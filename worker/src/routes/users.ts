// src/routes/users.ts

import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getVisibleTeamLevelsForUser, TeamLevel, mapMocoUnitToTeamLevel } from "../lib/mocoMapping";
import { getAvatarUrl } from "../lib/avatarCache";
import { cacheGet, cacheSet } from "../lib/cache";
import { DateRangeSchema, parseQuery } from "../lib/schemas";

const AVATARS_DIR = process.env.AVATARS_DIR || "/app/avatars";

/**
 * Liest alle gecachten Avatar-IDs einmalig aus dem Filesystem.
 * Gibt ein Set mit den User-IDs zurück, für die ein Avatar lokal vorhanden ist.
 */
function getCachedAvatarIds(): Set<number> {
  try {
    const files = fs.readdirSync(AVATARS_DIR);
    const ids = new Set<number>();
    for (const file of files) {
      const match = file.match(/^(\d+)\.png$/);
      if (match) ids.add(parseInt(match[1], 10));
    }
    return ids;
  } catch {
    return new Set();
  }
}

const router = Router();

/**
 * GET /users
 * Liefert die Nutzerliste im vom Frontend erwarteten Shape:
 * id, firstname, lastname, email, avatar_url, title, team, active
 *
 * WICHTIG: Gefiltert nach teamLevel-Berechtigung des aktuellen Users
 */
router.get("/users", authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Sichtbare Team-Levels für diesen User
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    // MOCO-User laden, gefiltert nach sichtbaren Unit-Names
    const allUsers = await prisma.user.findMany({
      where: {
        archived: false,
      },
      orderBy: { id: "asc" },
    });

    // User nach teamLevel filtern
    const filteredUsers = allUsers.filter((u) => {
      const userLevel = mapMocoUnitToTeamLevel(u.unitName);
      return visibleLevels.includes(userLevel);
    });

    // DashboardUser-Daten laden (für Session-Tracking, active-Status und timelineActive)
    const dashboardUsers = await prisma.dashboardUser.findMany({
      where: {
        mocoUserId: { in: filteredUsers.map(u => u.id) },
      },
      select: {
        id: true,
        mocoUserId: true,
        active: true,
        timelineActive: true,
        lastLoginAt: true,
        lastSessionDuration: true,
        totalSessionTime: true,
      },
    });
    
    const dashboardUserMap = new Map(
      dashboardUsers.map(du => [du.mocoUserId, du])
    );

    // Einmalig alle gecachten Avatar-IDs laden (P-02: kein N+1 mehr)
    const cachedAvatarIds = getCachedAvatarIds();
    
    // In Frontend-Format konvertieren
    const rows = filteredUsers
      .map((u) => {
        const dashboardUser = dashboardUserMap.get(u.id);
        
        // WICHTIG: Wenn DashboardUser existiert, prüfe timelineActive
        if (dashboardUser && dashboardUser.timelineActive === false) {
          return null;
        }
        
        // Avatar-URL aus lokalem Cache (einmaliger Filesystem-Read oben)
        const avatarUrl = cachedAvatarIds.has(u.id) ? getAvatarUrl(u.id) : (u.avatar || null);
        
        return {
          id: u.id,
          firstname: u.firstname,
          lastname: u.lastname,
          email: u.email,
          avatar_url: avatarUrl,
          title: u.title,
          team: u.unitName,
          active: !u.archived,
          dashboardUserId: dashboardUser ? String(dashboardUser.id) : undefined,
          dashboardUserActive: dashboardUser ? dashboardUser.active : undefined,
          timelineActive: dashboardUser ? dashboardUser.timelineActive : undefined,
          // Session-Daten (nur für Super User)
          ...(req.user?.superUser && dashboardUser ? {
            lastLoginAt: dashboardUser.lastLoginAt,
            lastSessionDuration: dashboardUser.lastSessionDuration,
            totalSessionTime: dashboardUser.totalSessionTime,
          } : {}),
        };
      });

    res.json(rows.filter(Boolean));
  } catch (e: unknown) {
    console.error("[users] error:", e);
    res.status(500).json({ error: "users_failed" });
  }
});

/**
 * GET /users/:userId/employments
 * Liefert Employment-Daten für einen User
 * Query-Parameter: from (YYYY-MM-DD), to (YYYY-MM-DD)
 */
router.get("/users/:userId/employments", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid userId" });
    }

    const range = parseQuery(DateRangeSchema, req.query, res);
    if (!range) return;

    const { from: fromStr, to: toStr } = range;
    const from = new Date(fromStr);
    const to = new Date(toStr);

    // Prüfen ob User sichtbar ist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { DashboardUser: true },
    });

    if (!user) {
      return res.status(404).json({ error: "not_found", detail: "User not found" });
    }

    const userLevel = mapMocoUnitToTeamLevel(user.unitName || "");
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    if (!visibleLevels.includes(userLevel)) {
      return res.status(403).json({ error: "forbidden", detail: "User not visible" });
    }

    // Employments laden
    const employments = await prisma.employment.findMany({
      where: {
        userId,
        fromDate: { lte: to },
        OR: [
          { toDate: null },
          { toDate: { gte: from } },
        ],
      },
      orderBy: { fromDate: "asc" },
    });

    const result = employments.map((e) => ({
      id: e.id,
      userId: e.userId,
      weeklyTargetHours: e.weeklyTargetHours,
      patternAm: e.patternAm,
      patternPm: e.patternPm,
      fromDate: e.fromDate.toISOString().slice(0, 10),
      toDate: e.toDate ? e.toDate.toISOString().slice(0, 10) : null,
      createdAt: e.createdAt ? e.createdAt.toISOString() : null,
      updatedAt: e.updatedAt ? e.updatedAt.toISOString() : null,
    }));

    res.json(result);
  } catch (e: unknown) {
    console.error("[users] employments error:", e);
    res.status(500).json({ error: "employments_failed" });
  }
});

/**
 * GET /users/offices
 * Liefert Liste aller eindeutigen office-Werte
 * Gefiltert nach sichtbaren Team-Levels
 */
router.get("/users/offices", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    // Alle User laden und nach teamLevel filtern
    const allUsers = await prisma.user.findMany({
      where: {
        archived: false,
        office: { not: null },
      },
      select: { office: true, unitName: true },
    });

    const filteredUsers = allUsers.filter((u) => {
      const userLevel = mapMocoUnitToTeamLevel(u.unitName || "");
      return visibleLevels.includes(userLevel);
    });

    // Eindeutige office-Werte extrahieren
    const offices = Array.from(new Set(filteredUsers.map((u) => u.office).filter(Boolean))).sort();

    res.json(offices);
  } catch (e: unknown) {
    console.error("[users] offices error:", e);
    res.status(500).json({ error: "offices_failed" });
  }
});

/**
 * GET /users/:userId/schedules
 * Liefert Schedule-Daten (Abwesenheiten) für einen User
 * Query-Parameter: from (YYYY-MM-DD), to (YYYY-MM-DD)
 */
router.get("/users/:userId/schedules", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid userId" });
    }

    const range = parseQuery(DateRangeSchema, req.query, res);
    if (!range) return;

    const { from: fromStr, to: toStr } = range;
    const from = new Date(fromStr);
    const to = new Date(toStr);

    // Prüfen ob User sichtbar ist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { DashboardUser: true },
    });

    if (!user) {
      return res.status(404).json({ error: "not_found", detail: "User not found" });
    }

    const userLevel = mapMocoUnitToTeamLevel(user.unitName || "");
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    if (!visibleLevels.includes(userLevel)) {
      return res.status(403).json({ error: "forbidden", detail: "User not visible" });
    }

    // Schedules laden
    const schedules = await prisma.schedule.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: "asc" },
    });

    const result = schedules.map((s) => ({
      id: s.id,
      user_id: s.userId,
      date: s.date.toISOString().slice(0, 10),
      absence_code: s.absenceCode,
      am: s.am,
      pm: s.pm,
    }));

    res.json(result);
  } catch (e: unknown) {
    console.error("[users] schedules error:", e);
    res.status(500).json({ error: "schedules_failed" });
  }
});

/**
 * GET /api/users/:userId/week-overview
 * Liefert Wochenübersicht für einen User: 3 KW IST+PLANUNG (Vergangenheit) + 3 KW PLANUNG (Zukunft)
 */
router.get("/users/:userId/week-overview", authMiddleware, async (req: AuthRequest, res) => {
  const startTime = Date.now();
  try {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid userId" });
    }

    // PERFORMANCE: Redis-Cache
    const cacheKey = `user-week-overview:${userId}`;
    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      console.log(`[week-overview] Cache HIT for user ${userId} (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }

    // Prüfen ob User sichtbar ist
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, unitName: true },
    });

    if (!user) {
      return res.status(404).json({ error: "not_found", detail: "User not found" });
    }

    const userLevel = mapMocoUnitToTeamLevel(user.unitName || "");
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    if (!visibleLevels.includes(userLevel)) {
      return res.status(403).json({ error: "forbidden", detail: "User not visible" });
    }

    // Datumsbereich berechnen: 3 Wochen IST+PLANUNG (Vergangenheit) + 3 Wochen PLANUNG (Zukunft)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const istStart = new Date(today);
    istStart.setDate(istStart.getDate() - 21);
    
    const planungEnd = new Date(today);
    planungEnd.setDate(planungEnd.getDate() + 21);

    const istStartISO = istStart.toISOString().slice(0, 10);
    const todayISO = today.toISOString().slice(0, 10);
    const planungEndISO = planungEnd.toISOString().slice(0, 10);

    // Activities (IST) für die letzten 3 Wochen laden
    const activitiesQuery = Date.now();
    const activities = await prisma.$queryRaw<Array<{
      date: Date;
      projectName: string | null;
      hours: number | null;
      seconds: number | null;
      billable: boolean | null;
    }>>`
      SELECT 
        a.date::date AS date,
        p.name AS "projectName",
        a.hours,
        a.seconds,
        COALESCE(a.billable, p.billable) AS billable
      FROM "Activity" a
      LEFT JOIN "Project" p ON a."projectId" = p.id
      WHERE a."userId" = ${userId}
        AND a.date::date >= ${istStartISO}::date
        AND a.date::date < ${todayISO}::date
      ORDER BY a.date ASC
    `;
    console.log(`[week-overview] Activities query: ${Date.now() - activitiesQuery}ms (${activities.length} rows)`);

    // Planning für Vergangenheit und Zukunft laden
    const planningQuery = Date.now();
    const planning = await prisma.$queryRaw<Array<{
      startsOn: Date;
      endsOn: Date;
      hoursPerDay: number | null;
      projectName: string | null;
      billable: boolean | null;
    }>>`
      SELECT 
        pe."startsOn"::date AS "startsOn",
        pe."endsOn"::date AS "endsOn",
        pe."hoursPerDay",
        p.name AS "projectName",
        p.billable
      FROM "PlanningEntry" pe
      LEFT JOIN "Project" p ON pe."projectId" = p.id
      WHERE pe."userId" = ${userId}
        AND pe."startsOn"::date <= ${planungEndISO}::date
        AND pe."endsOn"::date >= ${istStartISO}::date
      ORDER BY pe."startsOn" ASC
    `;
    console.log(`[week-overview] Planning query: ${Date.now() - planningQuery}ms (${planning.length} rows)`);

    // Helper: Expandiere Planning-Entries in Tage
    const expandPlanningEntries = (entries: any[], startDate: Date, endDate: Date) => {
      const expanded: any[] = [];
      for (const entry of entries) {
        const startsOn = new Date(entry.startsOn);
        const endsOn = new Date(entry.endsOn);
        
        for (let d = new Date(Math.max(startsOn.getTime(), startDate.getTime())); 
             d <= new Date(Math.min(endsOn.getTime(), endDate.getTime())); 
             d.setDate(d.getDate() + 1)) {
          expanded.push({
            date: new Date(d),
            projectName: entry.projectName || "Unbekannt",
            hours: entry.hoursPerDay || 0,
            billable: entry.billable,
          });
        }
      }
      return expanded;
    };

    const getWeekNumber = (date: Date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const getWeekKey = (date: Date) => {
      const year = date.getFullYear();
      const week = getWeekNumber(date);
      return `${year}-KW${week.toString().padStart(2, "0")}`;
    };

    // IST (Activities) nach Wochen gruppieren
    const istWeeksData: Record<string, number> = {};
    for (const act of activities) {
      const date = new Date(act.date);
      const weekKey = getWeekKey(date);
      const hours = act.hours || (act.seconds ? act.seconds / 3600 : 0);
      istWeeksData[weekKey] = (istWeeksData[weekKey] || 0) + hours;
    }

    // PLANUNG für Vergangenheit
    const yesterdayEnd = new Date(today);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);
    const expandedPlanningPast = expandPlanningEntries(planning, istStart, yesterdayEnd);
    const planningPastData: Record<string, number> = {};
    for (const plan of expandedPlanningPast) {
      const weekKey = getWeekKey(plan.date);
      planningPastData[weekKey] = (planningPastData[weekKey] || 0) + plan.hours;
    }

    // Alle Wochen sammeln und sortieren
    const allWeeks = new Set([
      ...Object.keys(istWeeksData),
      ...Object.keys(planningPastData),
    ]);
    const sortedWeeks = Array.from(allWeeks).sort();

    // IST+PLANUNG Wochen (vergangene 3 Wochen)
    const istPlanWeeks = sortedWeeks
      .filter(week => istWeeksData[week] && istWeeksData[week] > 0)
      .slice(-3)
      .map(week => ({
        week,
        actualHours: istWeeksData[week] || 0,
        plannedHours: planningPastData[week] || 0,
        variance: (istWeeksData[week] || 0) - (planningPastData[week] || 0),
      }));

    const response = {
      weeks: istPlanWeeks,
    };

    // PERFORMANCE: Cache für 2 Minuten
    await cacheSet(cacheKey, response, 120);
    console.log(`[week-overview] Total: ${Date.now() - startTime}ms for user ${userId}`);
    
    res.json(response);
  } catch (e: unknown) {
    console.error("[users] week-overview error:", e);
    res.status(500).json({ error: "week_overview_failed" });
  }
});

export default router;
