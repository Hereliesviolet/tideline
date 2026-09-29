// src/middleware/auth.ts
// Express-Middleware für Authentifizierung

import { Request, Response, NextFunction } from "express";
import type { DashboardUser, User } from "@prisma/client";
import { verifyJWT, JWTPayload } from "../lib/auth";
import { prisma } from "../db";
import { resolveDashboardTeamLevel } from "../lib/mocoMapping";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    teamLevel: number;
    superUser?: boolean;
    dashboardUser: DashboardUser & { mocoUser: User | null };
  };
}

/**
 * Middleware: Prüft JWT-Token und lädt Dashboard-User
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", detail: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyJWT(token);

    if (!payload) {
      res.status(401).json({ error: "unauthorized", detail: "Invalid token" });
      return;
    }

    // Dashboard-User aus DB laden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id: payload.userId },
      include: { mocoUser: true },
    });

    if (!dashboardUser || !dashboardUser.active) {
      res.status(401).json({ error: "unauthorized", detail: "User not found or inactive" });
      return;
    }

    // User-Info im Request-Kontext speichern
    req.user = {
      id: dashboardUser.id,
      email: dashboardUser.email,
      teamLevel: resolveDashboardTeamLevel(
        dashboardUser.teamLevel,
        dashboardUser.mocoUser?.unitName,
        dashboardUser.mocoUnitName
      ),
      superUser: dashboardUser.superUser || false,
      dashboardUser,
    };

    next();
  } catch (error: any) {
    console.error("[auth] middleware error:", error);
    res.status(500).json({ error: "auth_failed", detail: String(error?.message ?? error) });
  }
}

/**
 * Middleware: Prüft ob User Admin-Level hat (mindestens minLevel) ODER Super User ist
 */
export function requireAdminLevel(minLevel: number) {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized", detail: "Not authenticated" });
      return;
    }

    // Super User hat immer Zugriff
    if (req.user.superUser) {
      next();
      return;
    }

    if (req.user.teamLevel < minLevel) {
      res.status(403).json({
        error: "forbidden",
        detail: `Requires team level ${minLevel} or higher, or super user status`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Prüft ob User Super User ist
 */
export function requireSuperUser() {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized", detail: "Not authenticated" });
      return;
    }

    if (!req.user.superUser) {
      res.status(403).json({
        error: "forbidden",
        detail: "Requires super user status",
      });
      return;
    }

    next();
  };
}

