import type { TimelineDay, TimelineDimensions } from '@/lib/timelineConstants';
import { DATE_HEADER_HEIGHT, TYPE, Z } from '@/lib/timelineTokens';
import { cn } from '@/lib/utils';

interface TimelineDateHeaderProps {
  allDays: TimelineDay[];
  dynamicDimensions: TimelineDimensions;
  gridWidth: number;
}

export default function TimelineDateHeader({ allDays, dynamicDimensions, gridWidth }: TimelineDateHeaderProps) {
  return (
    <div
      className="sticky top-0 flex flex-shrink-0 items-stretch border-b bg-[var(--timeline-surface)]"
      style={{ height: DATE_HEADER_HEIGHT, zIndex: Z.dateHeader }}
    >
      <div
        className="sticky left-0 flex-shrink-0 border-r"
        style={{
          width: `${dynamicDimensions.sidebarWidth}px`,
          zIndex: Z.userColumn,
          background: 'color-mix(in oklab, var(--muted) 40%, var(--timeline-surface))',
        }}
      />

      <div
        className="flex flex-shrink-0 items-center"
        style={{
          gap: `${dynamicDimensions.cellGap}px`,
          width: `${gridWidth}px`,
        }}
      >
        {allDays.map((day, idx) => {
          const prev = idx > 0 ? allDays[idx - 1] : null;
          const isMonthChange = Boolean(prev) && prev!.day > day.day;
          return (
            <div
              key={day.iso}
              className={cn(
                'flex flex-col items-center justify-center flex-shrink-0 gap-0.5 py-1.5',
                day.isWeekend && 'bg-muted/20',
                day.isHoliday && 'bg-destructive/10',
                isMonthChange && 'border-l border-primary/30',
              )}
              style={{
                width: `${dynamicDimensions.cellWidth}px`,
              }}
              data-day-index={day.index}
            >
              {day.isToday ? (
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
                  style={{ fontSize: TYPE.dateNumber }}
                  aria-label="Heute"
                >
                  {day.day}
                </span>
              ) : (
                <span
                  className={cn(
                    'font-semibold leading-none',
                    day.isWeekend ? 'text-muted-foreground/80' : 'text-foreground',
                  )}
                  style={{ fontSize: TYPE.dateNumber }}
                >
                  {day.day}
                </span>
              )}
              <span
                className={cn(
                  'text-center font-medium uppercase tracking-wide leading-none',
                  day.isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground/80',
                )}
                style={{ fontSize: TYPE.weekday }}
              >
                {day.weekday.slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
