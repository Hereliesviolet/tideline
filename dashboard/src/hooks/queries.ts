// Zentrale React-Query-Hooks für das Dashboard.
// Wrappen die bestehenden fetch-Funktionen aus lib/api.ts in useQuery/useMutation.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  fetchUsersMapped,
  fetchTimelineWithDateRange,
  fetchUserEmployments,
  fetchSchedulesByUser,
  fetchOffices,
  fetchUserWeekOverview,
  fetchWithAuth,
  updateUserActive,
  type User,
  type Employment,
  type Schedule,
} from '@/lib/api';
import { getCurrentUser, type User as AuthUser } from '@/lib/auth';

// ============================================================================
// QUERY KEYS — single source of truth für alle Cache-Keys
// ============================================================================

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => [...queryKeys.users.all, 'list'] as const,
    employments: (userId: number, from: string, to: string) =>
      [...queryKeys.users.all, 'employments', userId, from, to] as const,
    schedules: (userId: number, from: string, to: string) =>
      [...queryKeys.users.all, 'schedules', userId, from, to] as const,
    weekOverview: (userId: number) =>
      [...queryKeys.users.all, 'weekOverview', userId] as const,
    offices: () => [...queryKeys.users.all, 'offices'] as const,
  },
  timeline: {
    all: ['timeline'] as const,
    range: (from: string, to: string, teams?: string[]) =>
      [
        ...queryKeys.timeline.all,
        'range',
        from,
        to,
        (teams ?? []).join(','),
      ] as const,
  },
  admin: {
    all: ['admin'] as const,
    dashboardUsers: () => [...queryKeys.admin.all, 'dashboard-users'] as const,
    timelineUsers: () => [...queryKeys.admin.all, 'timeline-users'] as const,
    mocoUsers: () => [...queryKeys.admin.all, 'moco-users'] as const,
    sessions: () => [...queryKeys.admin.all, 'sessions'] as const,
  },
} as const;

// ============================================================================
// AUTH
// ============================================================================

export function useCurrentUser(
  options?: Omit<UseQueryOptions<AuthUser, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<AuthUser, Error>({
    queryKey: queryKeys.auth.me,
    queryFn: getCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
    ...options,
  });
}

// ============================================================================
// USERS
// ============================================================================

export function useUsers(enabled = true) {
  return useQuery<User[], Error>({
    queryKey: queryKeys.users.list(),
    queryFn: fetchUsersMapped,
    staleTime: 60_000,
    enabled,
  });
}

export function useUserEmployments(userId: number | null, from: string, to: string) {
  return useQuery<Employment[], Error>({
    queryKey: queryKeys.users.employments(userId ?? -1, from, to),
    queryFn: () => fetchUserEmployments(userId as number, from, to),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  });
}

export function useUserSchedules(userId: number | null, from: string, to: string) {
  return useQuery<Schedule[], Error>({
    queryKey: queryKeys.users.schedules(userId ?? -1, from, to),
    queryFn: () => fetchSchedulesByUser(userId as number, { from, to }),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  });
}

export function useUserWeekOverview(userId: number | null) {
  return useQuery({
    queryKey: queryKeys.users.weekOverview(userId ?? -1),
    queryFn: () => fetchUserWeekOverview(userId as number),
    enabled: userId !== null,
    staleTime: 60_000,
  });
}

export function useOffices() {
  return useQuery<string[], Error>({
    queryKey: queryKeys.users.offices(),
    queryFn: fetchOffices,
    staleTime: 10 * 60_000,
  });
}

// ============================================================================
// TIMELINE
// ============================================================================

export function useTimelineRange(from: string, to: string, teams?: string[]) {
  return useQuery({
    queryKey: queryKeys.timeline.range(from, to, teams),
    queryFn: () =>
      fetchTimelineWithDateRange(from, to, {
        teams: teams && teams.length > 0 ? teams : undefined,
      }),
    staleTime: 60_000,
  });
}

// ============================================================================
// ADMIN — Dashboard-Users / Sessions / MOCO-User-Liste
// ============================================================================

export interface DashboardUserRow {
  id: string;
  email: string;
  name: string;
  teamLevel: number;
  mocoUnitName: string | null;
  mocoUserId: number | null;
  active: boolean;
  mocoUser: {
    id: number;
    firstname: string | null;
    lastname: string | null;
    avatar: string | null;
    title: string | null;
  } | null;
  lastLoginAt: string | null;
  lastSessionDuration: number | null;
  totalSessionTime: number | null;
}

export interface TimelineUserRow {
  id: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  avatar: string | null;
  title: string | null;
  unitName: string | null;
  archived: boolean;
  dashboardUserId: string | null;
  dashboardUserActive: boolean | null;
  dashboardUserSuperUser: boolean;
  dashboardUserInvitedAt: string | null;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  timelineActive: boolean;
  isOnline: boolean;
}

export interface MocoUserRow {
  id: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  fullname: string;
  unitName: string;
  teamLevel: number;
  archived: boolean;
  isInvited: boolean;
  hasAccount: boolean;
  hasPendingInvitation: boolean;
  isVisible: boolean;
}

export interface SessionRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export function useDashboardUsers() {
  return useQuery<DashboardUserRow[], Error>({
    queryKey: queryKeys.admin.dashboardUsers(),
    queryFn: () => fetchWithAuth<DashboardUserRow[]>('/api/admin/users'),
    staleTime: 30_000,
  });
}

export function useAdminTimelineUsers() {
  return useQuery<TimelineUserRow[], Error>({
    queryKey: queryKeys.admin.timelineUsers(),
    queryFn: () => fetchWithAuth<TimelineUserRow[]>('/api/admin/timeline-users'),
    staleTime: 30_000,
  });
}

export function useAdminMocoUsers() {
  return useQuery<MocoUserRow[], Error>({
    queryKey: queryKeys.admin.mocoUsers(),
    queryFn: () => fetchWithAuth<MocoUserRow[]>('/api/admin/moco-users'),
    staleTime: 5 * 60_000,
  });
}

export function useAdminSessions() {
  return useQuery<SessionRow[], Error>({
    queryKey: queryKeys.admin.sessions(),
    queryFn: () => fetchWithAuth<SessionRow[]>('/api/admin/sessions'),
    staleTime: 30_000,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useToggleUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      updateUserActive(userId, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useToggleAdminUserField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      field,
      value,
    }: {
      userId: string;
      field: 'active' | 'timelineActive' | 'superUser';
      value: boolean;
    }) =>
      fetchWithAuth(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}

export function useToggleTimelineUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      mocoUserId,
      timelineActive,
    }: {
      mocoUserId: number;
      timelineActive: boolean;
    }) =>
      fetchWithAuth(`/api/admin/timeline-users/${mocoUserId}`, {
        method: 'PUT',
        body: JSON.stringify({ timelineActive }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}

export function useInviteFromMoco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mocoUserId: number) =>
      fetchWithAuth('/api/admin/invite-from-moco', {
        method: 'POST',
        body: JSON.stringify({ mocoUserId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mocoUserId: number) =>
      fetchWithAuth('/api/admin/resend-invitation', {
        method: 'POST',
        body: JSON.stringify({ mocoUserId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      fetchWithAuth('/api/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}
