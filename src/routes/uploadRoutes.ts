/**
 * Upload Routes
 * Phase 3: Request signed URL (auth) and perform signed upload (no auth).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { uploadController } from '../controllers/uploadController';

const router = Router();

router.post('/request-url', requireAuth, (req, res, next) =>
  uploadController.requestUploadUrl(req, res, next)
);

router.post(
  '/signed',
  upload.single('file'),
  (req, res, next) => uploadController.handleSignedUpload(req, res, next)
);

export default router;
