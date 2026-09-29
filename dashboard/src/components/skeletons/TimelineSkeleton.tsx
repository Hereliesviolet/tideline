import { Skeleton } from '@/components/ui/skeleton';
import { calculateTimelineDimensions } from '@/lib/timelineConstants';
import {
  AVATAR_SIZE,
  CELL_GAP,
  DATE_HEADER_HEIGHT,
  DAY_COUNT,
  IST_OVERTIME_HEADROOM,
  ROW_BASE_HEIGHT,
} from '@/lib/timelineTokens';

const ROW_COUNT = 8;
const ROW_HEIGHT = ROW_BASE_HEIGHT + IST_OVERTIME_HEADROOM;

/**
 * Lade-Platzhalter für die Timeline. Nutzt dieselben Maße wie das echte Grid
 * (Sidebar-Breite, Zellbreite, Zeilenhöhe), damit der Wechsel nicht ruckelt.
 */
export function TimelineSkeleton() {
  const { cellWidth, sidebarWidth } = calculateTimelineDimensions();
  const gridStyle = {
    gridTemplateColumns: `repeat(${DAY_COUNT}, ${cellWidth}px)`,
    gap: `${CELL_GAP}px`,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center border-b" style={{ height: DATE_HEADER_HEIGHT }}>
        <div className="flex-shrink-0 border-r px-3" style={{ width: sidebarWidth }}>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid" style={gridStyle}>
          {Array.from({ length: DAY_COUNT }).map((_, i) => (
            <Skeleton key={i} className="mx-auto h-6 w-4" />
          ))}
        </div>
      </div>

      {Array.from({ length: ROW_COUNT }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex items-center border-b" style={{ height: ROW_HEIGHT }}>
          <div className="flex flex-shrink-0 items-center gap-2 border-r px-2" style={{ width: sidebarWidth }}>
            <Skeleton className="rounded-full" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-14" />
            </div>
          </div>
          <div className="grid" style={gridStyle}>
            {Array.from({ length: DAY_COUNT }).map((_, j) => (
              <Skeleton
                key={j}
                className="rounded-none"
                style={{ height: ROW_HEIGHT, opacity: 0.55 + (rowIdx * j) / 200 }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
