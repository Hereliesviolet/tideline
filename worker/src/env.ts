// src/env.ts
// Zentral: liest ENV-Variablen und erzwingt erforderliche Werte.
// Unterstützt sowohl MOCO_BASE_URL/MOCO_API_KEY als auch MOCO_BASE/MOCO_TOKEN.

import "dotenv/config";

function trimTrailingSlash(u?: string): string {
  return (u || "").replace(/\/+$/, "");
}

export const MOCO_BASE: string = trimTrailingSlash(
  process.env.MOCO_BASE_URL || process.env.MOCO_BASE || ""
);
// Unterstützt mehrere Schlüsselnamen, damit bestehende Deployments weiterlaufen
export const MOCO_TOKEN: string =
  process.env.MOCO_API_KEY ||
  process.env.MOCO_API_TOKEN ||
  process.env.MOCO_TOKEN ||
  "";

export const MOCO_PER_PAGE: number = Number(process.env.MOCO_PER_PAGE || 100);

export const NODE_ENV: "development" | "production" | "test" =
  (process.env.NODE_ENV as any) || "development";

export function requireEnv(): void {
  const missing: string[] = [];
  if (!MOCO_BASE) missing.push("MOCO_BASE_URL/MOCO_BASE");
  if (!MOCO_TOKEN) missing.push("MOCO_API_KEY/MOCO_API_TOKEN/MOCO_TOKEN");
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}
