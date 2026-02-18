/**
 * Resurfacing Controller
 * Phase 6: HTTP handlers for memory resurfacing
 */

import { Request, Response, NextFunction } from 'express';
import { resurfacingService } from '../services/resurfacing/resurfacingService';
import { logger } from '../utils/logger';

export class ResurfacingController {
  /**
   * GET /api/resurface/daily
   * Get daily resurfaced memory
   */
  async getDailyMemory(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('Daily resurfacing request');
      
      const result = await resurfacingService.getDailyMemory();
      
      if (!result) {
        res.json({
          success: true,
          data: {
            memory: null,
            message: 'No memories available for resurfacing yet. Keep recording!',
          },
        });
        return;
      }
      
      res.json({
        success: true,
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
