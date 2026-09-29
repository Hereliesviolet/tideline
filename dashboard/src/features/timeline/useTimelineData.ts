import { useEffect, useMemo, useState } from 'react';
import {
  fetchUsersMapped,
  fetchTimelineWithDateRange,
  fetchUserEmployments,
  fetchSchedulesByUser,
  type User,
  type TimelineItem,
  type Employment,
  type Schedule,
} from '@/lib/api';
import type { User as AuthUser } from '@/lib/auth';
import { mergeGanttFeaturesIntoRuns } from '@/lib/ganttDataTransform';
import { getProjectUniqueColor } from '@/lib/projectColors';
import { mapWithConcurrency } from '@/lib/mapWithConcurrency';
import type { GanttFeature } from '@/types/gantt';

export interface CellProject {
  name: string;
  hours: number;
  billable?: boolean | null;
  customerName?: string | null;
}

export interface CapacityEntry {
  userId: number;
  date: string;
  targetHours: number;
  bookedHours: number;
  fillPercent: number | null;
}

export interface UserCellData {
  employments: Employment[];
  activities: TimelineItem[];
  planning: TimelineItem[];
  schedules: Schedule[];
}

export interface TimelineDataShape {
  items: TimelineItem[];
  users: Array<{ id: number; office: string | null }>;
  dateRange: { from: string; to: string };
  capacities?: CapacityEntry[];
  bottlenecks?: Array<{ userId: number; date: string; isBottleneck: boolean; totalHours: number; fillPercent: number; overlappingProjects: number }>;
  projects?: Array<{ userId: number; date: string; projects: CellProject[] }>;
  ganttFeatures?: Array<{ userId: number; features: Array<{ id: string; name: string; startAt: string; endAt: string; status: { id: string; name: string; color: string }; hoursPerDay: number; totalHours: number; projectColor: string; actualDays?: number }> }>;
}

interface UseTimelineDataArgs {
  dateRange: { from: string; to: string };
  selectedTeams: string[];
  teamsInitialized: boolean;
  user: AuthUser | null;
  resolveTeamsForFetch: () => string[];
}

export function useTimelineData({
  dateRange,
  selectedTeams,
  teamsInitialized,
  user,
  resolveTeamsForFetch,
}: UseTimelineDataArgs) {
  const [users, setUsers] = useState<User[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineDataShape | null>(null);
  const [employmentsMap, setEmploymentsMap] = useState<Map<number, Employment[]>>(new Map());
  const [schedulesMap, setSchedulesMap] = useState<Map<number, Schedule[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capacityData, setCapacityData] = useState<Map<string, CapacityEntry>>(new Map());
  const [projectsData, setProjectsData] = useState<Map<string, { userId: number; date: string; projects: CellProject[] }>>(new Map());
  const [ganttFeaturesData, setGanttFeaturesData] = useState<Map<number, GanttFeature[]>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const teamsToUse = resolveTeamsForFetch();

        const timeline = await fetchTimelineWithDateRange(dateRange.from, dateRange.to, {
          teams: teamsToUse.length > 0 ? teamsToUse : undefined,
        });
        if (!alive) return;
        setTimelineData(timeline as TimelineDataShape);

        const allUsersData = await fetchUsersMapped();
        if (!alive) return;

        const normalizedUsers = allUsersData.map((u) => {
          const cast = u as unknown as Record<string, unknown>;
          const firstname = ((u.firstname as string) || (cast.firstName as string) || '');
          const lastname = ((u.lastname as string) || (cast.lastName as string) || '');
          const displayName =
            u.displayName ||
            (firstname && lastname ? `${firstname} ${lastname}`.trim() : firstname || lastname || '');
          const unitName = u.unitName || (cast.team as string) || null;
          const avatarUrl = u.avatarUrl ?? (cast.avatar_url as string | null) ?? null;
          return { ...u, firstname, lastname, displayName, unitName, avatarUrl };
        });

        setUsers(normalizedUsers);

        const usersToProcess = normalizedUsers;

        const CONCURRENCY = 6;

        const employmentResults = await mapWithConcurrency(
          usersToProcess,
          CONCURRENCY,
          async (uu) => {
            try {
              const emps = await fetchUserEmployments(uu.id, dateRange.from, dateRange.to);
              return { userId: uu.id, employments: emps };
            } catch {
              return { userId: uu.id, employments: [] };
            }
          },
        );

        const scheduleResults = await mapWithConcurrency(
          usersToProcess,
          CONCURRENCY,
          async (uu) => {
            try {
              const scheds = await fetchSchedulesByUser(uu.id, {
                from: dateRange.from,
                to: dateRange.to,
              });
              return { userId: uu.id, schedules: scheds };
            } catch {
              return { userId: uu.id, schedules: [] };
            }
          },
        );

        const empMap = new Map<number, Employment[]>();
        const schedMap = new Map<number, Schedule[]>();
        for (const r of employmentResults) empMap.set(r.userId, r.employments);
        for (const r of scheduleResults) schedMap.set(r.userId, r.schedules);

        if (!alive) return;
        setEmploymentsMap(empMap);
        setSchedulesMap(schedMap);

        if (timeline.capacities) {
          const m = new Map<string, CapacityEntry>();
          for (const c of timeline.capacities) m.set(`${c.userId}-${c.date}`, c);
          setCapacityData(m);
        }
        if (timeline.projects) {
          const m = new Map<string, { userId: number; date: string; projects: CellProject[] }>();
          for (const p of timeline.projects) m.set(`${p.userId}-${p.date}`, p);
          setProjectsData(m);
        }
        if (timeline.ganttFeatures) {
          const ganttMap = new Map<number, GanttFeature[]>();
          for (const userFeatures of timeline.ganttFeatures) {
            // Backend liefert i. d. R. eine Feature-Instanz pro Tag mit Hex-Farbe.
            // → in CSS-Variablen-Palette umschreiben und in Mehrtages-Runs mergen.
            const normalized: GanttFeature[] = userFeatures.features.map((f) => ({
              ...f,
              startAt: new Date(`${f.startAt}T00:00:00`),
              endAt: new Date(`${f.endAt}T00:00:00`),
              projectColor: getProjectUniqueColor(f.name),
            }));
            const merged = mergeGanttFeaturesIntoRuns(normalized).map((m) => ({
              ...m,
              hoursPerDay: m.hoursPerDay ?? 0,
              totalHours: m.totalHours ?? 0,
              projectColor: m.projectColor ?? getProjectUniqueColor(m.name),
            }));
            ganttMap.set(userFeatures.userId, merged);
          }
          setGanttFeaturesData(ganttMap);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Fehler beim Laden der Timeline');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to, selectedTeams, teamsInitialized, user]);

  const userDataMap = useMemo(() => {
    const map = new Map<number, UserCellData>();
    for (const u of users) {
      const employments = employmentsMap.get(u.id) || [];
      const schedules = schedulesMap.get(u.id) || [];
      const activities = (timelineData?.items || []).filter(
        (it) => it.userId === u.id && (it.type === 'work' || it.type === 'activity'),
      );
      const planning = (timelineData?.items || []).filter(
        (it) => it.userId === u.id && it.type === 'plan',
      );
      map.set(u.id, { employments, activities, planning, schedules });
    }
    return map;
  }, [users, employmentsMap, schedulesMap, timelineData]);

  return {
    loading,
    error,
    users,
    timelineData,
    employmentsMap,
    schedulesMap,
    capacityData,
    projectsData,
    ganttFeaturesData,
    userDataMap,
  };
}
