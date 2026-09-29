import { URL } from "node:url";

export type MocoClientOptions = {
  baseUrl: string;
  apiToken: string;
  userAgent?: string;
};

type Query = Record<string, string | number | boolean | undefined>;

export class MocoClient {
  private baseUrl: string;
  private token: string;
  private ua: string;

  constructor(opts: MocoClientOptions) {
    if (!opts.baseUrl || !opts.apiToken) {
      throw new Error("MocoClient: baseUrl & apiToken required");
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.apiToken;
    this.ua = opts.userAgent ?? "CapacityTimeline/1.0";
  }

  private async fetchJson(url: string, attempt = 0): Promise<Response> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Token token=${this.token}`,
        Accept: "application/json",
        "User-Agent": this.ua
      }
    });
    if (res.status === 429) {
      if (attempt >= 5) {
        throw new Error(`MOCO rate limit exceeded after 5 retries: ${url}`);
      }
      const retryAfter = Number(res.headers.get("retry-after") ?? "2");
      await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
      return this.fetchJson(url, attempt + 1);
    }
    return res;
  }

  private buildUrl(path: string, query?: Query): string {
    const u = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          u.searchParams.set(k, String(v));
        }
      }
    }
    return u.toString();
  }

  private nextLink(res: Response): string | null {
    const link = res.headers.get("link");
    if (!link) return null;
    const piece = link.split(",").map(s => s.trim()).find(s => /rel="next"/i.test(s));
    if (!piece) return null;
    const urlMatch = piece.match(/<([^>]+)>/);
    return urlMatch ? urlMatch[1] : null;
  }

  private async getAll<T>(path: string, query?: Query, onProgress?: (page: number, itemsInPage: number, totalItems: number) => void): Promise<T[]> {
    let url: string | null = this.buildUrl(path, query);
    const out: T[] = [];
    let pageNum = 0;
    const fetchStart = Date.now();
    while (url) {
      pageNum++;
      const res = await this.fetchJson(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MOCO ${path} ${res.status}: ${text}`);
      }
      const page = (await res.json()) as T[];
      out.push(...page);
      if (onProgress) {
        onProgress(pageNum, page.length, out.length);
      } else if (pageNum % 20 === 0 || page.length < 100) {
        // Fortschrittsanzeige alle 20 Seiten oder bei kleineren Seiten (weniger Spam)
        const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(1);
        console.log(`[sync] ${path}: page ${pageNum}, ${out.length} items (${elapsed}s)`);
      }
      url = this.nextLink(res);
    }
    if (pageNum > 1 && pageNum % 20 !== 0) {
      // Finale Meldung wenn nicht gerade geloggt wurde
      const elapsed = ((Date.now() - fetchStart) / 1000).toFixed(1);
      console.log(`[sync] ${path}: ${out.length} items total in ${pageNum} pages (${elapsed}s)`);
    }
    return out;
  }

  // ---- MOCO Endpunkte ----
  async users(params?: { archived?: boolean }): Promise<User[]> {
    const query =
      params && typeof params.archived === "boolean"
        ? { archived: params.archived }
        : undefined;
    return this.getAll<User>("/users", query);
  }

  async user(id: number): Promise<User> {
    const res = await this.fetchJson(this.buildUrl(`/users/${id}`));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MOCO /users/${id} ${res.status}: ${text}`);
    }
    return res.json() as Promise<User>;
  }
  async projects(params?: { archived?: boolean }): Promise<Project[]> {
    const query =
      params && typeof params.archived === "boolean"
        ? { archived: params.archived }
        : undefined;
    return this.getAll<Project>("/projects", query);
  }
  async activities(params: {
    from?: string; to?: string; user_id?: number; project_id?: number; task_id?: number;
    updated_after?: string;
  }): Promise<Activity[]> {
    return this.getAll<Activity>("/activities", params);
  }
  async planningEntries(params: {
    period?: string; from?: string; to?: string; user_id?: number; project_id?: number;
    updated_after?: string;
  }): Promise<PlanningEntry[]> {
    return this.getAll<PlanningEntry>("/planning_entries", params);
  }
  async schedules(params: {
    from: string; to: string; user_id?: number; absence_code?: string;
    updated_after?: string;
  }): Promise<Schedule[]> {
    return this.getAll<Schedule>("/schedules", params);
  }
  async employments(params: {
    from: string; to?: string; user_id?: number;
  }): Promise<Employment[]> {
    return this.getAll<Employment>("/users/employments", params);
  }
  async companies(params?: { archived?: boolean }): Promise<Company[]> {
    const query =
      params && typeof params.archived === "boolean"
        ? { archived: params.archived }
        : undefined;
    return this.getAll<Company>("/companies", query);
  }
  async tasks(params?: { project_id?: number }): Promise<Task[]> {
    const query =
      params && typeof params.project_id === "number"
        ? { project_id: params.project_id }
        : undefined;
    return this.getAll<Task>("/projects/tasks", query);
  }
  async userHolidays(params?: { user_id?: number; year?: number }): Promise<UserHoliday[]> {
    return this.getAll<UserHoliday>("/users/holidays", params);
  }
  async tags(params?: {}): Promise<Tag[]> {
    return this.getAll<Tag>("/tags", params);
  }
  async contacts(params?: { company_id?: number; archived?: boolean }): Promise<Contact[]> {
    const query =
      params && (typeof params.company_id === "number" || typeof params.archived === "boolean")
        ? { company_id: params.company_id, archived: params.archived }
        : undefined;
    return this.getAll<Contact>("/contacts", query);
  }
  async userPresences(params: {
    from: string; to: string; user_id?: number;
  }): Promise<UserPresence[]> {
    return this.getAll<UserPresence>("/users/presences", params);
  }
  async workTimeAdjustments(params?: {
    from?: string; to?: string; user_id?: number;
  }): Promise<WorkTimeAdjustment[]> {
    return this.getAll<WorkTimeAdjustment>("/users/work_time_adjustments", params);
  }
  async projectExpenses(params?: {
    project_id?: number; from?: string; to?: string;
  }): Promise<ProjectExpense[]> {
    return this.getAll<ProjectExpense>("/projects/expenses", params);
  }
  async projectPaymentSchedules(params?: {
    project_id?: number;
  }): Promise<ProjectPaymentSchedule[]> {
    const query =
      params && typeof params.project_id === "number"
        ? { project_id: params.project_id }
        : undefined;
    return this.getAll<ProjectPaymentSchedule>("/projects/payment_schedules", query);
  }
  async projectGroups(params?: {}): Promise<ProjectGroup[]> {
    return this.getAll<ProjectGroup>("/projects/groups", params);
  }
  async projectContracts(params?: {
    project_id?: number;
  }): Promise<ProjectContract[]> {
    const query =
      params && typeof params.project_id === "number"
        ? { project_id: params.project_id }
        : undefined;
    return this.getAll<ProjectContract>("/projects/contracts", query);
  }
  async units(params?: {}): Promise<Unit[]> {
    return this.getAll<Unit>("/units", params);
  }
  async reportsUtilization(params?: {
    from?: string; to?: string; user_id?: number; project_id?: number;
  }): Promise<UtilizationReport[]> {
    return this.getAll<UtilizationReport>("/reports/utilization", params);
  }
  async reportsAbsences(params?: {
    from?: string; to?: string; user_id?: number;
  }): Promise<AbsencesReport[]> {
    return this.getAll<AbsencesReport>("/reports/absences", params);
  }
}

// ---- Typen (Vollständig mit allen MOCO API Feldern) ----
export type User = {
  id: number;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  initials?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  title?: string;
  phone?: string;
  mobile_phone?: string;
  office?: string;
  unit?: { id: number; name: string } | null;
  unit_id?: number;
  unit_name?: string;
  active?: boolean; // MOCO verwendet "active: false" für offboardete User
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  // Weitere Felder die die API liefern könnte
  [key: string]: any;
};

export type Project = {
  id: number;
  name: string;
  identifier?: string;
  number?: string;
  customer?: { id: number; name: string } | null;
  customer_id?: number;
  customer_name?: string;
  leader?: { id: number; name?: string } | null;
  leader_id?: number;
  leader_name?: string;
  color?: string | null;
  billable?: boolean | null;
  internal?: boolean | null;
  budget?: number | null;
  budget_spent?: number | null;
  currency?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  // Weitere Felder die die API liefern könnte
  [key: string]: any;
};

export type Activity = {
  id: number;
  date: string;
  seconds?: number | null;
  worked_seconds?: number | null;
  hours?: number | null;
  billable?: boolean | null;
  description?: string | null;
  updated_at?: string;
  project?: { id: number; name?: string } | null;
  task?: { id: number; name?: string } | null;
  user?: { id: number };
};

export type PlanningEntry = {
  id: number;
  starts_on: string;
  ends_on: string;
  hours_per_day: number;
  tentative?: boolean | null;
  color?: string | null;
  updated_at?: string;
  user?: { id: number };
  project?: { id: number; name?: string } | null;
  task?: { id: number; name?: string } | null;
};

export type Schedule = {
  id: number;
  date: string;
  absence_code?: string; // Legacy field (may not be present)
  assignment?: {
    id: number;
    name: string;
    code: string; // WICHTIG: Der eigentliche absence_code ist hier!
    customer_name?: string;
    color?: string;
    type: string;
  };
  am?: boolean;
  pm?: boolean;
  user?: { id: number };
  comment?: string;
  symbol?: number;
  created_at?: string;
  updated_at?: string;
};

export type Employment = {
  id: number;
  weekly_target_hours?: number | null;
  pattern: {
    am: number[]; // meist 5 Elemente (Mo–Fr)
    pm: number[];
  };
  from: string;      // YYYY-MM-DD
  to: string | null; // null = open end
  user: { id: number };
  created_at?: string;
  updated_at?: string;
};

export type Company = {
  id: number;
  name: string;
  type?: string | null; // "customer", "supplier", etc.
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type Task = {
  id: number;
  name: string;
  project_id?: number;
  project?: { id: number; name?: string } | null;
  billable?: boolean | null;
  active?: boolean;
  budget?: number | null;
  budget_spent?: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type UserHoliday = {
  id: number;
  year: number;
  total?: number | null;
  used?: number | null;
  remaining?: number | null;
  user?: { id: number };
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type Tag = {
  id: number;
  name: string;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type Contact = {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  company?: { id: number; name: string } | null;
  company_id?: number | null;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type UserPresence = {
  id: number;
  date: string;
  from?: string | null; // HH:mm
  to?: string | null; // HH:mm
  user?: { id: number };
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type WorkTimeAdjustment = {
  id: number;
  date: string;
  hours?: number | null;
  comment?: string | null;
  user?: { id: number };
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type ProjectExpense = {
  id: number;
  date: string;
  description?: string | null;
  gross?: number | null;
  net?: number | null;
  vat?: number | null;
  currency?: string | null;
  project?: { id: number; name?: string } | null;
  project_id?: number | null;
  billable?: boolean | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type ProjectPaymentSchedule = {
  id: number;
  invoice_date?: string | null;
  due_date?: string | null;
  net?: number | null;
  gross?: number | null;
  currency?: string | null;
  project?: { id: number; name?: string } | null;
  project_id?: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type ProjectGroup = {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type ProjectContract = {
  id: number;
  name?: string | null;
  project?: { id: number; name?: string } | null;
  project_id?: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type Unit = {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

export type UtilizationReport = {
  user_id?: number;
  project_id?: number;
  date?: string;
  utilization?: number | null;
  available?: number | null;
  booked?: number | null;
  [key: string]: any;
};

export type AbsencesReport = {
  user_id?: number;
  date?: string;
  absence_code?: string | null;
  hours?: number | null;
  [key: string]: any;
};

// ---- ENV-getter & Wrapper (für evtl. Legacy-Nutzung) ----
function fromEnv(): MocoClientOptions {
  const baseUrl = process.env.MOCO_BASE_URL ?? "";
  const apiToken = process.env.MOCO_API_TOKEN ?? "";
  if (!baseUrl || !apiToken) {
    throw new Error("MOCO env missing (MOCO_BASE_URL / MOCO_API_TOKEN)");
  }
  return { baseUrl, apiToken };
}

export async function fetchUsers(opts?: MocoClientOptions): Promise<User[]> {
  const c = new MocoClient(opts ?? fromEnv());
  const list = await c.users();
  return list.map(u => ({
    ...u,
    firstname: u.firstname ?? u.fullname?.split(" ")?.[0],
    lastname: u.lastname ?? u.fullname?.split(" ")?.slice(1).join(" ")
  }) as User);
}

export async function fetchProjects(opts?: MocoClientOptions): Promise<Project[]> {
  const c = new MocoClient(opts ?? fromEnv());
  const list = await c.projects();
  return list.map(p => ({
    ...p,
    identifier: p.identifier ?? p.number,
    customer_name: p.customer?.name ?? undefined
  }) as Project);
}

export async function fetchActivities(
  opts?: (MocoClientOptions & { from: string; to: string; user_id?: number; project_id?: number; task_id?: number; })
): Promise<Activity[]> {
  const { baseUrl, apiToken, userAgent, ...params } = opts ?? { ...fromEnv(), from: "", to: "" };
  const c = new MocoClient({ baseUrl, apiToken, userAgent });
  const rows = await c.activities(params as any);
  return rows.map(a => ({ ...a, hours: a.hours ?? ((a.worked_seconds ?? a.seconds ?? 0) / 3600) }) as Activity);
}

export async function fetchPlanning(
  opts?: (MocoClientOptions & { period: string; user_id?: number; project_id?: number; })
): Promise<PlanningEntry[]> {
  const { baseUrl, apiToken, userAgent, ...params } = opts ?? { ...fromEnv(), period: "" };
  const c = new MocoClient({ baseUrl, apiToken, userAgent });
  return c.planningEntries(params as any);
}
