// src/lib/api.ts
// Zentrale API-Schicht für das Dashboard – robust gegen unterschiedliche Backends,
// probiert mehrere Pfade (/api/..., /..., /moco/...) der Reihe nach aus.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Versucht mehrere URLs; bei HTTP 429 kurz warten und erneut versuchen (Proxy-Rate-Limit).
 */
async function fetchFirstOk<T>(urls: string[]): Promise<T> {
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const errors: string[] = [];
  const maxAttemptsPerUrl = 5;

  for (const url of urls) {
    for (let attempt = 0; attempt < maxAttemptsPerUrl; attempt++) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          return (await res.json()) as T;
        }

        const errorText = await res.text().catch(() => '');
        const statusText = res.statusText || `HTTP ${res.status}`;

        if (res.status === 429 && attempt < maxAttemptsPerUrl - 1) {
          const ra = res.headers.get('Retry-After');
          const backoffSec = ra ? parseInt(ra, 10) : Math.min(2 ** attempt, 10);
          await sleep(Math.min(Math.max(backoffSec, 1) * 1000, 15_000));
          continue;
        }

        errors.push(`${url}: ${statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ''}`);
        break;
      } catch (e: unknown) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
  }

  throw new Error(`All URLs failed:\n${errors.join('\n')}\n\nTried: ${urls.join(', ')}`);
}

/**
 * Helper-Funktion: Einfacher Fetch mit Auth
 */
export async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  // Prüfe sowohl 'token' als auch 'auth_token' (für Kompatibilität)
  const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Bei HTTP 429 (Proxy-Rate-Limit) kurz warten und erneut versuchen, damit
  // datenintensive Seiten (z. B. Admin) nicht fälschlich leer dargestellt werden.
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, { ...options, headers });

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status === 429 && attempt < maxAttempts - 1) {
      const ra = res.headers.get('Retry-After');
      const backoffSec = ra ? parseInt(ra, 10) : Math.min(2 ** attempt, 10);
      await sleep(Math.min(Math.max(backoffSec, 1) * 1000, 15_000));
      continue;
    }

    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  // Nicht erreichbar, aber TypeScript-vollständig
  throw new Error('API error 429: rate limit exceeded');
}

// ============================================================================
// TYPES
// ============================================================================

export type User = {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  avatar_url: string | null;
  avatarUrl?: string | null; // Alias für Kompatibilität
  title: string | null;
  team: string | null;
  unitName: string | null;
  active: boolean;
  displayName?: string;
  initials?: string;
  dashboardUserId?: string;
  lastLoginAt?: string | null;
  lastSessionDuration?: number | null;
  totalSessionTime?: number | null;
};

export type TimelineItem = {
  userId: number;
  date: string; // YYYY-MM-DD
  type: "work" | "plan" | "absence" | "activity"; // "activity" für Kompatibilität
  seconds?: number;
  hours?: number;
  billable?: boolean | null;
  color?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  customerName?: string | null;
  taskName?: string | null;
  absenceCode?: string | null;
  startsOn?: string; // Für Planning Entries
  endsOn?: string; // Für Planning Entries
  id?: number; // Für Kompatibilität mit MocoActivity
  hoursPerDay?: number | null; // Für Kompatibilität mit PlanningEntry
};

export type Employment = {
  id: number;
  userId: number;
  weeklyTargetHours: number;
  weekly_target_hours?: number; // Alias für Kompatibilität
  daily_target_hours?: number; // Für Kompatibilität
  patternAm: string | number[] | null; // JSON-String oder bereits geparstes Array: [1,1,1,1,1] für Mo-Fr
  patternPm: string | number[] | null; // JSON-String oder bereits geparstes Array: [1,1,1,1,1] für Mo-Fr
  fromDate: string; // YYYY-MM-DD
  from_date?: string; // Alias für Kompatibilität
  toDate: string | null; // YYYY-MM-DD
  to_date?: string | null; // Alias für Kompatibilität
};

export type Schedule = {
  id: number;
  user_id: number;
  date: string; // YYYY-MM-DD
  absence_code: string;
  absenceCode?: string; // Alias für Kompatibilität
  am: boolean | null;
  pm: boolean | null;
};

export type MocoActivity = {
  id?: number; // Optional für Kompatibilität mit TimelineItem
  date: string;
  seconds?: number | null;
  hours?: number | null;
  billable?: boolean | null;
  userId: number;
  projectId?: number | null;
  projectName?: string | null;
  project?: { id: number; name: string; billable?: boolean | null } | null; // Für Kompatibilität
  description?: string | null;
};

export type PlanningEntry = {
  id?: number; // Optional für Kompatibilität mit TimelineItem
  userId: number;
  startsOn?: string; // YYYY-MM-DD, optional für Kompatibilität
  endsOn?: string; // YYYY-MM-DD, optional für Kompatibilität
  hoursPerDay?: number | null; // Optional für Kompatibilität
  hours?: number | null; // Alias für hoursPerDay
  date?: string; // Für Kompatibilität (wird aus startsOn/endsOn berechnet)
  color?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  taskName?: string | null;
};

export type MocoProject = {
  id: number;
  name: string;
  identifier?: string;
  customer?: { id: number; name: string } | null;
  leader?: { id: number; firstname: string; lastname: string } | null;
  budget?: number | null;
  updated_at?: string | null;
  active?: boolean | null;
  billable?: boolean | null;
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * GET /users
 * Liefert alle sichtbaren User
 */
export async function fetchUsersMapped(): Promise<User[]> {
  return await fetchFirstOk<User[]>([
    '/api/users',
    '/users',
  ]);
}

/**
 * GET /api/timeline?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Liefert Timeline-Items (IST + SOLL)
 */
export async function fetchTimeline(from: string, to: string): Promise<TimelineItem[]> {
  return await fetchFirstOk<TimelineItem[]>([
    `/api/timeline?from=${from}&to=${to}`,
    `/timeline?from=${from}&to=${to}`,
  ]);
}

/**
 * GET /timeline?from=YYYY-MM-DD&to=YYYY-MM-DD&teams=...
 * Liefert Timeline mit erweiterten Daten
 */
export async function fetchTimelineWithDateRange(
  from: string,
  to: string,
  filters?: {
    teams?: string[];
    offices?: string[];
  }
): Promise<{
  items: TimelineItem[];
  users: Array<{ id: number; office: string | null }>;
  dateRange: { from: string; to: string };
  capacities?: Array<{
    userId: number;
    date: string;
    targetHours: number;
    bookedHours: number;
    fillPercent: number | null;
  }>;
  bottlenecks?: Array<{
    userId: number;
    date: string;
    isBottleneck: boolean;
    totalHours: number;
    fillPercent: number;
    overlappingProjects: number;
  }>;
  projects?: Array<{
    userId: number;
    date: string;
    projects: Array<{ name: string; hours: number; billable?: boolean | null; customerName?: string | null }>;
  }>;
  ganttFeatures?: Array<{
    userId: number;
    features: Array<{
      id: string;
      name: string;
      startAt: string;
      endAt: string;
      status: { id: string; name: string; color: string };
      hoursPerDay: number;
      totalHours: number;
      projectColor: string;
      actualDays?: number;
    }>;
  }>;
}> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (filters?.teams && filters.teams.length > 0) {
    params.set('teams', filters.teams.join(','));
  }
  if (filters?.offices && filters.offices.length > 0) {
    params.set('offices', filters.offices.join(','));
  }

  return await fetchFirstOk<{
    items: TimelineItem[];
    users: Array<{ id: number; office: string | null }>;
    dateRange: { from: string; to: string };
    capacities?: Array<{
      userId: number;
      date: string;
      targetHours: number;
      bookedHours: number;
      fillPercent: number | null;
    }>;
    bottlenecks?: Array<{
      userId: number;
      date: string;
      isBottleneck: boolean;
      totalHours: number;
      fillPercent: number;
      overlappingProjects: number;
    }>;
    projects?: Array<{
      userId: number;
      date: string;
      projects: Array<{ name: string; hours: number; billable?: boolean | null; customerName?: string | null }>;
    }>;
    ganttFeatures?: Array<{
      userId: number;
      features: Array<{
        id: string;
        name: string;
        startAt: string;
        endAt: string;
        status: { id: string; name: string; color: string };
        hoursPerDay: number;
        totalHours: number;
        projectColor: string;
        actualDays?: number;
      }>;
    }>;
  }>([
    `/api/timeline?${params.toString()}`,
  ]);
}

/**
 * GET /users/:userId/employments?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Liefert Employment-Daten für einen User
 */
export async function fetchUserEmployments(
  userId: number,
  from: string,
  to: string
): Promise<Employment[]> {
  return await fetchFirstOk<Employment[]>([
    `/api/users/${userId}/employments?from=${from}&to=${to}`,
    `/users/${userId}/employments?from=${from}&to=${to}`,
  ]);
}

/**
 * GET /users/:userId/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Liefert Schedule-Daten (Abwesenheiten) für einen User
 */
export async function fetchSchedulesByUser(
  userId: number,
  params: { from: string; to: string }
): Promise<Schedule[]> {
  return await fetchFirstOk<Schedule[]>([
    `/api/users/${userId}/schedules?from=${params.from}&to=${params.to}`,
    `/users/${userId}/schedules?from=${params.from}&to=${params.to}`,
  ]);
}

/**
 * GET /users/offices
 * Liefert Liste aller Standorte
 */
export async function fetchOffices(): Promise<string[]> {
  return await fetchFirstOk<string[]>([
    '/api/users/offices',
    '/users/offices',
  ]);
}

/**
 * GET /api/timeline/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=...
 * Liefert Capacity-Daten für alle Tage im Zeitraum
 */
export async function fetchTimelineCapacity(
  from: string,
  to: string,
  userIds?: number[]
): Promise<Array<{
  userId: number;
  date: string;
  targetHours: number;
  bookedHours: number;
  fillPercent: number | null;
}>> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (userIds && userIds.length > 0) {
    params.set('userIds', userIds.join(','));
  }

  return await fetchFirstOk<Array<{
    userId: number;
    date: string;
    targetHours: number;
    bookedHours: number;
    fillPercent: number | null;
  }>>([
    `/api/timeline/capacity?${params.toString()}`,
    `/timeline/capacity?${params.toString()}`,
  ]);
}

/**
 * GET /api/timeline/bottlenecks?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=...
 * Liefert Bottleneck-Daten (Engpässe)
 */
export async function fetchTimelineBottlenecks(
  from: string,
  to: string,
  userIds?: number[]
): Promise<Array<{
  userId: number;
  date: string;
  isBottleneck: boolean;
  totalHours: number;
  fillPercent: number;
  overlappingProjects: number;
}>> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (userIds && userIds.length > 0) {
    params.set('userIds', userIds.join(','));
  }

  return await fetchFirstOk<Array<{
    userId: number;
    date: string;
    isBottleneck: boolean;
    totalHours: number;
    fillPercent: number;
    overlappingProjects: number;
  }>>([
    `/api/timeline/bottlenecks?${params.toString()}`,
    `/timeline/bottlenecks?${params.toString()}`,
  ]);
}

/**
 * GET /api/timeline/projects?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=...
 * Liefert Projekt-Daten für alle Tage im Zeitraum
 */
export async function fetchTimelineProjects(
  from: string,
  to: string,
  userIds?: number[]
): Promise<Array<{
  userId: number;
  date: string;
  projects: Array<{ name: string; hours: number; billable?: boolean | null }>;
}>> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (userIds && userIds.length > 0) {
    params.set('userIds', userIds.join(','));
  }

  return await fetchFirstOk<Array<{
    userId: number;
    date: string;
    projects: Array<{ name: string; hours: number; billable?: boolean | null }>;
  }>>([
    `/api/timeline/projects?${params.toString()}`,
    `/timeline/projects?${params.toString()}`,
  ]);
}

/**
 * GET /api/timeline/gantt-features?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=...
 * Liefert Gantt-Features für den SOLL-Bereich
 */
export async function fetchTimelineGanttFeatures(
  from: string,
  to: string,
  userIds?: number[]
): Promise<Array<{
  userId: number;
  features: Array<{
    id: string;
    name: string;
    startAt: string;
    endAt: string;
    status: { id: string; name: string; color: string };
    hoursPerDay: number;
    totalHours: number;
    projectColor: string;
    actualDays?: number;
  }>;
}>> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (userIds && userIds.length > 0) {
    params.set('userIds', userIds.join(','));
  }

  return await fetchFirstOk<Array<{
    userId: number;
    features: Array<{
      id: string;
      name: string;
      startAt: string;
      endAt: string;
      status: { id: string; name: string; color: string };
      hoursPerDay: number;
      totalHours: number;
      projectColor: string;
      actualDays?: number;
    }>;
  }>>([
    `/api/timeline/gantt-features?${params.toString()}`,
    `/timeline/gantt-features?${params.toString()}`,
  ]);
}

/**
 * PUT /api/admin/users/:id
 * Aktualisiert User (z.B. active-Status)
 */
export async function updateUserActive(userId: string, active: boolean): Promise<void> {
  await fetchWithAuth(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  });
}

/**
 * GET /api/users/:userId/week-overview
 * Liefert Wochenübersicht für einen User: 3 KW IST vs PLAN
 */
export async function fetchUserWeekOverview(userId: number): Promise<{
  weeks: Array<{
    week: string;
    actualHours: number;
    plannedHours: number;
    variance: number;
  }>;
}> {
  return await fetchFirstOk<{
    weeks: Array<{
      week: string;
      actualHours: number;
      plannedHours: number;
      variance: number;
    }>;
  }>([
    `/api/users/${userId}/week-overview`,
  ]);
}
