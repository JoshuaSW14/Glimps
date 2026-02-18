/**
 * Answer Routes
 * Phase 4: API routes for Q&A
 */

import { Router } from 'express';
import { answerController } from '../controllers/answerController';

const router = Router();

// Ask a question
router.post(
  '/',
  (req, res, next) => answerController.ask(req, res, next)
);

export { router as answerRoutes };
