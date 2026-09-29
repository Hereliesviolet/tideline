// src/lib/schemas.ts
// Zentrale Zod-Schemas für Request-Validierung

import { z } from "zod";
import { Response } from "express";

// --- Auth-Schemas ---------------------------------------------------------

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const Verify2FASchema = z.object({
  pendingToken: z.string(),
  code: z.string().length(6),
});

export const ResendSchema = z.object({
  pendingToken: z.string(),
});

export const AcceptInviteSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
});

// --- Admin-Schemas --------------------------------------------------------

export const InviteFromMocoSchema = z.object({
  mocoUserId: z.number().int(),
});

// Resend-Einladung verwendet ebenfalls mocoUserId (kein invitationId)
export const ResendInvitationSchema = z.object({
  mocoUserId: z.number().int(),
});

export const ResetPasswordSchema = z.object({
  userId: z.string(),
});

export const UpdateUserSchema = z.object({
  teamLevel: z.number().int().min(0).max(7).optional(),
  active: z.boolean().optional(),
  timelineActive: z.boolean().optional(),
  superUser: z.boolean().optional(),
});

// --- Shared Schemas -------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DateRangeSchema = z.object({
  from: z.string().regex(ISO_DATE, "Erwartet YYYY-MM-DD"),
  to: z.string().regex(ISO_DATE, "Erwartet YYYY-MM-DD"),
});

// --- Helper-Funktionen ---------------------------------------------------

/**
 * Parst und validiert einen Request-Body gegen ein Zod-Schema.
 * Bei Validierungsfehler wird automatisch HTTP 400 gesendet und null zurückgegeben.
 */
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({
      error: "validation_failed",
      issues: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}

/**
 * Parst und validiert Query-Parameter gegen ein Zod-Schema.
 * Bei Validierungsfehler wird automatisch HTTP 400 gesendet und null zurückgegeben.
 */
export function parseQuery<T>(
  schema: z.ZodSchema<T>,
  query: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    res.status(400).json({
      error: "validation_failed",
      issues: result.error.flatten(),
    });
    return null;
  }
  return result.data;
}
