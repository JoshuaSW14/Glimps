/**
 * File Upload Middleware
 * Phase 2: Multer configuration for memory uploads
 */

import multer from 'multer';
import { config } from '../config';
import { ValidationError } from '../utils/errors';

// Store files in memory for processing
const storage = multer.memoryStorage();

// File filter
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  // Accept voice files (audio/x-m4a is what iOS sends for M4A recordings)
  const voiceTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/m4a'];
  
  // Accept image files
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  
  const allowedTypes = [...voiceTypes, ...imageTypes];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError(
      `File type not supported: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`
    ));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize, // Default 50MB
  },
});
