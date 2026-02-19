/**
 * Auth Middleware
 * Production Hardening Phase 2: Validate JWT and attach userId to request
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/authService';

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = authService.verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ ok: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}
