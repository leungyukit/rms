import { describe, it, expect } from 'vitest';
import { escapeFormula, autoMapping } from '@/lib/import';

describe('escapeFormula', () => {
  it('escapes strings starting with =', () => {
    expect(escapeFormula('=1+1')).toBe("'=1+1");
  });

  it('escapes strings starting with +', () => {
    expect(escapeFormula('+1+1')).toBe("'+1+1");
  });

  it('escapes strings starting with -', () => {
    expect(escapeFormula('-1+1')).toBe("'-1+1");
  });

  it('escapes strings starting with @', () => {
    expect(escapeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves normal strings alone', () => {
    expect(escapeFormula('normal text')).toBe('normal text');
  });

  it('handles non-string values', () => {
    expect(escapeFormula(42)).toBe(42);
    expect(escapeFormula(null)).toBe(null);
  });
});

describe('autoMapping', () => {
  it('maps Chinese column names', () => {
    const result = autoMapping(['标题', '描述', '优先级']);
    expect(result).toEqual({
      '标题': 'title',
      '描述': 'description',
      '优先级': 'priority',
    });
  });

  it('maps English column names', () => {
    const result = autoMapping(['title', 'description', 'priority']);
    expect(result).toEqual({
      'title': 'title',
      'description': 'description',
      'priority': 'priority',
    });
  });

  it('is case-insensitive', () => {
    const result = autoMapping(['Title', 'DESCRIPTION']);
    expect(result).toEqual({
      'Title': 'title',
      'DESCRIPTION': 'description',
    });
  });

  it('skips unknown columns', () => {
    const result = autoMapping(['标题', '未知列']);
    expect(result).toEqual({ '标题': 'title' });
  });
});
