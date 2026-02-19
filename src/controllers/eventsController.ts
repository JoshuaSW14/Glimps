/**
 * Events Controller
 * SECURITY: All repo calls pass userId — ownership is enforced at the DB layer.
 */

import { Response, NextFunction } from 'express';
import { eventRepository, memoryEventLinkRepository, memoryRepository } from '../db/repositories';
import { eventRetrievalService } from '../services/retrieval/eventRetrievalService';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import { serializeMemory } from '../utils/serializeMemory';

export class EventsController {
  /**
   * GET /api/events
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const events = await eventRepository.listRecent(50, userId);
      res.json({ ok: true, data: { events } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/events/:eventId
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { eventId } = req.params;

      // Ownership enforced by findById with userId
      const event = await eventRepository.findById(eventId, userId);
      const links = await memoryEventLinkRepository.findByEventId(eventId);

      // Fetch memories scoped to the same user
      const memoryIds = links.map((l) => l.memoryId);
      const memories = await memoryRepository.findByIds(memoryIds, userId);
      const memoryMap = new Map(memories.map((m) => [m.id, m]));

      const primaryMemory = links
        .filter((l) => l.relationshipType === 'primary')
        .map((l) => memoryMap.get(l.memoryId))
        .find(Boolean);

      const supportingMemories = links
        .filter((l) => l.relationshipType === 'supporting')
        .map((l) => memoryMap.get(l.memoryId))
        .filter(Boolean);

      const contextMemories = links
        .filter((l) => l.relationshipType === 'context')
        .map((l) => memoryMap.get(l.memoryId))
        .filter(Boolean);

      res.json({
        ok: true,
        data: {
          event,
          primaryMemory: primaryMemory ? serializeMemory(primaryMemory) : undefined,
          supportingMemories: supportingMemories.map((m) => serializeMemory(m!)),
          contextMemories: contextMemories.map((m) => serializeMemory(m!)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/events/search
   */
  async search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { query, limit = 10, filters = {} } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'query is required' } });
        return;
      }

      logger.info('Event search request', { query, limit });
      const result = await eventRetrievalService.search(query, limit, filters, userId);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const eventsController = new EventsController();
