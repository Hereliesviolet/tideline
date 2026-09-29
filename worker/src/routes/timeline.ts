// src/routes/timeline.ts

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getVisibleTeamLevelsForUser, TeamLevel, mapMocoUnitToTeamLevel } from "../lib/mocoMapping";
import { cacheGet, cacheSet } from "../lib/cache";
import {
  isoDay,
  buildEmploymentsMap,
  buildSchedulesMap,
  buildWorkAndPlanMaps,
  calculateCapacitiesAndMore,
  calculateCapacitiesOnly,
  calculateBottlenecksOnly,
  calculateProjectsOnly,
  ActivityRow,
  PlanningRow,
  TimelineItem,
} from "../lib/capacityService";
import {
  computeSollFrom,
  buildGanttFeatureRows,
  buildPlanningItems,
  GanttFeatureRow,
} from "../lib/ganttService";

const router = Router();

// --- Helper ---------------------------------------------------------------

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function clamp(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

// --- Shared User-Filter-Logik ---------------------------------------------

async function resolveVisibleUsers(
  req: AuthRequest,
  teamsFilter: string[],
  officesFilter: string[]
): Promise<{
  filteredUsers: Array<{ id: number; unitName: string | null; office: string | null }>;
  activeMocoUserIds: Set<number>;
}> {
  const visibleLevels = getVisibleTeamLevelsForUser(
    req.user!.teamLevel as TeamLevel,
    req.user!.superUser
  );

  const allUsers = await prisma.user.findMany({
    where: { archived: false },
    select: { id: true, unitName: true, office: true },
  });

  const filteredUsers = allUsers.filter((u) => {
    const userLevel = mapMocoUnitToTeamLevel(u.unitName || "");
    if (!visibleLevels.includes(userLevel)) return false;
    if (teamsFilter.length > 0) {
      const teamValue = String(userLevel).padStart(2, "0");
      if (!teamsFilter.includes(teamValue)) return false;
    }
    if (officesFilter.length > 0) {
      if (!u.office || !officesFilter.includes(u.office)) return false;
    }
    return true;
  });

  const dashboardUsers = await prisma.dashboardUser.findMany({
    where: { mocoUserId: { in: filteredUsers.map((u) => u.id) }, active: true },
    select: { mocoUserId: true },
  });
  const activeMocoUserIds = new Set(dashboardUsers.map((du) => du.mocoUserId));

  return { filteredUsers, activeMocoUserIds };
}

// --- GET /timeline --------------------------------------------------------

/**
 * GET /timeline
 *
 * Query-Parameter:
 *  - from (YYYY-MM-DD) oder month + year
 *  - to   (YYYY-MM-DD) oder month + year
 *  - teams (optional, komma-separiert)
 *  - offices (optional, komma-separiert)
 *
 * Liefert items[], capacities[], bottlenecks[], projects[], ganttFeatures[].
 */
router.get("/timeline", authMiddleware, async (req: AuthRequest, res) => {
  const requestStart = Date.now();
  try {
    // Datum-Parameter auflösen (month/year ODER from/to)
    let from: Date;
    let to: Date;
    let fromStr: string;
    let toStr: string;

    const monthStr = String(req.query.month ?? "").trim();
    const yearStr = String(req.query.year ?? "").trim();

    if (monthStr && yearStr) {
      const month = parseInt(monthStr, 10);
      const year = parseInt(yearStr, 10);
      if (Number.isNaN(month) || Number.isNaN(year) || month < 1 || month > 12) {
        return res.status(400).json({ error: "bad_range", detail: "Invalid month/year format" });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      from = new Date(today);
      from.setDate(from.getDate() - 15);
      to = new Date(today);
      to.setDate(to.getDate() + 15);
      fromStr = isoDay(from);
      toStr = isoDay(to);
    } else {
      fromStr = String(req.query.from ?? "");
      toStr = String(req.query.to ?? "");
      if (!fromStr || !toStr) {
        return res.status(400).json({ error: "bad_range", detail: "from/to or month/year query params required" });
      }
      from = new Date(fromStr);
      to = new Date(toStr);
      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: "bad_range", detail: "invalid from/to date format" });
      }
    }

    // Sichtbare User und Filter bestimmen
    const teamsFilter = req.query.teams ? String(req.query.teams).split(",").filter(Boolean) : [];
    const officesFilter = req.query.offices ? String(req.query.offices).split(",").filter(Boolean) : [];
    const teamsFilterForCache = req.query.teams ? String(req.query.teams).trim() : "";

    const { filteredUsers, activeMocoUserIds } = await resolveVisibleUsers(req, teamsFilter, officesFilter);
    const activeFilteredUsers = filteredUsers.filter((u) => activeMocoUserIds.has(u.id));
    const visibleUserIds = new Set(filteredUsers.map((u) => u.id));
    const visibleUserIdsArray = Array.from(visibleUserIds);

    // Cache-Check
    const cacheKey = `timeline:${fromStr}:${toStr}:${req.user!.id}:${teamsFilterForCache}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (visibleUserIdsArray.length === 0) {
      const emptyResponse = {
        items: [],
        users: [],
        dateRange: monthStr && yearStr ? { from: fromStr, to: toStr } : undefined,
        capacities: [],
        bottlenecks: [],
        projects: [],
        ganttFeatures: [],
      };
      await cacheSet(cacheKey, emptyResponse, 300);
      return res.json(emptyResponse);
    }

    // --- DB-Abfragen -------------------------------------------------------
    const activities = await prisma.$queryRaw<ActivityRow[]>`
      SELECT "userId", date::date AS date, seconds, hours, billable, "projectId"
      FROM "Activity"
      WHERE date::date >= ${fromStr}::date AND date::date <= ${toStr}::date
        AND "userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const plans = await prisma.$queryRaw<Array<PlanningRow & { projectName: string | null; customerName: string | null; taskName: string | null }>>`
      SELECT pe."userId", pe."startsOn", pe."endsOn", pe."hoursPerDay", pe.color,
             pe."projectId", p.name AS "projectName", p."customerName", t.name AS "taskName"
      FROM "PlanningEntry" pe
      LEFT JOIN "Project" p ON pe."projectId" = p.id
      LEFT JOIN "Task" t ON pe."taskId" = t.id
      WHERE pe."startsOn"::date <= ${toStr}::date AND pe."endsOn"::date >= ${fromStr}::date
        AND pe."userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;
    console.log(`[timeline] Plans: ${plans.length} rows`);

    const scheduleRows = await prisma.$queryRaw<{
      userId: number; date: Date; absenceCode: string; am: boolean | null; pm: boolean | null;
    }[]>`
      SELECT "userId", date::date AS date, "absenceCode", am, pm
      FROM "Schedule"
      WHERE date::date >= ${fromStr}::date AND date::date <= ${toStr}::date
        AND "userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    // Projektnamen für Activities laden
    const activityProjectIds = Array.from(
      new Set(activities.map((a) => a.projectId).filter((id): id is number => id != null))
    );
    const activityProjects =
      activityProjectIds.length > 0
        ? await prisma.project.findMany({
            where: { id: { in: activityProjectIds } },
            select: { id: true, name: true, customerName: true },
          })
        : [];
    const projectNameMap = new Map(activityProjects.map((p) => [p.id, p.name]));
    const projectCustomerMap = new Map(activityProjects.map((p) => [p.id, p.customerName]));

    // Employments laden
    const employmentsData = await prisma.employment.findMany({
      where: {
        userId: { in: visibleUserIdsArray },
        fromDate: { lte: to },
        OR: [{ toDate: null }, { toDate: { gte: from } }],
      },
    });

    // --- Items aufbauen ----------------------------------------------------
    const items: TimelineItem[] = [];
    const clampedFrom = new Date(from);
    const clampedTo = new Date(to);

    for (const a of activities) {
      if (a.userId == null || !a.date) continue;
      const seconds = a.seconds ?? (a.hours != null ? Number(a.hours) * 3600 : null);
      const customerName = a.projectId ? (projectCustomerMap.get(a.projectId) ?? null) : null;
      items.push({
        userId: a.userId,
        date: isoDay(new Date(a.date)),
        type: "work",
        seconds: seconds ?? undefined,
        hours: seconds == null ? (a.hours ?? undefined) : undefined,
        billable: a.billable ?? null,
        projectId: a.projectId ?? null,
        projectName: a.projectId ? (projectNameMap.get(a.projectId) ?? null) : null,
        customerName,
      });
    }

    for (const p of plans) {
      if (p.userId == null || !p.startsOn || !p.endsOn) continue;
      const start = clamp(new Date(p.startsOn), clampedFrom, clampedTo);
      const end = clamp(new Date(p.endsOn), clampedFrom, clampedTo);
      items.push({
        userId: p.userId,
        date: isoDay(start),
        type: "plan",
        hours: p.hoursPerDay ?? undefined,
        color: p.color ?? null,
        projectId: p.projectId ?? null,
        projectName: p.projectName ?? null,
        customerName: p.customerName ?? null,
        taskName: p.taskName ?? null,
        startsOn: isoDay(start),
        endsOn: isoDay(end),
      });
    }

    for (const s of scheduleRows) {
      if (s.userId == null || !s.date) continue;
      items.push({
        userId: s.userId,
        date: isoDay(new Date(s.date)),
        type: "absence",
        absenceCode: s.absenceCode,
        hours: 0,
        billable: null,
        projectId: null,
      });
    }

    // --- Service-Aufrufe ---------------------------------------------------
    const employmentsMap = buildEmploymentsMap(employmentsData);
    const schedulesMap = buildSchedulesMap(scheduleRows);
    const { workItemsByUserAndDate, planItemsByUser } = buildWorkAndPlanMaps(items);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { capacities, bottlenecks, projects } = calculateCapacitiesAndMore(
      filteredUsers, workItemsByUserAndDate, planItemsByUser,
      schedulesMap, employmentsMap, from, to, today
    );

    // Gantt-Features
    const sollFrom = computeSollFrom(from, to);
    let ganttFeatures: GanttFeatureRow[] = [];

    if (sollFrom <= to) {
      const sollItems = items.filter((item) => {
        if (item.type !== "plan") return false;
        if (item.startsOn && item.endsOn) {
          const start = new Date(item.startsOn + "T00:00:00");
          const end = new Date(item.endsOn + "T00:00:00");
          return start <= to && end >= sollFrom;
        }
        return item.date >= isoDay(sollFrom) && item.date <= isoDay(to);
      });

      const usersForGanttData = await prisma.user.findMany({
        where: { id: { in: Array.from(visibleUserIds) } },
        select: { id: true, firstname: true, lastname: true, unitName: true },
      });
      const usersForGantt = usersForGanttData.map((u) => ({
        id: u.id,
        displayName: `${u.firstname || ""} ${u.lastname || ""}`.trim() || `User ${u.id}`,
        unitName: u.unitName,
      }));

      ganttFeatures = buildGanttFeatureRows(sollItems, usersForGantt, employmentsMap, schedulesMap, sollFrom, to);
    }

    // --- Response ----------------------------------------------------------
    const users = activeFilteredUsers
      .filter((u) => items.some((it) => it.userId === u.id))
      .map((u) => ({ id: u.id, office: u.office }));

    const response = {
      items,
      users,
      ...(monthStr && yearStr ? { dateRange: { from: isoDay(from), to: isoDay(to) } } : {}),
      capacities,
      bottlenecks: sollFrom <= to ? bottlenecks : [],
      projects,
      ganttFeatures,
    };

    await cacheSet(cacheKey, response, 300);
    const totalDuration = Date.now() - requestStart;
    console.log(
      `[timeline] PERFORMANCE - Total: ${totalDuration}ms | Items: ${items.length} | Users: ${activeFilteredUsers.length} | Capacities: ${capacities.length} | Gantt: ${ganttFeatures.length}`
    );
    res.json(response);
  } catch (e: unknown) {
    const totalDuration = Date.now() - requestStart;
    console.error(`[/timeline] failed after ${totalDuration}ms:`, e);
    res.status(500).json({ error: "timeline_failed" });
  }
});

// --- GET /api/timeline/capacity -------------------------------------------

router.get("/api/timeline/capacity", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fromStr = String(req.query.from ?? "");
    const toStr = String(req.query.to ?? "");
    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "bad_range", detail: "from/to query params required" });
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ error: "bad_range", detail: "invalid from/to date format" });
    }

    const userIdsParam = String(req.query.userIds ?? "").trim();
    const requestedUserIds = userIdsParam
      ? userIdsParam.split(",").map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
      : null;

    const { filteredUsers: allFiltered, activeMocoUserIds } = await resolveVisibleUsers(req, [], []);
    let filteredUsers = allFiltered.filter((u) => activeMocoUserIds.has(u.id));
    if (requestedUserIds && requestedUserIds.length > 0) {
      filteredUsers = filteredUsers.filter((u) => requestedUserIds.includes(u.id));
    }
    const visibleUserIdsArray = filteredUsers.map((u) => u.id);

    const cacheKey = `capacity:${fromStr}:${toStr}:${[...visibleUserIdsArray].sort().join(",")}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (visibleUserIdsArray.length === 0) {
      const result = { capacities: [] };
      await cacheSet(cacheKey, result, 300);
      return res.json(result);
    }

    const activities = await prisma.$queryRaw<ActivityRow[]>`
      SELECT "userId", date::date AS date, seconds, hours, billable, "projectId"
      FROM "Activity"
      WHERE date::date >= ${fromStr}::date AND date::date <= ${toStr}::date
        AND "userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const plans = await prisma.$queryRaw<Array<PlanningRow & { projectName: string | null; customerName: string | null; taskName: string | null }>>`
      SELECT pe."userId", pe."startsOn", pe."endsOn", pe."hoursPerDay", pe.color,
             pe."projectId", p.name AS "projectName", p."customerName", t.name AS "taskName"
      FROM "PlanningEntry" pe
      LEFT JOIN "Project" p ON pe."projectId" = p.id
      LEFT JOIN "Task" t ON pe."taskId" = t.id
      WHERE pe."startsOn"::date <= ${toStr}::date AND pe."endsOn"::date >= ${fromStr}::date
        AND pe."userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const scheduleRows = await prisma.$queryRaw<{ userId: number; date: Date; absenceCode: string }[]>`
      SELECT "userId", date::date AS date, "absenceCode"
      FROM "Schedule"
      WHERE date::date >= ${fromStr}::date AND date::date <= ${toStr}::date
        AND "userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const employmentsData = await prisma.employment.findMany({
      where: {
        userId: { in: visibleUserIdsArray },
        fromDate: { lte: to },
        OR: [{ toDate: null }, { toDate: { gte: from } }],
      },
    });

    const employmentsMap = buildEmploymentsMap(employmentsData);
    const schedulesMap = buildSchedulesMap(scheduleRows);

    // Alle Items aufbauen (für calculateCapacitiesOnly)
    const timelineItems: TimelineItem[] = [];
    for (const a of activities) {
      if (a.userId == null || !a.date) continue;
      const seconds = a.seconds ?? (a.hours != null ? Number(a.hours) * 3600 : null);
      timelineItems.push({
        userId: a.userId, date: isoDay(new Date(a.date)), type: "work",
        seconds: seconds ?? undefined,
        hours: seconds == null ? (a.hours ?? undefined) : undefined,
      });
    }
    for (const p of plans) {
      if (p.userId == null || !p.startsOn || !p.endsOn) continue;
      const start = clamp(new Date(p.startsOn), from, to);
      timelineItems.push({
        userId: p.userId, date: isoDay(start), type: "plan",
        hours: p.hoursPerDay ?? undefined,
        projectName: p.projectName ?? p.taskName ?? null,
        customerName: p.customerName ?? null,
        startsOn: isoDay(start),
        endsOn: isoDay(clamp(new Date(p.endsOn), from, to)),
      });
    }

    const capacities = calculateCapacitiesOnly(filteredUsers, timelineItems, schedulesMap, employmentsMap, from, to);

    const result = { capacities };
    await cacheSet(cacheKey, result, 300);
    res.json(result);
  } catch (e: unknown) {
    console.error("[/api/timeline/capacity] failed:", e);
    res.status(500).json({ error: "capacity_failed" });
  }
});

// --- GET /api/timeline/bottlenecks ----------------------------------------

router.get("/api/timeline/bottlenecks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fromStr = String(req.query.from ?? "");
    const toStr = String(req.query.to ?? "");
    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "bad_range", detail: "from/to query params required" });
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ error: "bad_range", detail: "invalid from/to date format" });
    }

    const sollFrom = computeSollFrom(from, to);
    if (sollFrom > to) return res.json({ bottlenecks: [] });

    const userIdsParam = String(req.query.userIds ?? "").trim();
    const requestedUserIds = userIdsParam
      ? userIdsParam.split(",").map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
      : null;

    const { filteredUsers } = await resolveVisibleUsers(req, [], []);
    const users = requestedUserIds && requestedUserIds.length > 0
      ? filteredUsers.filter((u) => requestedUserIds.includes(u.id))
      : filteredUsers;
    const visibleUserIdsArray = users.map((u) => u.id);

    const cacheKey = `bottlenecks:${isoDay(sollFrom)}:${toStr}:${[...visibleUserIdsArray].sort().join(",")}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (visibleUserIdsArray.length === 0) {
      const result = { bottlenecks: [] };
      await cacheSet(cacheKey, result, 300);
      return res.json(result);
    }

    const plans = await prisma.$queryRaw<Array<PlanningRow & { projectName: string | null; customerName: string | null; taskName: string | null }>>`
      SELECT pe."userId", pe."startsOn", pe."endsOn", pe."hoursPerDay", pe.color,
             pe."projectId", p.name AS "projectName", p."customerName", t.name AS "taskName"
      FROM "PlanningEntry" pe
      LEFT JOIN "Project" p ON pe."projectId" = p.id
      LEFT JOIN "Task" t ON pe."taskId" = t.id
      WHERE pe."startsOn"::date <= ${toStr}::date AND pe."endsOn"::date >= ${isoDay(sollFrom)}::date
        AND pe."userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const employmentsData = await prisma.employment.findMany({
      where: {
        userId: { in: visibleUserIdsArray },
        fromDate: { lte: to },
        OR: [{ toDate: null }, { toDate: { gte: sollFrom } }],
      },
    });

    const employmentsMap = buildEmploymentsMap(employmentsData);
    const planningItems = buildPlanningItems(plans, sollFrom, to);
    const bottlenecks = calculateBottlenecksOnly(users, planningItems, employmentsMap, sollFrom, to);

    const result = { bottlenecks };
    await cacheSet(cacheKey, result, 300);
    res.json(result);
  } catch (e: unknown) {
    console.error("[/api/timeline/bottlenecks] failed:", e);
    res.status(500).json({ error: "bottlenecks_failed" });
  }
});

// --- GET /api/timeline/projects -------------------------------------------

router.get("/api/timeline/projects", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fromStr = String(req.query.from ?? "");
    const toStr = String(req.query.to ?? "");
    const isPastParam = String(req.query.isPast ?? "").toLowerCase() === "true";
    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "bad_range", detail: "from/to query params required" });
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ error: "bad_range", detail: "invalid from/to date format" });
    }

    const userIdsParam = String(req.query.userIds ?? "").trim();
    const requestedUserIds = userIdsParam
      ? userIdsParam.split(",").map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
      : null;

    const { filteredUsers } = await resolveVisibleUsers(req, [], []);
    const users = requestedUserIds && requestedUserIds.length > 0
      ? filteredUsers.filter((u) => requestedUserIds.includes(u.id))
      : filteredUsers;
    const visibleUserIdsArray = users.map((u) => u.id);

    const cacheKey = `projects:${fromStr}:${toStr}:${isPastParam}:${[...visibleUserIdsArray].sort().join(",")}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (visibleUserIdsArray.length === 0) {
      const result = { projects: [] };
      await cacheSet(cacheKey, result, 300);
      return res.json(result);
    }

    const timelineItems: TimelineItem[] = [];

    if (isPastParam) {
      const activities = await prisma.$queryRaw<ActivityRow[]>`
        SELECT "userId", date::date AS date, seconds, hours, billable, "projectId"
        FROM "Activity"
        WHERE date::date >= ${fromStr}::date AND date::date <= ${toStr}::date
          AND "userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
      `;
      const activityProjectIds = Array.from(
        new Set(activities.map((a) => a.projectId).filter((id): id is number => id != null))
      );
      const activityProjects =
        activityProjectIds.length > 0
          ? await prisma.project.findMany({
              where: { id: { in: activityProjectIds } },
              select: { id: true, name: true, customerName: true },
            })
          : [];
      const projectNameMap = new Map(activityProjects.map((p) => [p.id, p.name]));
      const projectCustomerMap = new Map(activityProjects.map((p) => [p.id, p.customerName]));

      for (const a of activities) {
        if (a.userId == null || !a.date) continue;
        const seconds = a.seconds ?? (a.hours != null ? Number(a.hours) * 3600 : null);
        timelineItems.push({
          userId: a.userId, date: isoDay(new Date(a.date)), type: "work",
          seconds: seconds ?? undefined,
          hours: seconds == null ? (a.hours ?? undefined) : undefined,
          billable: a.billable ?? null,
          projectName: a.projectId ? (projectNameMap.get(a.projectId) ?? null) : null,
          customerName: a.projectId ? (projectCustomerMap.get(a.projectId) ?? null) : null,
        });
      }
    } else {
      const plans = await prisma.$queryRaw<Array<PlanningRow & { projectName: string | null; customerName: string | null; taskName: string | null }>>`
        SELECT pe."userId", pe."startsOn", pe."endsOn", pe."hoursPerDay", pe.color,
               pe."projectId", p.name AS "projectName", p."customerName", t.name AS "taskName"
        FROM "PlanningEntry" pe
        LEFT JOIN "Project" p ON pe."projectId" = p.id
        LEFT JOIN "Task" t ON pe."taskId" = t.id
        WHERE pe."startsOn"::date <= ${toStr}::date AND pe."endsOn"::date >= ${fromStr}::date
          AND pe."userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
      `;
      for (const p of plans) {
        if (p.userId == null || !p.startsOn || !p.endsOn) continue;
        const start = clamp(new Date(p.startsOn), from, to);
        timelineItems.push({
          userId: p.userId, date: isoDay(start), type: "plan",
          hours: p.hoursPerDay ?? undefined,
          projectName: p.projectName ?? p.taskName ?? null,
          customerName: p.customerName ?? null,
          startsOn: isoDay(start),
          endsOn: isoDay(clamp(new Date(p.endsOn), from, to)),
        });
      }
    }

    const projects = calculateProjectsOnly(users, timelineItems, isPastParam, from, to);

    const result = { projects };
    await cacheSet(cacheKey, result, 300);
    res.json(result);
  } catch (e: unknown) {
    console.error("[/api/timeline/projects] failed:", e);
    res.status(500).json({ error: "projects_failed" });
  }
});

// --- GET /api/timeline/gantt-features -------------------------------------

router.get("/api/timeline/gantt-features", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fromStr = String(req.query.from ?? "");
    const toStr = String(req.query.to ?? "");
    if (!fromStr || !toStr) {
      return res.status(400).json({ error: "bad_range", detail: "from/to query params required" });
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ error: "bad_range", detail: "invalid from/to date format" });
    }

    const sollFrom = computeSollFrom(from, to);
    if (sollFrom > to) return res.json({ features: [] });

    const userIdsParam = String(req.query.userIds ?? "").trim();
    const requestedUserIds = userIdsParam
      ? userIdsParam.split(",").map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
      : null;

    const allUsers = await prisma.user.findMany({
      where: { archived: false },
      select: { id: true, unitName: true, firstname: true, lastname: true },
    });
    const visibleLevels = getVisibleTeamLevelsForUser(
      req.user!.teamLevel as TeamLevel,
      req.user!.superUser
    );
    let filteredUsers = allUsers.filter((u) => {
      const userLevel = mapMocoUnitToTeamLevel(u.unitName || "");
      return visibleLevels.includes(userLevel);
    });
    if (requestedUserIds && requestedUserIds.length > 0) {
      filteredUsers = filteredUsers.filter((u) => requestedUserIds.includes(u.id));
    }
    const visibleUserIdsArray = filteredUsers.map((u) => u.id);

    const cacheKey = `gantt:${isoDay(sollFrom)}:${toStr}:${[...visibleUserIdsArray].sort().join(",")}`;
    const cached = await cacheGet<unknown>(cacheKey);
    if (cached) return res.json(cached);

    if (visibleUserIdsArray.length === 0) {
      const result = { features: [] };
      await cacheSet(cacheKey, result, 600);
      return res.json(result);
    }

    const plans = await prisma.$queryRaw<Array<PlanningRow & { projectName: string | null; customerName: string | null; taskName: string | null }>>`
      SELECT pe."userId", pe."startsOn", pe."endsOn", pe."hoursPerDay", pe.color,
             pe."projectId", p.name AS "projectName", p."customerName", t.name AS "taskName"
      FROM "PlanningEntry" pe
      LEFT JOIN "Project" p ON pe."projectId" = p.id
      LEFT JOIN "Task" t ON pe."taskId" = t.id
      WHERE pe."startsOn"::date <= ${toStr}::date AND pe."endsOn"::date >= ${isoDay(sollFrom)}::date
        AND pe."userId" = ANY(ARRAY[${Prisma.join(visibleUserIdsArray)}]::int[])
    `;

    const employmentsData = await prisma.employment.findMany({
      where: {
        userId: { in: visibleUserIdsArray },
        fromDate: { lte: to },
        OR: [{ toDate: null }, { toDate: { gte: sollFrom } }],
      },
    });

    const schedulesData = await prisma.$queryRaw<{ userId: number; date: Date; absenceCode: string }[]>`
      SELECT "userId", date::date AS date, "absenceCode"
      FROM "Schedule"
      WHERE date::date >= ${isoDay(sollFrom)}::date AND date::date <= ${toStr}::date
    `;

    const employmentsMap = buildEmploymentsMap(employmentsData);
    const schedulesMap = buildSchedulesMap(schedulesData);
    const timelineItems = buildPlanningItems(plans, sollFrom, to);

    const usersForGantt = filteredUsers.map((u) => ({
      id: u.id,
      displayName: `${u.firstname || ""} ${u.lastname || ""}`.trim() || `User ${u.id}`,
      unitName: u.unitName,
    }));

    const features = buildGanttFeatureRows(timelineItems, usersForGantt, employmentsMap, schedulesMap, sollFrom, to);

    const result = { features };
    await cacheSet(cacheKey, result, 600);
    res.json(result);
  } catch (e: unknown) {
    console.error("[/api/timeline/gantt-features] failed:", e);
    res.status(500).json({ error: "gantt_features_failed" });
  }
});

export default router;
