import { describe, expect, it, vi } from 'vitest';
import {
  getVisibleTeamLevelsForUser,
  mapMocoUnitToTeamLevel,
  teamLevelsToTeamValues,
} from './mocoMapping';

describe('mapMocoUnitToTeamLevel', () => {
  it.each([
    ['00. Prakti / Werki', 0],
    ['01. Analyst', 1],
    ['02. Berater', 2],
    ['03. Senior Berater', 3],
    ['04. Manager', 4],
    ['05. Senior Manager', 5],
    ['06. Assoc. Partner / Director', 6],
    ['07. Partner', 7],
  ])('maps "%s" to level %i', (unit, level) => {
    expect(mapMocoUnitToTeamLevel(unit)).toBe(level);
  });

  it('maps filtered units to level 0', () => {
    expect(mapMocoUnitToTeamLevel('08. Freelancer')).toBe(0);
    expect(mapMocoUnitToTeamLevel('09. Admin')).toBe(0);
  });

  it('falls back to level 0 for empty values', () => {
    expect(mapMocoUnitToTeamLevel(null)).toBe(0);
    expect(mapMocoUnitToTeamLevel('')).toBe(0);
  });

  it('recognises role names without the numeric prefix', () => {
    expect(mapMocoUnitToTeamLevel('Senior Manager')).toBe(5);
    expect(mapMocoUnitToTeamLevel('Partner')).toBe(7);
  });

  it('falls back to the numeric prefix and warns for unknown names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(mapMocoUnitToTeamLevel('3. Something else')).toBe(3);
    expect(mapMocoUnitToTeamLevel('Something else')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('getVisibleTeamLevelsForUser', () => {
  it('shows only levels strictly below the own level', () => {
    expect(getVisibleTeamLevelsForUser(0)).toEqual([]);
    expect(getVisibleTeamLevelsForUser(3)).toEqual([0, 1, 2]);
  });

  it('shows every level to super users', () => {
    expect(getVisibleTeamLevelsForUser(0, true)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('teamLevelsToTeamValues', () => {
  it('zero-pads levels', () => {
    expect(teamLevelsToTeamValues([0, 3, 7])).toEqual(['00', '03', '07']);
  });
});
