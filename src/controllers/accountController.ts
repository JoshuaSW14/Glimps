/**
 * Account Controller
 * Phase 6: Delete account and export data (App Store compliance).
 */

import { Response, NextFunction } from 'express';
import { withTransaction } from '../db';
import { memoryRepository, eventRepository } from '../db/repositories';
import { AuthRequest } from '../middleware/auth';

export class AccountController {
  /**
   * DELETE /api/account
   * Delete the authenticated user and all their data (cascades).
   */
  async deleteAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await withTransaction(async (client) => {
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
      });

      res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/account/export
   * Export all user data as JSON (memories and events).
   */
  async exportData(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const memories = await memoryRepository.listRecent(10000, userId);
      const events = await eventRepository.listRecent(10000, userId);

      res.json({
        success: true,
        data: {
          user: { id: userId },
          memories,
          events,
          exportedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const accountController = new AccountController();
