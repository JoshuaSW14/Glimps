/**
 * Routes Index
 * Phase 2: Centralized route exports
 * Production: Auth routes public; memories/events/search/ask/resurface require auth
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { memoriesRoutes } from './memoriesRoutes';
import { searchRoutes } from './searchRoutes';
import { answerRoutes } from './answerRoutes';
import { resurfacingRoutes } from './resurfacingRoutes';
import eventsRoutes from './eventsRoutes';
import authRoutes from './authRoutes';
import uploadRoutes from './uploadRoutes';
import accountRoutes from './accountRoutes';
import { labelsRoutes } from './labelsRoutes';

const router = Router();

// Public
router.use('/auth', authRoutes);

// Upload: request-url requires auth; signed is public (signature-verified)
router.use('/upload', uploadRoutes);

// Account: delete and export (require auth)
router.use('/account', accountRoutes);

// Protected (require valid JWT)
router.use('/memories', requireAuth, memoriesRoutes);
router.use('/labels', requireAuth, labelsRoutes);
router.use('/events', requireAuth, eventsRoutes);
router.use('/search', requireAuth, searchRoutes);
router.use('/ask', requireAuth, answerRoutes);
router.use('/resurface', requireAuth, resurfacingRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

export { router as apiRoutes };
