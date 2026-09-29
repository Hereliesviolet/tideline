// src/lib/auth.ts
// JWT-Handling für Authentifizierung

import jwt, { SignOptions } from "jsonwebtoken";
import { randomInt } from "crypto";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET: string = _jwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

export type JWTPayload = {
  userId: string;
  email: string;
  teamLevel: number;
};

/**
 * Generiert einen JWT-Token für einen User
 */
export function generateJWT(
  userId: string,
  email: string,
  teamLevel: number
): string {
  const payload: JWTPayload = {
    userId,
    email,
    teamLevel,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

/**
 * Verifiziert einen JWT-Token und gibt das Payload zurück
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Generiert einen kryptografisch sicheren 6-stelligen numerischen 2FA-Code
 */
export function generate2FACode(): string {
  return randomInt(100000, 1000000).toString();
}

