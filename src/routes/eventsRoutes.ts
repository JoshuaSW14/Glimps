/**
 * Events Routes
 * Phase 3: Event API endpoints
 */

import { Router } from 'express';
import { eventsController } from '../controllers/eventsController';

const router = Router();

/**
 * GET /api/events
 * List recent events
 */
router.get('/', (req, res, next) => eventsController.list(req, res, next));

/**
 * GET /api/events/:eventId
 * Get event by ID with memories
 */
router.get('/:eventId', (req, res, next) => eventsController.getById(req, res, next));

/**
 * POST /api/events/search
 * Search events by query
 */
router.post('/search', (req, res, next) => eventsController.search(req, res, next));

export default router;
