/**
 * Auth Controller
 * Production Hardening Phase 2: Apple / Google Sign In, session token only
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/authService';
import { AuthRequest } from '../middleware/auth';

export class AuthController {
  /**
   * POST /api/auth/apple
   * Body: { identityToken?, user (Apple user ID), email?, fullName? }
   * Returns: { token, user: { id, email, name } }
   */
  async appleSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user: appleUserId, email, fullName } = req.body;

      if (!appleUserId || typeof appleUserId !== 'string') {
        res.status(400).json({ error: 'Missing Apple user identifier' });
        return;
      }

      const name = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
        : undefined;

      const authResult = await authService.authenticateApple(
        appleUserId,
        email,
        name
      );

      const token = authService.generateToken({
        userId: authResult.userId,
        email: authResult.email,
      });

      res.json({
        success: true,
        data: {
          token,
          user: {
            id: authResult.userId,
            email: authResult.email,
            name: authResult.name,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/google
   * Body: { id (Google user ID), email?, name? }
   * Returns: { token, user: { id, email, name } }
   */
  async googleSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: googleUserId, email, name } = req.body;

      if (!googleUserId || typeof googleUserId !== 'string') {
        res.status(400).json({ error: 'Missing Google user identifier' });
        return;
      }

      const authResult = await authService.authenticateGoogle(
        googleUserId,
        email,
        name
      );

      const token = authService.generateToken({
        userId: authResult.userId,
        email: authResult.email,
      });

      res.json({
        success: true,
        data: {
          token,
          user: {
            id: authResult.userId,
            email: authResult.email,
            name: authResult.name,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Requires Bearer token. Returns new token.
   */
  async refresh(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const token = authService.generateToken({ userId });
      res.json({
        success: true,
        data: { token },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
