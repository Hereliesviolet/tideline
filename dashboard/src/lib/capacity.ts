import type { Employment, Schedule, TimelineItem } from './api';
import { isHamburgHoliday } from './holidays';
import { classifyBooking } from './cellColors';
import type { BookingType } from './projectColors';

export function isWeekend(isoDate:string) {
  const d = new Date(isoDate+'T00:00:00'); const dow = d.getDay(); // 0=So,6=Sa
  return dow === 0 || dow === 6;
}

/**
 * Prüft, ob ein Tag im Arbeitszeitmodell (Employment) liegt
 * @param isoDate Datum im Format YYYY-MM-DD
 * @param employments Array von Employment-Objekten
 * @returns true wenn der Tag im Zeitmodell liegt, false sonst
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
    const fromDateStr = emp.from_date || emp.fromDate;
    const toDateStr = emp.to_date || emp.toDate;
    
    if (!fromDateStr) continue; // Kein fromDate = ungültiges Employment
    
    const fromDate = new Date(fromDateStr + 'T00:00:00');
    const toDate = toDateStr ? new Date(toDateStr + 'T00:00:00') : null;
    
    // Prüfe ob Datum im Zeitraum liegt
    // WICHTIG: Vergleiche nur die Datumsteile (ohne Zeit), da wir 'T00:00:00' hinzufügen
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
  
  return false;
}

export function dayTargetHours(isoDate:string, employments: Employment[], fallback=8): number {
  // WICHTIG: Prüfe zuerst, ob der Tag im Zeitmodell liegt
  // Wenn nicht, gibt 0 zurück (Tag ist ausgegraut)
  if (!isDayInEmploymentPattern(isoDate, employments)) {
    return 0;
  }
  
  const d = new Date(isoDate+'T00:00:00');
  for (const e of employments) {
    const from = new Date((e.from_date || e.fromDate)+'T00:00:00');
    const to = (e.to_date || e.toDate) ? new Date((e.to_date || e.toDate)+'T00:00:00') : null;
    if (d >= from && (!to || d <= to)) {
      if (e.daily_target_hours && e.daily_target_hours > 0) {
        return e.daily_target_hours;
      }
      if (e.weekly_target_hours || e.weeklyTargetHours) {
        const weeklyHours = e.weekly_target_hours || e.weeklyTargetHours || 0;
        if (weeklyHours > 0) {
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
            // Parse patterns
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
            } catch (e) {
              // Fehler beim Parsen - verwende Fallback
            }
            
            // Zähle aktive Tage pro Woche
            // WICHTIG: Pattern kann Stunden enthalten (z.B. [4,4,4,4,4]) ODER 1/0 (z.B. [1,1,1,1,1])
            let activeDaysPerWeek = 0;
            if (patternAm || patternPm) {
              for (let i = 0; i < 5; i++) {
                const amValue = patternAm && patternAm[i];
                const pmValue = patternPm && patternPm[i];
                // Tag ist aktiv wenn patternAm ODER patternPm > 0
                const isAmActive = amValue !== null && amValue !== undefined && amValue > 0;
                const isPmActive = pmValue !== null && pmValue !== undefined && pmValue > 0;
                if (isAmActive || isPmActive) {
                  activeDaysPerWeek++;
                }
              }
            }
            
            // Wenn keine Pattern-Daten, verwende Standard 5 Tage
            if (activeDaysPerWeek === 0) {
              activeDaysPerWeek = 5;
            }
            
            // Berechne Stunden pro Tag
            const calculated = Number((weeklyHours / activeDaysPerWeek).toFixed(2));
            return calculated;
          }
        }
      }
    }
  }
  return fallback;
}

export function scheduleKind(date:string, schedules: Schedule[]) {
  if (!date || schedules.length === 0) {
    return 'WORK';
  }
  
  // Normalisiere Datumsformat zu YYYY-MM-DD
  const normalizedDate = date.slice(0, 10);
  
  const s = schedules.find((x) => {
    if (!x.date) return false;
    
    // Normalisiere Schedule-Datum zu YYYY-MM-DD
    let scheduleDate: string;
    const scheduleDateValue = x.date as string | Date | undefined;
    if (typeof scheduleDateValue === 'string') {
      scheduleDate = scheduleDateValue.slice(0, 10);
    } else if (scheduleDateValue instanceof Date) {
      scheduleDate = scheduleDateValue.toISOString().slice(0, 10);
    } else {
      return false;
    }
    
    return scheduleDate === normalizedDate;
  });
  
  if (!s) return 'WORK';
  const code = (s.absence_code ?? s.absenceCode ?? '').toUpperCase();
  if (code.includes('SICK') || code.includes('KRANK')) return 'SICK';
  if (code.includes('VACATION') || code.includes('URLAUB')) return 'VACATION';
  if (code.includes('HOLIDAY') || code.includes('FEIERTAG')) return 'HOLIDAY';
  return 'OTHER';
}

/**
 * Liefert den Abwesenheits-Code des MOCO-Schedules für diesen Tag,
 * oder null, wenn kein Schedule mit gesetztem absence_code existiert.
 */
export function getAbsenceCode(date: string, schedules: Schedule[]): string | null {
  if (!date || schedules.length === 0) return null;
  const normalizedDate = date.slice(0, 10);

  for (const s of schedules) {
    if (!s.date) continue;
    const scheduleDateValue = s.date as string | Date | undefined;
    let scheduleDate: string;
    if (typeof scheduleDateValue === 'string') {
      scheduleDate = scheduleDateValue.slice(0, 10);
    } else if (scheduleDateValue instanceof Date) {
      scheduleDate = scheduleDateValue.toISOString().slice(0, 10);
    } else {
      continue;
    }
    if (scheduleDate !== normalizedDate) continue;

    const code = String(s.absenceCode ?? s.absence_code ?? '').trim();
    if (code.length > 0) return code;
  }
  return null;
}

export function hasAbsence(date: string, schedules: Schedule[]): boolean {
  if (!date) return false;
  if (getAbsenceCode(date, schedules) !== null) return true;
  // Fallback: hardcodierte Feiertage (falls MOCO keine liefert)
  return isHamburgHoliday(date);
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
  _user: { id: number; displayName?: string },
  date: string,
  employments: Employment[],
  activities: TimelineItem[],
  planning: TimelineItem[],
  schedules: Schedule[]
): { targetHours: number; bookedHours: number; fillPercent: number | null } {
  // 1. Abwesenheit (Schedule oder Feiertag): fillPercent null, bookedHours = targetHours
  //    (CellProjectModal rechnet daraus die Auslastung; die Zelle prüft Absence selbst).
  const isAbsent = hasAbsence(date, schedules);
  const isInPattern = isDayInEmploymentPattern(date, employments);

  if (isAbsent) {
    const targetHours = isInPattern ? dayTargetHours(date, employments, 8) : 8;
    return { targetHours, bookedHours: targetHours, fillPercent: null };
  }

  const isPast = new Date(date + 'T00:00:00') < new Date();

  // 2. Tag außerhalb des Zeitmodells (z. B. Wochenende): Soll 0, aber tatsächlich
  //    gebuchte IST-Stunden bleiben sichtbar. Planungs-Zeiträume zählen hier nicht.
  if (!isInPattern) {
    const bookedHours = isPast ? sumActivitiesForDate(date, activities) : 0;
    return { targetHours: 0, bookedHours, fillPercent: 0 };
  }

  // 3. Normaler Arbeitstag
  const targetHours = dayTargetHours(date, employments, 8);
  const bookedHours = isPast
    ? sumActivitiesForDate(date, activities)
    : sumPlanningForDate(date, planning);

  const fillPercent =
    targetHours === 0
      ? 0
      : bookedHours === 0
        ? 0
        : (bookedHours / targetHours) * 100;

  return { targetHours, bookedHours, fillPercent };
}

/**
 * Detaillierte IST-Projektaufteilung für einen Tag.
 *
 * Gruppiert Activities nach Projekt UND Buchungstyp:
 *  - internal   → interner Kunde (siehe INTERNAL_CUSTOMER_NAME)
 *  - billable   → extern, verrechenbar (billable === true)
 *  - unbillable → extern, nicht verrechenbar (billable === false)
 *  - neutral    → extern, ohne Bewertung (billable == null)
 *
 * Wird für das Buchungspunkte-Modal im IST-Bereich verwendet.
 */
export function getISTProjectBreakdownForDate(
  date: string,
  activities: TimelineItem[]
): Array<{
  name: string;
  hours: number;
  type: BookingType;
  customerName?: string | null;
}> {
  const dayActivities = activities.filter(
    (a) =>
      a.date === date &&
      (a.type === 'work' || a.type === 'activity'),
  );

  if (dayActivities.length === 0) {
    return [];
  }

  const projectMap = new Map<
    string,
    { name: string; type: BookingType; hours: number; customerName: string | null }
  >();

  for (const act of dayActivities) {
    const hours = act.hours ?? (act.seconds ? act.seconds / 3600 : 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const projName = act.projectName || 'Ohne Projekt';
    const customerNameRaw = act.customerName || null;
    const type = classifyBooking(customerNameRaw, act.billable);

    const key = `${projName}::${type}`;
    const existing = projectMap.get(key) || { name: projName, type, hours: 0, customerName: customerNameRaw };

    existing.hours += hours;
    if (!existing.customerName && customerNameRaw) {
      existing.customerName = customerNameRaw;
    }
    projectMap.set(key, existing);
  }

  return Array.from(projectMap.values()).sort((a, b) => b.hours - a.hours);
}
