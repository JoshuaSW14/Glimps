/**
 * Search Routes
 * Phase 3: API routes for memory search
 */

import { Router } from 'express';
import { searchController } from '../controllers/searchController';

const router = Router();

// Search for memories
router.post(
  '/',
  (req, res, next) => searchController.search(req, res, next)
);

export { router as searchRoutes };
