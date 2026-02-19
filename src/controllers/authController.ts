/**
 * Auth Controller
 * SECURITY: All provider tokens are verified server-side before a session token is issued.
 * The client never controls which user account it gets — the sub extracted from a
 * cryptographically verified provider JWT determines identity.
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/authService';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AuthController {
  /**
   * POST /api/auth/login
   * Body: { provider: "apple" | "google", idToken: string }
   * Returns: { ok: true, data: { token, user: { id, email?, name? } } }
   *
   * SECURITY: verifies the provider token server-side, never trusts client-supplied IDs.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider, idToken } = req.body;

      if (!provider || !['apple', 'google'].includes(provider)) {
        console.log('Invalid provider in login request', { provider });
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'provider must be "apple" or "google"' } });
        return;
      }
      if (!idToken || typeof idToken !== 'string') {
        console.log('Missing or invalid idToken in login request');
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'idToken is required' } });
        return;
      }

      let authResult;
      if (provider === 'apple') {
        const verified = await authService.verifyAppleToken(idToken);
        console.log('Apple token verified', { sub: verified.sub, email: verified.email });
        authResult = await authService.authenticateApple(verified.sub, verified.email);
      } else {
        const verified = await authService.verifyGoogleToken(idToken);
        console.log('Google token verified', { sub: verified.sub, email: verified.email, name: verified.name });
        authResult = await authService.authenticateGoogle(verified.sub, verified.email, verified.name);
      }

      const token = authService.generateToken({ userId: authResult.userId, email: authResult.email });
      console.log('Session token generated for user', { userId: authResult.userId, provider });

      logger.info('User authenticated', { userId: authResult.userId, provider });

      res.json({
        ok: true,
        data: {
          token,
          user: { id: authResult.userId, email: authResult.email, name: authResult.name },
        },
      });
    } catch (error) {
      // Surface token verification failures as 401, not 500
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      if (
        normalized.includes('invalid') ||
        normalized.includes('expired') ||
        normalized.includes('signature') ||
        normalized.includes('verification') ||
        normalized.includes('audience') ||
        normalized.includes('issuer')
      ) {
        const code = normalized.includes('audience')
          ? 'TOKEN_AUDIENCE_INVALID'
          : normalized.includes('issuer')
            ? 'TOKEN_ISSUER_INVALID'
            : normalized.includes('expired')
              ? 'TOKEN_EXPIRED'
              : 'TOKEN_INVALID';

        const publicMessage = code === 'TOKEN_AUDIENCE_INVALID'
          ? 'Provider token audience mismatch'
          : code === 'TOKEN_ISSUER_INVALID'
            ? 'Provider token issuer mismatch'
            : code === 'TOKEN_EXPIRED'
              ? 'Provider token expired'
              : 'Provider token verification failed';

        const failedProvider = (req.body as { provider?: string })?.provider;
        logger.warn('Provider token verification failed', { provider: failedProvider, code, error: message });
        res.status(401).json({
          ok: false,
          error: {
            code,
            message: publicMessage,
            ...(config.nodeEnv === 'development' ? { details: message } : {}),
          },
        });
        return;
      }
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Requires Bearer token. Returns a new session token.
   */
  async refresh(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const token = authService.generateToken({ userId });
      res.json({ ok: true, data: { token } });
    } catch (error) {
      next(error);
    }
  }

  /** Legacy routes — return 410 Gone so old clients get a clear error. */
  gone(_req: Request, res: Response): void {
    res.status(410).json({ ok: false, error: { code: 'GONE', message: 'Use POST /api/auth/login instead' } });
  }
}

export const authController = new AuthController();
