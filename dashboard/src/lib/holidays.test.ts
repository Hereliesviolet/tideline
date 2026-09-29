import { describe, expect, it } from 'vitest';
import { HAMBURG_HOLIDAYS, isHamburgHoliday } from './holidays';

describe('isHamburgHoliday', () => {
  it('recognises fixed and movable holidays', () => {
    expect(isHamburgHoliday('2026-01-01')).toBe(true);
    expect(isHamburgHoliday('2026-04-03')).toBe(true); // Good Friday
    expect(isHamburgHoliday('2026-10-31')).toBe(true); // Reformation Day
  });

  it('returns false for ordinary days', () => {
    expect(isHamburgHoliday('2026-03-03')).toBe(false);
  });

  it('ignores a time suffix on ISO timestamps', () => {
    expect(isHamburgHoliday('2026-12-25T10:30:00.000Z')).toBe(true);
  });

  it('contains only well-formed ISO dates', () => {
    for (const d of HAMBURG_HOLIDAYS) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
