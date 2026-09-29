import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@/lib/api';
import type { User as AuthUser } from '@/lib/auth';
import {
  mapMocoUnitToTeamLevel,
  getVisibleTeamLevelsForUser,
  teamLevelsToTeamValues,
  type TeamLevel,
} from '@/lib/mocoMapping';
import type { GanttFeature } from '@/types/gantt';
import type { UserGanttData } from '@/lib/ganttDataTransform';

function isExcludedUnit(unitName: string | null | undefined): boolean {
  const normalized = (unitName || '').toLowerCase().trim();
  return (
    normalized === 'admin' ||
    normalized === '09. admin' ||
    normalized.includes('09. admin') ||
    normalized === 'freelancer' ||
    normalized === '07. freelancer' ||
    normalized.includes('freelancer')
  );
}

export function userTeamValue(unitName: string | null | undefined): string {
  return String(mapMocoUnitToTeamLevel(unitName)).padStart(2, '0');
}

export function useTimelineFilters(user: AuthUser | null) {
  const getDefaultTeams = useCallback((): string[] => {
    if (!user || user.teamLevel === undefined || user.teamLevel === null) return [];
    return teamLevelsToTeamValues(
      getVisibleTeamLevelsForUser(user.teamLevel as TeamLevel, Boolean(user.superUser) === true),
    );
  }, [user]);

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamsInitialized, setTeamsInitialized] = useState(false);

  useEffect(() => {
    if (user && !teamsInitialized) {
      const defaultTeams = getDefaultTeams();
      if (defaultTeams.length > 0) {
        setSelectedTeams(defaultTeams);
        setTeamsInitialized(true);
      }
    }
  }, [user, teamsInitialized, getDefaultTeams]);

  // Wird vom Fetch aufgerufen: initialisiert die Default-Teams beim ersten Laden
  // und liefert die Teams, mit denen tatsächlich geladen werden soll.
  const resolveTeamsForFetch = useCallback((): string[] => {
    let teamsToUse = selectedTeams;
    if (!teamsInitialized && user && user.teamLevel !== undefined) {
      const defaultTeams = getDefaultTeams();
      if (defaultTeams.length > 0) {
        setSelectedTeams(defaultTeams);
        setTeamsInitialized(true);
        teamsToUse = defaultTeams;
      }
    }
    return teamsToUse;
  }, [selectedTeams, teamsInitialized, user, getDefaultTeams]);

  const resetTeams = useCallback(() => setSelectedTeams(getDefaultTeams()), [getDefaultTeams]);

  return {
    selectedTeams,
    setSelectedTeams,
    searchQuery,
    setSearchQuery,
    teamsInitialized,
    getDefaultTeams,
    resolveTeamsForFetch,
    resetTeams,
  };
}

interface FilteredUsersArgs {
  users: User[];
  ganttFeaturesData: Map<number, GanttFeature[]>;
  selectedTeams: string[];
  teamsInitialized: boolean;
  searchQuery: string;
}

export function useFilteredTimelineUsers({
  users,
  ganttFeaturesData,
  selectedTeams,
  teamsInitialized,
  searchQuery,
}: FilteredUsersArgs) {
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const displayName =
        u.displayName?.trim() ||
        (u.firstname && u.lastname ? `${u.firstname} ${u.lastname}`.trim() : '') ||
        u.firstname?.trim() ||
        u.lastname?.trim() ||
        '';
      if (displayName.match(/^User\s+\d+$/i)) return false;
      if (!displayName || displayName.length < 2) return false;
      if (isExcludedUnit(u.unitName)) return false;
      const teamValue = userTeamValue(u.unitName);
      if (selectedTeams.length > 0) {
        if (!selectedTeams.includes(teamValue)) return false;
      } else if (teamsInitialized) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !displayName.toLowerCase().includes(q) &&
          !(u.email && u.email.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [users, searchQuery, selectedTeams, teamsInitialized]);

  const ganttData: UserGanttData[] = useMemo(() => {
    return filteredUsers.map((u) => ({
      user: u,
      features: ganttFeaturesData.get(u.id) || [],
    }));
  }, [filteredUsers, ganttFeaturesData]);

  const groupedGanttData = useMemo(() => {
    const groups = new Map<string, UserGanttData[]>();
    for (const ud of ganttData) {
      const teamName = ud.user.unitName || 'Unbekannt';
      if (isExcludedUnit(teamName)) continue;
      const teamValue = userTeamValue(teamName);
      if (selectedTeams.length > 0 && !selectedTeams.includes(teamValue)) continue;
      if (selectedTeams.length === 0 && teamsInitialized) continue;
      const existing = groups.get(teamName) || [];
      groups.set(teamName, [...existing, ud]);
    }

    const sorted = Array.from(groups.entries()).sort(
      (a, b) => mapMocoUnitToTeamLevel(a[0]) - mapMocoUnitToTeamLevel(b[0]),
    );

    return sorted.map(([teamName, arr]) => {
      const sortedUsers = [...arr].sort((a, b) => {
        const fnA = (a.user.firstname || a.user.displayName || '').trim().toLowerCase();
        const fnB = (b.user.firstname || b.user.displayName || '').trim().toLowerCase();
        return fnA.localeCompare(fnB, 'de', { sensitivity: 'base' });
      });
      return [teamName, sortedUsers] as [string, UserGanttData[]];
    });
  }, [ganttData, selectedTeams, teamsInitialized]);

  return { filteredUsers, ganttData, groupedGanttData };
}
