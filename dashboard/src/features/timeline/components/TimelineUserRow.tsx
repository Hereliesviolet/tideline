import React from 'react';
import { User, Employment, Schedule } from '@/lib/api';
import TimelineCell from './TimelineCell';
import { UserAvatar } from '@/components/UserAvatar';
import GanttFeaturesRenderer, {
  computeGanttRequiredHeight,
  layoutGanttLayers,
} from './GanttFeaturesRenderer';
import ProjectDetailModal from '@/components/ProjectDetailModal';
import { calculateDailyCapacity } from '@/lib/capacity';
import { Eye, EyeOff } from 'lucide-react';
import type { UserGanttData } from '@/lib/ganttDataTransform';
import type { GanttFeature } from '@/types/gantt';
import type { TimelineDay, TimelineDimensions } from '@/lib/timelineConstants';
import {
  AVATAR_SIZE,
  DAY_COUNT,
  GANTT_MAX_LAYERS,
  IST_OVERTIME_HEADROOM,
  ROW_BASE_HEIGHT,
  ROW_MIN_HEIGHT,
  TYPE,
  Z,
} from '@/lib/timelineTokens';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function fmtH(h: number): string {
  const s = h.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

interface TimelineUserRowProps {
  user: User;
  userDataForCell: {
    employments: Employment[];
    activities: any[];
    planning: any[];
    schedules: Schedule[];
  };
  userGanttData?: UserGanttData;
  allDays: TimelineDay[];
  dynamicDimensions: TimelineDimensions;
  ganttVisibility: Map<number, boolean>;
  setGanttVisibility: (visibility: Map<number, boolean>) => void;
  onCellClick: (date: string, userId: number) => void;
  onUserClick?: (user: User) => void;
  getCellProjects: (
    date: string,
    userId: number,
    isPast: boolean,
  ) => Array<{ name: string; hours: number; billable?: boolean | null }>;
  capacityData?: Map<
    string,
    { userId: number; date: string; targetHours: number; bookedHours: number; fillPercent: number | null }
  >;
  highlighted?: boolean;
}

const TimelineUserRow = React.memo(function TimelineUserRow({
  user,
  userDataForCell,
  userGanttData,
  allDays,
  dynamicDimensions,
  ganttVisibility,
  setGanttVisibility,
  onCellClick,
  onUserClick,
  getCellProjects,
  capacityData,
  highlighted = false,
}: TimelineUserRowProps) {
  const { cellWidth, cellGap, sidebarWidth } = dynamicDimensions;
  const gridWidth = DAY_COUNT * (cellWidth + cellGap) - cellGap;

  const firstSollIndex = React.useMemo(() => {
    const today = allDays.find((d) => d.isToday);
    if (today && typeof today.index === 'number') return today.index + 1;
    return 15;
  }, [allDays]);

  const showCellView = ganttVisibility.get(user.id) === true;
  const hasGantt = Boolean(userGanttData && userGanttData.features.length > 0);

  const ganttRequiredHeight = React.useMemo(() => {
    if (!userGanttData || userGanttData.features.length === 0 || showCellView) return 0;
    const layers = layoutGanttLayers(userGanttData.features, allDays[0].iso, firstSollIndex);
    const visible = Math.min(layers.length, GANTT_MAX_LAYERS);
    return computeGanttRequiredHeight(visible, layers.length > visible);
  }, [userGanttData, showCellView, allDays, firstSollIndex]);

  // Alle Zeilen ohne Gantt-Stapel sind gleich hoch; der Headroom hält
  // einen 140-%-Balken innerhalb der Zeile.
  const rowHeightPx = Math.max(
    ROW_MIN_HEIGHT,
    ROW_BASE_HEIGHT + IST_OVERTIME_HEADROOM,
    ganttRequiredHeight,
  );

  const dayCapacities = React.useMemo(() => {
    const capacities = new Map<
      string,
      { targetHours: number; bookedHours: number; fillPercent: number | null }
    >();
    for (const day of allDays) {
      if (capacityData) {
        const key = `${user.id}-${day.iso}`;
        const serverCapacity = capacityData.get(key);
        if (serverCapacity) {
          capacities.set(day.iso, serverCapacity);
          continue;
        }
      }
      const capacity = calculateDailyCapacity(
        user,
        day.iso,
        userDataForCell.employments,
        day.isPast || day.isToday ? userDataForCell.activities : [],
        day.isPast || day.isToday ? [] : userDataForCell.planning,
        userDataForCell.schedules,
      );
      capacities.set(day.iso, capacity);
    }
    return capacities;
  }, [allDays, user, userDataForCell, capacityData]);

  const dayProjects = React.useMemo(() => {
    const projects = new Map<
      string,
      Array<{ name: string; hours: number; billable?: boolean | null }>
    >();
    for (const day of allDays) {
      const isPast = day.isPast || day.isToday;
      const projs = getCellProjects(day.iso, user.id, isPast);
      projects.set(day.iso, projs);
    }
    return projects;
  }, [allDays, user.id, getCellProjects]);

  const dayActivities = React.useMemo(() => {
    const activities = new Map<string, typeof userDataForCell.activities>();
    for (const day of allDays) {
      if (day.isPast || day.isToday) {
        activities.set(
          day.iso,
          userDataForCell.activities.filter((a) => a.date === day.iso),
        );
      } else {
        activities.set(day.iso, []);
      }
    }
    return activities;
  }, [allDays, userDataForCell.activities]);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedFeature, setSelectedFeature] = React.useState<GanttFeature | null>(null);

  const handleFeatureClick = React.useCallback((feature: GanttFeature) => {
    setSelectedFeature(feature);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = React.useCallback(() => {
    setIsModalOpen(false);
    setSelectedFeature(null);
  }, []);

  return (
    <div
      className="group/row relative grid items-stretch border-b border-border"
      style={{
        gridTemplateColumns: `${sidebarWidth}px 1fr`,
        height: `${rowHeightPx}px`,
      }}
      data-user-id={user.id}
    >
      {highlighted && (
        <div
          className="today-column-flash pointer-events-none absolute inset-0"
          style={{
            zIndex: Z.rowFlash,
            background: 'color-mix(in oklab, var(--primary) 18%, transparent)',
          }}
          aria-hidden
        />
      )}
      <div
        className="sticky left-0 flex items-center gap-2 border-r border-border bg-card px-2 py-1"
        style={{ zIndex: Z.userColumn }}
      >
        <UserAvatar
          avatarUrl={user.avatarUrl}
          displayName={user.displayName}
          sizePx={AVATAR_SIZE}
          onClick={() => onUserClick?.(user)}
        />
        <button
          type="button"
          onClick={() => onUserClick?.(user)}
          className="min-w-0 flex-1 cursor-pointer text-left"
          title={user.displayName || `User ${user.id}`}
        >
          {(() => {
            const displayName = user.displayName || `User ${user.id}`;
            const nameParts = displayName.split(' ').filter((p) => p.length > 0);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            if (nameParts.length > 1 && firstName && lastName) {
              return (
                <span className="flex flex-col leading-[1.15] text-foreground">
                  <span className="truncate font-medium" style={{ fontSize: TYPE.userName }}>
                    {firstName}
                  </span>
                  <span className="truncate text-muted-foreground" style={{ fontSize: TYPE.userSurname }}>
                    {lastName}
                  </span>
                </span>
              );
            }
            return (
              <span
                className="block truncate font-medium text-foreground"
                style={{ fontSize: TYPE.userName }}
              >
                {displayName}
              </span>
            );
          })()}
        </button>

        {hasGantt && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 opacity-70 data-[active]:opacity-100"
            data-active={showCellView ? '' : undefined}
            title={showCellView ? 'Gantt-Ansicht zeigen' : 'Detailzellen zeigen'}
            onClick={(e) => {
              e.stopPropagation();
              const newVisibility = new Map(ganttVisibility);
              newVisibility.set(user.id, !showCellView);
              setGanttVisibility(newVisibility);
            }}
          >
            {showCellView ? (
              <Eye className={cn('size-3.5 text-primary')} />
            ) : (
              <EyeOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>

      <div
        className="relative flex items-end overflow-visible"
        style={{
          gap: `${cellGap}px`,
          height: `${rowHeightPx}px`,
          width: `${gridWidth}px`,
        }}
      >
        {allDays.map((day) => {
          const capacity = dayCapacities.get(day.iso)!;
          const isIst = day.isPast || day.isToday;

          if (isIst || showCellView) {
            return (
              <TimelineCell
                key={`${isIst ? 'ist' : 'soll-cell'}-${user.id}-${day.iso}`}
                date={day.iso}
                fillPercent={capacity.fillPercent}
                isPast={isIst}
                isWeekend={day.isWeekend}
                isHoliday={day.isHoliday}
                schedules={userDataForCell.schedules}
                activities={dayActivities.get(day.iso) || []}
                targetHours={capacity.targetHours}
                bookedHours={capacity.bookedHours}
                projects={dayProjects.get(day.iso) || []}
                cellWidth={cellWidth}
                rowHeight={rowHeightPx}
                onClick={() => onCellClick(day.iso, user.id)}
              />
            );
          }

          return (
            <TimelineCell
              key={`soll-outline-${user.id}-${day.iso}`}
              date={day.iso}
              fillPercent={null}
              isPast={false}
              isWeekend={day.isWeekend}
              isHoliday={day.isHoliday}
              schedules={userDataForCell.schedules}
              activities={[]}
              targetHours={capacity.targetHours}
              bookedHours={0}
              projects={[]}
              cellWidth={cellWidth}
              rowHeight={rowHeightPx}
              disableHover
              outlineOnly
            />
          );
        })}

        {hasGantt && (
          <GanttFeaturesRenderer
            userGanttData={userGanttData!}
            userId={user.id}
            ganttVisibility={ganttVisibility}
            cellWidth={cellWidth}
            cellGap={cellGap}
            rowHeight={rowHeightPx}
            timelineStartISO={allDays[0].iso}
            firstSollIndex={firstSollIndex}
            onFeatureClick={handleFeatureClick}
          />
        )}

        {!showCellView && (
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: Z.sollLabel }}>
            {allDays.map((day) => {
              if (day.isPast || day.isToday) return null;
              const cap = dayCapacities.get(day.iso);
              if (!cap || cap.fillPercent === null || cap.bookedHours <= 0) return null;
              return (
                <div
                  key={`soll-h-${day.iso}`}
                  className="absolute flex items-center justify-center tabular-nums font-semibold text-muted-foreground/80"
                  style={{
                    top: 4,
                    left: `${day.index * (cellWidth + cellGap)}px`,
                    width: `${cellWidth}px`,
                    fontSize: TYPE.cellLabel,
                    lineHeight: 1,
                  }}
                >
                  {fmtH(cap.bookedHours)}h
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ProjectDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        feature={selectedFeature}
        userId={user.id}
        userName={user.displayName || `User ${user.id}`}
      />
    </div>
  );
});

export default TimelineUserRow;
