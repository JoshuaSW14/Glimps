/**
 * Upload Controller
 * Phase 3: Signed URL flow — request URL (auth) and handle signed upload (no auth).
 */

import { Response, NextFunction } from 'express';
import { signedUrlService } from '../services/storage/signedUrlService';
import { storageService } from '../services/storage/storageService';
import { memoryRepository, memoryContextRepository } from '../db/repositories';
import { memoryPipeline } from '../services/pipeline/memoryPipeline';
import { logger } from '../utils/logger';
import { ValidationError, DatabaseError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';
import { serializeMemory } from '../utils/serializeMemory';
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
        ok: true,
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
   * Public (no auth). Query: fileKey, signature, expires. Body: multipart file + optional metadata fields.
   * Verifies signature, stores file, creates memory + context, runs pipeline.
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
        res.status(403).json({ ok: false, error: { code: 'INVALID_UPLOAD_LINK', message: 'Invalid or expired upload link' } });
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

      // Parse metadata from multipart body fields
      const capturedAtRaw = req.body.capturedAt as string | undefined;
      const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();
      const latitude = req.body.latitude != null ? parseFloat(req.body.latitude) : undefined;
      const longitude = req.body.longitude != null ? parseFloat(req.body.longitude) : undefined;
      const locationName = req.body.locationName as string | undefined;
      const notesRaw = req.body.notes;
      const notes = typeof notesRaw === 'string' ? notesRaw.trim() : undefined;
      if (notes && notes.length > 500) {
        throw new ValidationError('notes must be 500 characters or fewer');
      }

      const ext = fileKey.split('.').pop()?.toLowerCase() || '';
      const voiceExts = ['m4a', 'mp4', 'mp3', 'wav', 'webm'];
      const modality: Modality = voiceExts.includes(ext) ? ('voice' as Modality) : ('image' as Modality);

      const storedFile = await storageService.storeFileFromBuffer(
        file.buffer,
        fileKey,
        file.mimetype
      );

      const fileMetadata: Record<string, unknown> = {
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
      const mediaType = modality === 'voice' ? MediaType.Audio : MediaType.Photo;

      // SECURITY: If the user doesn't exist in our DB, reject — no orphan memories.
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
          logger.warn('Signed upload rejected: user not found in DB', { userId });
          res.status(403).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Upload user not recognized' } });
          return;
        }
        throw err;
      }

      // Persist initial context before the pipeline runs so AI sees user notes immediately.
      const hasLocation = latitude != null && longitude != null;
      if (hasLocation || locationName || notes) {
        await memoryContextRepository.upsert({
          memoryId: memory.id,
          userNote: notes || undefined,
          latitude: hasLocation ? latitude : undefined,
          longitude: hasLocation ? longitude : undefined,
          locationName,
          confirmed: true,
        });
      }

      memoryPipeline.processMemory({
        memoryId: memory.id,
        metadata: {
          ...fileMetadata,
          latitude: hasLocation ? latitude : undefined,
          longitude: hasLocation ? longitude : undefined,
          locationName,
        },
        userId,
      }).catch((error) => {
        logger.error('Async pipeline failed after signed upload', { error, memoryId: memory.id });
      });

      logger.info('Signed upload accepted', {
        memoryId: memory.id,
        fileKey,
        capturedAt,
        hasLocation,
        hasNotes: !!notes,
      });

      res.status(201).json({
        ok: true,
        data: {
          memory: serializeMemory(memory),
          processingTimeMs: 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
