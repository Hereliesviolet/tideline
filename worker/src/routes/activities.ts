// src/routes/activities.ts
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /activities?from=YYYY-MM-DD&to=YYYY-MM-DD&user_id=&project_id=
 * Liefert Roh-Activities; Felder wie vom Frontend erwartet.
 */
router.get("/activities", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fromRaw = String(req.query.from ?? "");
    const toRaw = String(req.query.to ?? "");
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;

    // ISO-Date-Validierung: nur YYYY-MM-DD erlaubt
    const from = ISO_DATE_RE.test(fromRaw) ? fromRaw : null;
    const to = ISO_DATE_RE.test(toRaw) ? toRaw : null;

    const conditions: Prisma.Sql[] = [];
    if (from && to) {
      conditions.push(Prisma.sql`date::date >= ${from}::date AND date::date <= ${to}::date`);
    } else if (from) {
      conditions.push(Prisma.sql`date::date >= ${from}::date`);
    } else if (to) {
      conditions.push(Prisma.sql`date::date <= ${to}::date`);
    }
    if (userId !== null && !Number.isNaN(userId)) {
      conditions.push(Prisma.sql`"userId" = ${userId}`);
    }
    if (projectId !== null && !Number.isNaN(projectId)) {
      conditions.push(Prisma.sql`"projectId" = ${projectId}`);
    }

    const whereClause = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, date, seconds, hours, billable, description,
             "userId", "projectId", "taskId", "updatedAt"
      FROM "Activity"
      ${whereClause}
      ORDER BY date DESC, id DESC
      LIMIT 5000
    `;
    res.json(
      rows.map((r) => ({
        id: r.id,
        date: r.date,
        seconds: r.seconds ?? (r.hours != null ? Number(r.hours) * 3600 : null),
        hours: r.hours ?? (r.seconds != null ? Number(r.seconds) / 3600 : null),
        billable: r.billable ?? null,
        description: r.description ?? null,
        userId: r.userId ?? null,
        projectId: r.projectId ?? null,
        taskId: r.taskId ?? null,
        updatedAt: r.updatedAt ?? null,
        project: null,
      }))
    );
  } catch (e) {
    console.error("[activities] error:", e);
    res.status(500).json({ error: "activities_failed" });
  }
});

export default router;
