// src/lib/ganttDataTransform.ts
// Gantt-Feature-Transformation für Timeline (portiert vom Client)

import { calculateDailyCapacity, dayTargetHours, sumPlanningForDate, getPlanningEntriesForDate, isWeekend } from './capacity';

type User = {
  id: number;
  displayName?: string;
  unitName?: string | null;
};

type TimelineItem = {
  userId: number;
  date: string; // YYYY-MM-DD
  type: "work" | "plan" | "activity" | "absence";
  seconds?: number;
  hours?: number;
  billable?: boolean | null;
  projectId?: number | null;
  projectName?: string | null;
  taskName?: string | null;
  startsOn?: string; // YYYY-MM-DD
  endsOn?: string; // YYYY-MM-DD
};

type Employment = {
  from_date: string;
  to_date: string | null;
  daily_target_hours: number | null;
  weekly_target_hours: number | null;
};

type Schedule = {
  date: string;
  absence_code: string | null;
};

type GanttStatus = {
  id: string;
  name: string;
  color: string;
};

type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: GanttStatus;
  hoursPerDay: number;
  totalHours: number;
  projectColor: string;
  actualDays: number; // Anzahl der tatsächlichen Tage mit Buchungspunkten (ohne Wochenenden)
};

const GANTT_STATUSES: GanttStatus[] = [
  {
    id: 'free',
    name: 'Freie Kapazität',
    color: '#9CA3AF', // base-300/40 - sehr hell
  },
  {
    id: 'medium',
    name: 'Mittel',
    color: '#F59E0B', // warning - gelb
  },
  {
    id: 'ideal',
    name: 'Ideal',
    color: '#10B981', // success - grün
  },
  {
    id: 'overtime',
    name: 'Overtime',
    color: '#EF4444', // error - rot
  },
];

function getStatusByFillPercent(fillPercent: number | null, isPast: boolean): GanttStatus {
  if (fillPercent === null) {
    // Abwesenheit
    return {
      id: 'absence',
      name: 'Abwesenheit',
      color: '#4B5563', // neutral - dunkelgrau
    };
  }

  if (fillPercent < 40) {
    return GANTT_STATUSES[0]; // Freie Kapazität
  } else if (fillPercent < 80) {
    return GANTT_STATUSES[1]; // Mittel
  } else if (fillPercent <= 100) {
    return GANTT_STATUSES[2]; // Ideal
  } else {
    return GANTT_STATUSES[3]; // Overtime
  }
}

function getProjectUniqueColor(projectName: string): string {
  // Hash-Funktion für Projektname
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Farbpalette: Verschiedene Farbtöne, die gut sichtbar sind
  const colors = [
    '#3B82F6', // Blau
    '#10B981', // Grün
    '#F59E0B', // Orange
    '#EF4444', // Rot
    '#8B5CF6', // Violett
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Limette
    '#F97316', // Orange-Rot
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#A855F7', // Lila
    '#22D3EE', // Sky
    '#34D399', // Emerald
    '#FBBF24', // Amber
    '#FB7185', // Rose
  ];
  
  // Verwende Hash für konsistente Farbzuweisung
  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}

export type UserGanttData = {
  userId: number;
  features: GanttFeature[];
};

/**
 * Transformiert User-Daten zu Gantt-Features.
 *
 * WICHTIG:
 * - Es werden ausschließlich Tage im übergebenen Zeitraum [rangeFrom, rangeTo] betrachtet.
 * - Der aufrufende Code stellt sicher, dass dieser Zeitraum bereits dem SOLL-Bereich entspricht
 *   (z.B. ab "heute" bis "to" im Timeline-Endpunkt).
 *
 * Dadurch ist garantiert, dass:
 * - Alle Planungstage im SOLL-Bereich, für die es Buchungspunkte gibt, auch als Gantt-Features erscheinen.
 * - Die Logik unabhängig vom aktuellen Server-Datum funktioniert (reine Abhängigkeit von from/to).
 */
export function transformUsersToGanttFeatures(
  users: User[],
  timelineItems: TimelineItem[],
  employmentsMap: Map<number, Employment[]>,
  schedulesMap: Map<number, Schedule[]>,
  rangeFrom: Date,
  rangeTo: Date,
): UserGanttData[] {
  const from = new Date(rangeFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(rangeTo);
  to.setHours(0, 0, 0, 0);

  const result: UserGanttData[] = [];

  for (const user of users) {
    const employments = employmentsMap.get(user.id) || [];
    const schedules = schedulesMap.get(user.id) || [];
    const activities = timelineItems.filter(
      (it) => it.userId === user.id && (it.type === 'work' || it.type === 'activity')
    );
    const planning = timelineItems.filter(
      (it) => it.userId === user.id && it.type === 'plan'
    );

    const features: GanttFeature[] = [];

    // Erstelle Gantt-Features PRO PROJEKT - exakt wie Detail-Ansicht
    // WICHTIG: Verwende getPlanningEntriesForDate() für 1:1 Übereinstimmung mit Detail-Ansicht
    const projectDaysMap = new Map<string, Array<{ date: Date; hours: number }>>();
    
    // Iteriere über alle Tage im übergebenen SOLL-Zeitraum [from, to]
    // WICHTIG: Unabhängig vom aktuellen Server-Datum, nur vom Zeitraum des Aufrufs abhängig.
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      d.setHours(0, 0, 0, 0);
      
      // WICHTIG: Verwende lokale Zeit für ISO-Format
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayOfMonth = String(d.getDate()).padStart(2, '0');
      const dayISO = `${year}-${month}-${dayOfMonth}`;

      // NEU: Tage mit *echter* Abwesenheit komplett aus der Gantt-Planung ausschließen.
      // Es zählt nur ein Schedule mit gesetztem absence_code / absenceCode an genau diesem Tag.
      const hasAbsence = schedules.some((s) => {
        if (!s.date) return false;
        const scheduleDateValue = s.date as string | Date | undefined;
        let scheduleDate: string | null = null;
        if (typeof scheduleDateValue === 'string') {
          scheduleDate = scheduleDateValue.slice(0, 10);
        } else if (scheduleDateValue instanceof Date) {
          scheduleDate = scheduleDateValue.toISOString().slice(0, 10);
        }
        if (scheduleDate !== dayISO) {
          return false;
        }

        const code =
          (s as any).absenceCode ??
          (s as any).absence_code ??
          null;

        if (code == null) {
          return false;
        }

        const normalizedCode = String(code).trim();
        return normalizedCode.length > 0;
      });

      // Abwesenheit hat Vorrang vor allem anderen: keine Planung an diesem Tag im Gantt
      if (hasAbsence) {
        continue;
      }
      
      // WICHTIG: Überspringe Wochenenden, es sei denn, es gibt explizite Planning-Entries für diesen Tag
      // Prüfe zuerst, ob es ein explizites Planning-Entry für diesen Tag gibt (plan.date === dayISO)
      // Ein explizites Planning-Entry bedeutet: plan.date === dayISO (nicht nur im Zeitraum)
      const hasExplicitPlanning = planning.some(p => p.type === 'plan' && p.date === dayISO);
      const isWeekendDay = isWeekend(dayISO);
      
      // Wenn Wochenende und kein explizites Planning-Entry, überspringe
      // WICHTIG: Auch wenn getPlanningEntriesForDate() ein Ergebnis zurückgibt (weil Tag im Zeitraum liegt),
      // überspringen wir Wochenenden, es sei denn, es gibt ein explizites Planning-Entry
      if (isWeekendDay && !hasExplicitPlanning) {
        continue;
      }
      
      // Verwende getPlanningEntriesForDate() - exakt wie Detail-Ansicht
      // ABER: Für Wochenenden wird diese Funktion nur aufgerufen, wenn hasExplicitPlanning === true
      const dayProjects = getPlanningEntriesForDate(dayISO, planning);
      
      // Sammle Tage pro Projekt
      for (const project of dayProjects) {
        if (project.hours > 0) {
          const dayDate = new Date(d);
          dayDate.setHours(0, 0, 0, 0);
          
          if (!projectDaysMap.has(project.name)) {
            projectDaysMap.set(project.name, []);
          }
          const projectDays = projectDaysMap.get(project.name);
          if (projectDays) {
            projectDays.push({
              date: dayDate,
              hours: project.hours
            });
          }
        }
      }
    }
    
    // Erstelle Gantt-Features für jedes Projekt
    // NEU: Zusammenhängende Tage eines Projekts werden zu EINEM Feature
    // zusammengefasst, damit mehrtägige Planungen wieder als durchgehender
    // Balken dargestellt werden.
    //
    // Regeln:
    // - Nur Tage ohne Abwesenheit, die in projectDaysMap enthalten sind,
    //   werden berücksichtigt (siehe Schleife oben).
    // - Tage zählen als "zusammenhängend", wenn sie kalendarisch
    //   direkt aufeinander folgen (Differenz 1 Tag).
    // - Wochenenden trennen nur dann, wenn es KEINE expliziten
    //   Planning-Entries für diese Tage gibt (bereits in projectDaysMap
    //   herausgefiltert).
    // - Für jedes zusammenhängende Intervall entsteht genau EIN Feature
    //   mit actualDays = Anzahl der Tage im Intervall.
    for (const [projectName, activeDays] of projectDaysMap.entries()) {
      if (activeDays.length === 0) {
        continue;
      }
      // Sortiere Tage nach Datum (damit IDs stabil bleiben)
      const sortedDays = [...activeDays].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );

      // Hilfsvariablen für das aktuelle Intervall
      let currentStart: Date | null = null;
      let currentEnd: Date | null = null;
      let currentTotalHours = 0;
      let currentDayCount = 0;
      let maxFillPercentInRun: number | null = null;

      const flushCurrentRun = () => {
        if (!currentStart || !currentEnd || currentDayCount === 0) {
          return;
        }

        const startISO = `${currentStart.getFullYear()}-${String(
          currentStart.getMonth() + 1,
        ).padStart(2, '0')}-${String(currentStart.getDate()).padStart(2, '0')}`;

        const featureStartDate = new Date(currentStart);
        featureStartDate.setHours(0, 0, 0, 0);
        const featureEndDate = new Date(currentEnd);
        featureEndDate.setDate(featureEndDate.getDate() + 1); // endAt exklusiv
        featureEndDate.setHours(0, 0, 0, 0);

        // Status anhand des maximalen Füllgrades im Intervall bestimmen
        const effectiveFillPercent =
          maxFillPercentInRun != null ? maxFillPercentInRun : 0;
        const status = getStatusByFillPercent(effectiveFillPercent, true);
        const projectColor = getProjectUniqueColor(projectName);

        const hoursPerDay =
          currentDayCount > 0 ? currentTotalHours / currentDayCount : currentTotalHours;

        features.push({
          id: `${user.id}-${projectName.replace(/\s+/g, '-')}-${startISO}-${currentDayCount}d`,
          name: projectName,
          startAt: featureStartDate,
          endAt: featureEndDate,
          status,
          hoursPerDay,
          totalHours: currentTotalHours,
          projectColor,
          actualDays: currentDayCount,
        });
      };

      for (let i = 0; i < sortedDays.length; i++) {
        const day = sortedDays[i];
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);

        const dayISO = `${dayDate.getFullYear()}-${String(
          dayDate.getMonth() + 1,
        ).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;

        // Füllgrad bezogen auf den gesamten Tag (alle Projekte),
        // wie bisher auch für die Statusfarbe verwendet.
        const planningHours = sumPlanningForDate(dayISO, planning);
        const targetHours = dayTargetHours(dayISO, employments);
        const dayFillPercent =
          targetHours > 0 ? (planningHours / targetHours) * 100 : 0;

        if (maxFillPercentInRun == null || dayFillPercent > maxFillPercentInRun) {
          maxFillPercentInRun = dayFillPercent;
        }

        if (!currentStart) {
          // Neues Intervall starten
          currentStart = dayDate;
          currentEnd = dayDate;
          currentTotalHours = day.hours;
          currentDayCount = 1;
          continue;
        }

        // Prüfe, ob dieser Tag direkt auf den letzten Tag des aktuellen Intervalls folgt
        const expectedNext = new Date(currentEnd as Date);
        expectedNext.setDate(expectedNext.getDate() + 1);
        expectedNext.setHours(0, 0, 0, 0);

        const isConsecutive = dayDate.getTime() === expectedNext.getTime();

        if (isConsecutive) {
          // Tag gehört zum aktuellen Intervall
          currentEnd = dayDate;
          currentTotalHours += day.hours;
          currentDayCount += 1;
        } else {
          // Intervall beenden und neues starten
          flushCurrentRun();

          currentStart = dayDate;
          currentEnd = dayDate;
          currentTotalHours = day.hours;
          currentDayCount = 1;
          maxFillPercentInRun = dayFillPercent;
        }
      }

      // Letztes Intervall flushen
      flushCurrentRun();
    }

    result.push({
      userId: user.id,
      features,
    });
  }

  return result;
}

