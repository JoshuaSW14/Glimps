/**
 * Upload Controller
 * Phase 3: Signed URL flow — request URL (auth) and handle signed upload (no auth).
 */

import { Response, NextFunction } from 'express';
import { signedUrlService } from '../services/storage/signedUrlService';
import { storageService } from '../services/storage/storageService';
import { memoryRepository } from '../db/repositories';
import { memoryPipeline } from '../services/pipeline/memoryPipeline';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';
import { serializeMemory } from '../utils/serializeMemory';
import { DatabaseError } from '../utils/errors';
import { Modality, MemorySourceEnum, MediaType, ProcessingStatus } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UploadController {
  /**
   * POST /api/upload/request-url
   * Authenticated. Body: { fileType: 'voice' | 'image' }. Returns signed upload URL and metadata.
   */
  async requestUploadUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        return next(new ValidationError('User not authenticated'));
      }
      const fileType = req.body.fileType as 'voice' | 'image';
      if (!fileType || !['voice', 'image'].includes(fileType)) {
        throw new ValidationError('fileType must be "voice" or "image"');
      }

      const data = signedUrlService.generateUpload(userId, fileType);
      const uploadUrl = `/api/upload/signed?fileKey=${encodeURIComponent(data.fileKey)}&signature=${data.signature}&expires=${data.expiresAt}`;

      res.json({
        success: true,
        data: {
          uploadUrl,
          fileKey: data.fileKey,
          expiresAt: data.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/signed
   * Public (no auth). Query: fileKey, signature, expires. Body: multipart file.
   * Verifies signature, stores file, creates memory source, runs pipeline.
   */
  async handleSignedUpload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileKey = req.query.fileKey as string;
      const signature = req.query.signature as string;
      const expiresStr = req.query.expires as string;

      if (!fileKey || !signature || !expiresStr) {
        throw new ValidationError('Missing fileKey, signature, or expires');
      }
      const expires = parseInt(expiresStr, 10);
      if (Number.isNaN(expires)) {
        throw new ValidationError('Invalid expires');
      }
      if (!signedUrlService.verify(fileKey, signature, expires)) {
        res.status(403).json({ success: false, error: 'Invalid or expired upload link' });
        return;
      }

      const file = req.file;
      if (!file || !file.buffer) {
        throw new ValidationError('No file in request');
      }

      const userId = fileKey.split('/')[0];
      if (!UUID_REGEX.test(userId)) {
        throw new ValidationError('Invalid fileKey');
      }

      const ext = fileKey.split('.').pop()?.toLowerCase() || '';
      const voiceExts = ['m4a', 'mp4', 'mp3', 'wav', 'webm'];
      const modality: Modality = voiceExts.includes(ext) ? ('voice' as Modality) : ('image' as Modality);

      const storedFile = await storageService.storeFileFromBuffer(
        file.buffer,
        fileKey,
        file.mimetype
      );

      const metadata: Record<string, unknown> = {
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
      const capturedAt = new Date();
      const mediaType = modality === 'voice' ? MediaType.Audio : MediaType.Photo;

      // Try with userId first so the memory is owned and findable by the user. Only omit on FK violation.
      let memory: Awaited<ReturnType<typeof memoryRepository.create>>;
      try {
        memory = await memoryRepository.create({
          userId,
          capturedAt,
          source: MemorySourceEnum.Upload,
          mediaType,
          storagePath: storedFile.path,
          processingStatus: ProcessingStatus.Pending,
        });
      } catch (err) {
        const code = err instanceof DatabaseError ? (err.details as { code?: string })?.code : undefined;
        if (code === '23503') {
          logger.warn('Signed upload: user not in DB (FK), creating memory without user_id', { userId });
          memory = await memoryRepository.create({
            userId: undefined,
            capturedAt,
            source: MemorySourceEnum.Upload,
            mediaType,
            storagePath: storedFile.path,
            processingStatus: ProcessingStatus.Pending,
          });
        } else {
          throw err;
        }
      }

      const result = await memoryPipeline.processMemory({
        memoryId: memory.id,
        metadata,
        userId,
      });

      logger.info('Signed upload completed', {
        memoryId: result.memory.id,
        fileKey,
        processingTimeMs: result.processingTimeMs,
      });

      res.status(201).json({
        success: true,
        data: {
          memory: serializeMemory(result.memory),
          processingTimeMs: result.processingTimeMs,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
