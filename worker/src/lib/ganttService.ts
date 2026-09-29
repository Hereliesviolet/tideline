// src/lib/ganttService.ts
// Service-Layer für Gantt-Feature-Transformation.
// Kapselt die Gantt-Logik aus routes/timeline.ts.

import { transformUsersToGanttFeatures } from "./ganttDataTransform";
import { isoDay, TimelineItem, EmploymentEntry, ScheduleEntry } from "./capacityService";

const DAY_MS = 1000 * 60 * 60 * 24;

// --- Typen ----------------------------------------------------------------

export type SerializedGanttFeature = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  status: { id: string; name: string; color: string };
  hoursPerDay: number;
  totalHours: number;
  projectColor: string;
  actualDays: number;
};

export type GanttFeatureRow = {
  userId: number;
  features: SerializedGanttFeature[];
};

// --- Hilfsfunktionen ------------------------------------------------------

/**
 * Berechnet den SOLL-Startpunkt aus dem angefragten Zeitraum [from, to].
 *
 * Bei einem 30-Tage-Fenster wird Tag 14 (0-basiert) als "heute" definiert,
 * damit Browser- und Server-Zeitzonen keine Rolle spielen.
 * In allen anderen Fällen wird der Server-Heute-Wert als Fallback verwendet.
 */
export function computeSollFrom(from: Date, to: Date): Date {
  const totalDaysInRange = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;

  if (totalDaysInRange === 30) {
    const todayFromRange = new Date(from);
    todayFromRange.setDate(todayFromRange.getDate() + 14);
    todayFromRange.setHours(0, 0, 0, 0);

    const firstSoll = new Date(todayFromRange);
    firstSoll.setDate(firstSoll.getDate() + 1);
    firstSoll.setHours(0, 0, 0, 0);
    return firstSoll;
  } else {
    const serverToday = new Date();
    serverToday.setHours(0, 0, 0, 0);
    return from > serverToday ? from : serverToday;
  }
}

/**
 * Serialisiert ein Date-Objekt als lokales YYYY-MM-DD (ohne Zeitzonen-Shift).
 */
function serializeLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Transformiert Planning-Items zu Gantt-Feature-Zeilen (serialisiert).
 *
 * Kapselt den Aufruf von transformUsersToGanttFeatures + Datums-Serialisierung.
 */
export function buildGanttFeatureRows(
  sollItems: TimelineItem[],
  usersForGantt: Array<{
    id: number;
    displayName: string;
    unitName?: string | null;
  }>,
  employmentsMap: Map<number, EmploymentEntry[]>,
  schedulesMap: Map<number, ScheduleEntry[]>,
  sollFrom: Date,
  to: Date
): GanttFeatureRow[] {
  const ganttData = transformUsersToGanttFeatures(
    usersForGantt,
    sollItems,
    employmentsMap,
    schedulesMap,
    sollFrom,
    to
  );

  return ganttData.map((userData) => ({
    userId: userData.userId,
    features: userData.features.map((f) => ({
      id: f.id,
      name: f.name,
      startAt: serializeLocalDate(f.startAt),
      endAt: serializeLocalDate(f.endAt),
      status: f.status,
      hoursPerDay: f.hoursPerDay,
      totalHours: f.totalHours,
      projectColor: f.projectColor,
      actualDays: f.actualDays,
    })),
  }));
}

/**
 * Wandelt rohe PlanningRow-Daten in TimelineItems um (SOLL-Items für Gantt).
 * Clamp auf den Zeitraum [from, to].
 */
export function buildPlanningItems(
  plans: Array<{
    userId: number | null;
    startsOn: Date;
    endsOn: Date;
    hoursPerDay: number | null;
    color?: string | null;
    projectId?: number | null;
    projectName?: string | null;
    customerName?: string | null;
    taskName?: string | null;
  }>,
  from: Date,
  to: Date
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const p of plans) {
    if (p.userId == null || !p.startsOn || !p.endsOn) continue;
    const start = clamp(new Date(p.startsOn), from, to);
    const end = clamp(new Date(p.endsOn), from, to);
    items.push({
      userId: p.userId,
      date: isoDay(start),
      type: "plan",
      hours: p.hoursPerDay ?? undefined,
      projectName: p.projectName ?? null,
      customerName: p.customerName ?? null,
      taskName: p.taskName ?? null,
      startsOn: isoDay(start),
      endsOn: isoDay(end),
    });
  }
  return items;
}

function clamp(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}
