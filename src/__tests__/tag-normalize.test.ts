import { describe, it, expect } from 'vitest';
import { normalizeTagKey, cleanTagName, isValidTagName, dedupeTags } from '@/lib/tag-normalize';

describe('normalizeTagKey', () => {
  it('trims whitespace', () => {
    expect(normalizeTagKey('  权限管理  ')).toBe('权限管理');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTagKey('权限  管理')).toBe('权限 管理');
  });

  it('converts fullwidth to halfwidth', () => {
    expect(normalizeTagKey('ＡＢＣ')).toBe('abc');
  });

  it('converts fullwidth space (U+3000)', () => {
    expect(normalizeTagKey('权限\u3000管理')).toBe('权限 管理');
  });

  it('lowercases ASCII', () => {
    expect(normalizeTagKey('Performance')).toBe('performance');
  });

  it('preserves Chinese characters', () => {
    expect(normalizeTagKey('性能优化')).toBe('性能优化');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeTagKey('')).toBe('');
    expect(normalizeTagKey(undefined as any)).toBe('');
    expect(normalizeTagKey(null as any)).toBe('');
  });

  it('handles mixed CJK + ASCII', () => {
    expect(normalizeTagKey(' React 性能优化 ')).toBe('react 性能优化');
  });
});

describe('cleanTagName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanTagName('  权限  管理  ')).toBe('权限 管理');
  });

  it('converts fullwidth but preserves case', () => {
    expect(cleanTagName('ＡＢＣ')).toBe('ABC');
  });
});

describe('isValidTagName', () => {
  it('rejects empty', () => {
    expect(isValidTagName('')).toBe(false);
    expect(isValidTagName('   ')).toBe(false);
  });

  it('rejects too long', () => {
    expect(isValidTagName('a'.repeat(51))).toBe(false);
  });

  it('rejects comma and semicolon', () => {
    expect(isValidTagName('a,b')).toBe(false);
    expect(isValidTagName('a;b')).toBe(false);
  });

  it('accepts normal tags', () => {
    expect(isValidTagName('性能优化')).toBe(true);
    expect(isValidTagName('React')).toBe(true);
  });
});

describe('dedupeTags', () => {
  it('deduplicates by normalized key, keeps first display name', () => {
    const result = dedupeTags(['权限管理', '权限管理 ']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('权限管理');
  });

  it('handles fullwidth/halfwidth dedup', () => {
    const result = dedupeTags(['ABC', 'ａｂｃ']);
    expect(result).toHaveLength(1);
  });

  it('filters invalid tags', () => {
    const result = dedupeTags(['valid', '', 'a,b', '   ']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid');
  });

  it('returns empty for non-array', () => {
    expect(dedupeTags(null as any)).toEqual([]);
    expect(dedupeTags(undefined as any)).toEqual([]);
    expect(dedupeTags('string' as any)).toEqual([]);
  });
});