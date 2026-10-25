import { describe, it, expect } from 'vitest';
import { epochHosts } from '../epochsHosts';
import { messages } from '../i18n';

describe('epochHosts', () => {
  it('allows only the production host in CI builds', () => {
    expect(epochHosts(true)).toEqual(['victor-go.github.io']);
  });

  it('also allows local hosts in non-CI builds', () => {
    expect(epochHosts(false)).toEqual(['victor-go.github.io', 'localhost', '127.0.0.1']);
  });
});

describe('unavailable message', () => {
  it.each(['zh', 'en'] as const)('exists in %s and differs from refused', (lang) => {
    const m = messages[lang];
    expect(m.unavailable.length).toBeGreaterThan(0);
    expect(m.unavailable).not.toBe(m.refused);
  });

  it('differs between languages', () => {
    expect(messages.zh.unavailable).not.toBe(messages.en.unavailable);
  });
});
