// src/routes/admin.ts
// Admin-Endpoints für Benutzerverwaltung

import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../db";
import { authMiddleware, requireSuperUser, AuthRequest } from "../middleware/auth";
import { mapMocoUnitToTeamLevel, getVisibleTeamLevelsForUser, TeamLevel } from "../lib/mocoMapping";
import { getCachedMocoUsers, cacheMocoUsers, invalidateMocoUsersCache } from "../lib/cache";
import { getAvatarUrl } from "../lib/avatarCache";
import { hashPassword } from "../lib/password";
import { sendInvitationEmail, sendPasswordResetEmail } from "../lib/email";
import crypto from "crypto";
import { MocoClient } from "../lib/mocoClient";
import { InviteFromMocoSchema, ResendInvitationSchema, ResetPasswordSchema, UpdateUserSchema, parseBody } from "../lib/schemas";

const AVATARS_DIR = process.env.AVATARS_DIR || "/app/avatars";

/**
 * Liest alle gecachten Avatar-IDs einmalig aus dem Filesystem.
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

// MOCO-Config aus ENV
const MOCO_BASE = process.env.MOCO_BASE_URL || process.env.MOCO_BASE || "";
const MOCO_TOKEN = process.env.MOCO_API_TOKEN || process.env.MOCO_API_KEY || process.env.MOCO_TOKEN || "";

const router = Router();

// Alle Admin-Endpoints erfordern Auth + Super User
router.use(authMiddleware);
router.use(requireSuperUser());

/**
 * GET /api/admin/timeline-users
 * Liste aller MOCO-User, die in der Timeline angezeigt werden
 * (inklusive User ohne DashboardUser)
 */
router.get("/timeline-users", async (req: AuthRequest, res) => {
  try {
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    // Alle MOCO-User laden (die in der Timeline angezeigt werden)
    const allUsers = await prisma.user.findMany({
      where: { archived: false },
      orderBy: { id: "asc" },
    });

    const filteredUsers = allUsers.filter((u) => {
      const userLevel = mapMocoUnitToTeamLevel(u.unitName);
      return visibleLevels.includes(userLevel);
    });

    // DashboardUser-Daten laden
    const dashboardUsers = await prisma.dashboardUser.findMany({
      where: {
        mocoUserId: { in: filteredUsers.map(u => u.id) },
      },
      include: { mocoUser: true },
    });

    const dashboardUserMap = new Map(
      dashboardUsers.map(du => [du.mocoUserId, du])
    );

    // Einmalig alle gecachten Avatar-IDs laden (P-02: kein N+1 mehr)
    const cachedAvatarIds = getCachedAvatarIds();

    // Online-Status: User ist online wenn lastActivityAt < 5 Minuten alt ist
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

    const timelineUsers = filteredUsers.map((u) => {
      const dashboardUser = dashboardUserMap.get(u.id);
      const avatarUrl = cachedAvatarIds.has(u.id) ? getAvatarUrl(u.id) : (u.avatar || null);

      const isOnline = dashboardUser && dashboardUser.lastActivityAt 
        ? (now - dashboardUser.lastActivityAt.getTime()) < ONLINE_THRESHOLD_MS
        : false;

      return {
        id: u.id,
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email,
        avatar: avatarUrl,
        title: u.title,
        unitName: u.unitName,
        archived: u.archived,
        dashboardUserId: dashboardUser ? dashboardUser.id : null,
        dashboardUserActive: dashboardUser ? dashboardUser.active : null,
        dashboardUserSuperUser: dashboardUser ? dashboardUser.superUser : false,
        dashboardUserInvitedAt: dashboardUser ? dashboardUser.invitedAt : null,
        lastLoginAt: dashboardUser ? dashboardUser.lastLoginAt : null,
        lastActivityAt: dashboardUser ? dashboardUser.lastActivityAt : null,
        timelineActive: dashboardUser ? dashboardUser.timelineActive : true,
        isOnline,
      };
    });

    res.json(timelineUsers);
  } catch (error: unknown) {
    console.error("[admin] timeline-users error:", error);
    res.status(500).json({ error: "admin_timeline_users_failed" });
  }
});

/**
 * GET /api/admin/users
 * Liste aller Dashboard-User (gefiltert nach teamLevel des aktuellen Admins)
 */
router.get("/users", async (req: AuthRequest, res) => {
  try {
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    const dashboardUsers = await prisma.dashboardUser.findMany({
      where: {
        teamLevel: { in: visibleLevels },
      },
      include: {
        mocoUser: true,
      },
      orderBy: [
        { teamLevel: "asc" },
        { name: "asc" },
      ],
    });

    // Online-Status: User ist online wenn lastActivityAt < 5 Minuten alt ist
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 Minuten

    res.json(
      dashboardUsers.map((u) => {
        const isOnline = u.lastActivityAt 
          ? (now - u.lastActivityAt.getTime()) < ONLINE_THRESHOLD_MS
          : false;
        
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          teamLevel: u.teamLevel,
          mocoUnitName: u.mocoUnitName,
          mocoUserId: u.mocoUserId,
          active: u.active,
          timelineActive: u.timelineActive,
          createdAt: u.createdAt,
          invitedAt: u.invitedAt,
          mocoUser: u.mocoUser,
          lastLoginAt: u.lastLoginAt,
          lastActivityAt: u.lastActivityAt,
          lastSessionDuration: u.lastSessionDuration,
          totalSessionTime: u.totalSessionTime,
          isOnline,
        };
      })
    );
  } catch (error: unknown) {
    console.error("[admin] users error:", error);
    res.status(500).json({ error: "admin_users_failed" });
  }
});

/**
 * GET /api/admin/moco-users
 * Liste aller MOCO-User (für Einladungen)
 */
router.get("/moco-users", async (req: AuthRequest, res) => {
  try {
    // Cache prüfen
    const cached = await getCachedMocoUsers<any[]>(req.user!.teamLevel);
    if (cached) {
      return res.json(cached);
    }

    // MOCO-Client erstellen
    if (!MOCO_BASE || !MOCO_TOKEN) {
      return res.status(500).json({
        error: "moco_not_configured",
        detail: "MOCO API not configured",
      });
    }

    const client = new MocoClient({ baseUrl: MOCO_BASE, apiToken: MOCO_TOKEN });

    // Alle MOCO-User laden (aktiv & archiviert)
    // Hinweis: MOCO gibt bei archived=true ALLE User zurück (aktiv + archiviert),
    // nicht nur archivierte. Daher Deduplizierung nach ID notwendig.
    const [usersActive, usersArchived] = await Promise.all([
      client.users({ archived: false }).catch(() => []),
      client.users({ archived: true }).catch(() => []),
    ]);

    const usersById = new Map<number, (typeof usersActive)[0]>();
    for (const u of [...usersActive, ...usersArchived]) {
      if (!usersById.has(u.id)) usersById.set(u.id, u);
    }
    const allMocoUsers = [...usersById.values()];

    // Bereits eingeladene Dashboard-User und aktive Einladungen
    const [dashboardUsersDb, activeInvitations] = await Promise.all([
      prisma.dashboardUser.findMany({
        select: { mocoUserId: true },
      }),
      prisma.invitation.findMany({
        where: {
          expiresAt: { gt: new Date() }, // Nur nicht-abgelaufene Einladungen
          used: false,
        },
        select: { mocoUserId: true },
      }),
    ]);
    const accountMocoUserIds = new Set(dashboardUsersDb.map((u) => u.mocoUserId));
    const pendingInvitationMocoUserIds = new Set(activeInvitations.map((i) => i.mocoUserId));
    const invitedMocoUserIds = new Set([
      ...accountMocoUserIds,
      ...pendingInvitationMocoUserIds,
    ]);

    // Sichtbare Levels für Admin
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    // MOCO-User formatieren
    const mocoUsers = allMocoUsers.map((u) => {
      const unitName = u.unit?.name ?? u.unit_name ?? "";
      const teamLevel = mapMocoUnitToTeamLevel(unitName);
      const isInvited = invitedMocoUserIds.has(u.id);
      const isVisible = visibleLevels.includes(teamLevel);

      return {
        id: u.id,
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email,
        fullname: u.fullname ?? `${u.firstname || ""} ${u.lastname || ""}`.trim(),
        unitName: unitName,
        teamLevel: teamLevel,
        archived: u.archived ?? false,
        isInvited,
        hasAccount: accountMocoUserIds.has(u.id),
        hasPendingInvitation: pendingInvitationMocoUserIds.has(u.id),
        isVisible, // Nur sichtbare User für diesen Admin
      };
    });

    // Nur sichtbare User zurückgeben
    const visibleMocoUsers = mocoUsers.filter((u) => u.isVisible);

    // In Cache speichern
    await cacheMocoUsers(req.user!.teamLevel, visibleMocoUsers, 300);

    res.json(visibleMocoUsers);
  } catch (error: unknown) {
    console.error("[admin] moco-users error:", error);
    res.status(500).json({ error: "admin_moco_users_failed" });
  }
});

/**
 * POST /api/admin/invite-from-moco
 * MOCO-User einladen
 */
router.post("/invite-from-moco", async (req: AuthRequest, res) => {
  try {
    const body = parseBody(InviteFromMocoSchema, req.body, res);
    if (!body) return;

    const { mocoUserId } = body;

    // Prüfen ob bereits ein aktiver DashboardUser existiert
    const existing = await prisma.dashboardUser.findUnique({
      where: { mocoUserId },
    });

    if (existing && existing.active) {
      return res.status(400).json({
        error: "bad_request",
        detail: "User already registered",
      });
    }

    // MOCO-User aus lokaler DB laden (nicht via API – funktioniert auch für archivierte User)
    const mocoUser = await prisma.user.findUnique({
      where: { id: mocoUserId },
    });

    if (!mocoUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "MOCO user not found",
      });
    }

    // Team-Level ermitteln
    const unitName = mocoUser.unitName ?? "";
    const teamLevel = mapMocoUnitToTeamLevel(unitName);

    // Prüfen ob Admin dieses Level sehen darf
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);
    if (!visibleLevels.includes(teamLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot invite user from this team level",
      });
    }

    // Email prüfen
    const email = mocoUser.email;
    if (!email) {
      return res.status(400).json({
        error: "bad_request",
        detail: "MOCO user has no email",
      });
    }

    // Prüfen ob Email bereits von einem anderen aktiven DashboardUser verwendet wird
    const existingByEmail = await prisma.dashboardUser.findUnique({
      where: { email },
    });

    if (existingByEmail && existingByEmail.active) {
      return res.status(400).json({
        error: "bad_request",
        detail: "Email already in use",
      });
    }

    // Bestehende offene Einladungen invalidieren
    await prisma.invitation.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Einladungs-Token generieren
    const token = crypto.randomBytes(32).toString("hex");

    // Invitation erstellen (7 Tage gültig)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.invitation.create({
      data: {
        token,
        email,
        mocoUserId,
        teamLevel,
        expiresAt,
      },
    });

    // Einladungs-E-Mail senden
    try {
      await sendInvitationEmail(email, token);
    } catch (emailError) {
      console.error("[admin] Failed to send invitation email:", emailError);
      // Invitation trotzdem erstellen, E-Mail kann später erneut gesendet werden
    }

    // Cache invalidieren, damit die MOCO-User-Liste sofort aktualisiert wird
    await invalidateMocoUsersCache();

    res.json({
      success: true,
      message: "Invitation sent",
      invitation: {
        email,
        mocoUserId,
        teamLevel,
        expiresAt,
      },
    });
  } catch (error: unknown) {
    console.error("[admin] invite-from-moco error:", error);
    res.status(500).json({ error: "invite_failed" });
  }
});

/**
 * POST /api/admin/resend-invitation
 * Einladung für einen noch nicht registrierten MOCO-User erneut senden
 */
router.post("/resend-invitation", async (req: AuthRequest, res) => {
  try {
    const body = parseBody(ResendInvitationSchema, req.body, res);
    if (!body) return;

    const { mocoUserId } = body;

    // Prüfen ob bereits registriert (aktiver DashboardUser)
    const existing = await prisma.dashboardUser.findUnique({
      where: { mocoUserId },
    });

    if (existing && existing.active) {
      return res.status(400).json({
        error: "bad_request",
        detail: "User is already registered",
      });
    }

    // MOCO-User aus lokaler DB laden
    const mocoUser = await prisma.user.findUnique({
      where: { id: mocoUserId },
    });

    if (!mocoUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "MOCO user not found",
      });
    }

    // Team-Level und Sichtbarkeit prüfen
    const unitName = mocoUser.unitName ?? "";
    const teamLevel = mapMocoUnitToTeamLevel(unitName);
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    if (!visibleLevels.includes(teamLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot invite user from this team level",
      });
    }

    const email = mocoUser.email;
    if (!email) {
      return res.status(400).json({
        error: "bad_request",
        detail: "MOCO user has no email",
      });
    }

    // Alle bestehenden offenen Einladungen invalidieren
    await prisma.invitation.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Neue Einladung erstellen (7 Tage gültig)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.invitation.create({
      data: {
        token,
        email,
        mocoUserId,
        teamLevel,
        expiresAt,
      },
    });

    // Einladungs-E-Mail senden
    try {
      await sendInvitationEmail(email, token);
    } catch (emailError) {
      console.error("[admin] Failed to send resend invitation email:", emailError);
    }

    await invalidateMocoUsersCache();

    res.json({
      success: true,
      message: "Invitation resent",
    });
  } catch (error: unknown) {
    console.error("[admin] resend-invitation error:", error);
    res.status(500).json({ error: "resend_invitation_failed" });
  }
});

/**
 * POST /api/admin/reset-password
 * Passwort eines bestehenden Dashboard-Users zurücksetzen (nur SuperUser oder Level 5+)
 */
router.post("/reset-password", async (req: AuthRequest, res) => {
  try {
    const body = parseBody(ResetPasswordSchema, req.body, res);
    if (!body) return;

    const { userId } = body;

    // Dashboard-User finden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!dashboardUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "User not found",
      });
    }

    // Prüfen ob Admin diesen User sehen darf
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);
    if (!visibleLevels.includes(dashboardUser.teamLevel as TeamLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot reset password for this user",
      });
    }

    // Alte offene Einladungen invalidieren
    await prisma.invitation.updateMany({
      where: { email: dashboardUser.email, used: false },
      data: { used: true },
    });

    // Neuen Reset-Token als Invitation erstellen (7 Tage gültig)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.invitation.create({
      data: {
        token,
        email: dashboardUser.email,
        mocoUserId: dashboardUser.mocoUserId,
        teamLevel: dashboardUser.teamLevel,
        expiresAt,
      },
    });

    // Passwort invalidieren und Account deaktivieren bis neues Passwort gesetzt wird
    await prisma.dashboardUser.update({
      where: { id: userId },
      data: {
        passwordHash: "",
        active: false,
      },
    });

    // Passwort-Reset-E-Mail senden
    try {
      await sendPasswordResetEmail(dashboardUser.email, token);
    } catch (emailError) {
      console.error("[admin] Failed to send password reset email:", emailError);
    }

    res.json({
      success: true,
      message: "Password reset initiated",
    });
  } catch (error: unknown) {
    console.error("[admin] reset-password error:", error);
    res.status(500).json({ error: "reset_password_failed" });
  }
});

/**
 * PUT /api/admin/timeline-users/:mocoUserId
 * Timeline-Aktivierung für MOCO-User ändern
 * Erstellt automatisch einen DashboardUser, falls noch keiner existiert
 */
router.put("/timeline-users/:mocoUserId", async (req: AuthRequest, res) => {
  try {
    const mocoUserId = parseInt(req.params.mocoUserId, 10);
    if (Number.isNaN(mocoUserId)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid mocoUserId" });
    }

    const { timelineActive } = req.body;

    if (typeof timelineActive !== "boolean") {
      return res.status(400).json({ error: "bad_request", detail: "timelineActive must be boolean" });
    }

    // MOCO-User prüfen
    const mocoUser = await prisma.user.findUnique({
      where: { id: mocoUserId },
    });

    if (!mocoUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "MOCO User not found",
      });
    }

    // Prüfen ob Admin diesen User sehen darf
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);
    const userLevel = mapMocoUnitToTeamLevel(mocoUser.unitName || "");
    
    if (!visibleLevels.includes(userLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot edit user from this team level",
      });
    }

    // DashboardUser suchen oder erstellen
    let dashboardUser = await prisma.dashboardUser.findUnique({
      where: { mocoUserId },
    });

    if (!dashboardUser) {
      // Erstelle einen minimalen DashboardUser (nur für timelineActive)
      // WICHTIG: active = false, damit er keinen Dashboard-Zugang hat
      const defaultPassword = "!ChangeMe123"; // Wird nie verwendet, da active = false
      
      if (!mocoUser.email) {
        return res.status(400).json({
          error: "bad_request",
          detail: "MOCO user has no email address – cannot create dashboard entry",
        });
      }
      dashboardUser = await prisma.dashboardUser.create({
        data: {
          mocoUserId,
          email: mocoUser.email,
          passwordHash: await hashPassword(defaultPassword),
          name: `${mocoUser.firstname || ''} ${mocoUser.lastname || ''}`.trim() || `User ${mocoUserId}`,
          teamLevel: userLevel,
          mocoUnitName: mocoUser.unitName,
          active: false, // Kein Dashboard-Zugang
          timelineActive: timelineActive,
        },
      });
    } else {
      // DashboardUser existiert bereits, nur timelineActive aktualisieren
      dashboardUser = await prisma.dashboardUser.update({
        where: { id: dashboardUser.id },
        data: { timelineActive },
      });
    }

    res.json({
      success: true,
      mocoUserId,
      dashboardUserId: dashboardUser.id,
      timelineActive: dashboardUser.timelineActive,
    });
  } catch (error: unknown) {
    console.error("[admin] update timeline-user error:", error);
    res.status(500).json({ error: "update_timeline_user_failed" });
  }
});

/**
 * PUT /api/admin/users/:id
 * User bearbeiten (Team-Level, aktiv)
 */
router.put("/users/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const body = parseBody(UpdateUserSchema, req.body, res);
    if (!body) return;

    const { teamLevel, active, timelineActive, superUser } = body;

    // User finden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id },
    });

    if (!dashboardUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "User not found",
      });
    }

    // Prüfen ob Admin diesen User sehen darf
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);
    if (!visibleLevels.includes(dashboardUser.teamLevel as TeamLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot edit user from this team level",
      });
    }

    // Update-Daten vorbereiten (Felder durch Zod-Schema bereits typsicher)
    const updateData: Record<string, unknown> = {};

    if (teamLevel !== undefined) {
      // Prüfen ob neues Level sichtbar ist
      if (!visibleLevels.includes(teamLevel as TeamLevel)) {
        return res.status(403).json({
          error: "forbidden",
          detail: "Cannot set user to this team level",
        });
      }
      updateData.teamLevel = teamLevel;
    }

    if (active !== undefined) {
      updateData.active = active;
    }

    if (timelineActive !== undefined) {
      updateData.timelineActive = timelineActive;
    }

    if (superUser !== undefined && req.user!.superUser) {
      updateData.superUser = superUser;
    }

    // User aktualisieren
    const updated = await prisma.dashboardUser.update({
      where: { id },
      data: updateData,
      include: { mocoUser: true },
    });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      teamLevel: updated.teamLevel,
      mocoUnitName: updated.mocoUnitName,
      mocoUserId: updated.mocoUserId,
      active: updated.active,
      superUser: updated.superUser || false,
      mocoUser: updated.mocoUser,
    });
  } catch (error: unknown) {
    console.error("[admin] update user error:", error);
    res.status(500).json({ error: "update_user_failed" });
  }
});

/**
 * DELETE /api/admin/users/:id
 * User deaktivieren (soft delete)
 */
router.delete("/users/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // User finden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id },
    });

    if (!dashboardUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "User not found",
      });
    }

    // Prüfen ob Admin diesen User sehen darf
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);
    if (!visibleLevels.includes(dashboardUser.teamLevel as TeamLevel)) {
      return res.status(403).json({
        error: "forbidden",
        detail: "Cannot deactivate user from this team level",
      });
    }

    // User deaktivieren
    await prisma.dashboardUser.update({
      where: { id },
      data: { active: false },
    });

    res.json({
      success: true,
      message: "User deactivated",
    });
  } catch (error: unknown) {
    console.error("[admin] delete user error:", error);
    res.status(500).json({ error: "delete_user_failed" });
  }
});

/**
 * GET /api/admin/sessions
 * Liste aller Sessions aller User (nur Super User)
 */
router.get("/sessions", requireSuperUser(), async (req: AuthRequest, res) => {
  try {
    const dashboardUsers = await prisma.dashboardUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        lastLoginAt: true,
        lastActivityAt: true,
        lastSessionDuration: true,
        totalSessionTime: true,
        active: true,
      },
      orderBy: [
        { lastLoginAt: "desc" }, // Neueste zuerst, null-Werte kommen zuletzt
        { name: "asc" }, // Fallback-Sortierung
      ],
    });

    // Online-Status: User ist online wenn lastActivityAt < 5 Minuten alt ist
    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 Minuten

    res.json(
      dashboardUsers.map((u) => {
        const isOnline = u.lastActivityAt 
          ? (now - u.lastActivityAt.getTime()) < ONLINE_THRESHOLD_MS
          : false;
        
        return {
          userId: u.id,
          email: u.email,
          name: u.name,
          lastLoginAt: u.lastLoginAt,
          lastActivityAt: u.lastActivityAt,
          lastSessionDuration: u.lastSessionDuration,
          totalSessionTime: u.totalSessionTime,
          active: u.active,
          isOnline,
        };
      })
    );
  } catch (error: unknown) {
    console.error("[admin] sessions error:", error);
    res.status(500).json({ error: "admin_sessions_failed" });
  }
});

/**
 * GET /api/admin/dashboard-users
 * Liste aller Dashboard-User mit Berechtigungen und Views
 */
router.get("/dashboard-users", async (req: AuthRequest, res) => {
  try {
    const visibleLevels = getVisibleTeamLevelsForUser(req.user!.teamLevel as TeamLevel, req.user!.superUser);

    const dashboardUsers = await prisma.dashboardUser.findMany({
      where: {
        teamLevel: { in: visibleLevels },
      },
      include: {
        mocoUser: true,
      },
      orderBy: [
        { teamLevel: "asc" },
        { name: "asc" },
      ],
    });

    // Berechtigungen für jeden User berechnen
    const result = dashboardUsers.map((u) => {
      const visibleLevels = getVisibleTeamLevelsForUser(u.teamLevel as TeamLevel, u.superUser || false);
      
      // Views bestimmen
      const views: string[] = [];
      if (visibleLevels.length > 0) {
        views.push("Timeline");
      }
      if (u.superUser) {
        views.push("Users", "Admin");
      }

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        teamLevel: u.teamLevel,
        mocoUnitName: u.mocoUnitName,
        mocoUserId: u.mocoUserId,
        active: u.active,
        superUser: u.superUser || false,
        createdAt: u.createdAt,
        invitedAt: u.invitedAt,
        mocoUser: u.mocoUser
          ? {
              id: u.mocoUser.id,
              firstname: u.mocoUser.firstname,
              lastname: u.mocoUser.lastname,
              unitName: u.mocoUser.unitName,
            }
          : null,
        permissions: {
          visibleLevels,
          views,
        },
      };
    });

    res.json(result);
  } catch (error: unknown) {
    console.error("[admin] dashboard-users error:", error);
    res.status(500).json({ error: "admin_dashboard_users_failed" });
  }
});

export default router;

