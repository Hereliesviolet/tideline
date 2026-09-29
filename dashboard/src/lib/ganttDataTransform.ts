import type { User } from '@/lib/api';
import type { GanttFeature } from '@/types/gantt';

export type UserGanttData = {
  user: User;
  features: GanttFeature[];
};

/**
 * Merged ggf. eine vom Backend pro Tag gelieferte Feature-Liste in
 * zusammenhängende Mehrtages-Runs zusammen. Bricht bei:
 *  - Lücke (>= 1 Kalendertag)
 *  - geänderter hoursPerDay
 *  - geänderter projectColor / status
 */
export function mergeGanttFeaturesIntoRuns(features: GanttFeature[]): GanttFeature[] {
  if (features.length === 0) return [];

  const byProject = new Map<string, GanttFeature[]>();
  for (const f of features) {
    const list = byProject.get(f.name) ?? [];
    list.push(f);
    byProject.set(f.name, list);
  }

  const merged: GanttFeature[] = [];

  for (const [projectName, list] of byProject.entries()) {
    const sorted = [...list].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );

    type Run = {
      start: Date;
      endExclusive: Date;
      hoursPerDay: number;
      totalHours: number;
      days: number;
      status: GanttFeature['status'];
      projectColor?: string;
    };

    const runs: Run[] = [];
    let current: Run | null = null;

    for (const f of sorted) {
      const fStart = new Date(f.startAt);
      fStart.setHours(0, 0, 0, 0);
      const fEnd = new Date(f.endAt ?? f.startAt);
      fEnd.setHours(0, 0, 0, 0);
      // endAt ist exklusiv; falls Backend Tag-genau liefert (start === end), verlängere auf nächsten Tag
      if (fEnd.getTime() === fStart.getTime()) {
        fEnd.setDate(fEnd.getDate() + 1);
      }

      // Anzahl Tage in diesem Feature (i. d. R. 1 vom Backend)
      const featureDays = Math.max(
        1,
        Math.round((fEnd.getTime() - fStart.getTime()) / 86_400_000),
      );
      const hoursPerDay = f.hoursPerDay ?? (f.totalHours ?? 0) / featureDays;

      const canExtend =
        current !== null &&
        current.endExclusive.getTime() === fStart.getTime() &&
        Math.abs(current.hoursPerDay - hoursPerDay) < 0.01 &&
        current.projectColor === f.projectColor;

      if (canExtend && current) {
        current.endExclusive = fEnd;
        current.days += featureDays;
        current.totalHours += hoursPerDay * featureDays;
      } else {
        if (current) runs.push(current);
        current = {
          start: fStart,
          endExclusive: fEnd,
          hoursPerDay,
          totalHours: hoursPerDay * featureDays,
          days: featureDays,
          status: f.status,
          projectColor: f.projectColor,
        };
      }
    }
    if (current) runs.push(current);

    for (const run of runs) {
      const id = `${projectName.replace(/\s+/g, '-')}-${run.start
        .toISOString()
        .slice(0, 10)}-${run.days}d`;
      merged.push({
        id,
        name: projectName,
        startAt: run.start,
        endAt: run.endExclusive,
        status: run.status,
        hoursPerDay: run.hoursPerDay,
        totalHours: run.totalHours,
        projectColor: run.projectColor,
        actualDays: run.days,
      });
    }
  }

  // Stabile Sortierung nach Startdatum, dann nach Hours/Day (größte zuerst)
  merged.sort((a, b) => {
    const d = a.startAt.getTime() - b.startAt.getTime();
    if (d !== 0) return d;
    return (b.hoursPerDay ?? 0) - (a.hoursPerDay ?? 0);
  });

  return merged;
}
