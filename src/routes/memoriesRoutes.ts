/**
 * Memories Routes
 * Phase 2: API routes for memory operations
 */

import { Router } from 'express';
import { memoriesController } from '../controllers/memoriesController';
import { upload } from '../middleware/upload';
import {
  validateFileExists,
  validateModality,
  validateUUID,
} from '../middleware/validation';

const router = Router();

// Upload a new memory
router.post(
  '/upload',
  upload.single('file'),
  validateFileExists,
  validateModality,
  (req, res, next) => memoriesController.upload(req, res, next)
);

// Get memory source status
router.get(
  '/sources/:sourceId',
  validateUUID('sourceId'),
  (req, res, next) => memoriesController.getSourceStatus(req, res, next)
);

// Retry failed memory processing
router.post(
  '/sources/:sourceId/retry',
  validateUUID('sourceId'),
  (req, res, next) => memoriesController.retryProcessing(req, res, next)
);

// List recent memories
router.get(
  '/',
  (req, res, next) => memoriesController.list(req, res, next)
);

// Memory labels (must be before /:id)
router.get(
  '/:id/labels',
  validateUUID('id'),
  (req, res, next) => memoriesController.getMemoryLabels(req, res, next)
);
router.post(
  '/:id/labels',
  validateUUID('id'),
  (req, res, next) => memoriesController.addLabelToMemory(req, res, next)
);
router.delete(
  '/:id/labels/:labelId',
  validateUUID('id'),
  validateUUID('labelId'),
  (req, res, next) => memoriesController.removeLabelFromMemory(req, res, next)
);

// Get memory asset (image or voice file) – must be before /:id
router.get(
  '/:id/asset',
  validateUUID('id'),
  (req, res, next) => memoriesController.getAsset(req, res, next)
);

// Get memory by ID
router.get(
  '/:id',
  validateUUID('id'),
  (req, res, next) => memoriesController.getById(req, res, next)
);

export { router as memoriesRoutes };
