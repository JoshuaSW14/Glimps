/**
 * Auth Routes
 */

import { Router } from 'express';
import { authController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Unified provider login — verifies provider token server-side before issuing session token
router.post('/login', (req, res, next) => authController.login(req, res, next));

// Refresh an existing session token
router.post('/refresh', requireAuth, (req, res, next) => authController.refresh(req as any, res, next));

// Legacy endpoints — return 410 Gone so old clients fail clearly
router.post('/apple',  (req, res) => authController.gone(req, res));
router.post('/google', (req, res) => authController.gone(req, res));

export default router;
