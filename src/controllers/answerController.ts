/**
 * Answer Controller
 * Phase 4: HTTP handlers for Q&A
 */

import { Response, NextFunction } from 'express';
import { answerService } from '../services/answer/answerService';
import { retrievalLogRepository } from '../db/repositories';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';

export class AnswerController {
  /**
   * POST /api/ask
   * Ask a question and get an answer based on memories (scoped to authenticated user)
   */
  async ask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { question } = req.body;
      
      if (!question || typeof question !== 'string') {
        throw new ValidationError('Question is required and must be a string');
      }
      
      if (question.trim().length === 0) {
        throw new ValidationError('Question cannot be empty');
      }
      
      logger.info('Question received', { question });
      
      const userId = req.userId!;
      const result = await answerService.generateAnswer(question, userId);

      // Log the retrieval for per-user audit trail
      await retrievalLogRepository.create({
        userId,
        userQuery: question,
        memoryIds: result.memoryIds,
        searchMetadata: {
          confidence: result.confidence,
          memoryCount: result.memories.length,
          searchTimeMs: result.searchTimeMs,
          answerTimeMs: result.answerTimeMs,
        },
      });

      res.json({
        ok: true,
        data: {
          answer: result.answer,
          confidence: result.confidence,
          memories: result.memories.map(m => ({
            id: m.id,
            transcript: m.transcript,
            capturedAt: m.capturedAt,
            mediaType: m.mediaType,
            locationName: m.locationName,
          })),
          events: result.events,
          eventIds: result.eventIds,
          metadata: {
            searchTimeMs: result.searchTimeMs,
            answerTimeMs: result.answerTimeMs,
            totalTimeMs: result.searchTimeMs + result.answerTimeMs,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const answerController = new AnswerController();
