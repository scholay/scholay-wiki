import { describe, expect, it } from 'vitest';
import { journalCanonicalPath } from './seo-paths';

describe('journal canonical paths', () => {
  it('uses and escapes the authoritative backend slug', () => {
    expect(journalCanonicalPath(42, 'nature-中国-science')).toBe(
      '/journal/42/nature-%E4%B8%AD%E5%9B%BD-science',
    );
  });

  it('falls back to the unambiguous numeric route without an authoritative slug', () => {
    expect(journalCanonicalPath(7)).toBe('/journal/7');
  });
});
