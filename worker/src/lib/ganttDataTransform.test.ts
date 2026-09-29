import { describe, expect, it } from "vitest";
import { transformUsersToGanttFeatures } from "./ganttDataTransform";

type Args = Parameters<typeof transformUsersToGanttFeatures>;

const employment = {
  from_date: "2020-01-01",
  to_date: null,
  daily_target_hours: null,
  weekly_target_hours: 40,
  patternAm: [1, 1, 1, 1, 1],
  patternPm: [1, 1, 1, 1, 1],
};

const users: Args[0] = [{ id: 1, displayName: "Test User" }];
const employments: Args[2] = new Map([[1, [employment]]]);

// Monday to Sunday
const from = new Date("2024-03-04T00:00:00");
const to = new Date("2024-03-10T00:00:00");

const weekPlan: Args[1] = [
  {
    userId: 1,
    date: "2024-03-04",
    type: "plan",
    hours: 8,
    projectName: "Alpha",
    startsOn: "2024-03-04",
    endsOn: "2024-03-08",
  },
];

describe("transformUsersToGanttFeatures", () => {
  it("merges consecutive planned weekdays into one feature and skips the weekend", () => {
    const [result] = transformUsersToGanttFeatures(
      users,
      weekPlan,
      employments,
      new Map(),
      from,
      to,
    );
    expect(result.userId).toBe(1);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      name: "Alpha",
      actualDays: 5,
      hoursPerDay: 8,
      totalHours: 40,
      status: { id: "ideal" },
    });
    expect(result.features[0].endAt.getDate()).toBe(9); // exclusive end: Saturday
  });

  it("splits the feature on an absence day", () => {
    const schedules: Args[3] = new Map([[1, [{ date: "2024-03-06", absence_code: "vacation" }]]]);
    const [result] = transformUsersToGanttFeatures(
      users,
      weekPlan,
      employments,
      schedules,
      from,
      to,
    );
    expect(result.features.map((f) => f.actualDays)).toEqual([2, 2]);
  });

  it("reports overtime when planning exceeds the target", () => {
    const overbooked: Args[1] = [{ ...weekPlan[0], hours: 10 }];
    const [result] = transformUsersToGanttFeatures(
      users,
      overbooked,
      employments,
      new Map(),
      from,
      to,
    );
    expect(result.features[0].status.id).toBe("overtime");
  });

  it("returns an empty feature list for users without planning", () => {
    const [result] = transformUsersToGanttFeatures(users, [], employments, new Map(), from, to);
    expect(result.features).toEqual([]);
  });
});
