// src/lib/cache.ts
// Redis-Caching für Performance-Optimierungen

import { createClient } from "redis";

// Redis-Client wird optional verwendet
// Falls Redis nicht verfügbar ist, werden alle Cache-Operationen ignoriert
let redisClient: any = null;
let redisInitialized = false;

async function getRedisClient() {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  try {
    // Dynamischer Import, da redis optional ist
    const { createClient } = await import("redis");
    const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
    redisClient = createClient({ url: redisUrl });

    redisClient.on("error", (err: any) => {
      console.warn("[cache] Redis error (cache disabled):", err);
      redisClient = null;
    });

    await redisClient.connect().catch(() => {
      console.warn("[cache] Redis connection failed (cache disabled)");
      redisClient = null;
    });
  } catch (error) {
    console.warn("[cache] Redis not available (cache disabled):", error);
    redisClient = null;
  }

  return redisClient;
}

/**
 * Cached einen Wert in Redis
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number = 60
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return; // Redis nicht verfügbar
    if (!client.isOpen) {
      await client.connect();
    }
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    // Fehler ignorieren, Cache ist optional
  }
}

/**
 * Holt einen Wert aus Redis-Cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null; // Redis nicht verfügbar
    if (!client.isOpen) {
      await client.connect();
    }
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    return null;
  }
}

/**
 * Löscht einen Cache-Key
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client) return; // Redis nicht verfügbar
    if (!client.isOpen) {
      await client.connect();
    }
    await client.del(key);
  } catch (error) {
    // Fehler ignorieren
  }
}

/**
 * Cache-Key für Auslastungs-Report generieren
 */
function cacheKeyUtilizationReport(params: { from: string; to: string; teamLevel?: number }): string {
  return `utilization:${params.from}:${params.to}:${params.teamLevel ?? "all"}`;
}

/**
 * Cache-Key für MOCO-User-Liste generieren
 */
function cacheKeyMocoUsers(teamLevel?: number): string {
  return `moco_users:${teamLevel ?? "all"}`;
}

/**
 * Cached einen Auslastungs-Report
 */
export async function cacheUtilizationReport(
  params: { from: string; to: string; teamLevel?: number },
  data: any,
  ttl: number = 60
): Promise<void> {
  await cacheSet(cacheKeyUtilizationReport(params), data, ttl);
}

/**
 * Holt einen Auslastungs-Report aus Cache
 */
export async function getCachedUtilizationReport<T>(
  params: { from: string; to: string; teamLevel?: number }
): Promise<T | null> {
  return cacheGet<T>(cacheKeyUtilizationReport(params));
}

/**
 * Cached MOCO-User-Liste
 */
export async function cacheMocoUsers(
  teamLevel: number | undefined,
  data: any,
  ttl: number = 300
): Promise<void> {
  await cacheSet(cacheKeyMocoUsers(teamLevel), data, ttl);
}

/**
 * Holt MOCO-User-Liste aus Cache
 */
export async function getCachedMocoUsers<T>(teamLevel?: number): Promise<T | null> {
  return cacheGet<T>(cacheKeyMocoUsers(teamLevel));
}

/**
 * Invalidiert alle MOCO-User Caches
 */
export async function invalidateMocoUsersCache(): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  
  try {
    const keys = await redis.keys("moco_users:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error("[cache] Failed to invalidate MOCO users cache:", error);
  }
}