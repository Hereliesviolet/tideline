import { describe, expect, it } from "vitest";
import {
  calculateBottleneck,
  calculateDailyCapacity,
  dayTargetHours,
  getPlanningEntriesForDate,
  isDayInEmploymentPattern,
  isWeekend,
  sumActivitiesForDate,
  sumPlanningForDate,
} from "./capacity";

type Employment = Parameters<typeof dayTargetHours>[1][number];
type Item = Parameters<typeof sumPlanningForDate>[1][number];

const fullTime: Employment = {
  from_date: "2020-01-01",
  to_date: null,
  daily_target_hours: null,
  weekly_target_hours: 40,
  patternAm: [1, 1, 1, 1, 1],
  patternPm: [1, 1, 1, 1, 1],
};

// 2024-03-04 is a Monday, 2024-03-09 a Saturday.
const MONDAY = "2024-03-04";
const SATURDAY = "2024-03-09";

describe("isWeekend", () => {
  it("detects weekends", () => {
    expect(isWeekend(SATURDAY)).toBe(true);
    expect(isWeekend(MONDAY)).toBe(false);
  });
});

describe("isDayInEmploymentPattern", () => {
  it("accepts working weekdays and rejects weekends", () => {
    expect(isDayInEmploymentPattern(MONDAY, [fullTime])).toBe(true);
    expect(isDayInEmploymentPattern(SATURDAY, [fullTime])).toBe(false);
  });

  it("rejects days outside the employment period", () => {
    expect(isDayInEmploymentPattern(MONDAY, [{ ...fullTime, to_date: "2024-01-31" }])).toBe(false);
  });

  it("supports JSON string patterns and days off", () => {
    const fridayOff = { ...fullTime, patternAm: "[1,1,1,1,0]", patternPm: "[1,1,1,1,0]" };
    expect(isDayInEmploymentPattern("2024-03-08", [fridayOff])).toBe(false);
    expect(isDayInEmploymentPattern(MONDAY, [fridayOff])).toBe(true);
  });
});

describe("dayTargetHours", () => {
  it("returns 0 outside the pattern", () => {
    expect(dayTargetHours(SATURDAY, [fullTime])).toBe(0);
  });

  it("derives daily hours from the weekly target", () => {
    expect(dayTargetHours(MONDAY, [fullTime])).toBe(8);
  });

  it("prefers an explicit daily target and otherwise uses the fallback", () => {
    expect(dayTargetHours(MONDAY, [{ ...fullTime, daily_target_hours: 6 }])).toBe(6);
    expect(dayTargetHours(MONDAY, [{ ...fullTime, weekly_target_hours: null }], 7)).toBe(7);
  });
});

describe("planning and booking sums", () => {
  const planning: Item[] = [
    { userId: 1, date: MONDAY, type: "plan", hours: 2, projectName: "Alpha" },
    {
      userId: 1,
      date: "2024-03-01",
      type: "plan",
      hours: 3,
      projectName: "Beta",
      startsOn: "2024-03-01",
      endsOn: "2024-03-08",
    },
  ];

  it("sums explicit and period-based planning for a weekday", () => {
    expect(sumPlanningForDate(MONDAY, planning)).toBe(5);
  });

  it("ignores period-based planning on weekends in the per-project view", () => {
    expect(getPlanningEntriesForDate(SATURDAY, planning)).toEqual([]);
    expect(
      getPlanningEntriesForDate(MONDAY, planning)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("converts seconds to hours for bookings", () => {
    const bookings: Item[] = [
      { userId: 1, date: MONDAY, type: "work", hours: 1.5 },
      { userId: 1, date: MONDAY, type: "activity", seconds: 1800 },
      { userId: 1, date: MONDAY, type: "plan", hours: 9 },
    ];
    expect(sumActivitiesForDate(MONDAY, bookings)).toBe(2);
  });
});

describe("calculateDailyCapacity", () => {
  it("uses bookings for past days", () => {
    const activities: Item[] = [{ userId: 1, date: MONDAY, type: "work", hours: 4 }];
    expect(calculateDailyCapacity({ id: 1 }, MONDAY, [fullTime], activities, [], [])).toEqual({
      targetHours: 8,
      bookedHours: 4,
      fillPercent: 50,
    });
  });

  it("uses planning for future days", () => {
    const date = "2099-03-02"; // Monday
    const planning: Item[] = [{ userId: 1, date, type: "plan", hours: 4 }];
    expect(calculateDailyCapacity({ id: 1 }, date, [fullTime], [], planning, [])).toEqual({
      targetHours: 8,
      bookedHours: 4,
      fillPercent: 50,
    });
  });

  it("returns a null fill percentage on absence days", () => {
    const schedules = [{ date: MONDAY, absence_code: "vacation" }];
    expect(calculateDailyCapacity({ id: 1 }, MONDAY, [fullTime], [], [], schedules)).toEqual({
      targetHours: 8,
      bookedHours: 8,
      fillPercent: null,
    });
  });

  it("has no target on weekends", () => {
    expect(calculateDailyCapacity({ id: 1 }, SATURDAY, [fullTime], [], [], [])).toEqual({
      targetHours: 0,
      bookedHours: 0,
      fillPercent: 0,
    });
  });
});

describe("calculateBottleneck", () => {
  it("flags days above 100 percent", () => {
    const planning: Item[] = [
      { userId: 1, date: MONDAY, type: "plan", hours: 10, projectName: "A" },
    ];
    expect(calculateBottleneck(MONDAY, planning, 8)).toMatchObject({
      isBottleneck: true,
      totalHours: 10,
      fillPercent: 125,
      overlappingProjects: 1,
    });
  });

  it("flags overlapping projects even below 100 percent", () => {
    const planning: Item[] = [
      { userId: 1, date: MONDAY, type: "plan", hours: 2, projectName: "A" },
      { userId: 1, date: MONDAY, type: "plan", hours: 2, projectName: "B" },
    ];
    expect(calculateBottleneck(MONDAY, planning, 8)).toMatchObject({
      isBottleneck: true,
      overlappingProjects: 2,
    });
  });

  it("does not flag a single project within capacity", () => {
    const planning: Item[] = [
      { userId: 1, date: MONDAY, type: "plan", hours: 8, projectName: "A" },
    ];
    expect(calculateBottleneck(MONDAY, planning, 8).isBottleneck).toBe(false);
  });
});
