/**
 * Avatar-Caching: Lädt Avatare von MOCO und speichert sie lokal
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const AVATARS_DIR = process.env.AVATARS_DIR || '/app/avatars';
const AVATAR_BASE_URL = process.env.AVATAR_BASE_URL || '/api/avatars';

/**
 * Stelle sicher, dass das Avatare-Verzeichnis existiert
 */
export async function ensureAvatarsDir(): Promise<void> {
  try {
    await fs.mkdir(AVATARS_DIR, { recursive: true });
  } catch (e: any) {
    if (e.code !== 'EEXIST') {
      throw new Error(`Failed to create avatars directory: ${e.message}`);
    }
  }
}

/**
 * Lade Avatar von MOCO-URL und speichere lokal
 * @param userId MOCO User-ID
 * @param mocoAvatarUrl URL des Avatars von MOCO (z.B. https://data.mocoapp.com/...)
 * @returns Lokale Avatar-URL oder null bei Fehler
 */
export async function downloadAndCacheAvatar(
  userId: number,
  mocoAvatarUrl: string | null | undefined
): Promise<string | null> {
  if (!mocoAvatarUrl || !mocoAvatarUrl.trim()) {
    return null;
  }

  // Prüfe ob Avatar bereits gecacht ist
  const localPath = path.join(AVATARS_DIR, `${userId}.png`);
  const localUrl = `${AVATAR_BASE_URL}/${userId}`;

  try {
    // Prüfe ob Datei bereits existiert
    try {
      await fs.access(localPath);
      // Avatar bereits vorhanden, gebe lokale URL zurück
      return localUrl;
    } catch {
      // Datei existiert nicht, lade sie herunter
    }

    // Lade Avatar von MOCO
    const response = await fetch(mocoAvatarUrl, {
      headers: {
        'User-Agent': 'CapacityTimeline-Avatar-Cache/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[avatarCache] Failed to download avatar for user ${userId}: ${response.status} ${response.statusText}`);
      return null;
    }

    // Stelle sicher, dass Verzeichnis existiert
    await ensureAvatarsDir();

    // Speichere Avatar lokal
    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));

    console.log(`[avatarCache] Cached avatar for user ${userId}`);
    return localUrl;
  } catch (e: any) {
    console.error(`[avatarCache] Error caching avatar for user ${userId}:`, e.message);
    return null;
  }
}

/**
 * Prüfe ob Avatar lokal gecacht ist
 */
export async function isAvatarCached(userId: number): Promise<boolean> {
  const localPath = path.join(AVATARS_DIR, `${userId}.png`);
  try {
    await fs.access(localPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hole lokale Avatar-Pfad
 */
export function getAvatarPath(userId: number): string {
  return path.join(AVATARS_DIR, `${userId}.png`);
}

/**
 * Hole lokale Avatar-URL
 */
export function getAvatarUrl(userId: number): string {
  return `${AVATAR_BASE_URL}/${userId}`;
}

