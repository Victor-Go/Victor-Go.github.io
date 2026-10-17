import { describe, it, expect } from 'vitest';
import vectors from './xwing-vectors.json';
import {
  xwing,
  generateKeyPair,
  encryptForPublicKey,
  decryptWithPrivateKey,
  encryptTextForPublicKey,
  decryptTextWithPrivateKey,
  KEM_CT_LEN,
} from '../crypto/kem';
import { CipherError, DECRYPT_FAILED, decode } from '../crypto/encoding';

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
const enc = (s: string) => new TextEncoder().encode(s);

describe('X-Wing (draft-connolly-cfrg-xwing-kem) official vectors', () => {
  it.each(vectors.map((v, i) => [i, v] as const))('vector %i', (_i, v) => {
    const keys = xwing.keygen(hex(v.seed));
    expect(toHex(keys.secretKey)).toBe(v.sk);
    expect(toHex(keys.publicKey)).toBe(v.pk);
    expect(keys.publicKey.length).toBe(1216);
    const { sharedSecret, cipherText } = xwing.encapsulate(hex(v.pk), hex(v.eseed));
    expect(toHex(sharedSecret)).toBe(v.ss);
    expect(toHex(cipherText)).toBe(v.ct);
    expect(cipherText.length).toBe(KEM_CT_LEN);
    expect(toHex(xwing.decapsulate(hex(v.ct), hex(v.sk)))).toBe(v.ss);
  });
});

describe('key exchange encryption', () => {
  it('has 32-byte private seed and 1216-byte public key', async () => {
    const kp = await generateKeyPair();
    expect(decode('private', kp.privateText).length).toBe(32);
    expect(decode('public', kp.publicText).length).toBe(1216);
  });

  it('round-trips text, empty and multibyte Unicode', async () => {
    const kp = await generateKeyPair();
    for (const msg of ['', 'hello', '你好,世界 🔐 ñ', 'x'.repeat(100_000)]) {
      const ct = await encryptTextForPublicKey(kp.publicText, msg);
      expect(await decryptTextWithPrivateKey(kp.privateText, ct)).toBe(msg);
    }
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const kp = await generateKeyPair();
    const a = await encryptTextForPublicKey(kp.publicText, 'same');
    const b = await encryptTextForPublicKey(kp.publicText, 'same');
    expect(a).not.toBe(b);
  });

  it('fails when any single byte of the ciphertext is flipped', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptForPublicKey(decode('public', kp.publicText), enc('attack at dawn'));
    const seed = decode('private', kp.privateText);
    for (let i = 0; i < ct.length; i++) {
      const t = ct.slice();
      t[i] ^= 0x01;
      await expect(decryptWithPrivateKey(seed, t)).rejects.toMatchObject({ code: 'decrypt' });
    }
  }, 120_000);

  it('fails with the wrong private key', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const ct = await encryptTextForPublicKey(a.publicText, 'secret');
    await expect(decryptTextWithPrivateKey(b.privateText, ct)).rejects.toMatchObject({
      code: 'decrypt',
      message: DECRYPT_FAILED,
    });
  });

  it('rejects truncated data and wrong-kind inputs', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptTextForPublicKey(kp.publicText, 'x');
    await expect(decryptTextWithPrivateKey(kp.privateText, ct.slice(0, 40))).rejects.toBeInstanceOf(CipherError);
    await expect(decryptTextWithPrivateKey(kp.publicText, ct)).rejects.toBeInstanceOf(CipherError);
    await expect(encryptTextForPublicKey(kp.privateText, 'x')).rejects.toBeInstanceOf(CipherError);
  });

  it('does not mutate caller-supplied seed bytes', async () => {
    const kp = await generateKeyPair();
    const ct = await encryptTextForPublicKey(kp.publicText, 'hi');
    const seed = decode('private', kp.privateText);
    const copy = seed.slice();
    await decryptWithPrivateKey(seed, decode('kx', ct));
    expect(seed).toEqual(copy);
  });
});
