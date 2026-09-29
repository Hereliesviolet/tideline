// src/lib/capacityService.ts
// Service-Layer für Capacity-, Bottleneck- und Projekt-Berechnungen.
// Kapselt die Berechnungsschleifen aus routes/timeline.ts.

import {
  calculateDailyCapacity,
  calculateBottleneck,
  getProjectsForDate,
  getPlanningEntriesForDate,
  dayTargetHours,
} from "./capacity";

// --- Shared Types ---------------------------------------------------------

export type ActivityRow = {
  userId: number | null;
  date: Date;
  seconds: number | null;
  hours: number | null;
  billable: boolean | null;
  projectId: number | null;
};

export type PlanningRow = {
  userId: number | null;
  startsOn: Date;
  endsOn: Date;
  hoursPerDay: number | null;
  color: string | null;
  projectId: number | null;
  projectName?: string | null;
  customerName?: string | null;
  taskName?: string | null;
};

export type TimelineItem = {
  userId: number;
  date: string;
  type: "work" | "plan" | "absence" | "activity";
  seconds?: number;
  hours?: number;
  billable?: boolean | null;
  color?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  customerName?: string | null;
  taskName?: string | null;
  absenceCode?: string | null;
  startsOn?: string;
  endsOn?: string;
};

export type CapacityEntry = {
  userId: number;
  date: string;
  targetHours: number;
  bookedHours: number;
  fillPercent: number | null;
};

export type BottleneckEntry = {
  userId: number;
  date: string;
  isBottleneck: boolean;
  totalHours: number;
  fillPercent: number;
  overlappingProjects: number;
};

export type ProjectEntry = {
  userId: number;
  date: string;
  projects: Array<{
    name: string;
    hours: number;
    billable?: boolean | null;
    customerName?: string | null;
  }>;
};

export type EmploymentEntry = {
  from_date: string;
  to_date: string | null;
  daily_target_hours: number | null;
  weekly_target_hours: number | null;
  patternAm?: string | number[] | null;
  patternPm?: string | number[] | null;
};

export type ScheduleEntry = {
  date: string;
  absence_code: string | null;
};

// --- Hilfsfunktionen ------------------------------------------------------

export function isoDay(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Baut eine Map userId → EmploymentEntry[] aus Prisma-Employment-Rohdaten.
 * Parst patternAm/patternPm JSON falls vorhanden.
 */
export function buildEmploymentsMap(
  employmentsData: Array<{
    userId: number;
    fromDate: Date;
    toDate: Date | null;
    weeklyTargetHours: number | null;
    patternAm: string | null;
    patternPm: string | null;
  }>
): Map<number, EmploymentEntry[]> {
  const map = new Map<number, EmploymentEntry[]>();
  for (const emp of employmentsData) {
    if (!map.has(emp.userId)) map.set(emp.userId, []);
    let patternAm: string | number[] | null = null;
    let patternPm: string | number[] | null = null;
    if (emp.patternAm) {
      try { patternAm = JSON.parse(emp.patternAm); } catch { patternAm = emp.patternAm; }
    }
    if (emp.patternPm) {
      try { patternPm = JSON.parse(emp.patternPm); } catch { patternPm = emp.patternPm; }
    }
    map.get(emp.userId)!.push({
      from_date: emp.fromDate.toISOString().slice(0, 10),
      to_date: emp.toDate ? emp.toDate.toISOString().slice(0, 10) : null,
      daily_target_hours: null,
      weekly_target_hours: emp.weeklyTargetHours,
      patternAm,
      patternPm,
    });
  }
  return map;
}

/**
 * Baut eine Map userId → ScheduleEntry[] aus Schedule-Rohdaten.
 */
export function buildSchedulesMap(
  schedulesData: Array<{ userId: number; date: Date; absenceCode: string }>
): Map<number, ScheduleEntry[]> {
  const map = new Map<number, ScheduleEntry[]>();
  for (const sched of schedulesData) {
    if (!map.has(sched.userId)) map.set(sched.userId, []);
    map.get(sched.userId)!.push({
      date: isoDay(new Date(sched.date)),
      absence_code: sched.absenceCode,
    });
  }
  return map;
}

/**
 * Baut O(1)-Lookup-Maps für IST- und SOLL-Items.
 * Ersetzt die O(n²)-filter()-Aufrufe in den Berechnungsschleifen.
 */
export function buildWorkAndPlanMaps(items: TimelineItem[]): {
  workItemsByUserAndDate: Map<number, Map<string, TimelineItem[]>>;
  planItemsByUser: Map<number, TimelineItem[]>;
} {
  const workItemsByUserAndDate = new Map<number, Map<string, TimelineItem[]>>();
  const planItemsByUser = new Map<number, TimelineItem[]>();

  for (const item of items) {
    if (item.type === "work") {
      if (!workItemsByUserAndDate.has(item.userId)) {
        workItemsByUserAndDate.set(item.userId, new Map());
      }
      const byDate = workItemsByUserAndDate.get(item.userId)!;
      if (!byDate.has(item.date)) byDate.set(item.date, []);
      byDate.get(item.date)!.push(item);
    } else if (item.type === "plan") {
      if (!planItemsByUser.has(item.userId)) planItemsByUser.set(item.userId, []);
      planItemsByUser.get(item.userId)!.push(item);
    }
  }

  return { workItemsByUserAndDate, planItemsByUser };
}

/**
 * Berechnet Capacities, Bottlenecks und Projekte für alle User über den gesamten
 * Datumszeitraum [from, to].
 *
 * Wird vom Haupt-/timeline-Handler verwendet, der alle drei Kennzahlen gleichzeitig benötigt.
 */
export function calculateCapacitiesAndMore(
  users: Array<{ id: number }>,
  workItemsByUserAndDate: Map<number, Map<string, TimelineItem[]>>,
  planItemsByUser: Map<number, TimelineItem[]>,
  schedulesMap: Map<number, ScheduleEntry[]>,
  employmentsMap: Map<number, EmploymentEntry[]>,
  from: Date,
  to: Date,
  today: Date
): {
  capacities: CapacityEntry[];
  bottlenecks: BottleneckEntry[];
  projects: ProjectEntry[];
} {
  const capacities: CapacityEntry[] = [];
  const bottlenecks: BottleneckEntry[] = [];
  const projects: ProjectEntry[] = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateISO = isoDay(d);
    const isPast = d < today;

    for (const user of users) {
      const userActivities = workItemsByUserAndDate.get(user.id)?.get(dateISO) ?? [];
      const userPlanning = planItemsByUser.get(user.id) ?? [];
      const userEmployments = employmentsMap.get(user.id) ?? [];
      const userSchedules = schedulesMap.get(user.id) ?? [];

      const capacity = calculateDailyCapacity(
        user, dateISO, userEmployments, userActivities, userPlanning, userSchedules
      );
      capacities.push({
        userId: user.id,
        date: dateISO,
        targetHours: capacity.targetHours,
        bookedHours: capacity.bookedHours,
        fillPercent: capacity.fillPercent,
      });

      if (!isPast) {
        const targetHours = dayTargetHours(dateISO, userEmployments, 8);
        const bottleneck = calculateBottleneck(dateISO, userPlanning, targetHours);
        bottlenecks.push({
          userId: user.id,
          date: dateISO,
          isBottleneck: bottleneck.isBottleneck,
          totalHours: bottleneck.totalHours,
          fillPercent: bottleneck.fillPercent,
          overlappingProjects: bottleneck.overlappingProjects,
        });
      }

      let projectList: Array<{
        name: string;
        hours: number;
        billable?: boolean | null;
        customerName?: string | null;
      }>;
      if (isPast) {
        projectList = getProjectsForDate(dateISO, userActivities);
      } else {
        const planningEntries = getPlanningEntriesForDate(dateISO, userPlanning);
        projectList = planningEntries.map((entry) => ({
          name: entry.name,
          hours: entry.hours,
          billable: null,
          customerName: entry.customerName,
        }));
      }
      if (projectList.length > 0) {
        projects.push({ userId: user.id, date: dateISO, projects: projectList });
      }
    }
  }

  return { capacities, bottlenecks, projects };
}

/**
 * Berechnet nur Capacities (für den dedizierten /capacity-Sub-Endpoint).
 * Verwendet O(1)-Maps intern.
 */
export function calculateCapacitiesOnly(
  users: Array<{ id: number }>,
  timelineItems: TimelineItem[],
  schedulesMap: Map<number, ScheduleEntry[]>,
  employmentsMap: Map<number, EmploymentEntry[]>,
  from: Date,
  to: Date
): CapacityEntry[] {
  const { workItemsByUserAndDate, planItemsByUser } = buildWorkAndPlanMaps(timelineItems);
  const capacities: CapacityEntry[] = [];

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateISO = isoDay(d);
    for (const user of users) {
      const userActivities = workItemsByUserAndDate.get(user.id)?.get(dateISO) ?? [];
      const userPlanning = planItemsByUser.get(user.id) ?? [];

      const capacity = calculateDailyCapacity(
        user, dateISO,
        employmentsMap.get(user.id) ?? [],
        userActivities,
        userPlanning,
        schedulesMap.get(user.id) ?? []
      );
      capacities.push({
        userId: user.id,
        date: dateISO,
        targetHours: capacity.targetHours,
        bookedHours: capacity.bookedHours,
        fillPercent: capacity.fillPercent,
      });
    }
  }

  return capacities;
}

/**
 * Berechnet nur Bottlenecks für SOLL-Tage (für den dedizierten /bottlenecks-Sub-Endpoint).
 */
export function calculateBottlenecksOnly(
  users: Array<{ id: number }>,
  planningItems: TimelineItem[],
  employmentsMap: Map<number, EmploymentEntry[]>,
  sollFrom: Date,
  to: Date
): BottleneckEntry[] {
  const planItemsByUser = new Map<number, TimelineItem[]>();
  for (const item of planningItems) {
    if (!planItemsByUser.has(item.userId)) planItemsByUser.set(item.userId, []);
    planItemsByUser.get(item.userId)!.push(item);
  }

  const bottlenecks: BottleneckEntry[] = [];
  for (let d = new Date(sollFrom); d <= to; d.setDate(d.getDate() + 1)) {
    const dateISO = isoDay(d);
    for (const user of users) {
      const userPlanning = planItemsByUser.get(user.id) ?? [];
      const targetHours = dayTargetHours(dateISO, employmentsMap.get(user.id) ?? [], 8);
      const bottleneck = calculateBottleneck(dateISO, userPlanning, targetHours);
      bottlenecks.push({
        userId: user.id,
        date: dateISO,
        isBottleneck: bottleneck.isBottleneck,
        totalHours: bottleneck.totalHours,
        fillPercent: bottleneck.fillPercent,
        overlappingProjects: bottleneck.overlappingProjects,
      });
    }
  }

  return bottlenecks;
}

/**
 * Berechnet Projekt-Aggregation pro Tag und User (für den dedizierten /projects-Sub-Endpoint).
 */
export function calculateProjectsOnly(
  users: Array<{ id: number }>,
  timelineItems: TimelineItem[],
  isPast: boolean,
  from: Date,
  to: Date
): ProjectEntry[] {
  const workItemsByUserAndDate = new Map<number, Map<string, TimelineItem[]>>();
  const planItemsByUser = new Map<number, TimelineItem[]>();
  for (const item of timelineItems) {
    if (item.type === "work" || item.type === "activity") {
      if (!workItemsByUserAndDate.has(item.userId)) workItemsByUserAndDate.set(item.userId, new Map());
      const byDate = workItemsByUserAndDate.get(item.userId)!;
      if (!byDate.has(item.date)) byDate.set(item.date, []);
      byDate.get(item.date)!.push(item);
    } else if (item.type === "plan") {
      if (!planItemsByUser.has(item.userId)) planItemsByUser.set(item.userId, []);
      planItemsByUser.get(item.userId)!.push(item);
    }
  }

  const projects: ProjectEntry[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateISO = isoDay(d);
    for (const user of users) {
      let projectList: Array<{ name: string; hours: number; billable?: boolean | null; customerName?: string | null }>;
      if (isPast) {
        const userActivities = workItemsByUserAndDate.get(user.id)?.get(dateISO) ?? [];
        projectList = getProjectsForDate(dateISO, userActivities);
      } else {
        const userPlanning = planItemsByUser.get(user.id) ?? [];
        const planningEntries = getPlanningEntriesForDate(dateISO, userPlanning);
        projectList = planningEntries.map((entry) => ({
          name: entry.name,
          hours: entry.hours,
          billable: null,
          customerName: entry.customerName,
        }));
      }
      if (projectList.length > 0) {
        projects.push({ userId: user.id, date: dateISO, projects: projectList });
      }
    }
  }

  return projects;
}
