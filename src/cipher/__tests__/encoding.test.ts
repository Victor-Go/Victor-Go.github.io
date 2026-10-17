import { describe, it, expect } from 'vitest';
import { encode, decode, detectKind, PREFIX, CipherError } from '../crypto/encoding';

describe('encoding', () => {
  const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 0xff);

  it('round-trips every kind and carries a distinct readable prefix', () => {
    const seen = new Set<string>();
    for (const kind of ['public', 'private', 'kx', 'pw'] as const) {
      const text = encode(kind, bytes);
      expect(text.startsWith(PREFIX[kind])).toBe(true);
      expect(text).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(decode(kind, text)).toEqual(bytes);
      expect(detectKind(text)).toBe(kind);
      seen.add(PREFIX[kind]);
    }
    expect(seen.size).toBe(4);
  });

  it('ignores whitespace and line wrapping from copy/paste', () => {
    const text = encode('kx', bytes);
    const wrapped = ' \n' + text.replace(/(.{40})/g, '$1\n') + '\t ';
    expect(decode('kx', wrapped)).toEqual(bytes);
  });

  it('rejects the wrong kind with a typed error', () => {
    const text = encode('public', bytes);
    expect(() => decode('private', text)).toThrow(CipherError);
    try {
      decode('private', text);
    } catch (e) {
      expect((e as CipherError).code).toBe('wrong-kind');
    }
  });

  it('rejects malformed input without echoing it', () => {
    const secret = 'SUPERSECRETVALUE';
    for (const bad of ['', secret, PREFIX.kx + '!!!' + secret, PREFIX.kx + 'A', PREFIX.kx + secret + '=']) {
      let caught: unknown;
      try {
        decode('kx', bad);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CipherError);
      const err = caught as CipherError;
      expect(err.message).not.toContain(secret);
      expect(JSON.stringify(err)).not.toContain(secret);
    }
    expect(detectKind('hello world')).toBeNull();
  });
});
