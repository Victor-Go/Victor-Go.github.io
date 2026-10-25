import { CipherError } from "./encoding";
import { open, seal, utf8, utf8Decode } from "./aead";
import { DEFAULT_PARAMS, deriveKey, inlineKdf, validParams, type Kdf, type KdfParams } from "./password";
import { LEGACY_EPOCH, type Epochs } from "./epochs";
import { getEpochs } from "./epochsEnv";
import { randomBytes, release, track } from "./secrets";

/*
 * .efile layout (all integers big-endian):
 *   "EFIL" | version(1)=1 | kdf(1)=1 | epoch(2) | m(4) | t(1) | p(1) | salt(16) | nonce prefix(7)
 *   | flags(1) | chunkLog2(1)                                              -> 39-byte header
 *   followed by AES-256-GCM chunks of (1 << chunkLog2) plaintext bytes each (the last one may be
 *   shorter), each carrying a 16-byte tag. The header is the AAD of every chunk, and the chunk
 *   nonce is  prefix(7) | counter(4) | last(1)  so chunks can't be reordered, dropped or truncated.
 *
 * Plaintext stream: metaLen(4) | meta JSON | data, where `data` is raw or, with FLAG_COMPRESSED,
 * deflate-raw compressed. The metadata (name, MIME type, size) is encrypted along with the data.
 */

const MAGIC = utf8("EFIL");
const VERSION = 1;
const KDF_ARGON2ID = 1;
const SALT_LEN = 16;
const PREFIX_LEN = 7;
const TAG_LEN = 16;
const HEADER_LEN = 39;
const FLAG_COMPRESSED = 1;
const INFO = utf8("cipher/file/v1");

const CHUNK_LOG2 = 20;
const MIN_CHUNK_LOG2 = 16;
const MAX_CHUNK_LOG2 = 24;
const MAX_META = 8192;
export const EFILE_EXTENSION = ".efile";

export interface FileMeta {
  /** Original file name (may be empty). */
  name: string;
  /** Lower-case MIME type, or application/octet-stream. */
  type: string;
  /** Size of the original file in bytes. */
  size: number;
}

export interface FileOptions {
  kdf?: Kdf;
  params?: KdfParams;
  epochs?: Epochs;
  signal?: AbortSignal;
  /** Called with (bytes done, bytes total) of the encrypted-file side or the input side. */
  onProgress?: (done: number, total: number) => void;
}

export interface EncryptFileOptions extends FileOptions {
  compress?: boolean;
}

export const compressionSupported = (): boolean =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,60}$/;
const FALLBACK_TYPE = "application/octet-stream";

export function sanitizeMime(type: string): string {
  const t = type.trim().toLowerCase().split(";")[0].trim();
  return MIME_RE.test(t) ? t : FALLBACK_TYPE;
}

/** Only formats the browser can show with <img> or <video>; SVG and HTML are deliberately absent. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
const VIDEO_TYPES = new Set(["video/webm", "video/mp4"]);

export function previewKind(type: string): "image" | "video" | null {
  if (IMAGE_TYPES.has(type)) return "image";
  if (VIDEO_TYPES.has(type)) return "video";
  return null;
}

/** A name that is safe to hand to the browser's download attribute. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 200);
  return cleaned || "decrypted-file";
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
}

function chunkNonce(prefix: Uint8Array, counter: number, last: boolean): Uint8Array {
  if (counter > 0xffffffff) throw new CipherError("format");
  const nonce = new Uint8Array(12);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setUint32(PREFIX_LEN, counter);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

const blobPart = (b: Uint8Array): BlobPart => b as BlobPart;

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export async function encryptFile(
  input: Blob,
  password: string,
  { kdf = inlineKdf, params = DEFAULT_PARAMS, epochs = getEpochs(), compress = false, signal, onProgress }: EncryptFileOptions = {},
): Promise<Blob> {
  if (password.length === 0) throw new CipherError("empty-password");
  if (!validParams(params)) throw new CipherError("format");
  if (compress && !compressionSupported()) throw new CipherError("format");
  const label = epochs.labels.get(epochs.current);
  if (label === undefined) throw new CipherError("format");

  const salt = randomBytes(SALT_LEN);
  const prefix = randomBytes(PREFIX_LEN);
  const head = new Uint8Array(HEADER_LEN);
  const view = new DataView(head.buffer);
  head.set(MAGIC, 0);
  head[4] = VERSION;
  head[5] = KDF_ARGON2ID;
  view.setUint16(6, epochs.current);
  view.setUint32(8, params.m);
  head[12] = params.t;
  head[13] = params.p;
  head.set(salt, 14);
  head.set(prefix, 14 + SALT_LEN);
  head[37] = compress ? FLAG_COMPRESSED : 0;
  head[38] = CHUNK_LOG2;

  const key = await importKey(kdf, password, salt, params, label);
  checkAbort(signal);

  const meta: FileMeta = {
    name: ((input as File).name ?? "").slice(0, 255),
    type: sanitizeMime(input.type),
    size: input.size,
  };
  const metaBytes = utf8(JSON.stringify(meta));
  if (metaBytes.length > MAX_META) throw new CipherError("format");
  const lead = new Uint8Array(4 + metaBytes.length);
  new DataView(lead.buffer).setUint32(0, metaBytes.length);
  lead.set(metaBytes, 4);

  const chunkSize = 1 << CHUNK_LOG2;
  const fill = track(new Uint8Array(chunkSize));
  let fillLen = 0;
  let counter = 0;
  let read = 0;
  const parts: BlobPart[] = [blobPart(head)];

  const emit = async (len: number, last: boolean) => {
    checkAbort(signal);
    const ct = await seal(key, chunkNonce(prefix, counter++, last), head, fill.subarray(0, len));
    parts.push(new Blob([blobPart(ct)]));
    onProgress?.(Math.min(read, input.size), input.size);
  };
  const push = async (data: Uint8Array) => {
    let off = 0;
    while (off < data.length) {
      // A full chunk is only sealed once more data is known to follow, so the last one is flagged.
      if (fillLen === chunkSize) {
        await emit(fillLen, false);
        fillLen = 0;
      }
      const n = Math.min(chunkSize - fillLen, data.length - off);
      fill.set(data.subarray(off, off + n), fillLen);
      fillLen += n;
      off += n;
    }
  };

  try {
    await push(lead);
    const counted = input.stream().pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(c, ctl) {
          read += c.length;
          ctl.enqueue(c);
        },
      }),
    );
    const source = compress ? counted.pipeThrough(new CompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) : counted;
    const reader = source.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    await emit(fillLen, true);
  } finally {
    release(fill);
  }
  onProgress?.(input.size, input.size);
  return new Blob(parts, { type: "application/octet-stream" });
}

async function importKey(kdf: Kdf, password: string, salt: Uint8Array, params: KdfParams, label: string) {
  return deriveKey(kdf, password, salt, params, label, INFO);
}

interface Header {
  epoch: number;
  params: KdfParams;
  salt: Uint8Array;
  prefix: Uint8Array;
  compressed: boolean;
  chunkSize: number;
}

/** Null for anything that is not a well-formed v1 header. */
function parseHeader(data: Uint8Array): Header | null {
  if (data.length < HEADER_LEN) return null;
  for (let i = 0; i < MAGIC.length; i++) if (data[i] !== MAGIC[i]) return null;
  if (data[4] !== VERSION || data[5] !== KDF_ARGON2ID) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const epoch = view.getUint16(6);
  if (epoch === LEGACY_EPOCH) return null;
  const params: KdfParams = { m: view.getUint32(8), t: data[12], p: data[13] };
  if (!validParams(params)) return null;
  const flags = data[37];
  const log2 = data[38];
  if ((flags & ~FLAG_COMPRESSED) !== 0 || log2 < MIN_CHUNK_LOG2 || log2 > MAX_CHUNK_LOG2) return null;
  return {
    epoch,
    params,
    salt: data.subarray(14, 14 + SALT_LEN),
    prefix: data.subarray(14 + SALT_LEN, 14 + SALT_LEN + PREFIX_LEN),
    compressed: (flags & FLAG_COMPRESSED) !== 0,
    chunkSize: 1 << log2,
  };
}

/** True when the bytes start with the .efile magic, so wrong files are rejected before Argon2id runs. */
export async function looksLikeEfile(blob: Blob): Promise<boolean> {
  if (blob.size < HEADER_LEN + TAG_LEN) return false;
  return parseHeader(await readSlice(blob, 0, HEADER_LEN)) !== null;
}

export async function decryptFile(
  input: Blob,
  password: string,
  { kdf = inlineKdf, epochs = getEpochs(), signal, onProgress }: FileOptions = {},
): Promise<{ blob: Blob; meta: FileMeta }> {
  if (input.size < HEADER_LEN + TAG_LEN) throw new CipherError("file-format");
  const headBytes = await readSlice(input, 0, HEADER_LEN);
  const h = parseHeader(headBytes);
  if (!h) throw new CipherError("file-format");

  const known = epochs.labels.has(h.epoch);
  // A retired epoch still pays for the full Argon2id run so it can't be told apart by timing.
  let key: CryptoKey;
  try {
    key = await importKey(kdf, password, h.salt, h.params, epochs.labels.get(h.epoch) ?? "");
  } catch (e) {
    throw e instanceof CipherError && e.code === "kdf" ? e : new CipherError("decrypt");
  }
  if (!known) throw new CipherError("decrypt");

  const parts: BlobPart[] = [];
  let written = 0;
  let meta: FileMeta | undefined;
  let sink: ((data: Uint8Array) => Promise<void>) | undefined;
  let finish: (() => Promise<void>) | undefined;
  const abortSink: { run: () => void } = { run: () => undefined };
  // The native decompressor may still read a buffer after write() settles, so it gets private
  // copies that are only zeroed once the whole job has ended.
  const fed: Uint8Array[] = [];

  const startSink = (m: FileMeta) => {
    const take = (data: Uint8Array) => {
      written += data.length;
      if (written > m.size) throw new CipherError("decrypt");
      if (data.length > 0) parts.push(new Blob([blobPart(data)]));
    };
    if (!h.compressed) {
      sink = async (d) => take(d);
      finish = async () => undefined;
      return;
    }
    if (!compressionSupported()) throw new CipherError("format");
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const collect = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        take(value);
      }
    })();
    collect.catch(() => undefined);
    abortSink.run = () => {
      writer.abort().catch(() => undefined);
      reader.cancel().catch(() => undefined);
    };
    sink = async (d) => {
      const copy = track(d.slice());
      fed.push(copy);
      await writer.write(copy as BufferSource);
    };
    finish = async () => {
      await Promise.all([writer.close(), collect]);
    };
  };

  const stride = h.chunkSize + TAG_LEN;
  let counter = 0;
  try {
    for (let off = HEADER_LEN; off < input.size; off += stride) {
      checkAbort(signal);
      const end = Math.min(off + stride, input.size);
      const last = end >= input.size;
      const ct = await readSlice(input, off, end);
      if (ct.length < TAG_LEN) throw new CipherError("decrypt");
      const pt = track(await open(key, chunkNonce(h.prefix, counter++, last), headBytes, ct));
      try {
        let data: Uint8Array = pt;
        if (!meta) {
          const view = new DataView(pt.buffer, pt.byteOffset, pt.byteLength);
          const metaLen = pt.length >= 4 ? view.getUint32(0) : -1;
          if (metaLen < 2 || metaLen > MAX_META || 4 + metaLen > pt.length) throw new CipherError("decrypt");
          meta = parseMeta(utf8Decode(pt.subarray(4, 4 + metaLen)));
          startSink(meta);
          data = pt.subarray(4 + metaLen);
        }
        await sink!(data);
      } finally {
        release(pt);
      }
      onProgress?.(end, input.size);
    }
    if (!meta) throw new CipherError("decrypt");
    await finish!();
    release(...fed);
    if (written !== meta.size) throw new CipherError("decrypt");
  } catch (e) {
    abortSink.run();
    release(...fed);
    if (e instanceof DOMException) throw e;
    throw e instanceof CipherError && (e.code === "kdf" || e.code === "format") ? e : new CipherError("decrypt");
  }
  const type = previewKind(meta.type) ? meta.type : FALLBACK_TYPE;
  return { blob: new Blob(parts, { type }), meta };
}

function parseMeta(text: string): FileMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CipherError("decrypt");
  }
  const o = raw as Partial<FileMeta> | null;
  if (
    !o || typeof o !== "object" || typeof o.name !== "string" || typeof o.type !== "string" ||
    !Number.isSafeInteger(o.size) || (o.size as number) < 0
  ) {
    throw new CipherError("decrypt");
  }
  return { name: o.name.slice(0, 255), type: sanitizeMime(o.type), size: o.size as number };
}
