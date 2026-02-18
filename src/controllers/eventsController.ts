/**
 * Events Controller
 * Phase 3: HTTP handlers for event operations
 */

import { Response, NextFunction } from 'express';
import { eventRepository, memoryEventLinkRepository, memoryRepository } from '../db/repositories';
import { eventRetrievalService } from '../services/retrieval/eventRetrievalService';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

export class EventsController {
  /**
   * GET /api/events
   * List recent events
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const events = await eventRepository.listRecent(50, req.userId);
      
      res.json({
        success: true,
        data: {
          events,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * GET /api/events/:eventId
   * Get event by ID with supporting memories
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { eventId } = req.params;
      
      const event = await eventRepository.findById(eventId);
      const links = await memoryEventLinkRepository.findByEventId(eventId);
      
      // Fetch all memories
      const memories = await Promise.all(
        links.map(link => memoryRepository.findById(link.memoryId))
      );
      
      // Organize by relationship type
      const memoryMap = new Map(memories.map(m => [m.id, m]));
      
      const primaryMemory = links
        .filter(l => l.relationshipType === 'primary')
        .map(l => memoryMap.get(l.memoryId))
        .filter(Boolean)[0];
      
      const supportingMemories = links
        .filter(l => l.relationshipType === 'supporting')
        .map(l => memoryMap.get(l.memoryId))
        .filter(Boolean);
      
      const contextMemories = links
        .filter(l => l.relationshipType === 'context')
        .map(l => memoryMap.get(l.memoryId))
        .filter(Boolean);
      
      res.json({
        success: true,
        data: {
          event,
          primaryMemory,
          supportingMemories,
          contextMemories,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * POST /api/events/search
   * Search events by semantic similarity
   */
  async search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, limit = 10, filters = {} } = req.body;
      
      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Query is required',
        });
        return;
      }
      
      logger.info('Event search request', { query, limit, filters });
      
      const result = await eventRetrievalService.search(query, limit, filters, req.userId);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const eventsController = new EventsController();
