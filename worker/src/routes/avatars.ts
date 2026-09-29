/**
 * Avatar-Auslieferung: Liefert gecachte Avatare aus
 */

import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getAvatarPath, ensureAvatarsDir } from '../lib/avatarCache';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/avatars/:userId
 * Liefert den gecachten Avatar für einen User
 */
router.get('/avatars/:userId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'bad_request', detail: 'Invalid userId' });
    }

    const avatarPath = getAvatarPath(userId);

    try {
      // Prüfe ob Avatar existiert
      await fs.access(avatarPath);

      // Setze Content-Type
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 Stunden Cache

      // Lese und sende Avatar
      const avatarBuffer = await fs.readFile(avatarPath);
      res.send(avatarBuffer);
    } catch {
      // Avatar nicht gefunden, sende 404
      res.status(404).json({ error: 'not_found', detail: 'Avatar not found' });
    }
  } catch (e: any) {
    console.error('[avatars] error:', e);
    res.status(500).json({ error: 'avatar_failed', detail: String(e?.message ?? e) });
  }
});

export default router;

