import type { TimelineDimensions } from '@/lib/timelineConstants';
import { Z } from '@/lib/timelineTokens';

interface TimelineTodayOverlaysProps {
  dividerIndex: number;
  dynamicDimensions: TimelineDimensions;
  highlightToday: boolean;
}

/** Heute-Tint, Heute-Flash und IST↔SOLL-Trenner; liegen im scrollenden Inhalt über Header + Body. */
export default function TimelineTodayOverlays({
  dividerIndex,
  dynamicDimensions,
  highlightToday,
}: TimelineTodayOverlaysProps) {
  if (dividerIndex < 0) return null;

  const { sidebarWidth, cellWidth, cellGap } = dynamicDimensions;
  const dividerLeft = sidebarWidth + (dividerIndex + 1) * (cellWidth + cellGap) - cellGap / 2;
  const flashLeft = sidebarWidth + dividerIndex * (cellWidth + cellGap);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{
          left: `${flashLeft}px`,
          width: `${cellWidth}px`,
          zIndex: Z.todayTint,
          background: 'var(--cell-today-tint)',
        }}
        aria-hidden
      />
      {highlightToday && (
        <div
          className="today-column-flash pointer-events-none absolute inset-y-0 rounded-sm"
          style={{
            left: `${flashLeft}px`,
            width: `${cellWidth}px`,
            zIndex: Z.divider,
            background: 'color-mix(in oklab, var(--primary) 35%, transparent)',
            boxShadow: '0 0 20px 8px color-mix(in oklab, var(--primary) 25%, transparent)',
          }}
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{
          left: `${dividerLeft}px`,
          width: '1px',
          zIndex: Z.divider,
          background:
            'linear-gradient(180deg, var(--cell-divider-from) 0%, var(--cell-divider-to) 100%)',
          boxShadow: '0 0 6px 1px var(--cell-divider-glow-violet)',
        }}
        aria-hidden
      />
    </>
  );
}
