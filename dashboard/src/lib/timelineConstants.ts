import { isHamburgHoliday } from './holidays';
import { CELL_GAP, CELL_MIN_WIDTH, DAY_COUNT, ROW_BASE_HEIGHT } from './timelineTokens';

export interface TimelineDimensions {
  cellWidth: number;
  cellHeight: number;
  cellGap: number;
  sidebarWidth: number;
}

// Zellbreite und Sidebar-Breite passen sich der verfügbaren Breite an,
// die Zeilenhöhe ist fest (ROW_BASE_HEIGHT).
export function calculateTimelineDimensions(): TimelineDimensions {
  if (typeof window === 'undefined') {
    return {
      cellWidth: 40,
      cellHeight: ROW_BASE_HEIGHT,
      cellGap: CELL_GAP,
      sidebarWidth: 120,
    };
  }

  const scrollbarWidth = 17;

  // Navigation-Sidebar-Breite dynamisch aus dem DOM ermitteln
  // (shadcn Sidebar reserviert den Platz über data-slot="sidebar-gap").
  const NAV_EXPANDED_FALLBACK_PX = 171;
  let navSidebarWidth = NAV_EXPANDED_FALLBACK_PX;
  if (typeof document !== 'undefined') {
    const gapEl = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement | null;
    const containerEl = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement | null;
    const legacyEl = document.querySelector('aside, nav[class*="w-"]') as HTMLElement | null;

    const actual =
      (gapEl && gapEl.offsetWidth) ||
      (containerEl && containerEl.offsetWidth) ||
      (legacyEl && legacyEl.offsetWidth) ||
      0;

    if (actual > 0) {
      navSidebarWidth = actual;
    } else {
      try {
        const match = document.cookie.match(/sidebar_state=([^;]+)/);
        if (match && match[1] === 'false') {
          navSidebarWidth = 48;
        }
      } catch {
        navSidebarWidth = NAV_EXPANDED_FALLBACK_PX;
      }
    }
  }

  const sidebarWidthMultiplier = navSidebarWidth < 100 ? 0.14 : 0.18;
  const sidebarWidth = Math.max(120, Math.min(190, Math.floor(window.innerWidth * sidebarWidthMultiplier)));

  const screenWidth = window.innerWidth;

  // Sicherheitspuffer 1–2 % der Bildschirmbreite gegen Rundungsfehler
  let safetyPercentage = 0.01;
  if (screenWidth >= 2000) {
    safetyPercentage = 0.02;
  } else if (screenWidth >= 1600) {
    safetyPercentage = 0.015;
  }
  const dynamicSafetyMargin = Math.floor(screenWidth * safetyPercentage);

  const availableWidthForTimeline = screenWidth - navSidebarWidth - scrollbarWidth - dynamicSafetyMargin;
  const availableWidthForCells = availableWidthForTimeline - sidebarWidth;

  const calculatedCellWidth = Math.floor(
    (availableWidthForCells - (DAY_COUNT - 1) * CELL_GAP) / DAY_COUNT,
  );
  const cellWidth = Math.max(CELL_MIN_WIDTH, calculatedCellWidth);

  return {
    cellWidth,
    cellHeight: ROW_BASE_HEIGHT,
    cellGap: CELL_GAP,
    sidebarWidth,
  };
}

export interface TimelineDay {
  iso: string;
  day: number;
  weekday: string;
  isToday: boolean;
  isPast: boolean;
  isWorkday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  /** Position im 30-Tage-Fenster (0-29) */
  index: number;
}

// 30 Tage: 14 IST (Vergangenheit) + heute + 15 SOLL (Zukunft), inkl. Wochenenden
export function generateTimelineDays(): TimelineDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Lokale Zeit für ISO-Format, nicht UTC (vermeidet Zeitzonen-Sprünge)
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const start = new Date(today);
  start.setDate(start.getDate() - 14);

  const days: TimelineDay[] = [];

  for (let i = 0; i < DAY_COUNT; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${dayOfMonth}`;
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = isHamburgHoliday(iso);

    days.push({
      iso,
      day: d.getDate(),
      weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
      isToday: iso === todayISO,
      isPast: d < today,
      isWorkday: !isWeekend && !isHoliday,
      isWeekend,
      isHoliday,
      index: i,
    });
  }

  return days;
}

export function getTodayIndex(days: TimelineDay[]): number {
  return days.findIndex((d) => d.isToday);
}
