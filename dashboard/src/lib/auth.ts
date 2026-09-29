// src/lib/auth.ts
// API-Calls für Authentifizierung

export interface LoginResponse {
  success: boolean;
  pendingToken: string;
  message: string;
}

export interface Verify2FAResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    teamLevel: number;
    mocoUnitName: string | null;
    superUser: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  teamLevel: number;
  mocoUnitName: string | null;
  mocoUserId: number;
  active: boolean;
  superUser: boolean;
  avatarUrl?: string | null;
  mocoUser?: any;
}

/** Liest Fehler aus API-Antworten (JSON mit detail oder Klartext/HTML von Proxy). */
async function readAuthApiError(response: Response, fallback: string): Promise<string> {
  const raw = await response.text();
  try {
    const body = JSON.parse(raw) as { detail?: string; message?: string; error?: string };
    if (typeof body.detail === 'string') return body.detail;
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
  } catch {
    /* kein JSON — z. B. 429-Text von Rate-Limit oder HTML */
  }
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (response.status === 429) {
    return trimmed
      ? `Zu viele Anfragen (Bitte warten). ${trimmed}`
      : 'Zu viele Anfragen für diesen Anmelde-Versuch. Bitte etwa 1 Minute warten und erneut versuchen.';
  }
  if (response.status === 401) {
    return 'Ungültige E-Mail oder Passwort – oder Zugang ist deaktiviert.';
  }
  if (trimmed) return `HTTP ${response.status}: ${trimmed}`;
  return fallback;
}

/**
 * Schritt 1: Login mit Email + Passwort
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const msg = await readAuthApiError(response, 'Anmeldung fehlgeschlagen.');
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Schritt 2: 2FA-Code verifizieren
 */
export async function verify2FA(
  pendingToken: string,
  code: string
): Promise<Verify2FAResponse> {
  const response = await fetch("/api/auth/verify-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken, code }),
  });

  if (!response.ok) {
    const msg = await readAuthApiError(response, 'Code konnte nicht bestätigt werden.');
    throw new Error(msg);
  }

  return response.json();
}

/**
 * 2FA-Code erneut senden
 */
export async function resend2FA(pendingToken: string): Promise<void> {
  const response = await fetch("/api/auth/resend-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken }),
  });

  if (!response.ok) {
    const msg = await readAuthApiError(response, 'Code konnte nicht erneut gesendet werden.');
    throw new Error(msg);
  }
}

/**
 * Aktuellen User abrufen
 */
export async function getCurrentUser(): Promise<User> {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      throw new Error("Not authenticated");
    }
    const msg = await readAuthApiError(response, 'Benutzer konnte nicht geladen werden.');
    throw new Error(msg);
  }

  const userData = await response.json();
  // Debug-Logging entfernt: Vermeidet laute Konsolen-Ausgaben im Produktivbetrieb
  return userData;
}

/**
 * Einladung akzeptieren und Passwort setzen
 */
export async function acceptInvite(token: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });

  if (!response.ok) {
    const msg = await readAuthApiError(response, 'Einladung konnte nicht abgeschlossen werden.');
    throw new Error(msg);
  }
}

