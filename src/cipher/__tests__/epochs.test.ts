import { describe, it, expect } from 'vitest';
import { parseEpochs } from '../crypto/epochs';
import {
  encryptTextWithPassword,
  decryptTextWithPassword,
  decryptWithPassword,
  inlineKdf,
  type Kdf,
} from '../crypto/password';
import { generateKeyPair, encryptTextForPublicKey, decryptTextWithPrivateKey } from '../crypto/kem';
import { DECRYPT_FAILED, decode, encode } from '../crypto/encoding';

const fast = { m: 64, t: 1, p: 1 };
const rolled = (table: string, current: string) => ({ kdf: inlineKdf, params: fast, epochs: parseEpochs(table, current) });

describe('parseEpochs', () => {
  it('parses ids, constants and the legacy marker', () => {
    const e = parseEpochs('0,2:bcd,3:cde', '3');
    expect(e.current).toBe(3);
    expect([...e.labels.keys()]).toEqual([0, 2, 3]);
    expect(e.labels.get(2)).toBe('bcd');
  });

  it.each([
    ['', '1'],
    ['1:abc,', '1'],
    ['1', '1'],
    ['1:', '1'],
    ['1:a b', '1'],
    ['1:a:b', '1'],
    ['65536:abc', '65536'],
    ['100000:abc', '1'],
    ['1:abc,1:def', '1'],
    ['0:abc,1:def', '1'],
    ['1:abc', '2'],
    ['0,1:abc', '0'],
    ['1:abc', ''],
    ['1:abc', 'x'],
  ])('rejects table %j with current %j', (table, current) => {
    expect(() => parseEpochs(table, current)).toThrow();
  });

  it('never puts constants in error messages', () => {
    expect(() => parseEpochs('1:secret!', '1')).toThrow(/^(?!.*secret)/);
  });
});

describe('epoch rotation (password)', () => {
  it('decrypts across epochs while both are listed', async () => {
    const ct = await encryptTextWithPassword('hello', 'pw', rolled('1:aaa,2:bbb', '1'));
    expect(await decryptTextWithPassword(ct, 'pw', rolled('1:aaa,2:bbb', '2'))).toBe('hello');
  });

  it('writes the current epoch id into the header', async () => {
    const ct = await encryptTextWithPassword('x', 'pw', rolled('1:aaa,7:bbb', '7'));
    expect(new DataView(decode('pw', ct).buffer).getUint16(2)).toBe(7);
  });

  it('cannot decrypt once its epoch is dropped, with the standard error', async () => {
    const ct = await encryptTextWithPassword('hello', 'pw', rolled('1:aaa,2:bbb', '1'));
    await expect(decryptTextWithPassword(ct, 'pw', rolled('2:bbb,3:ccc', '3'))).rejects.toMatchObject({
      code: 'decrypt',
      message: DECRYPT_FAILED,
    });
  });

  it('runs the KDF for a retired epoch, matching the wrong-password path', async () => {
    const ct = await encryptTextWithPassword('hello', 'pw', rolled('1:aaa', '1'));
    let calls = 0;
    const kdf: Kdf = (pw, salt, params) => {
      calls++;
      return inlineKdf(pw, salt, params);
    };
    const retired = { kdf, epochs: parseEpochs('2:bbb', '2') };
    await expect(decryptTextWithPassword(ct, 'pw', retired)).rejects.toMatchObject({ message: DECRYPT_FAILED });
    expect(calls).toBe(1);
  });

  it('fails when a constant changes under the same id', async () => {
    const ct = await encryptTextWithPassword('hello', 'pw', rolled('1:aaa', '1'));
    await expect(decryptTextWithPassword(ct, 'pw', rolled('1:zzz', '1'))).rejects.toMatchObject({ code: 'decrypt' });
  });

  it('rewriting the epoch id breaks authentication', async () => {
    const ct = await encryptTextWithPassword('hello', 'pw', rolled('1:aaa,2:aaa', '1'));
    const raw = decode('pw', ct);
    raw[3] = 2;
    await expect(decryptTextWithPassword(encode('pw', raw), 'pw', rolled('1:aaa,2:aaa', '1'))).rejects.toMatchObject({
      code: 'decrypt',
    });
  });

  it('reads v1 ciphertext only while epoch 0 is listed', async () => {
    // Hand-built v1 blob: version 1, argon2id, m=64 t=1 p=1, no epoch byte, no constant.
    const salt = new Uint8Array(16).fill(5);
    const nonce = new Uint8Array(12).fill(6);
    const head = new Uint8Array(36);
    head[0] = 1;
    head[1] = 1;
    new DataView(head.buffer).setUint32(2, 64);
    head[6] = 1;
    head[7] = 1;
    head.set(salt, 8);
    head.set(nonce, 24);
    const key = await crypto.subtle.importKey('raw', await inlineKdf(new TextEncoder().encode('pw'), salt, fast) as BufferSource, 'AES-GCM', false, ['encrypt']);
    const body = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: head, tagLength: 128 }, key, new TextEncoder().encode('old data')),
    );
    const blob = new Uint8Array(head.length + body.length);
    blob.set(head);
    blob.set(body, head.length);
    const out = await decryptWithPassword(blob, 'pw', rolled('0,1:aaa', '1'));
    expect(new TextDecoder().decode(out)).toBe('old data');
    await expect(decryptWithPassword(blob, 'pw', rolled('1:aaa', '1'))).rejects.toMatchObject({ code: 'decrypt' });
  });
});

describe('epoch rotation (key exchange)', () => {
  it('decrypts across epochs while both are listed', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptTextForPublicKey(kp.publicText, 'hi', parseEpochs('1:aaa,2:bbb', '1'));
    expect(await decryptTextWithPrivateKey(kp.privateText, ct, parseEpochs('1:aaa,2:bbb', '2'))).toBe('hi');
  });

  it('cannot decrypt once its epoch is dropped, with the standard error', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptTextForPublicKey(kp.publicText, 'hi', parseEpochs('1:aaa', '1'));
    await expect(decryptTextWithPrivateKey(kp.privateText, ct, parseEpochs('2:bbb', '2'))).rejects.toMatchObject({
      code: 'decrypt',
      message: DECRYPT_FAILED,
    });
  });

  it('fails when a constant changes under the same id', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptTextForPublicKey(kp.publicText, 'hi', parseEpochs('1:aaa', '1'));
    await expect(decryptTextWithPrivateKey(kp.privateText, ct, parseEpochs('1:zzz', '1'))).rejects.toMatchObject({
      code: 'decrypt',
    });
  });
});
