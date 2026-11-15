import { describe, expect, it } from 'vitest';
import { formatDate } from './dates';

describe('formatDate', () => {
  it('writes a yyyy-mm-dd date for people', () => {
    expect(formatDate('2026-11-07')).toMatch(/Nov/);
    expect(formatDate('2026-11-07')).toMatch(/7/);
  });

  it('returns anything else unchanged', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('soon')).toBe('soon');
  });
});
