/**
 * Account Routes
 * Phase 6: Delete account and export data (require auth).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { accountController } from '../controllers/accountController';

const router = Router();

router.delete('/', requireAuth, (req, res, next) =>
  accountController.deleteAccount(req, res, next)
);
router.get('/export', requireAuth, (req, res, next) =>
  accountController.exportData(req, res, next)
);

export default router;
