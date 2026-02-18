/**
 * Auth Routes
 * Production Hardening Phase 2: Apple / Google Sign In, refresh
 */

import { Router } from 'express';
import { authController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/apple', (req, res, next) => authController.appleSignIn(req, res, next));
router.post('/google', (req, res, next) => authController.googleSignIn(req, res, next));
router.post('/refresh', requireAuth, (req, res, next) => authController.refresh(req, res, next));

export default router;
