import { describe, expect, it } from 'vitest';
import type { Employment, Schedule, TimelineItem } from './api';
import {
  calculateDailyCapacity,
  dayTargetHours,
  hasAbsence,
  isDayInEmploymentPattern,
  isWeekend,
  scheduleKind,
  sumActivitiesForDate,
  sumPlanningForDate,
} from './capacity';

function employment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: 1,
    userId: 1,
    weeklyTargetHours: 40,
    weekly_target_hours: 40,
    patternAm: [1, 1, 1, 1, 1],
    patternPm: [1, 1, 1, 1, 1],
    fromDate: '2020-01-01',
    from_date: '2020-01-01',
    toDate: null,
    to_date: null,
    ...overrides,
  };
}

function schedule(date: string, absenceCode: string): Schedule {
  return { id: 1, user_id: 1, date, absence_code: absenceCode, am: true, pm: true };
}

// 2024-03-04 is a Monday, 2024-03-09 a Saturday.
const MONDAY = '2024-03-04';
const SATURDAY = '2024-03-09';

describe('isWeekend', () => {
  it('detects Saturday and Sunday', () => {
    expect(isWeekend('2024-03-09')).toBe(true);
    expect(isWeekend('2024-03-10')).toBe(true);
    expect(isWeekend(MONDAY)).toBe(false);
  });
});

describe('isDayInEmploymentPattern', () => {
  it('is true for a weekday covered by the pattern', () => {
    expect(isDayInEmploymentPattern(MONDAY, [employment()])).toBe(true);
  });

  it('is false for weekends', () => {
    expect(isDayInEmploymentPattern(SATURDAY, [employment()])).toBe(false);
  });

  it('is false outside the employment period', () => {
    expect(
      isDayInEmploymentPattern(MONDAY, [
        employment({ fromDate: '2025-01-01', from_date: '2025-01-01' }),
      ]),
    ).toBe(false);
    expect(
      isDayInEmploymentPattern(MONDAY, [
        employment({ toDate: '2024-01-31', to_date: '2024-01-31' }),
      ]),
    ).toBe(false);
  });

  it('respects weekdays that are not worked (pattern value 0)', () => {
    const noMonday = employment({ patternAm: [0, 1, 1, 1, 1], patternPm: [0, 1, 1, 1, 1] });
    expect(isDayInEmploymentPattern(MONDAY, [noMonday])).toBe(false);
    expect(isDayInEmploymentPattern('2024-03-05', [noMonday])).toBe(true);
  });

  it('accepts patterns delivered as JSON strings and counts a half day as active', () => {
    const halfDays = employment({ patternAm: '[4,4,4,4,4]', patternPm: '[0,0,0,0,0]' });
    expect(isDayInEmploymentPattern(MONDAY, [halfDays])).toBe(true);
  });
});

describe('dayTargetHours', () => {
  it('returns 0 for days outside the pattern', () => {
    expect(dayTargetHours(SATURDAY, [employment()])).toBe(0);
  });

  it('divides weekly hours by the number of active days', () => {
    expect(dayTargetHours(MONDAY, [employment()])).toBe(8);
    const fourDays = employment({
      weeklyTargetHours: 32,
      weekly_target_hours: 32,
      patternAm: [1, 1, 1, 1, 0],
      patternPm: [1, 1, 1, 1, 0],
    });
    expect(dayTargetHours(MONDAY, [fourDays])).toBe(8);
    const partTime = employment({ weeklyTargetHours: 20, weekly_target_hours: 20 });
    expect(dayTargetHours(MONDAY, [partTime])).toBe(4);
  });

  it('prefers an explicit daily target', () => {
    expect(dayTargetHours(MONDAY, [employment({ daily_target_hours: 6 })])).toBe(6);
  });

  it('uses the fallback when the period has no hour information', () => {
    const noHours = employment({ weeklyTargetHours: 0, weekly_target_hours: 0 });
    expect(dayTargetHours(MONDAY, [noHours], 7.5)).toBe(7.5);
  });
});

describe('scheduleKind', () => {
  it('defaults to WORK', () => {
    expect(scheduleKind(MONDAY, [])).toBe('WORK');
    expect(scheduleKind(MONDAY, [schedule('2024-03-05', 'sick_day')])).toBe('WORK');
  });

  it('classifies known absence codes', () => {
    expect(scheduleKind(MONDAY, [schedule(MONDAY, 'sick_day')])).toBe('SICK');
    expect(scheduleKind(MONDAY, [schedule(MONDAY, 'vacation')])).toBe('VACATION');
    expect(scheduleKind(MONDAY, [schedule(MONDAY, 'public_holiday')])).toBe('HOLIDAY');
    expect(scheduleKind(MONDAY, [schedule(MONDAY, 'parental_leave')])).toBe('OTHER');
  });
});

describe('hasAbsence', () => {
  it('is true for a schedule with an absence code', () => {
    expect(hasAbsence(MONDAY, [schedule(MONDAY, 'vacation')])).toBe(true);
  });

  it('falls back to the built-in holiday list', () => {
    expect(hasAbsence('2026-12-25', [])).toBe(true);
    expect(hasAbsence(MONDAY, [])).toBe(false);
  });
});

describe('sumActivitiesForDate / sumPlanningForDate', () => {
  const items: TimelineItem[] = [
    { userId: 1, date: MONDAY, type: 'work', hours: 3 },
    { userId: 1, date: MONDAY, type: 'activity', seconds: 3600 },
    { userId: 1, date: MONDAY, type: 'plan', hours: 5 },
    { userId: 1, date: '2024-03-05', type: 'work', hours: 8 },
  ];

  it('sums hours and seconds of bookings for the day only', () => {
    expect(sumActivitiesForDate(MONDAY, items)).toBe(4);
  });

  it('counts planning entries by date and by period', () => {
    const planning: TimelineItem[] = [
      { userId: 1, date: MONDAY, type: 'plan', hours: 2 },
      {
        userId: 1,
        date: '2024-03-01',
        type: 'plan',
        hours: 3,
        startsOn: '2024-03-01',
        endsOn: '2024-03-08',
      },
      {
        userId: 1,
        date: '2024-03-11',
        type: 'plan',
        hours: 6,
        startsOn: '2024-03-11',
        endsOn: '2024-03-12',
      },
    ];
    expect(sumPlanningForDate(MONDAY, planning)).toBe(5);
    expect(sumPlanningForDate('2024-03-11', planning)).toBe(6);
  });
});

describe('calculateDailyCapacity', () => {
  const user = { id: 1 };

  it('uses booked hours for past working days', () => {
    const activities: TimelineItem[] = [{ userId: 1, date: MONDAY, type: 'work', hours: 6 }];
    const result = calculateDailyCapacity(user, MONDAY, [employment()], activities, [], []);
    expect(result).toEqual({ targetHours: 8, bookedHours: 6, fillPercent: 75 });
  });

  it('uses planned hours for future working days', () => {
    const date = '2099-03-02'; // Monday
    const planning: TimelineItem[] = [{ userId: 1, date, type: 'plan', hours: 8 }];
    const result = calculateDailyCapacity(user, date, [employment()], [], planning, []);
    expect(result).toEqual({ targetHours: 8, bookedHours: 8, fillPercent: 100 });
  });

  it('returns no fill percentage on absence days and marks them fully booked', () => {
    const result = calculateDailyCapacity(
      user,
      MONDAY,
      [employment()],
      [],
      [],
      [schedule(MONDAY, 'vacation')],
    );
    expect(result).toEqual({ targetHours: 8, bookedHours: 8, fillPercent: null });
  });

  it('has zero target on weekends but still shows booked hours', () => {
    const activities: TimelineItem[] = [{ userId: 1, date: SATURDAY, type: 'work', hours: 2 }];
    const result = calculateDailyCapacity(user, SATURDAY, [employment()], activities, [], []);
    expect(result).toEqual({ targetHours: 0, bookedHours: 2, fillPercent: 0 });
  });

  it('reports overbooking above 100 percent', () => {
    const activities: TimelineItem[] = [{ userId: 1, date: MONDAY, type: 'work', hours: 12 }];
    const result = calculateDailyCapacity(user, MONDAY, [employment()], activities, [], []);
    expect(result.fillPercent).toBe(150);
  });
});
