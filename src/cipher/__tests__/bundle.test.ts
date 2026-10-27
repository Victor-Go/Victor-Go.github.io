// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decryptFile, encryptFile } from '../crypto/file';
import { inlineKdf } from '../crypto/password';
import { parseEpochs } from '../crypto/epochs';
import { BUNDLE_TYPE, isBundle, packBundle, typeFromName, unpackBundle, uniqueNames } from '../crypto/bundle';
import { crc32, makeZip, readZip } from '../crypto/zip';

const epochs = parseEpochs('0,1:dev', '1');
const base = { kdf: inlineKdf, params: { m: 64, t: 1, p: 1 }, epochs };
const file = (name: string, bytes: number[], type = '') => new File([new Uint8Array(bytes)], name, { type });
const bytesOf = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));

describe('zip', () => {
  it('computes the standard CRC-32, also in pieces', () => {
    const data = new TextEncoder().encode('123456789');
    expect(crc32(data)).toBe(0xcbf43926);
    expect(crc32(data.subarray(4), crc32(data.subarray(0, 4)))).toBe(0xcbf43926);
  });

  it('round-trips entries given as bytes or blobs, with UTF-8 names', async () => {
    const zip = await makeZip([
      { name: 'a.png', data: new Uint8Array([1, 2, 3]) },
      { name: '页-2.txt', data: new Blob([new Uint8Array([4, 5])]) },
      { name: 'empty', data: new Uint8Array(0) },
    ]);
    const items = await readZip(zip);
    expect(items.map((i) => i.name)).toEqual(['a.png', '页-2.txt', 'empty']);
    expect(await bytesOf(items[0].data)).toEqual([1, 2, 3]);
    expect(await bytesOf(items[1].data)).toEqual([4, 5]);
    expect(items[2].data.size).toBe(0);
  });

  it('rejects data that is not a stored archive', async () => {
    await expect(readZip(new Blob([new Uint8Array(40)]))).rejects.toThrow();
    const zip = await makeZip([{ name: 'a', data: new Uint8Array([1]) }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    // Turn the central directory's compression method into "deflate".
    const cd = new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
    bytes[cd + 10] = 8;
    await expect(readZip(new Blob([bytes]))).rejects.toThrow();
  });
});

describe('bundle', () => {
  it('makes names unique and safe', () => {
    expect(uniqueNames(['a.png', 'A.png', 'a.png', '../x/y:z.txt'])).toEqual(['a.png', 'A (2).png', 'a (3).png', '_x_y_z.txt']);
  });

  it('maps only safe extensions to preview types', () => {
    expect(typeFromName('x.PNG')).toBe('image/png');
    expect(typeFromName('x.pdf')).toBe('application/pdf');
    expect(typeFromName('x.svg')).toBe('application/octet-stream');
    expect(typeFromName('png')).toBe('application/octet-stream');
  });

  it('encrypts several files as one .efile and lists them again after decrypting', async () => {
    const packed = await packBundle([file('a.png', [1, 2]), file('b.pdf', [3]), file('c.txt', [4, 5, 6]), file('a.png', [7])]);
    expect(packed.type).toBe(BUNDLE_TYPE);
    const enc = await encryptFile(packed, 'pw', base);
    const dec = await decryptFile(enc, 'pw', base);
    expect(isBundle(dec.meta.type)).toBe(true);
    const entries = await unpackBundle(dec.blob);
    expect(entries.map((e) => e.name)).toEqual(['a.png', 'b.pdf', 'c.txt', 'a (2).png']);
    expect(entries.map((e) => e.blob.type)).toEqual(['image/png', 'application/pdf', 'text/plain', 'image/png']);
    expect(await bytesOf(entries[2].blob)).toEqual([4, 5, 6]);
    expect(entries.map((e) => e.size)).toEqual([2, 1, 3, 1]);
  });

  it('does not unpack a zip the user encrypted as an ordinary file', async () => {
    const zip = await makeZip([{ name: 'a', data: new Uint8Array([1]) }]);
    const enc = await encryptFile(new File([zip], 'mine.zip', { type: 'application/zip' }), 'pw', base);
    const dec = await decryptFile(enc, 'pw', base);
    expect(isBundle(dec.meta.type)).toBe(false);
  });

  it('only names entries by their last path segment', async () => {
    const zip = await makeZip([{ name: '../../evil.png', data: new Uint8Array([1]) }]);
    const [e] = await unpackBundle(zip);
    expect(e.name).toBe('evil.png');
  });
});
