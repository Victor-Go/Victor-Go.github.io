import { describe, it, expect } from 'vitest';
import { extractLinks } from '../linkify';

describe('extractLinks', () => {
  it('finds http and https links in plain text', () => {
    expect(extractLinks('see https://example.com/a?b=1#c and http://x.org')).toEqual([
      'https://example.com/a?b=1#c',
      'http://x.org/',
    ]);
  });

  it('drops trailing punctuation and unbalanced brackets but keeps balanced ones', () => {
    expect(extractLinks('(https://a.com/x), https://b.com/y. https://c.com/z!')).toEqual([
      'https://a.com/x',
      'https://b.com/y',
      'https://c.com/z',
    ]);
    expect(extractLinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('stops before CJK text and full-width punctuation', () => {
    expect(extractLinks('网址https://example.com/路径。然后')).toEqual(['https://example.com/']);
    expect(extractLinks('点击 https://example.com/a，再试')).toEqual(['https://example.com/a']);
  });

  it('ignores other schemes and bare hosts', () => {
    expect(extractLinks('javascript:alert(1) ftp://x.com data:text/html,hi example.com')).toEqual([]);
  });

  it('de-duplicates and keeps order', () => {
    expect(extractLinks('https://a.com https://b.com https://a.com')).toEqual(['https://a.com/', 'https://b.com/']);
  });
});
