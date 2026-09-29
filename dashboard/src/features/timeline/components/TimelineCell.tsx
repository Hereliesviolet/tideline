import React from 'react';
import { Calendar, Umbrella, Heart } from 'lucide-react';
import type { TimelineItem, Schedule } from '@/lib/api';
import { getProjectUniqueColorPair } from '@/lib/projectColors';
import { getISTSegments } from '@/lib/cellColors';
import { getAbsenceCode } from '@/lib/capacity';
import {
  CELL_LABEL_MIN_HEIGHT,
  CELL_LABEL_MIN_WIDTH,
  IST_MAX_UTILIZATION,
  ROW_BASE_HEIGHT,
  TYPE,
} from '@/lib/timelineTokens';
import { cn } from '@/lib/utils';

interface TimelineCellProps {
  date: string;
  fillPercent: number | null;
  isPast: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  schedules: Schedule[];
  activities?: TimelineItem[];
  targetHours: number;
  bookedHours: number;
  projects?: Array<{ name: string; hours: number; billable?: boolean | null }>;
  cellWidth: number;
  /** Höhe der gesamten Zelle; 100 % Auslastung entsprechen ROW_BASE_HEIGHT. */
  rowHeight: number;
  onClick?: () => void;
  disableHover?: boolean;
  /** Dezente Spurzelle als Hintergrund für Gantt-Balken. */
  outlineOnly?: boolean;
}

/** Referenz für die Balkenhöhe, wenn außerhalb des Zeitmodells gebucht wurde. */
const FALLBACK_REFERENCE_HOURS = 8;

const CELL_Z_CLASS = 'z-[var(--tl-z-cell)]';
const HOVER_CLASSES =
  'cursor-pointer transition-[box-shadow,transform] duration-150 hover:z-[var(--tl-z-hover)] hover:shadow-md hover:ring-2 hover:ring-foreground/30 hover:ring-offset-1 hover:ring-offset-background focus-visible:z-[var(--tl-z-hover)] focus-visible:outline-2 focus-visible:outline-ring';

function fmtH(h: number): string {
  const s = h.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

const TimelineCell = React.memo(function TimelineCell({
  activities,
  date,
  fillPercent,
  isPast,
  isWeekend,
  isHoliday,
  schedules,
  targetHours,
  bookedHours,
  projects = [],
  cellWidth,
  rowHeight,
  onClick,
  disableHover = false,
  outlineOnly = false,
}: TimelineCellProps) {
  const clickable = Boolean(onClick) && !disableHover;
  const interactiveProps = (label: string) =>
    clickable
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': label,
          onClick,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick?.();
            }
          },
        }
      : {};

  const cellStyle = { width: `${cellWidth}px`, height: `${rowHeight}px` };
  const absenceCode = getAbsenceCode(date, schedules);

  // ─── 1) Echte Abwesenheit (Schedule mit Absence-Code) ────────────────────────
  if (absenceCode !== null) {
    const codeLower = absenceCode.toLowerCase();
    let IconComponent = Calendar;
    if (codeLower.includes('krank') || codeLower.includes('sick')) IconComponent = Heart;
    else if (codeLower.includes('urlaub') || codeLower.includes('vacation')) IconComponent = Umbrella;

    const tooltipText = `${date} – ${absenceCode}`;
    return (
      <div
        className={cn(
          CELL_Z_CLASS,
          'relative flex items-center justify-center border',
          'border-absence/40 bg-absence/70 text-foreground/60',
          clickable ? HOVER_CLASSES : 'cursor-default',
        )}
        style={cellStyle}
        title={tooltipText}
        {...interactiveProps(tooltipText)}
      >
        <IconComponent className="size-4" />
      </div>
    );
  }

  // ─── Outline (Gantt-Hintergrund) ─────────────────────────────────────────────
  if (outlineOnly) {
    return (
      <div
        className={cn('pointer-events-none', isWeekend ? 'bg-muted/25' : 'bg-transparent')}
        style={{
          ...cellStyle,
          borderBottom: '1px solid color-mix(in oklab, var(--border) 50%, transparent)',
        }}
      />
    );
  }

  // ─── 2) Feiertag ─────────────────────────────────────────────────────────────
  if (isHoliday) {
    const tooltipText = `${date} – Feiertag`;
    return (
      <div
        className="cursor-default border border-border/30 bg-muted/20"
        style={cellStyle}
        aria-label={tooltipText}
        title={tooltipText}
      />
    );
  }

  // ─── 3) Kein Arbeitstag laut Zeitmodell (inkl. Wochenende) ───────────────────
  if (targetHours === 0 && bookedHours === 0) {
    const tooltipText = `${date} – Kein Arbeitstag laut Zeitmodell`;
    return (
      <div
        className="cursor-default bg-muted/10"
        style={cellStyle}
        aria-label={tooltipText}
        title={tooltipText}
      />
    );
  }

  // ─── 4) Arbeitstag ohne Buchung ──────────────────────────────────────────────
  if (bookedHours === 0) {
    const tooltipText = `${date} – keine Buchung (${fmtH(targetHours)}h Soll)`;
    return (
      <div
        className={cn(
          CELL_Z_CLASS,
          'relative border border-[var(--cell-border)] bg-[var(--cell-bg-empty)]',
          clickable ? HOVER_CLASSES : 'cursor-default',
        )}
        style={cellStyle}
        title={tooltipText}
        {...interactiveProps(tooltipText)}
      />
    );
  }

  // ─── 5) IST-/Projekt-Stapel ──────────────────────────────────────────────────
  const referenceHours = targetHours > 0 ? targetHours : FALLBACK_REFERENCE_HOURS;
  const utilization = bookedHours / referenceHours;
  const isOvertime = targetHours > 0 && bookedHours > targetHours;
  const barHeight = Math.min(utilization, IST_MAX_UTILIZATION) * ROW_BASE_HEIGHT;

  const istSegments =
    isPast && activities && activities.length > 0
      ? getISTSegments(activities, date, referenceHours)
      : [];

  const projectSegments =
    !isPast && projects.length > 0
      ? projects
          .map((p) => ({ hours: p.hours, pair: getProjectUniqueColorPair(p.name || '') }))
          .sort((a, b) => b.hours - a.hours)
      : [];

  let segments: Array<{ hours: number; className?: string; bg?: string; color?: string }> =
    istSegments.length > 0
      ? istSegments.map((s) => ({ hours: s.hours, className: cn(s.color, s.textColor) }))
      : projectSegments.map((s) => ({
          hours: s.hours,
          bg: disableHover ? 'oklch(from var(--muted) l c h / 0.6)' : s.pair.bg,
          color: s.pair.text,
        }));
  // Gebuchte Stunden ohne Detaildaten (z. B. nur Server-Kapazität): ein neutrales Segment
  if (segments.length === 0) {
    segments = [{ hours: bookedHours, className: 'bg-neutral-booking text-neutral-booking-foreground' }];
  }
  const showLabels = !disableHover && cellWidth >= CELL_LABEL_MIN_WIDTH;

  const percentLabel = fillPercent !== null ? fillPercent.toFixed(0) : Math.round(utilization * 100);
  const titleText = (() => {
    const head = `${date} – ${isPast ? 'IST' : 'SOLL'}: ${bookedHours.toFixed(1)}h / ${targetHours.toFixed(1)}h (${percentLabel}%)`;
    if (projects.length === 0) return head;
    const rows = projects
      .slice(0, 5)
      .map((p) => `• ${p.name || 'Ohne Projekt'}: ${p.hours.toFixed(1)}h`)
      .join('\n');
    const more = projects.length > 5 ? `\n+${projects.length - 5} weitere…` : '';
    return `${head}\n${rows}${more}`;
  })();

  const scaleBaseHours = bookedHours > 0 ? bookedHours : segments.reduce((sum, s) => sum + s.hours, 0);
  let cumulativeBottomPx = 0;

  return (
    <div
      className={cn(
        CELL_Z_CLASS,
        'relative overflow-hidden font-medium',
        isWeekend ? 'bg-muted/25' : 'bg-[var(--cell-bg-empty)]',
        clickable ? HOVER_CLASSES : 'cursor-default',
        disableHover && 'opacity-50',
      )}
      style={{
        ...cellStyle,
        borderTop: '1px solid color-mix(in oklab, var(--border) 35%, transparent)',
        borderBottom: '1px solid color-mix(in oklab, var(--border) 50%, transparent)',
      }}
      title={titleText}
      {...interactiveProps(titleText)}
    >
      <div className="absolute inset-x-0 bottom-0" style={{ height: `${barHeight}px` }}>
        {segments.map((seg, idx) => {
          const segmentHeightPx = scaleBaseHours > 0 ? (seg.hours / scaleBaseHours) * barHeight : 0;
          const bottomPx = cumulativeBottomPx;
          cumulativeBottomPx += segmentHeightPx;
          const finalHeightPx = Math.max(segmentHeightPx, 1);
          return (
            <div
              key={idx}
              className={cn('absolute inset-x-0 flex items-center justify-center', seg.className)}
              style={{
                backgroundColor: seg.bg,
                color: seg.color,
                bottom: `${bottomPx}px`,
                height: `${finalHeightPx}px`,
              }}
            >
              {showLabels && finalHeightPx >= CELL_LABEL_MIN_HEIGHT && (
                <span
                  className="whitespace-nowrap font-semibold leading-none tabular-nums"
                  style={{ fontSize: TYPE.cellLabel }}
                >
                  {fmtH(seg.hours)}h
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isOvertime && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40"
          style={{ bottom: `${ROW_BASE_HEIGHT}px` }}
        />
      )}
    </div>
  );
});

export default TimelineCell;
