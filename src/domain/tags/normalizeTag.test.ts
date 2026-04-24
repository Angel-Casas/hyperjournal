import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTagList } from './normalizeTag';

describe('normalizeTag', () => {
  it('lowercases and trims', () => {
    expect(normalizeTag('  Breakout ')).toBe('breakout');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeTag('revenge  trade')).toBe('revenge trade');
    expect(normalizeTag('gap\tfill')).toBe('gap fill');
    expect(normalizeTag('multi   \n  word')).toBe('multi word');
  });

  it('returns empty string for all-whitespace input', () => {
    expect(normalizeTag('   ')).toBe('');
  });
});

describe('normalizeTagList', () => {
  it('normalizes, dedupes, and preserves first-seen order', () => {
    expect(
      normalizeTagList(['Breakout', ' breakout ', 'Revenge Trade', 'BREAKOUT']),
    ).toEqual(['breakout', 'revenge trade']);
  });

  it('drops entries that normalize to empty', () => {
    expect(normalizeTagList(['  ', 'foo', ''])).toEqual(['foo']);
  });

  it('truncates to maxLen (default 40) post-normalize', () => {
    const long = 'x'.repeat(50);
    const out = normalizeTagList([long]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(40);
  });

  it('honours a custom maxLen', () => {
    expect(normalizeTagList(['abcdef'], 3)).toEqual(['abc']);
  });
});
