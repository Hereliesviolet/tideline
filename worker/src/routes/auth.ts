// src/routes/auth.ts
// Authentifizierungs-Endpoints

import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db";
import { hashPassword, comparePassword } from "../lib/password";
import { generateJWT, generate2FACode } from "../lib/auth";
import { send2FAEmail } from "../lib/email";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getAvatarUrl, isAvatarCached } from "../lib/avatarCache";
import { LoginSchema, Verify2FASchema, ResendSchema, AcceptInviteSchema, parseBody } from "../lib/schemas";
import { mapMocoUnitToTeamLevel, resolveDashboardTeamLevel } from "../lib/mocoMapping";
import crypto from "crypto";

const router = Router();

// 2FA-Code Gültigkeit: 10 Minuten
const TWO_FA_EXPIRY_MINUTES = 10;
const MAX_2FA_ATTEMPTS = 5;
const MAX_RESEND_COUNT = 3;

// Maximale Lücke zwischen zwei Aktivitäts-Signalen, die noch als "dieselbe Session"
// gezählt wird. Identisch zur Online-Schwelle (5 Min). Liegt mehr Zeit zwischen zwei
// Heartbeats, war der Nutzer offline und die Lücke wird NICHT zur Session-Zeit addiert.
const ACTIVITY_GAP_SECONDS = 5 * 60;

/**
 * Berechnet die seit der letzten Aktivität verstrichene Zeit, sofern sie als
 * zusammenhängende Session gilt (kleiner/gleich ACTIVITY_GAP_SECONDS).
 * Gibt 0 zurück, wenn keine vorherige Aktivität existiert oder die Lücke zu groß ist.
 */
function continuousDeltaSeconds(lastActivityAt: Date | null, now: Date): number {
  if (!lastActivityAt) return 0;
  const deltaSec = Math.floor((now.getTime() - lastActivityAt.getTime()) / 1000);
  if (deltaSec <= 0 || deltaSec > ACTIVITY_GAP_SECONDS) return 0;
  return deltaSec;
}

// Rate-Limit für Auth-Endpoints: 10 Requests pro 15 Minuten
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit", detail: "Too many requests, please try again later" },
});

/**
 * POST /api/auth/login
 * Schritt 1: Email + Passwort prüfen, 2FA-Code generieren
 */
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseBody(LoginSchema, req.body, res);
    if (!body) return;

    const { email, password } = body;

    // Dashboard-User finden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { mocoUser: true },
    });

    if (!dashboardUser || !dashboardUser.active) {
      // Aus Sicherheitsgründen: Gleiche Antwort bei falschem User oder Passwort
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid email or password",
      });
    }

    // Passwort prüfen
    const passwordValid = await comparePassword(password, dashboardUser.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid email or password",
      });
    }

    // 2FA-Code generieren
    const code = generate2FACode();
    const codeHash = await hashPassword(code);

    // Temporären Login-Token generieren
    const pendingToken = crypto.randomBytes(32).toString("hex");

    // Alte Pending-Logins für diese Email löschen
    await prisma.pendingLogin.deleteMany({
      where: { email: dashboardUser.email },
    });

    // Neuen Pending-Login erstellen
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + TWO_FA_EXPIRY_MINUTES);

    await prisma.pendingLogin.create({
      data: {
        token: pendingToken,
        email: dashboardUser.email,
        codeHash,
        expiresAt,
      },
    });

    // 2FA-Code per E-Mail senden
    try {
      await send2FAEmail(dashboardUser.email, code);
      console.log("[auth] 2FA code sent");
    } catch (emailError: unknown) {
      console.error("[auth] Failed to send 2FA email:", emailError);
    }

    res.json({
      success: true,
      pendingToken,
      message: "2FA code sent to email",
    });
  } catch (error: unknown) {
    console.error("[auth] login error:", error);
    res.status(500).json({ error: "login_failed" });
  }
});

/**
 * POST /api/auth/verify-2fa
 * Schritt 2: 2FA-Code prüfen, JWT zurückgeben
 */
router.post("/verify-2fa", authLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseBody(Verify2FASchema, req.body, res);
    if (!body) return;

    const { pendingToken, code } = body;

    // Pending-Login finden
    const pendingLogin = await prisma.pendingLogin.findUnique({
      where: { token: pendingToken },
    });

    if (!pendingLogin) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid or expired token",
      });
    }

    // Prüfen ob abgelaufen
    if (new Date() > pendingLogin.expiresAt) {
      await prisma.pendingLogin.delete({ where: { id: pendingLogin.id } });
      return res.status(401).json({
        error: "unauthorized",
        detail: "Token expired",
      });
    }

    // Prüfen ob zu viele Code-Versuche
    if (pendingLogin.codeAttempts >= MAX_2FA_ATTEMPTS) {
      await prisma.pendingLogin.delete({ where: { id: pendingLogin.id } });
      return res.status(401).json({
        error: "unauthorized",
        detail: "Too many attempts, please start over",
      });
    }

    // Code prüfen
    const codeValid = await comparePassword(code, pendingLogin.codeHash);
    if (!codeValid) {
      // Code-Versuche erhöhen
      await prisma.pendingLogin.update({
        where: { id: pendingLogin.id },
        data: { codeAttempts: pendingLogin.codeAttempts + 1 },
      });

      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid code",
      });
    }

    // Dashboard-User laden
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { email: pendingLogin.email },
      include: { mocoUser: true },
    });

    if (!dashboardUser || !dashboardUser.active) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "User not found or inactive",
      });
    }

    const resolvedTeamLevel = resolveDashboardTeamLevel(
      dashboardUser.teamLevel,
      dashboardUser.mocoUser?.unitName,
      dashboardUser.mocoUnitName
    );
    const liveUnitName = dashboardUser.mocoUser?.unitName ?? dashboardUser.mocoUnitName;

    // JWT generieren
    const jwtToken = generateJWT(
      dashboardUser.id,
      dashboardUser.email,
      resolvedTeamLevel
    );

    // Session-Tracking: Neue Session beginnt -> Login-/Aktivitäts-Zeit setzen,
    // sessionStartAt setzen, Dauer der laufenden Session auf 0 zurücksetzen.
    const loginNow = new Date();
    await prisma.dashboardUser.update({
      where: { id: dashboardUser.id },
      data: {
        lastLoginAt: loginNow,
        sessionStartAt: loginNow,
        lastActivityAt: loginNow,
        lastSessionDuration: 0,
        teamLevel: resolvedTeamLevel,
        ...(liveUnitName && liveUnitName !== dashboardUser.mocoUnitName
          ? { mocoUnitName: liveUnitName }
          : {}),
      },
    });

    // Pending-Login löschen
    await prisma.pendingLogin.delete({ where: { id: pendingLogin.id } });

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: dashboardUser.id,
        email: dashboardUser.email,
        name: dashboardUser.name,
        teamLevel: resolvedTeamLevel,
        mocoUnitName: liveUnitName,
        superUser: dashboardUser.superUser || false,
      },
    });
  } catch (error: unknown) {
    console.error("[auth] verify-2fa error:", error);
    res.status(500).json({ error: "verify_failed" });
  }
});

/**
 * POST /api/auth/resend-2fa
 * 2FA-Code erneut senden
 */
router.post("/resend-2fa", async (req: Request, res: Response) => {
  try {
    const body = parseBody(ResendSchema, req.body, res);
    if (!body) return;

    const { pendingToken } = body;

    // Pending-Login finden
    const pendingLogin = await prisma.pendingLogin.findUnique({
      where: { token: pendingToken },
    });

    if (!pendingLogin) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid token",
      });
    }

    // Prüfen ob abgelaufen
    if (new Date() > pendingLogin.expiresAt) {
      await prisma.pendingLogin.delete({ where: { id: pendingLogin.id } });
      return res.status(401).json({
        error: "unauthorized",
        detail: "Token expired, please start over",
      });
    }

    // Rate-Limit: Max. 3 Resends pro Token (separater Zähler von Code-Versuchen)
    if (pendingLogin.resendCount >= MAX_RESEND_COUNT) {
      return res.status(429).json({
        error: "rate_limit",
        detail: "Too many resend requests",
      });
    }

    // Neuen Code generieren
    const code = generate2FACode();
    const codeHash = await hashPassword(code);

    // Code und Resend-Zähler aktualisieren
    await prisma.pendingLogin.update({
      where: { id: pendingLogin.id },
      data: {
        codeHash,
        resendCount: pendingLogin.resendCount + 1,
      },
    });

    // Code per E-Mail senden
    try {
      await send2FAEmail(pendingLogin.email, code);
    } catch (emailError: unknown) {
      console.error("[auth] Failed to send 2FA email:", emailError);
    }

    res.json({
      success: true,
      message: "2FA code resent",
    });
  } catch (error: unknown) {
    console.error("[auth] resend-2fa error:", error);
    res.status(500).json({ error: "resend_failed" });
  }
});

/**
 * GET /api/auth/me
 * Aktueller User (mit JWT)
 */
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id: req.user!.id },
      include: { mocoUser: true },
    });

    if (!dashboardUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "User not found",
      });
    }

    let avatarUrl: string | null = null;

    if (dashboardUser.mocoUserId) {
      const hasCachedAvatar = await isAvatarCached(dashboardUser.mocoUserId);
      avatarUrl = hasCachedAvatar
        ? getAvatarUrl(dashboardUser.mocoUserId)
        : (dashboardUser.mocoUser?.avatar || null);
    }

    res.json({
      id: dashboardUser.id,
      email: dashboardUser.email,
      name: dashboardUser.name,
      teamLevel: resolveDashboardTeamLevel(
        dashboardUser.teamLevel,
        dashboardUser.mocoUser?.unitName,
        dashboardUser.mocoUnitName
      ),
      mocoUnitName: dashboardUser.mocoUser?.unitName ?? dashboardUser.mocoUnitName,
      mocoUserId: dashboardUser.mocoUserId,
      active: dashboardUser.active,
      superUser: Boolean(dashboardUser.superUser),
      avatarUrl,
      mocoUser: dashboardUser.mocoUser,
    });
  } catch (error: unknown) {
    console.error("[auth] me error:", error);
    res.status(500).json({ error: "me_failed" });
  }
});

/**
 * POST /api/auth/accept-invite
 * Einladung akzeptieren, Passwort setzen
 */
router.post("/accept-invite", async (req: Request, res: Response) => {
  try {
    const body = parseBody(AcceptInviteSchema, req.body, res);
    if (!body) return;

    const { token, password } = body;

    // Invitation finden
    const invitation = await prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invalid invitation token",
      });
    }

    if (invitation.used) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invitation already used",
      });
    }

    if (new Date() > invitation.expiresAt) {
      return res.status(401).json({
        error: "unauthorized",
        detail: "Invitation expired",
      });
    }

    // Prüfen ob User bereits existiert
    const existingUser = await prisma.dashboardUser.findUnique({
      where: { email: invitation.email },
    });

    // MOCO-User laden
    const mocoUser = await prisma.user.findUnique({
      where: { id: invitation.mocoUserId },
    });

    if (!mocoUser) {
      return res.status(404).json({
        error: "not_found",
        detail: "MOCO user not found",
      });
    }

    // Passwort hashen
    const passwordHash = await hashPassword(password);

    let dashboardUser;

    if (existingUser) {
      // User existiert bereits: Passwort zurücksetzen und Team-Level aktualisieren
      dashboardUser = await prisma.dashboardUser.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          teamLevel: mapMocoUnitToTeamLevel(mocoUser.unitName),
          mocoUnitName: mocoUser.unitName,
          active: true,
        },
      });
    } else {
      // Neuer User: Dashboard-User erstellen
      dashboardUser = await prisma.dashboardUser.create({
        data: {
          mocoUserId: invitation.mocoUserId,
          email: invitation.email,
          passwordHash,
          name: mocoUser.firstname && mocoUser.lastname
            ? `${mocoUser.firstname} ${mocoUser.lastname}`.trim()
            : mocoUser.email || `User ${mocoUser.id}`,
          teamLevel: mapMocoUnitToTeamLevel(mocoUser.unitName),
          mocoUnitName: mocoUser.unitName,
          invitedAt: new Date(),
        },
      });
    }

    // Invitation als verwendet markieren
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { used: true },
    });

    res.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: dashboardUser.id,
        email: dashboardUser.email,
        name: dashboardUser.name,
      },
    });
  } catch (error: unknown) {
    console.error("[auth] accept-invite error:", error);
    res.status(500).json({ error: "accept_invite_failed" });
  }
});

/**
 * POST /api/auth/heartbeat
 * Heartbeat-Signal vom Frontend - aktualisiert lastActivityAt
 */
router.post("/heartbeat", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id: req.user!.id },
      select: { lastActivityAt: true, lastSessionDuration: true },
    });

    const data: {
      lastActivityAt: Date;
      totalSessionTime?: { increment: number };
      lastSessionDuration?: number;
    } = { lastActivityAt: now };

    if (dashboardUser) {
      const delta = continuousDeltaSeconds(dashboardUser.lastActivityAt, now);
      if (delta > 0) {
        // Zusammenhängende Session: verstrichene Zeit zur Gesamt- und Session-Dauer addieren
        data.totalSessionTime = { increment: delta };
        data.lastSessionDuration = (dashboardUser.lastSessionDuration ?? 0) + delta;
      } else if (dashboardUser.lastActivityAt) {
        // Lücke zu groß -> der Nutzer war offline, eine neue Session beginnt jetzt
        data.lastSessionDuration = 0;
      }
    }

    await prisma.dashboardUser.update({
      where: { id: req.user!.id },
      data,
    });

    res.json({ success: true });
  } catch (error: unknown) {
    console.error("[auth] heartbeat error:", error);
    res.status(500).json({ error: "heartbeat_failed" });
  }
});

/**
 * POST /api/auth/logout
 * Session-Dauer speichern beim Logout
 *
 * HINWEIS: Die Session-Zeit wird primär serverseitig per Heartbeat fortgeschrieben.
 * Dieser Endpoint addiert nur noch die seit dem letzten Heartbeat verstrichene Zeit
 * und markiert den Nutzer als offline (lastActivityAt = null, sessionStartAt = null).
 */
router.post("/logout", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const dashboardUser = await prisma.dashboardUser.findUnique({
      where: { id: req.user!.id },
      select: { lastActivityAt: true, lastSessionDuration: true },
    });

    const data: {
      lastActivityAt: null;
      sessionStartAt: null;
      totalSessionTime?: { increment: number };
      lastSessionDuration?: number;
    } = { lastActivityAt: null, sessionStartAt: null };

    if (dashboardUser) {
      const delta = continuousDeltaSeconds(dashboardUser.lastActivityAt, now);
      if (delta > 0) {
        data.totalSessionTime = { increment: delta };
        data.lastSessionDuration = (dashboardUser.lastSessionDuration ?? 0) + delta;
      }
    }

    await prisma.dashboardUser.update({
      where: { id: req.user!.id },
      data,
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error: unknown) {
    console.error("[auth] logout error:", error);
    res.status(500).json({ error: "logout_failed" });
  }
});

export default router;
