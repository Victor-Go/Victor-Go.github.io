import { describe, expect, it } from 'vitest';
import { importAesKey, open, seal } from '../crypto/aead';

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('AES-256-GCM', () => {
  it('matches NIST GCM-AES256 example 1 and rejects changed associated data', async () => {
    const key = await importAesKey(fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308'));
    const nonce = fromHex('cafebabefacedbaddecaf888');
    const empty = new Uint8Array();
    const ciphertext = await seal(key, nonce, empty, empty);
    expect(toHex(ciphertext)).toBe('fd2caa16a5832e76aa132c1453eeda7e');
    expect(await open(key, nonce, empty, ciphertext)).toEqual(empty);
    await expect(open(key, nonce, Uint8Array.of(1), ciphertext)).rejects.toMatchObject({ code: 'decrypt' });
  });
});
