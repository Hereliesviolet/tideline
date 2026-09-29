// src/routes/sessions.ts
// Session-Tracking Endpoints

import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, requireSuperUser, AuthRequest } from "../middleware/auth";

const router = Router();

/**
 * GET /api/users/:userId/sessions
 * Session-Daten für einen User abrufen (nur Super User)
 */
router.get(
  "/users/:userId/sessions",
  authMiddleware,
  requireSuperUser(),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const dashboardUser = await prisma.dashboardUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          lastLoginAt: true,
          lastSessionDuration: true,
          totalSessionTime: true,
        },
      });

      if (!dashboardUser) {
        return res.status(404).json({
          error: "not_found",
          detail: "User not found",
        });
      }

      res.json({
        userId: dashboardUser.id,
        email: dashboardUser.email,
        name: dashboardUser.name,
        lastLoginAt: dashboardUser.lastLoginAt,
        lastSessionDuration: dashboardUser.lastSessionDuration,
        totalSessionTime: dashboardUser.totalSessionTime,
      });
    } catch (error: unknown) {
      console.error("[sessions] get sessions error:", error);
      res.status(500).json({ error: "sessions_failed" });
    }
  }
);

export default router;
