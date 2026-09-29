import { describe, expect, it } from 'vitest';
import type { TimelineItem } from './api';
import { classifyBooking, getISTSegments, isInternalProject } from './cellColors';

describe('isInternalProject', () => {
  it('matches the default internal customer case-insensitively', () => {
    expect(isInternalProject('Internal')).toBe(true);
    expect(isInternalProject('  internal ')).toBe(true);
  });

  it('is false for other customers and empty values', () => {
    expect(isInternalProject('Acme')).toBe(false);
    expect(isInternalProject(null)).toBe(false);
    expect(isInternalProject(undefined)).toBe(false);
  });
});

describe('classifyBooking', () => {
  it('prioritises the internal customer over the billable flag', () => {
    expect(classifyBooking('Internal', true)).toBe('internal');
  });

  it('maps the billable flag for external customers', () => {
    expect(classifyBooking('Acme', true)).toBe('billable');
    expect(classifyBooking('Acme', false)).toBe('unbillable');
    expect(classifyBooking('Acme', null)).toBe('neutral');
    expect(classifyBooking('Acme', undefined)).toBe('neutral');
  });
});

describe('getISTSegments', () => {
  const date = '2024-03-04';
  const items: TimelineItem[] = [
    { userId: 1, date, type: 'work', hours: 2, customerName: 'Acme', billable: false },
    { userId: 1, date, type: 'work', hours: 4, customerName: 'Acme', billable: true },
    { userId: 1, date, type: 'work', hours: 2, customerName: 'Internal', billable: false },
    { userId: 1, date, type: 'plan', hours: 8, customerName: 'Acme', billable: true },
    { userId: 1, date: '2024-03-05', type: 'work', hours: 8, customerName: 'Acme', billable: true },
  ];

  it('groups bookings by type, ordered internal, billable, unbillable', () => {
    const segments = getISTSegments(items, date, 8);
    expect(segments.map((s) => [s.type, s.hours, s.percent])).toEqual([
      ['internal', 2, 25],
      ['billable', 4, 50],
      ['unbillable', 2, 25],
    ]);
  });

  it('returns nothing without bookings or without target hours', () => {
    expect(getISTSegments(items, '2024-03-06', 8)).toEqual([]);
    expect(getISTSegments(items, date, 0)).toEqual([]);
  });
});
