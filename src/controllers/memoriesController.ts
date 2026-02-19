/**
 * Memories Controller
 * SECURITY: All repo calls pass userId — ownership is enforced at the DB layer.
 */

import { Response, NextFunction } from 'express';
import path from 'path';
import {
  memoryRepository,
  memoryContextRepository,
  memoryTagRepository,
  memoryPeopleRepository,
  memoryLabelRepository,
  labelRepository,
} from '../db/repositories';
import { storageService } from '../services/storage/storageService';
import { memoryPipeline } from '../services/pipeline/memoryPipeline';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { serializeMemory } from '../utils/serializeMemory';
import { MemorySourceEnum, MediaType, ProcessingStatus, TagOrigin, Modality } from '../types';
import { AuthRequest } from '../middleware/auth';

export class MemoriesController {
  /**
   * POST /api/memories/upload
   */
  async upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const file = req.file;
      const modality = req.body.modality as Modality;
      const capturedAt = req.body.recordedAt ? new Date(req.body.recordedAt) : new Date();

      const metadata: Record<string, any> = {};
      if (req.body.latitude) metadata.latitude = parseFloat(req.body.latitude);
      if (req.body.longitude) metadata.longitude = parseFloat(req.body.longitude);
      if (req.body.locationName) metadata.locationName = req.body.locationName;

      logger.info('Memory upload request', { modality, fileSize: file!.size });

      const storedFile = await storageService.storeFile(file!, modality);
      metadata.originalFilename = storedFile.originalName;
      metadata.fileSize = storedFile.size;
      metadata.mimeType = storedFile.mimeType;

      const mediaType = modality === 'voice' ? MediaType.Audio : MediaType.Photo;
      const memory = await memoryRepository.create({
        userId,
        capturedAt,
        source: MemorySourceEnum.Upload,
        mediaType,
        storagePath: storedFile.path,
        processingStatus: ProcessingStatus.Pending,
      });

      const result = await memoryPipeline.processMemory({ memoryId: memory.id, metadata, userId });

      logger.info('Memory upload completed', { memoryId: result.memory.id });

      res.status(201).json({ ok: true, data: { memory: serializeMemory(result.memory), processingTimeMs: result.processingTimeMs } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/memories/:id/retry
   */
  async retryProcessing(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      // Ownership enforced by findById with userId
      await memoryRepository.findById(memoryId, userId);
      logger.info('Retry processing request', { memoryId });
      const result = await memoryPipeline.retryFailedMemory(memoryId);
      res.json({ ok: true, data: { memory: serializeMemory(result.memory), processingTimeMs: result.processingTimeMs } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      if (limit < 1 || limit > 100) throw new ValidationError('Limit must be between 1 and 100');
      const memories = await memoryRepository.listRecentWithContext(limit, userId);
      res.json({ ok: true, data: { memories: memories.map(serializeMemory), count: memories.length } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id/asset
   */
  async getAsset(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      // findById enforces ownership
      const memory = await memoryRepository.findById(id, userId);

      const buffer = await storageService.readFile(memory.storagePath);
      const ext = path.extname(memory.storagePath).toLowerCase();
      const mimeByExt: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp',
        '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav', '.webm': 'audio/webm',
      };
      const contentType = mimeByExt[ext] ?? 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id/labels
   */
  async getMemoryLabels(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      await memoryRepository.findById(memoryId, userId); // ownership check
      const labelIds = await memoryLabelRepository.getLabelIdsByMemoryId(memoryId);
      const labels = await Promise.all(
        labelIds.map((lid) => labelRepository.findById(lid, userId).catch(() => null))
      ).then((list) => list.filter(Boolean));
      res.json({ ok: true, data: { labels } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/memories/:id/labels
   */
  async addLabelToMemory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      const { labelId } = req.body;
      if (!labelId) throw new ValidationError('labelId is required');
      // Both ownership checks happen in the repos
      await memoryRepository.findById(memoryId, userId);
      await labelRepository.findById(labelId, userId);
      await memoryLabelRepository.addLabelToMemory(memoryId, labelId);
      const labelIds = await memoryLabelRepository.getLabelIdsByMemoryId(memoryId);
      const labels = await Promise.all(
        labelIds.map((lid) => labelRepository.findById(lid, userId).catch(() => null))
      ).then((list) => list.filter(Boolean));
      res.status(201).json({ ok: true, data: { labels } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/memories/:id/labels/:labelId
   */
  async removeLabelFromMemory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId, labelId } = req.params;
      await memoryRepository.findById(memoryId, userId);
      await labelRepository.findById(labelId, userId);
      await memoryLabelRepository.removeLabelFromMemory(memoryId, labelId);
      res.json({ ok: true, data: { removed: true } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const memory = await memoryRepository.findByIdWithContext(id, userId);
      res.json({ ok: true, data: { memory: serializeMemory(memory) } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/memories/:id/context
   */
  async getContext(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      // Retry once on NotFound — pipeline may still be committing
      let verified = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await memoryRepository.findById(memoryId, userId);
          verified = true;
          break;
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
          else throw new Error(`Memory ${memoryId} not found`);
        }
      }
      if (!verified) return;
      const [context, tags, people] = await Promise.all([
        memoryContextRepository.findByMemoryId(memoryId),
        memoryTagRepository.findByMemoryId(memoryId),
        memoryPeopleRepository.findByMemoryId(memoryId),
      ]);
      res.json({
        ok: true,
        data: {
          context: context
            ? { userNote: context.userNote, locationName: context.locationName, latitude: context.latitude, longitude: context.longitude, confirmed: context.confirmed }
            : null,
          tags: tags.map((t) => ({ tag: t.tag, confidence: t.confidence, origin: t.origin })),
          people: people.map((p) => ({ personName: p.personName, confidence: p.confidence, confirmed: p.confirmed })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/memories/:id/context
   */
  async updateContext(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      // Retry once — memory may still be committing after upload
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await memoryRepository.findById(memoryId, userId);
          break;
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
          else throw new Error(`Memory ${memoryId} not found`);
        }
      }
      const body = req.body as {
        userNote?: string; locationName?: string;
        latitude?: number; longitude?: number;
        tags?: string[]; people?: string[];
      };
      const hasContext = body.userNote !== undefined || body.locationName !== undefined || body.latitude !== undefined || body.longitude !== undefined;
      if (hasContext) {
        await memoryContextRepository.upsert({ memoryId, userNote: body.userNote, locationName: body.locationName, latitude: body.latitude, longitude: body.longitude, confirmed: true });
      }
      if (Array.isArray(body.tags)) {
        const existing = await memoryTagRepository.findByMemoryId(memoryId);
        const aiTags = new Set(existing.filter((t) => t.origin === 'ai').map((t) => t.tag));
        for (const tag of body.tags.filter((t) => t?.trim())) {
          if (!aiTags.has(tag)) await memoryTagRepository.create({ memoryId, tag: tag.trim(), origin: TagOrigin.User });
        }
      }
      if (Array.isArray(body.people)) {
        for (const name of body.people) {
          if (!name?.trim()) continue;
          await memoryPeopleRepository.create({ memoryId, personName: name.trim(), confirmed: true });
        }
      }
      const [context, tags, people] = await Promise.all([
        memoryContextRepository.findByMemoryId(memoryId),
        memoryTagRepository.findByMemoryId(memoryId),
        memoryPeopleRepository.findByMemoryId(memoryId),
      ]);
      res.json({
        ok: true,
        data: {
          context: context ? { userNote: context.userNote, locationName: context.locationName, latitude: context.latitude, longitude: context.longitude, confirmed: context.confirmed } : null,
          tags: tags.map((t) => ({ tag: t.tag, confidence: t.confidence, origin: t.origin })),
          people: people.map((p) => ({ personName: p.personName, confidence: p.confidence, confirmed: p.confirmed })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/memories/:id/confirm-ai
   */
  async confirmAi(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id: memoryId } = req.params;
      await memoryRepository.findById(memoryId, userId);
      const body = req.body as { place?: boolean; people?: string[]; tags?: string[] };
      if (body.place === true) {
        const ctx = await memoryContextRepository.findByMemoryId(memoryId);
        if (ctx) await memoryContextRepository.update(memoryId, { confirmed: true });
      }
      if (Array.isArray(body.people)) {
        for (const name of body.people) {
          if (!name?.trim()) continue;
          await memoryPeopleRepository.setConfirmed(memoryId, name.trim(), true);
        }
      }
      if (Array.isArray(body.tags)) {
        const existing = await memoryTagRepository.findByMemoryId(memoryId);
        for (const tag of body.tags) {
          if (!tag?.trim()) continue;
          const found = existing.find((t) => t.tag.toLowerCase() === tag.trim().toLowerCase());
          if (found) {
            await memoryTagRepository.deleteByMemoryIdAndTag(memoryId, found.tag);
            await memoryTagRepository.create({ memoryId, tag: found.tag, origin: TagOrigin.User });
          }
        }
      }
      const [context, tags, people] = await Promise.all([
        memoryContextRepository.findByMemoryId(memoryId),
        memoryTagRepository.findByMemoryId(memoryId),
        memoryPeopleRepository.findByMemoryId(memoryId),
      ]);
      res.json({
        ok: true,
        data: {
          context: context ? { userNote: context.userNote, locationName: context.locationName, latitude: context.latitude, longitude: context.longitude, confirmed: context.confirmed } : null,
          tags: tags.map((t) => ({ tag: t.tag, confidence: t.confidence, origin: t.origin })),
          people: people.map((p) => ({ personName: p.personName, confidence: p.confidence, confirmed: p.confirmed })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const memoriesController = new MemoriesController();
