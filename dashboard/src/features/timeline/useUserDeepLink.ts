import { useEffect, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { User } from '@/lib/api';
import { userTeamValue } from './useTimelineFilters';

interface UseUserDeepLinkArgs {
  ready: boolean;
  users: User[];
  selectedTeams: string[];
  allowedTeams: string[];
  setSelectedTeams: (update: (prev: string[]) => string[]) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
}

/**
 * `?user=<mocoUserId>` (z. B. aus der Command-Palette): Team des Users
 * einblenden, Zeile in die Mitte scrollen, 1.6s hervorheben, Parameter entfernen.
 */
export function useUserDeepLink({
  ready,
  users,
  selectedTeams,
  allowedTeams,
  setSelectedTeams,
  scrollerRef,
}: UseUserDeepLinkArgs) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightedUserId, setHighlightedUserId] = useState<number | null>(null);

  const userParam = searchParams.get('user');

  useEffect(() => {
    if (!ready || !userParam) return;
    const userId = Number(userParam);
    const target = users.find((u) => u.id === userId);
    if (!target) return;

    const teamValue = userTeamValue(target.unitName);
    if (!allowedTeams.includes(teamValue)) return;
    if (!selectedTeams.includes(teamValue)) {
      setSelectedTeams((prev) => [...prev, teamValue]);
      return;
    }

    const row = scrollerRef.current?.querySelector<HTMLElement>(`[data-user-id="${userId}"]`);
    if (!row) return;

    const t = setTimeout(() => {
      row.scrollIntoView({ block: 'center' });
      setHighlightedUserId(userId);
      setSearchParams({}, { replace: true });
      setTimeout(() => setHighlightedUserId(null), 1600);
    }, 150);
    return () => clearTimeout(t);
  }, [ready, userParam, users, selectedTeams, allowedTeams, setSelectedTeams, scrollerRef, setSearchParams]);

  return highlightedUserId;
}
