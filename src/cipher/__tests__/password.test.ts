import { describe, it, expect } from 'vitest';
import { argon2id } from '@noble/hashes/argon2.js';
import {
  encryptTextWithPassword,
  decryptTextWithPassword,
  DEFAULT_PARAMS,
  inlineKdf,
} from '../crypto/password';
import { decode, encode, DECRYPT_FAILED } from '../crypto/encoding';

// Cheap Argon2 parameters keep the suite fast; the real defaults are checked separately.
const fast = { m: 64, t: 1, p: 1 };
const opts = { kdf: inlineKdf, params: fast };

describe('password encryption', () => {
  it('matches the RFC 9106 Argon2id test vector', () => {
    const key = argon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), {
      m: 32, t: 3, p: 4, dkLen: 32,
      key: new Uint8Array(8).fill(3),
      personalization: new Uint8Array(12).fill(4),
    });
    expect(Array.from(key, (byte) => byte.toString(16).padStart(2, '0')).join(''))
      .toBe('0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
  });

  it('uses Argon2id 64 MiB / 3 passes / 1 lane by default', () => {
    expect(DEFAULT_PARAMS).toEqual({ m: 65536, t: 3, p: 1 });
  });

  it('round-trips empty, long and multibyte text', async () => {
    for (const msg of ['', 'a', '你好 🔐 ñ é', 'long '.repeat(50_000)]) {
      const ct = await encryptTextWithPassword(msg, 'pässwörd 密码', opts);
      expect(await decryptTextWithPassword(ct, 'pässwörd 密码', opts)).toBe(msg);
    }
  });

  it('works with the real default parameters', async () => {
    const ct = await encryptTextWithPassword('real params', 'pw', { kdf: inlineKdf });
    const raw = decode('pw', ct);
    expect(new DataView(raw.buffer, raw.byteOffset).getUint32(4)).toBe(65536);
    expect(await decryptTextWithPassword(ct, 'pw', { kdf: inlineKdf })).toBe('real params');
  }, 120_000);

  it('fails with a wrong password', async () => {
    const ct = await encryptTextWithPassword('secret', 'right', opts);
    await expect(decryptTextWithPassword(ct, 'wrong', opts)).rejects.toMatchObject({
      code: 'decrypt',
      message: DECRYPT_FAILED,
    });
  });

  it('fails when any byte (header or body) is tampered with', async () => {
    const ct = await encryptTextWithPassword('tamper me', 'pw', opts);
    const raw = decode('pw', ct);
    for (let i = 0; i < raw.length; i++) {
      const t = raw.slice();
      t[i] ^= 0x01;
      await expect(decryptTextWithPassword(encode('pw', t), 'pw', opts)).rejects.toMatchObject({ code: 'decrypt' });
    }
  }, 120_000);

  it('produces different ciphertext for the same plaintext and password', async () => {
    const a = await encryptTextWithPassword('same', 'pw', opts);
    const b = await encryptTextWithPassword('same', 'pw', opts);
    expect(a).not.toBe(b);
  });

  it('refuses absurd KDF parameters from untrusted headers', async () => {
    const ct = await encryptTextWithPassword('x', 'pw', opts);
    const raw = decode('pw', ct);
    new DataView(raw.buffer, raw.byteOffset).setUint32(4, 0xffffffff);
    await expect(decryptTextWithPassword(encode('pw', raw), 'pw', opts)).rejects.toMatchObject({ code: 'decrypt' });
  });
});
