// src/routes/schedules.ts

import { Router } from "express";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const router = Router();

type ScheduleRow = {
  id: number;
  date: Date;
  absenceCode: string;
  am: boolean | null;
  pm: boolean | null;
  userId: number;
  updatedAt: Date | null;
};

/**
 * GET /schedules
 *
 * Query-Parameter:
 *  - from (YYYY-MM-DD)
 *  - to   (YYYY-MM-DD)
 *  - user_id (optional)
 *  - absence_code (optional)
 */
router.get("/schedules", authMiddleware, async (req, res) => {
  try {
    const fromStr = String(req.query.from ?? "");
    const toStr = String(req.query.to ?? "");
    const userIdRaw = req.query.user_id;
    const absenceCodeRaw = req.query.absence_code;

    if (!fromStr || !toStr) {
      return res
        .status(400)
        .json({ error: "bad_range", detail: "from/to query params required" });
    }

    const from = new Date(fromStr);
    const to = new Date(toStr);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res
        .status(400)
        .json({ error: "bad_range", detail: "invalid from/to date format" });
    }

    // Build query
    let query = `
      SELECT
        id,
        date::date AS date,
        "absenceCode",
        am,
        pm,
        "userId",
        "updatedAt"
      FROM "Schedule"
      WHERE date::date >= ${fromStr}::date
        AND date::date <= ${toStr}::date
    `;

    const params: any[] = [];
    if (userIdRaw) {
      const userId = Number(userIdRaw);
      if (Number.isFinite(userId)) {
        query += ` AND "userId" = $${params.length + 1}`;
        params.push(userId);
      }
    }

    if (absenceCodeRaw) {
      query += ` AND "absenceCode" = $${params.length + 1}`;
      params.push(String(absenceCodeRaw));
    }

    query += ` ORDER BY date, "userId"`;

    const schedules = await prisma.$queryRawUnsafe<ScheduleRow[]>(query, ...params);

    res.json(
      schedules.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        absence_code: s.absenceCode,
        am: s.am,
        pm: s.pm,
        user_id: s.userId,
        user: { id: s.userId },
        updated_at: s.updatedAt?.toISOString() ?? null,
      }))
    );
  } catch (e: any) {
    console.error("[/schedules] failed:", e);
    res
      .status(500)
      .json({ error: "schedules_failed", detail: String(e?.message ?? e) });
  }
});

export default router;

