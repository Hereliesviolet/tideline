import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUserSeeTeam,
  getVisibleTeamLevelsForUser,
  isFilteredMocoUnit,
  mapMocoUnitToTeamLevel,
  resolveDashboardTeamLevel,
  teamLevelsToTeamValues,
} from "./mocoMapping";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mapMocoUnitToTeamLevel", () => {
  it.each([
    ["00. Prakti / Werki", 0],
    ["01. Analyst", 1],
    ["02. Berater", 2],
    ["03. Senior Berater", 3],
    ["04. Manager", 4],
    ["05. Senior Manager", 5],
    ["06. Assoc. Partner / Director", 6],
    ["07. Partner", 7],
  ])('maps "%s" to level %i', (unit, level) => {
    expect(mapMocoUnitToTeamLevel(unit)).toBe(level);
  });

  it("maps filtered units to level 0", () => {
    expect(mapMocoUnitToTeamLevel("08. Freelancer")).toBe(0);
    expect(mapMocoUnitToTeamLevel("09. Admin")).toBe(0);
  });

  it("returns level 0 for empty input", () => {
    expect(mapMocoUnitToTeamLevel(null)).toBe(0);
    expect(mapMocoUnitToTeamLevel(undefined)).toBe(0);
  });

  it("falls back to the numeric prefix, and to 0 with a warning for unknown names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapMocoUnitToTeamLevel("5. Custom role")).toBe(5);
    expect(mapMocoUnitToTeamLevel("Custom role")).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("isFilteredMocoUnit", () => {
  it("flags freelancer, admin and p&c units only", () => {
    expect(isFilteredMocoUnit("08. Freelancer")).toBe(true);
    expect(isFilteredMocoUnit("09. Admin")).toBe(true);
    expect(isFilteredMocoUnit("10. P&C")).toBe(true);
    expect(isFilteredMocoUnit("04. Manager")).toBe(false);
    expect(isFilteredMocoUnit(null)).toBe(false);
  });
});

describe("resolveDashboardTeamLevel", () => {
  it("prefers the live MOCO unit over the stored level", () => {
    expect(resolveDashboardTeamLevel(2, "04. Manager", null)).toBe(4);
  });

  it("uses the stored unit name when no live unit is available", () => {
    expect(resolveDashboardTeamLevel(2, null, "05. Senior Manager")).toBe(5);
  });

  it("keeps the stored level for filtered or missing units", () => {
    expect(resolveDashboardTeamLevel(6, "09. Admin", null)).toBe(6);
    expect(resolveDashboardTeamLevel(3, null, null)).toBe(3);
  });

  it("clamps out-of-range stored levels to 0", () => {
    expect(resolveDashboardTeamLevel(42, null, null)).toBe(0);
  });
});

describe("visibility", () => {
  it("shows only levels strictly below the own level", () => {
    expect(getVisibleTeamLevelsForUser(0)).toEqual([]);
    expect(getVisibleTeamLevelsForUser(4)).toEqual([0, 1, 2, 3]);
  });

  it("shows all levels to super users", () => {
    expect(getVisibleTeamLevelsForUser(0, true)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("canUserSeeTeam agrees with the strict-below rule", () => {
    expect(canUserSeeTeam(4, 3)).toBe(true);
    expect(canUserSeeTeam(4, 4)).toBe(false);
    expect(canUserSeeTeam(4, 6)).toBe(false);
  });

  it("formats levels as zero-padded team values", () => {
    expect(teamLevelsToTeamValues([0, 5])).toEqual(["00", "05"]);
  });
});
