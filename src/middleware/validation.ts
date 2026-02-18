/**
 * Validation Middleware
 * Phase 2: Request validation helpers
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

/**
 * Validate that file exists in request
 */
export function validateFileExists(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.file) {
    throw new ValidationError('File is required');
  }
  next();
}

/**
 * Validate modality parameter
 */
export function validateModality(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const modality = req.body.modality;
  
  if (!modality) {
    throw new ValidationError('Modality is required');
  }
  
  if (modality !== 'voice' && modality !== 'image') {
    throw new ValidationError('Modality must be "voice" or "image"');
  }
  
  next();
}

/**
 * Validate UUID parameter
 */
export function validateUUID(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    
    if (!value) {
      throw new ValidationError(`${paramName} is required`);
    }
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${paramName} must be a valid UUID`);
    }
    
    next();
  };
}
