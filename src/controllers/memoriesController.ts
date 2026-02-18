/**
 * Memories Controller
 * Phase 2: HTTP handlers for memory operations
 */

import { Response, NextFunction } from 'express';
import path from 'path';
import { memorySourceRepository, memoryRepository, memoryLabelRepository, labelRepository } from '../db/repositories';
import { storageService } from '../services/storage/storageService';
import { memoryPipeline } from '../services/pipeline/memoryPipeline';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';
import { Modality } from '../types';
import { AuthRequest } from '../middleware/auth';

export class MemoriesController {
  /**
   * POST /api/memories/upload
   * Upload and process a new memory (voice or image)
   */
  async upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      const modality = req.body.modality as Modality;
      const recordedAt = req.body.recordedAt
        ? new Date(req.body.recordedAt)
        : new Date();
      
      // Parse optional metadata
      const metadata: Record<string, any> = {};
      
      if (req.body.latitude) {
        metadata.latitude = parseFloat(req.body.latitude);
      }
      if (req.body.longitude) {
        metadata.longitude = parseFloat(req.body.longitude);
      }
      if (req.body.locationName) {
        metadata.locationName = req.body.locationName;
      }
      
      logger.info('Memory upload request', {
        modality,
        fileSize: file!.size,
        originalName: file!.originalname,
        metadata,
      });
      
      // Step 1: Store file
      const storedFile = await storageService.storeFile(file!, modality);
      
      // Add file metadata
      metadata.originalFilename = storedFile.originalName;
      metadata.fileSize = storedFile.size;
      metadata.mimeType = storedFile.mimeType;
      
      // Step 2: Create memory source
      const userId = req.userId;
      const memorySource = await memorySourceRepository.create({
        modality,
        storagePath: storedFile.path,
        metadata,
        ...(userId && { userId }),
      });
      
      // Step 3: Process memory (synchronous for Phase 2)
      const result = await memoryPipeline.processMemory({
        memorySourceId: memorySource.id,
        recordedAt,
        modality,
        storagePath: storedFile.path,
        metadata,
        ...(userId && { userId }),
      });
      
      logger.info('Memory upload completed', {
        memoryId: result.memory.id,
        processingTimeMs: result.processingTimeMs,
      });
      
      res.status(201).json({
        success: true,
        data: {
          memory: result.memory,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * GET /api/memories/sources/:sourceId
   * Get memory source status
   */
  async getSourceStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId } = req.params;
      
      const source = await memorySourceRepository.findById(sourceId);
      
      // Try to get associated memory
      const memory = await memoryRepository.findBySourceId(sourceId);
      
      res.json({
        success: true,
        data: {
          source,
          memory,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * POST /api/memories/sources/:sourceId/retry
   * Retry failed memory processing
   */
  async retryProcessing(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sourceId } = req.params;
      
      logger.info('Retry processing request', { sourceId });
      
      const result = await memoryPipeline.retryFailedMemory(sourceId);
      
      res.json({
        success: true,
        data: {
          memory: result.memory,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * GET /api/memories
   * List recent memories
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 20;
      
      if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
      }
      
      const memories = await memoryRepository.listRecent(limit, req.userId);
      
      res.json({
        success: true,
        data: {
          memories,
          count: memories.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * GET /api/memories/:id/asset
   * Stream the raw file (image or voice) for a memory. Auth required; user must own the memory.
   */
  async getAsset(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const memory = await memoryRepository.findById(id);

      if (req.userId != null) {
        if (memory.userId == null || memory.userId !== req.userId) {
          throw new NotFoundError('Memory', id);
        }
      }

      const source = await memorySourceRepository.findById(memory.memorySourceId);
      const buffer = await storageService.readFile(source.storagePath);
      const ext = path.extname(source.storagePath).toLowerCase();
      const mimeByExt: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.m4a': 'audio/mp4',
        '.mp4': 'audio/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.webm': 'audio/webm',
      };
      const contentType = mimeByExt[ext] ?? (source.metadata?.mimeType as string) ?? 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id/labels
   * Get labels for a memory
   */
  async getMemoryLabels(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: memoryId } = req.params;
      const memory = await memoryRepository.findById(memoryId);
      if (req.userId != null && (memory.userId == null || memory.userId !== req.userId)) {
        throw new NotFoundError('Memory', memoryId);
      }
      const labelIds = await memoryLabelRepository.getLabelIdsByMemoryId(memoryId);
      const labels = await Promise.all(
        labelIds.map((lid) => labelRepository.findById(lid).catch(() => null))
      ).then((list) => list.filter(Boolean));
      res.json({
        success: true,
        data: { labels },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/memories/:id/labels
   * Add a label to a memory (body: { labelId })
   */
  async addLabelToMemory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      const { labelId } = req.body;
      if (!labelId) {
        throw new ValidationError('labelId is required');
      }
      const memory = await memoryRepository.findById(memoryId);
      if (memory.userId != null && memory.userId !== userId) {
        throw new NotFoundError('Memory', memoryId);
      }
      const label = await labelRepository.findById(labelId);
      if (label.userId !== userId) {
        throw new NotFoundError('Label', labelId);
      }
      await memoryLabelRepository.addLabelToMemory(memoryId, labelId);
      const labelIds = await memoryLabelRepository.getLabelIdsByMemoryId(memoryId);
      const labels = await Promise.all(
        labelIds.map((lid) => labelRepository.findById(lid).catch(() => null))
      ).then((list) => list.filter(Boolean));
      res.status(201).json({
        success: true,
        data: { labels },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/memories/:id/labels/:labelId
   * Remove a label from a memory
   */
  async removeLabelFromMemory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId, labelId } = req.params;
      const memory = await memoryRepository.findById(memoryId);
      if (memory.userId != null && memory.userId !== userId) {
        throw new NotFoundError('Memory', memoryId);
      }
      const label = await labelRepository.findById(labelId);
      if (label.userId !== userId) {
        throw new NotFoundError('Label', labelId);
      }
      await memoryLabelRepository.removeLabelFromMemory(memoryId, labelId);
      res.json({
        success: true,
        data: { removed: true },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id
   * Get memory by ID
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      const memory = await memoryRepository.findById(id);
      
      res.json({
        success: true,
        data: {
          memory,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const memoriesController = new MemoriesController();
