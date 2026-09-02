import { describe, it, expect } from 'vitest';
import { ymdLocal, todayLocal, diffDaysLocal } from '@/lib/date-local';

describe('ymdLocal', () => {
  it('formats a known date in Asia/Shanghai', () => {
    // 2026-09-02 00:00 CST = 2026-09-01 16:00 UTC
    const d = new Date('2026-09-01T16:00:00Z');
    // In Asia/Shanghai, this is 2026-09-02 00:00
    // Our env is Asia/Shanghai, so this should give 2026-09-02
    expect(ymdLocal(d)).toBe('2026-09-02');
  });

  it('formats a date that is unambiguous', () => {
    const d = new Date('2026-06-15T10:00:00Z');
    // In CST, this is 2026-06-15 18:00
    expect(ymdLocal(d)).toBe('2026-06-15');
  });
});

describe('todayLocal', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = todayLocal();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('diffDaysLocal', () => {
  it('calculates difference between two dates', () => {
    expect(diffDaysLocal('2026-09-05', '2026-09-02')).toBe(3);
    expect(diffDaysLocal('2026-09-02', '2026-09-05')).toBe(-3);
  });

  it('returns 0 for same date', () => {
    expect(diffDaysLocal('2026-09-02', '2026-09-02')).toBe(0);
  });
});