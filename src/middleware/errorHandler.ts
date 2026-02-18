/**
 * Error Handler Middleware
 * Phase 2: Global error handling for Express
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logger.error('Request error', err, {
    method: req.method,
    path: req.path,
    body: req.body,
  });
  
  // Handle known AppError types
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code || 'ERROR',
        message: err.message,
        details: err.details,
      },
    });
    return;
  }
  
  // Handle unknown errors
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
