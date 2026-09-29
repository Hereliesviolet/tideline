import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import {
  calculateTimelineDimensions,
  generateTimelineDays,
  getTodayIndex,
} from '@/lib/timelineConstants';
import { DAY_COUNT, GRID_MIN_WIDTH } from '@/lib/timelineTokens';

export function useTimelineLayout(ready: boolean) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [navSidebarUpdate, setNavSidebarUpdate] = useState(0);

  // Reagiert auf Sidebar-Toggle (kein window-resize-Event!) und ruft daher
  // calculateTimelineDimensions neu auf, sobald sich der collapse-State ändert.
  const { state: sidebarState } = useSidebar();
  useEffect(() => {
    // Animation der Sidebar dauert ~200ms (transition-[width] duration-200).
    // Nach Ende der Animation neu vermessen, damit das DOM die finale Breite hat.
    const t = setTimeout(() => setNavSidebarUpdate((v) => v + 1), 240);
    return () => clearTimeout(t);
  }, [sidebarState]);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      setNavSidebarUpdate((v) => v + 1);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const dynamicDimensions = useMemo(() => calculateTimelineDimensions(), [viewportSize, navSidebarUpdate]);

  const gridWidth = DAY_COUNT * (dynamicDimensions.cellWidth + dynamicDimensions.cellGap) - dynamicDimensions.cellGap;
  const contentWidth = dynamicDimensions.sidebarWidth + Math.max(gridWidth, GRID_MIN_WIDTH);

  const allDays = useMemo(() => generateTimelineDays(), []);

  const dividerIndex = useMemo(() => {
    const idx = getTodayIndex(allDays);
    return idx >= 0 ? idx : -1;
  }, [allDays]);

  const [highlightToday, setHighlightToday] = useState(false);

  /**
   * Sichtbarer Grid-Bereich = Client-Breite minus sticky User-Spalte.
   * center=true zentriert den Trenner darin („Heute“-Button); sonst wird nur
   * minimal gescrollt, falls Heute (+2 Tage rechts) nicht sichtbar ist.
   */
  const scrollToToday = useCallback(
    (center: boolean) => {
      const el = timelineRef.current;
      if (!el || dividerIndex < 0) return;
      const { cellWidth, cellGap, sidebarWidth } = dynamicDimensions;
      const step = cellWidth + cellGap;
      const visibleWidth = el.clientWidth - sidebarWidth;

      if (center) {
        const dividerX = sidebarWidth + (dividerIndex + 1) * step - cellGap / 2;
        el.scrollLeft = dividerX - sidebarWidth - visibleWidth / 2;
        return;
      }

      const todayLeft = sidebarWidth + dividerIndex * step;
      const todayRight = todayLeft + cellWidth + 2 * step;
      const visibleFrom = el.scrollLeft + sidebarWidth;
      const visibleTo = el.scrollLeft + el.clientWidth;
      if (todayLeft >= visibleFrom && todayRight <= visibleTo) return;
      if (todayRight > visibleTo) el.scrollLeft = todayRight - el.clientWidth;
      else el.scrollLeft = todayLeft - sidebarWidth;
    },
    [dividerIndex, dynamicDimensions],
  );

  const handleTodayButtonClick = useCallback(() => {
    scrollToToday(true);
    setHighlightToday(true);
    setTimeout(() => setHighlightToday(false), 1600);
  }, [scrollToToday]);

  useEffect(() => {
    if (timelineRef.current && ready && dividerIndex >= 0) {
      const t = setTimeout(() => scrollToToday(false), 100);
      return () => clearTimeout(t);
    }
  }, [ready, dividerIndex, scrollToToday]);

  return {
    timelineRef,
    dynamicDimensions,
    gridWidth,
    contentWidth,
    allDays,
    dividerIndex,
    highlightToday,
    scrollToToday,
    handleTodayButtonClick,
  };
}
