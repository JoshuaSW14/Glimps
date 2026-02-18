/**
 * Labels Routes
 * CRUD for user-defined labels
 */

import { Router } from 'express';
import { labelsController } from '../controllers/labelsController';
import { validateUUID } from '../middleware/validation';

const router = Router();

router.get('/', (req, res, next) => labelsController.list(req, res, next));
router.post('/', (req, res, next) => labelsController.create(req, res, next));
router.patch('/:id', validateUUID('id'), (req, res, next) => labelsController.update(req, res, next));
router.delete('/:id', validateUUID('id'), (req, res, next) => labelsController.delete(req, res, next));

export { router as labelsRoutes };
