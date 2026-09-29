import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/lib/api';
import { getISTProjectBreakdownForDate } from '@/lib/capacity';
import { Z } from '@/lib/timelineTokens';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { TimelineSkeleton } from '@/components/skeletons/TimelineSkeleton';
import TimelineTeamSection from './components/TimelineTeamSection';
import TimelineToolbar from './TimelineToolbar';
import TimelineDateHeader from './TimelineDateHeader';
import TimelineTodayOverlays from './TimelineTodayOverlays';
import TimelineModals, { type CellProjectWithType } from './TimelineModals';
import { useTimelineData } from './useTimelineData';
import { useFilteredTimelineUsers, useTimelineFilters } from './useTimelineFilters';
import { useTimelineLayout } from './useTimelineLayout';
import { useUserDeepLink } from './useUserDeepLink';

export default function TimelinePage() {
  const { user } = useAuth();

  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    const end = new Date(today);
    end.setDate(end.getDate() + 15);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }, []);

  const filters = useTimelineFilters(user);
  const data = useTimelineData({
    dateRange,
    selectedTeams: filters.selectedTeams,
    teamsInitialized: filters.teamsInitialized,
    user,
    resolveTeamsForFetch: filters.resolveTeamsForFetch,
  });
  const { filteredUsers, ganttData, groupedGanttData } = useFilteredTimelineUsers({
    users: data.users,
    ganttFeaturesData: data.ganttFeaturesData,
    selectedTeams: filters.selectedTeams,
    teamsInitialized: filters.teamsInitialized,
    searchQuery: filters.searchQuery,
  });

  const ready = !data.loading && data.timelineData !== null;
  const layout = useTimelineLayout(ready);

  const defaultTeams = filters.getDefaultTeams();
  const highlightedUserId = useUserDeepLink({
    ready,
    users: data.users,
    selectedTeams: filters.selectedTeams,
    allowedTeams: defaultTeams,
    setSelectedTeams: filters.setSelectedTeams,
    scrollerRef: layout.timelineRef,
  });

  const [selectedCell, setSelectedCell] = useState<{ date: string; userId: number } | null>(null);
  const [selectedUserForWeekModal, setSelectedUserForWeekModal] = useState<User | null>(null);
  const [ganttVisibility, setGanttVisibility] = useState<Map<number, boolean>>(new Map());

  const handleCellClick = useCallback((date: string, userId: number) => {
    setSelectedCell({ date, userId });
  }, []);

  const getCellProjects = useCallback(
    (date: string, userId: number, isPast: boolean): CellProjectWithType[] => {
      if (isPast) {
        const userData = data.userDataMap.get(userId);
        if (!userData) return [];
        return getISTProjectBreakdownForDate(date, userData.activities);
      }
      return data.projectsData.get(`${userId}-${date}`)?.projects ?? [];
    },
    [data.projectsData, data.userDataMap],
  );

  return (
    <div
      className="isolate flex h-[calc(100dvh-3rem)] min-h-0 w-full flex-col overflow-hidden bg-[var(--timeline-surface)] transition-colors"
      style={{ '--tl-z-cell': Z.cell, '--tl-z-hover': Z.hover } as CSSProperties}
    >
      <TimelineToolbar
        selectedTeams={filters.selectedTeams}
        setSelectedTeams={filters.setSelectedTeams}
        defaultTeams={defaultTeams}
        onResetTeams={filters.resetTeams}
        searchQuery={filters.searchQuery}
        setSearchQuery={filters.setSearchQuery}
        onTodayClick={layout.handleTodayButtonClick}
        todayDisabled={layout.dividerIndex < 0}
        userCount={filteredUsers.length}
      />

      {data.error && (
        <Alert variant="destructive" className="m-4">
          <AlertTitle>Fehler beim Laden</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      )}

      {data.loading && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <TimelineSkeleton />
        </div>
      )}

      {ready && (
        <div
          ref={layout.timelineRef}
          className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="relative flex min-w-full flex-col" style={{ width: `${layout.contentWidth}px` }}>
            <TimelineDateHeader
              allDays={layout.allDays}
              dynamicDimensions={layout.dynamicDimensions}
              gridWidth={layout.gridWidth}
            />

            {groupedGanttData.length === 0 ? (
              <Empty className="py-16">
                <EmptyContent>
                  <EmptyTitle>Keine Mitarbeiter für diese Auswahl</EmptyTitle>
                  <EmptyDescription>
                    Passe Team-Filter oder Suche an, um Mitarbeiter anzuzeigen.
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              groupedGanttData.map(([teamName, teamData]) => (
                <TimelineTeamSection
                  key={teamName}
                  teamName={teamName}
                  teamUsers={teamData.map((td) => td.user)}
                  userDataMap={data.userDataMap}
                  ganttData={ganttData}
                  allDays={layout.allDays}
                  dynamicDimensions={layout.dynamicDimensions}
                  ganttVisibility={ganttVisibility}
                  setGanttVisibility={setGanttVisibility}
                  onCellClick={handleCellClick}
                  onUserClick={setSelectedUserForWeekModal}
                  getCellProjects={getCellProjects}
                  capacityData={data.capacityData}
                  highlightedUserId={highlightedUserId}
                />
              ))
            )}

            <TimelineTodayOverlays
              dividerIndex={layout.dividerIndex}
              dynamicDimensions={layout.dynamicDimensions}
              highlightToday={layout.highlightToday}
            />
          </div>
        </div>
      )}

      <TimelineModals
        selectedCell={selectedCell}
        onCloseCell={() => setSelectedCell(null)}
        userDataMap={data.userDataMap}
        getCellProjects={getCellProjects}
        selectedUser={selectedUserForWeekModal}
        onCloseUser={() => setSelectedUserForWeekModal(null)}
      />

      {!data.loading && !data.timelineData && !data.error && (
        <Empty className="flex-1">
          <EmptyContent>
            <EmptyTitle>Keine Daten geladen</EmptyTitle>
            <EmptyDescription>
              Bitte warte einen Moment oder lade die Seite neu.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
