// src/lib/password.ts
// Passwort-Hashing mit bcrypt

import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

/**
 * Hasht ein Passwort mit bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Vergleicht ein Passwort mit einem Hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

