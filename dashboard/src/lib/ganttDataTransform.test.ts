import { describe, expect, it } from 'vitest';
import type { GanttFeature } from '@/types/gantt';
import { mergeGanttFeaturesIntoRuns } from './ganttDataTransform';

const status = { id: 'plan', name: 'Plan', color: '#000' };

function day(
  project: string,
  isoDate: string,
  hoursPerDay: number,
  projectColor = '#f00',
): GanttFeature {
  const start = new Date(`${isoDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    id: `${project}-${isoDate}`,
    name: project,
    startAt: start,
    endAt: end,
    status,
    hoursPerDay,
    projectColor,
  };
}

describe('mergeGanttFeaturesIntoRuns', () => {
  it('returns an empty list for empty input', () => {
    expect(mergeGanttFeaturesIntoRuns([])).toEqual([]);
  });

  it('merges consecutive days with the same hours into one run', () => {
    const merged = mergeGanttFeaturesIntoRuns([
      day('Alpha', '2024-03-04', 4),
      day('Alpha', '2024-03-05', 4),
      day('Alpha', '2024-03-06', 4),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: 'Alpha',
      actualDays: 3,
      hoursPerDay: 4,
      totalHours: 12,
    });
    expect(merged[0].startAt.toISOString().slice(0, 10)).toBe('2024-03-04');
    expect(merged[0].endAt.toISOString().slice(0, 10)).toBe('2024-03-07');
  });

  it('splits runs at gaps', () => {
    const merged = mergeGanttFeaturesIntoRuns([
      day('Alpha', '2024-03-04', 4),
      day('Alpha', '2024-03-06', 4),
    ]);
    expect(merged.map((f) => f.actualDays)).toEqual([1, 1]);
  });

  it('splits runs when hours per day or colour change', () => {
    const hoursChange = mergeGanttFeaturesIntoRuns([
      day('Alpha', '2024-03-04', 4),
      day('Alpha', '2024-03-05', 8),
    ]);
    expect(hoursChange).toHaveLength(2);
    const colourChange = mergeGanttFeaturesIntoRuns([
      day('Alpha', '2024-03-04', 4, '#f00'),
      day('Alpha', '2024-03-05', 4, '#0f0'),
    ]);
    expect(colourChange).toHaveLength(2);
  });

  it('never merges different projects and sorts by start date, then hours per day', () => {
    const merged = mergeGanttFeaturesIntoRuns([
      day('Beta', '2024-03-04', 2),
      day('Alpha', '2024-03-04', 6),
      day('Alpha', '2024-03-03', 1),
    ]);
    expect(merged.map((f) => `${f.name}:${f.hoursPerDay}`)).toEqual([
      'Alpha:1',
      'Alpha:6',
      'Beta:2',
    ]);
  });
});
