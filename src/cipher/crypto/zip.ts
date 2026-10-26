import { CipherError } from "./encoding";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32; pass the previous result as `prev` to continue over a following chunk. */
export function crc32(data: Uint8Array, prev = 0): number {
  let c = ~prev >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

async function crc32Blob(blob: Blob): Promise<number> {
  const reader = blob.stream().getReader();
  let crc = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

export interface ZipEntry {
  name: string;
  data: Blob | Uint8Array;
}

/** ZIP32 limits: sizes and offsets are 4 bytes, entry counts 2 bytes. */
export const MAX_ZIP_BYTES = 0xffffffff;
export const MAX_ZIP_ENTRIES = 0xffff;
// 1980-01-01, the earliest valid DOS date, so the archive carries no timestamp of ours.
const DOS_DATE = 0x0021;

const blobPart = (b: Uint8Array): BlobPart => b as BlobPart;

/**
 * Builds an uncompressed (stored) ZIP. Page images and the files this site packs are mostly
 * already compressed, and the .efile layer has its own optional compression. Entries given as
 * Blobs are streamed for their CRC and never copied into memory.
 */
export async function makeZip(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length > MAX_ZIP_ENTRIES) throw new CipherError("format");
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const size = data instanceof Blob ? data.size : data.length;
    const nameBytes = enc.encode(name);
    if (size > MAX_ZIP_BYTES || nameBytes.length > 0xffff) throw new CipherError("format");
    const crc = data instanceof Blob ? await crc32Blob(data) : crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(local.buffer, blobPart(nameBytes), data instanceof Blob ? data : blobPart(data));

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, nameBytes.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
    if (offset > MAX_ZIP_BYTES) throw new CipherError("format");
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  if (offset + centralSize > MAX_ZIP_BYTES) throw new CipherError("format");
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  parts.push(...central.map(blobPart), end.buffer);
  return new Blob(parts, { type: "application/zip" });
}

export interface ZipItem {
  name: string;
  data: Blob;
}

/**
 * Reads the stored (uncompressed) archives that makeZip writes. Anything else — compression,
 * a comment, multiple disks, entries pointing outside the file — is rejected as malformed.
 */
export async function readZip(blob: Blob): Promise<ZipItem[]> {
  const bad = () => new CipherError("decrypt");
  if (blob.size < 22 || blob.size > MAX_ZIP_BYTES) throw bad();
  const tail = new DataView(await blob.slice(blob.size - 22).arrayBuffer());
  if (tail.getUint32(0, true) !== 0x06054b50 || tail.getUint16(20, true) !== 0) throw bad();
  const count = tail.getUint16(10, true);
  const cdSize = tail.getUint32(12, true);
  const cdOffset = tail.getUint32(16, true);
  if (tail.getUint16(8, true) !== count || cdOffset + cdSize + 22 !== blob.size) throw bad();

  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const v = new DataView(cd.buffer);
  const dec = new TextDecoder("utf-8", { fatal: true });
  const items: ZipItem[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw bad();
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    if ((flags & 0x0001) !== 0 || method !== 0 || csize !== usize || p + 46 + nlen + elen + clen > cd.length) throw bad();
    let name: string;
    try {
      name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    } catch {
      throw bad();
    }
    p += 46 + nlen + elen + clen;

    if (local + 30 > cdOffset) throw bad();
    const lh = new DataView(await blob.slice(local, local + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== 0x04034b50) throw bad();
    const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    if (start + usize > cdOffset) throw bad();
    items.push({ name, data: blob.slice(start, start + usize) });
  }
  if (p !== cd.length) throw bad();
  return items;
}
