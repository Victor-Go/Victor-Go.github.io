// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  decryptFile,
  encryptFile,
  looksLikeEfile,
  previewKind,
  safeFileName,
  sanitizeMime,
} from '../crypto/file';
import { encryptWithPassword, inlineKdf } from '../crypto/password';
import { parseEpochs } from '../crypto/epochs';

const epochs = parseEpochs('0,1:dev', '1');
const base = { kdf: inlineKdf, params: { m: 64, t: 1, p: 1 }, epochs };
const CHUNK = 1 << 20;
const TAG = 16;
const HEADER = 39;

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const make = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const blob = (b: Uint8Array) => new Blob([b as BlobPart]);

async function roundTrip(data: Uint8Array, opts: { compress?: boolean; name?: string; type?: string } = {}) {
  const file = new File([data as BlobPart], opts.name ?? 'a.bin', { type: opts.type ?? '' });
  const enc = await encryptFile(file, 'pw', { ...base, compress: opts.compress });
  const dec = await decryptFile(enc, 'pw', base);
  return { enc, dec };
}

describe('efile format', () => {
  it('round-trips sizes around the chunk boundary', async () => {
    for (const n of [0, 1, 1000, CHUNK - 100, CHUNK, CHUNK + 1, 2 * CHUNK + 5]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + n) & 255);
      const { dec } = await roundTrip(data);
      expect(same(await bytesOf(dec.blob), data), `size ${n}`).toBe(true);
      expect(dec.meta.size).toBe(n);
    }
  });

  it('handles a plaintext stream that fills whole chunks exactly', async () => {
    // The stream is a 4-byte length, the metadata JSON and the data, so scan sizes near two chunks.
    let exact = 0;
    for (let n = 2 * CHUNK - 120; n <= 2 * CHUNK - 20; n++) {
      const data = make(n);
      const { enc, dec } = await roundTrip(data, { name: 'x.bin' });
      if (enc.size === HEADER + 2 * (CHUNK + TAG)) exact++;
      expect(same(await bytesOf(dec.blob), data), `size ${n}`).toBe(true);
    }
    expect(exact).toBe(1);
  }, 120_000);

  it('keeps name, size and MIME type, encrypted', async () => {
    const { enc, dec } = await roundTrip(make(500), { name: 'photo.PNG', type: 'image/png' });
    expect(dec.meta).toEqual({ name: 'photo.PNG', type: 'image/png', size: 500 });
    expect(dec.blob.type).toBe('image/png');
    const raw = new TextDecoder('latin1').decode(await bytesOf(enc));
    expect(raw).not.toContain('photo');
    expect(raw).not.toContain('image/png');
  });

  it('never gives a non-previewable type to the decrypted blob', async () => {
    const { dec } = await roundTrip(make(10), { name: 'a.html', type: 'text/html' });
    expect(dec.meta.type).toBe('text/html');
    expect(dec.blob.type).toBe('application/octet-stream');
  });

  it('compresses when asked and still round-trips', async () => {
    const data = make(3 * CHUNK + 123, 65);
    const plain = await roundTrip(data);
    const packed = await roundTrip(data, { compress: true });
    expect((await bytesOf(packed.enc))[37]).toBe(1);
    expect((await bytesOf(plain.enc))[37]).toBe(0);
    expect(packed.enc.size).toBeLessThan(plain.enc.size / 50);
    expect(same(await bytesOf(packed.dec.blob), data)).toBe(true);
  });

  it('rejects a wrong password, a tampered byte and a bad header', async () => {
    const enc = await bytesOf((await roundTrip(make(2000))).enc);
    await expect(decryptFile(blob(enc), 'other', base)).rejects.toMatchObject({ code: 'decrypt' });
    const body = enc.slice();
    body[HEADER + 3] ^= 1;
    await expect(decryptFile(blob(body), 'pw', base)).rejects.toMatchObject({ code: 'decrypt' });
    const flags = enc.slice();
    flags[37] ^= 1; // the header is AAD of every chunk
    await expect(decryptFile(blob(flags), 'pw', base)).rejects.toMatchObject({ code: 'decrypt' });
    const magic = enc.slice();
    magic[0] = 0;
    await expect(decryptFile(blob(magic), 'pw', base)).rejects.toMatchObject({ code: 'file-format' });
    expect(await looksLikeEfile(blob(magic))).toBe(false);
    expect(await looksLikeEfile(blob(enc))).toBe(true);
  });

  it('detects truncation, extension and reordering of chunks', async () => {
    const enc = await bytesOf((await roundTrip(make(3 * CHUNK))).enc);
    const stride = CHUNK + TAG;
    const dec = (b: Uint8Array) => decryptFile(blob(b), 'pw', base);
    await expect(dec(enc.slice(0, HEADER + 2 * stride))).rejects.toMatchObject({ code: 'decrypt' });
    await expect(dec(enc.slice(0, enc.length - 1))).rejects.toMatchObject({ code: 'decrypt' });
    const extended = new Uint8Array(enc.length + stride);
    extended.set(enc);
    extended.set(enc.subarray(HEADER, HEADER + stride), enc.length);
    await expect(dec(extended)).rejects.toMatchObject({ code: 'decrypt' });
    const swapped = enc.slice();
    swapped.set(enc.subarray(HEADER + stride, HEADER + 2 * stride), HEADER);
    swapped.set(enc.subarray(HEADER, HEADER + stride), HEADER + stride);
    await expect(dec(swapped)).rejects.toMatchObject({ code: 'decrypt' });
  });

  it('refuses an unknown epoch only after paying for the KDF', async () => {
    const { enc } = await roundTrip(make(10));
    let calls = 0;
    const kdf: typeof inlineKdf = (...a) => (calls++, inlineKdf(...a));
    const other = parseEpochs('2:other', '2');
    await expect(decryptFile(enc, 'pw', { ...base, kdf, epochs: other })).rejects.toMatchObject({ code: 'decrypt' });
    expect(calls).toBe(1);
  });

  it('is not confused with text ciphertext bytes', async () => {
    const text = await encryptWithPassword(make(50), 'pw', base);
    await expect(decryptFile(blob(text), 'pw', base)).rejects.toMatchObject({ code: 'file-format' });
  });

  it('stops on abort', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(encryptFile(blob(make(10)), 'pw', { ...base, signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('requires a password', async () => {
    await expect(encryptFile(new Blob([]), '', base)).rejects.toMatchObject({ code: 'empty-password' });
  });
});

describe('file helpers', () => {
  it('only previews images and video the browser can show, never svg or html', () => {
    expect(previewKind('image/png')).toBe('image');
    expect(previewKind('image/jpeg')).toBe('image');
    expect(previewKind('video/webm')).toBe('video');
    expect(previewKind('application/pdf')).toBe('pdf');
    for (const t of ['image/svg+xml', 'text/html', 'application/octet-stream']) {
      expect(previewKind(t)).toBeNull();
    }
  });

  it('sanitises MIME types and file names', () => {
    expect(sanitizeMime('IMAGE/PNG; charset=x')).toBe('image/png');
    expect(sanitizeMime('not a type')).toBe('application/octet-stream');
    expect(sanitizeMime('')).toBe('application/octet-stream');
    expect(safeFileName('../../etc/pass:wd.txt')).toBe('_.._etc_pass_wd.txt');
    expect(safeFileName('')).toBe('decrypted-file');
    expect(safeFileName('...')).toBe('decrypted-file');
    expect(safeFileName('a\u0000b.png')).toBe('a_b.png');
  });
});
