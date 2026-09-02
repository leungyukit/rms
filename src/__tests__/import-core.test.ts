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
    // 函数签名是 (s: string)，但内部第一行就判 typeof 非 string 直接原样返回。
    // 导入的 Excel 单元格实际会给到 number/null，这条防御必须有测试盖住，
    // 所以用 as unknown as string 绕过编译期检查去测运行时行为。
    expect(escapeFormula(42 as unknown as string)).toBe(42);
    expect(escapeFormula(null as unknown as string)).toBe(null);
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
