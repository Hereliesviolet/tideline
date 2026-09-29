import { User } from '@/lib/api';
import type { UserGanttData } from '@/lib/ganttDataTransform';
import type { TimelineDay, TimelineDimensions } from '@/lib/timelineConstants';
import { DATE_HEADER_HEIGHT, TYPE, Z } from '@/lib/timelineTokens';
import TimelineUserRow from './TimelineUserRow';

interface TimelineTeamSectionProps {
  teamName: string;
  teamUsers: User[];
  userDataMap: Map<
    number,
    {
      employments: any[];
      activities: any[];
      planning: any[];
      schedules: any[];
    }
  >;
  ganttData: UserGanttData[];
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
    {
      userId: number;
      date: string;
      targetHours: number;
      bookedHours: number;
      fillPercent: number | null;
    }
  >;
  highlightedUserId?: number | null;
}

function teamAccentVar(teamName: string): string {
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = (Math.abs(hash) % 5) + 1;
  return `var(--chart-${index})`;
}

export default function TimelineTeamSection({
  teamName,
  teamUsers,
  userDataMap,
  ganttData,
  allDays,
  dynamicDimensions,
  ganttVisibility,
  setGanttVisibility,
  onCellClick,
  onUserClick,
  getCellProjects,
  capacityData,
  highlightedUserId,
}: TimelineTeamSectionProps) {
  const visibleUsers = teamUsers.filter((u) => userDataMap.has(u.id));
  if (visibleUsers.length === 0) return null;

  const accent = teamAccentVar(teamName);
  return (
    <section aria-label={teamName}>
      <div
        className="sticky flex items-center border-b border-border py-2 font-semibold uppercase tracking-wide text-foreground shadow-sm"
        style={{
          background: 'color-mix(in oklab, var(--muted) 60%, var(--timeline-surface))',
          top: DATE_HEADER_HEIGHT,
          borderLeft: `3px solid ${accent}`,
          zIndex: Z.teamHeader,
          fontSize: TYPE.teamHeader,
        }}
      >
        <div className="sticky left-0 flex items-center gap-3 px-3">
          <span>{teamName}</span>
          <span className="font-normal normal-case text-muted-foreground">
            {visibleUsers.length} Mitarbeiter
          </span>
        </div>
      </div>

      {visibleUsers.map((user) => {
        const userGanttData = ganttData.find((gd) => gd.user.id === user.id);
        return (
          <TimelineUserRow
            key={user.id}
            user={user}
            userDataForCell={userDataMap.get(user.id)!}
            userGanttData={userGanttData}
            allDays={allDays}
            dynamicDimensions={dynamicDimensions}
            ganttVisibility={ganttVisibility}
            setGanttVisibility={setGanttVisibility}
            onCellClick={onCellClick}
            onUserClick={onUserClick}
            getCellProjects={getCellProjects}
            capacityData={capacityData}
            highlighted={highlightedUserId === user.id}
          />
        );
      })}
    </section>
  );
}
