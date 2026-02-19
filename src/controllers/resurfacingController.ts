/**
 * Resurfacing Controller
 * Phase 6: HTTP handlers for memory resurfacing
 */

import { Response, NextFunction } from 'express';
import { resurfacingService } from '../services/resurfacing/resurfacingService';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export class ResurfacingController {
  /**
   * GET /api/resurface/daily
   * Get daily resurfaced memory (scoped to authenticated user)
   */
  async getDailyMemory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      logger.info('Daily resurfacing request', { userId });

      const result = await resurfacingService.getDailyMemory(userId);

      if (!result) {
        res.json({
          ok: true,
          data: {
            event: null,
            message: 'No memories available for resurfacing yet. Keep recording!',
          },
        });
        return;
      }

      res.json({
        ok: true,
        data: {
          event: result.event,
          reason: result.reason,
          score: result.score,
          notificationText: result.notificationText,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const resurfacingController = new ResurfacingController();
