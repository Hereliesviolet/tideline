// src/lib/capacity.ts
// Capacity-Berechnungen für Timeline (portiert vom Client)

type Employment = {
  from_date: string;
  to_date: string | null;
  daily_target_hours: number | null;
  weekly_target_hours: number | null;
  patternAm?: string | number[] | null; // JSON-String oder bereits geparstes Array: [1,1,1,1,1] für Mo-Fr
  patternPm?: string | number[] | null; // JSON-String oder bereits geparstes Array: [1,1,1,1,1] für Mo-Fr
};

type Schedule = {
  date: string;
  absence_code: string | null;
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
  customerName?: string | null;
  startsOn?: string; // YYYY-MM-DD
  endsOn?: string; // YYYY-MM-DD
};

export function isWeekend(isoDate: string): boolean {
  const d = new Date(isoDate + 'T00:00:00');
  const dow = d.getDay(); // 0=So,6=Sa
  return dow === 0 || dow === 6;
}

export function dayTargetHours(isoDate: string, employments: Employment[], fallback: number = 8): number {
  // WICHTIG: Prüfe zuerst, ob der Tag im Zeitmodell liegt
  // Wenn nicht, gibt 0 zurück (Tag ist ausgegraut)
  if (!isDayInEmploymentPattern(isoDate, employments)) {
    return 0;
  }
  
  const d = new Date(isoDate + 'T00:00:00');
  for (const e of employments) {
    const from = new Date(e.from_date + 'T00:00:00');
    const to = e.to_date ? new Date(e.to_date + 'T00:00:00') : null;
    if (d >= from && (!to || d <= to)) {
      if (e.daily_target_hours && e.daily_target_hours > 0) return e.daily_target_hours;
      if (e.weekly_target_hours && e.weekly_target_hours > 0) {
        // Berechne tägliche Stunden basierend auf Pattern
        // Zähle wie viele Tage pro Woche aktiv sind
        const date = new Date(isoDate + 'T00:00:00');
        const dayOfWeek = date.getDay();
        let mocoDayIndex: number | null = null;
        if (dayOfWeek === 1) mocoDayIndex = 0; // Mo
        else if (dayOfWeek === 2) mocoDayIndex = 1; // Di
        else if (dayOfWeek === 3) mocoDayIndex = 2; // Mi
        else if (dayOfWeek === 4) mocoDayIndex = 3; // Do
        else if (dayOfWeek === 5) mocoDayIndex = 4; // Fr
        
        if (mocoDayIndex !== null) {
          // Parse patternAm und patternPm
          let patternAm: number[] | null = null;
          let patternPm: number[] | null = null;
          try {
            if (typeof e.patternAm === 'string') {
              patternAm = JSON.parse(e.patternAm);
            } else if (Array.isArray(e.patternAm)) {
              patternAm = e.patternAm;
            }
            if (typeof e.patternPm === 'string') {
              patternPm = JSON.parse(e.patternPm);
            } else if (Array.isArray(e.patternPm)) {
              patternPm = e.patternPm;
            }
          } catch (err) {
            // Fehler beim Parsen - verwende Standard 5 Tage
          }
          
          // Zähle aktive Tage pro Woche
          let activeDaysPerWeek = 0;
          if (patternAm || patternPm) {
            for (let i = 0; i < 5; i++) {
              const amValue = patternAm && patternAm[i];
              const pmValue = patternPm && patternPm[i];
              if ((amValue !== null && amValue !== undefined && amValue > 0) ||
                  (pmValue !== null && pmValue !== undefined && pmValue > 0)) {
                activeDaysPerWeek++;
              }
            }
          }
          
          // Wenn keine Pattern-Daten, verwende Standard 5 Tage
          if (activeDaysPerWeek === 0) {
            activeDaysPerWeek = 5;
          }
          
          // Berechne Stunden pro Tag
          const calculated = Number((e.weekly_target_hours / activeDaysPerWeek).toFixed(2));
          return calculated;
        }
        // Fallback: Standard 5 Tage
        return Number((e.weekly_target_hours / 5).toFixed(2));
      }
    }
  }
  return fallback;
}

export function hasAbsence(date: string, schedules: Schedule[]): boolean {
  return schedules.some((s) => s.date === date);
}

/**
 * Prüft, ob ein Datum im Arbeitszeitmodell (Employment Pattern) liegt
 */
export function isDayInEmploymentPattern(isoDate: string, employments: Employment[]): boolean {
  const date = new Date(isoDate + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  
  // MOCO verwendet: Mo=0, Di=1, Mi=2, Do=3, Fr=4 (nicht JavaScript's 0=So!)
  // patternAm und patternPm sind Arrays: [Mo, Di, Mi, Do, Fr]
  // WICHTIG: Pattern kann Stunden enthalten (z.B. [4,4,4,4,4]) ODER 1/0 (z.B. [1,1,1,1,1])
  // JavaScript: So=0, Mo=1, Di=2, Mi=3, Do=4, Fr=5, Sa=6
  // Konvertierung: JavaScript → MOCO: Mo=1→0, Di=2→1, Mi=3→2, Do=4→3, Fr=5→4
  // Sonntag (0) und Samstag (6) sind nie im Pattern (nur Mo-Fr)
  let mocoDayIndex: number | null = null;
  if (dayOfWeek === 1) mocoDayIndex = 0; // Mo
  else if (dayOfWeek === 2) mocoDayIndex = 1; // Di
  else if (dayOfWeek === 3) mocoDayIndex = 2; // Mi
  else if (dayOfWeek === 4) mocoDayIndex = 3; // Do
  else if (dayOfWeek === 5) mocoDayIndex = 4; // Fr
  else return false; // So/Sa sind nie im Pattern
  
  // Finde das aktive Employment für dieses Datum
  for (const emp of employments) {
    const fromDate = new Date(emp.from_date + 'T00:00:00');
    const toDate = emp.to_date ? new Date(emp.to_date + 'T00:00:00') : null;
    
    // Prüfe ob Datum im Zeitraum liegt
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const fromDateOnly = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const toDateOnly = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) : null;
    
    if (dateOnly < fromDateOnly) continue;
    if (toDateOnly && dateOnly > toDateOnly) continue;
    
    // Parse patternAm und patternPm (können JSON-String oder bereits Array sein)
    let patternAm: number[] | null = null;
    let patternPm: number[] | null = null;
    
    try {
      if (typeof emp.patternAm === 'string') {
        patternAm = JSON.parse(emp.patternAm);
      } else if (Array.isArray(emp.patternAm)) {
        patternAm = emp.patternAm;
      }
      
      if (typeof emp.patternPm === 'string') {
        patternPm = JSON.parse(emp.patternPm);
      } else if (Array.isArray(emp.patternPm)) {
        patternPm = emp.patternPm;
      }
    } catch (e) {
      // Fehler beim Parsen - ignoriere dieses Employment
      continue;
    }
    
    // Prüfe ob Tag im Pattern liegt (patternAm ODER patternPm muss aktiv sein)
    // WICHTIG: Pattern kann Stunden enthalten (z.B. [4,4,4,4,4]) ODER 1/0 (z.B. [1,1,1,1,1])
    // Wenn Wert > 0, ist der Tag aktiv
    if (mocoDayIndex !== null) {
      const amValue = patternAm && patternAm[mocoDayIndex];
      const pmValue = patternPm && patternPm[mocoDayIndex];
      
      // Tag ist aktiv wenn patternAm ODER patternPm > 0
      const isAmActive = amValue !== null && amValue !== undefined && amValue > 0;
      const isPmActive = pmValue !== null && pmValue !== undefined && pmValue > 0;
      
      if (isAmActive || isPmActive) {
        return true; // Tag ist im Zeitmodell
      }
    }
  }
  
  // Kein aktives Employment gefunden oder Tag nicht im Pattern
  return false;
}

export function sumActivitiesForDate(date: string, activities: TimelineItem[]): number {
  return activities
    .filter((a) => a.date === date && (a.type === 'work' || a.type === 'activity'))
    .reduce((sum, a) => {
      const hours = a.hours ?? (a.seconds ? a.seconds / 3600 : 0);
      return sum + (Number.isFinite(hours) ? hours : 0);
    }, 0);
}

export function sumPlanningForDate(date: string, planning: TimelineItem[]): number {
  const dateObj = new Date(date + 'T00:00:00');
  let totalHours = 0;

  for (const plan of planning) {
    if (plan.type !== 'plan') continue;

    // Wenn das Planning Entry ein direktes Datum hat (date)
    if (plan.date === date) {
      totalHours += plan.hours ?? 0;
      continue;
    }

    // Wenn das Planning Entry einen Zeitraum hat (startsOn/endsOn)
    // WICHTIG: plan.hours ist bereits hoursPerDay (vom Backend gesetzt), nicht Gesamtstunden!
    if (plan.startsOn && plan.endsOn) {
      const start = new Date(plan.startsOn + 'T00:00:00');
      const end = new Date(plan.endsOn + 'T00:00:00');
      
      // Prüfe ob der Tag im Zeitraum liegt
      if (dateObj >= start && dateObj <= end) {
        // plan.hours ist bereits die Stunden pro Tag (hoursPerDay)
        totalHours += plan.hours ?? 0;
      }
    }
  }

  return totalHours;
}

export function calculateDailyCapacity(
  user: { id: number },
  date: string,
  employments: Employment[],
  activities: TimelineItem[],
  planning: TimelineItem[],
  schedules: Schedule[]
): { targetHours: number; bookedHours: number; fillPercent: number | null } {
  // WICHTIG: Prüfe ZUERST auf Abwesenheit (hat Priorität über Zeitmodell)
  // Abwesenheiten müssen immer angezeigt werden, auch wenn Tag außerhalb des Zeitmodells liegt
  const isAbsent = hasAbsence(date, schedules);
  
  // Prüfe ob Tag im Zeitmodell liegt
  const isInPattern = isDayInEmploymentPattern(date, employments);
  
  // Wenn Abwesenheit: immer null zurückgeben (wird als Abwesenheit angezeigt)
  // WICHTIG: bookedHours = targetHours, damit die Zelle vollständig gefüllt wird
  // Wenn Tag außerhalb des Zeitmodells: verwende Standard 8h für die Anzeige
  if (isAbsent) {
    const targetHours = isInPattern ? dayTargetHours(date, employments, 8) : 8; // Standard 8h wenn außerhalb des Zeitmodells
    return { targetHours, bookedHours: targetHours, fillPercent: null };
  }

  const isPast = new Date(date + 'T00:00:00') < new Date();

  // Tag außerhalb des Zeitmodells (Wochenende, kein Employment): Soll 0,
  // tatsächlich gebuchte IST-Stunden bleiben sichtbar. Planungen zählen hier nicht.
  if (!isInPattern) {
    const bookedHours = isPast ? sumActivitiesForDate(date, activities) : 0;
    return { targetHours: 0, bookedHours, fillPercent: 0 };
  }
  
  const targetHours = dayTargetHours(date, employments, 8);
  let bookedHours = 0;
  
  if (isPast) {
    // IST: Verwende tatsächliche Activities
    bookedHours = sumActivitiesForDate(date, activities);
  } else {
    // SOLL: Verwende echte Planungsdaten, KEIN Fallback!
    bookedHours = sumPlanningForDate(date, planning);
  }

  // WICHTIG: Wenn keine Stunden gebucht/geplant sind, zeige 0% (nicht null!)
  // null sollte NUR für Abwesenheiten verwendet werden
  const fillPercent = targetHours === 0
    ? 0
    : bookedHours === 0
    ? 0  // Keine Buchungen: 0% (nicht null!)
    : (bookedHours / targetHours) * 100;

  return { targetHours, bookedHours, fillPercent };
}

export function getProjectsForDate(
  date: string,
  activities: TimelineItem[]
): Array<{ name: string; hours: number; billable: boolean | null; customerName?: string | null }> {
  const projectMap = new Map<string, { hours: number; billable: boolean | null; customerName?: string | null }>();
  
  for (const act of activities) {
    if (act.date !== date || (act.type !== 'work' && act.type !== 'activity')) continue;
    
    const projName = act.projectName || 'Ohne Projekt';
    const hours = act.hours ?? (act.seconds ? act.seconds / 3600 : 0);
    const existing = projectMap.get(projName) || { hours: 0, billable: null, customerName: null };
    
    projectMap.set(projName, {
      hours: existing.hours + hours,
      // billable bleibt true wenn es einmal true war, sonst bleibt es null oder false
      billable: existing.billable === true ? true : (act.billable ?? null),
      customerName: existing.customerName || act.customerName || null,
    });
  }
  
  return Array.from(projectMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.hours - a.hours);
}

export function getPlanningEntriesForDate(
  date: string,
  planning: TimelineItem[]
): Array<{ name: string; hours: number; startsOn?: string; endsOn?: string; customerName?: string | null }> {
  const dateObj = new Date(date + 'T00:00:00');
  const projectMap = new Map<string, { hours: number; startsOn?: string; endsOn?: string; customerName?: string | null }>();
  
  // WICHTIG: Prüfe ob Wochenende - für Wochenenden nur explizite Planning-Entries (plan.date === date)
  const isWeekendDay = isWeekend(date);
  
  for (const plan of planning) {
    if (plan.type !== 'plan') continue;
    
    let hours = 0;
    let isInRange = false;
    
    // Wenn das Planning Entry ein direktes Datum hat
    if (plan.date === date) {
      // Explizites Planning-Entry für diesen Tag - immer verwenden (auch Wochenenden)
      hours = plan.hours ?? 0;
      isInRange = true;
    } else if (plan.startsOn && plan.endsOn) {
      // Wenn das Planning Entry einen Zeitraum hat
      // WICHTIG: Für Wochenenden ignorieren wir Zeiträume - nur explizite Planning-Entries (plan.date === date) zählen
      if (isWeekendDay) {
        // Wochenende: Überspringe Zeiträume, nur explizite Planning-Entries (plan.date === date) zählen
        continue;
      }
      
      // WICHTIG: plan.hours ist bereits hoursPerDay (vom Backend gesetzt), nicht Gesamtstunden!
      const start = new Date(plan.startsOn + 'T00:00:00');
      const end = new Date(plan.endsOn + 'T00:00:00');
      
      if (dateObj >= start && dateObj <= end) {
        // plan.hours ist bereits die Stunden pro Tag (hoursPerDay)
        hours = plan.hours ?? 0;
        isInRange = true;
      }
    }
    
    if (isInRange && hours > 0) {
      const projName = plan.projectName || 'Ohne Projekt';
      const existing = projectMap.get(projName) || { hours: 0, customerName: null };
      
      projectMap.set(projName, {
        hours: existing.hours + hours,
        startsOn: plan.startsOn,
        endsOn: plan.endsOn,
        customerName: existing.customerName || plan.customerName || null,
      });
    }
  }
  
  return Array.from(projectMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.hours - a.hours);
}

export function calculateBottleneck(
  date: string,
  planning: TimelineItem[],
  targetHours: number
): {
  isBottleneck: boolean;
  totalHours: number;
  fillPercent: number;
  overlappingProjects: number;
} {
  // Summiere alle Planning-Stunden für den Tag
  const totalHours = sumPlanningForDate(date, planning);
  
  // Berechne Füllgrad
  const fillPercent = targetHours === 0 ? 0 : (totalHours / targetHours) * 100;
  
  // Zähle überlappende Projekte (Projekte, die am selben Tag aktiv sind)
  const dateObj = new Date(date + 'T00:00:00');
  const activeProjects = new Set<string>();
  
  for (const plan of planning) {
    if (plan.type !== 'plan') continue;
    
    let isActive = false;
    
    // Direktes Datum
    if (plan.date === date) {
      isActive = true;
    } else if (plan.startsOn && plan.endsOn) {
      // Zeitraum
      const start = new Date(plan.startsOn + 'T00:00:00');
      const end = new Date(plan.endsOn + 'T00:00:00');
      if (dateObj >= start && dateObj <= end) {
        isActive = true;
      }
    }
    
    if (isActive && (plan.hours ?? 0) > 0) {
      const projName = plan.projectName || 'Ohne Projekt';
      activeProjects.add(projName);
    }
  }
  
  const overlappingProjects = activeProjects.size;
  
  // Engpass: >100% Auslastung ODER mehrere Projekte überlappen
  const isBottleneck = fillPercent > 100 || overlappingProjects > 1;
  
  return {
    isBottleneck,
    totalHours,
    fillPercent,
    overlappingProjects,
  };
}

