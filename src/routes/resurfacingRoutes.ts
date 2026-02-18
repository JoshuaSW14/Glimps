/**
 * Resurfacing Routes
 * Phase 6: API routes for memory resurfacing
 */

import { Router } from 'express';
import { resurfacingController } from '../controllers/resurfacingController';

const router = Router();

// Get daily resurfaced memory
router.get(
  '/daily',
  (req, res, next) => resurfacingController.getDailyMemory(req, res, next)
);

export { router as resurfacingRoutes };
