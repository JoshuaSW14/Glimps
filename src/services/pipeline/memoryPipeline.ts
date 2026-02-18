/**
 * Memory Processing Pipeline
 * Semantic memory graph: load memory by id, extract text, embed, update memory, create embedding.
 */

import { withTransaction } from '../../db';
import {
  memoryRepository,
  memoryEmbeddingRepository,
  memoryContextRepository,
} from '../../db/repositories';
import { storageService } from '../storage/storageService';
import {
  whisperService,
  visionService,
  normalizationService,
  embeddingService,
} from '../ai';
import { getCaptureDateFromExif } from '../../utils/exif';
import { contextInferenceService } from '../context/contextInferenceService';
import { logger } from '../../utils/logger';
import { ProcessingError } from '../../utils/errors';
import { Memory, ProcessingStatus, MediaType } from '../../types';

export interface ProcessMemoryInput {
  memoryId: string;
  metadata?: Record<string, any>;
  userId?: string;
}

export interface ProcessMemoryResult {
  memory: Memory;
  processingTimeMs: number;
}

export class MemoryPipeline {
  /**
   * Process a memory: extract text (transcribe/caption), normalize, embed, update memory and create embedding.
   * Optionally create memory_context from metadata (location).
   */
  async processMemory(input: ProcessMemoryInput): Promise<ProcessMemoryResult> {
    const startTime = Date.now();
    const { memoryId, metadata, userId } = input;

    logger.info('Starting memory processing pipeline', { memoryId });

    let memory = await memoryRepository.findById(memoryId);
    if (memory.processingStatus !== ProcessingStatus.Pending) {
      throw new ProcessingError(`Memory is not pending: ${memory.processingStatus}`, { memoryId });
    }

    try {
      if (memory.mediaType === MediaType.Photo) {
        const absolutePath = storageService.getAbsolutePath(memory.storagePath);
        const exifDate = await getCaptureDateFromExif(absolutePath);
        if (exifDate) {
          await memoryRepository.update(memoryId, { capturedAt: exifDate });
          memory = await memoryRepository.findById(memoryId);
        }
      }

      await memoryRepository.update(memoryId, { processingStatus: ProcessingStatus.Processing });

      const rawText = await this.extractText(memory.storagePath, memory.mediaType);
      const normalizedText = await normalizationService.normalize(rawText);
      const aiSummary = this.generateSummary(normalizedText);
      const embedding = await embeddingService.generateEmbedding(normalizedText);

      const updated = await withTransaction(async (client) => {
        const mem = await memoryRepository.update(
          memoryId,
          {
            transcript: rawText,
            aiSummary,
            processingStatus: ProcessingStatus.Completed,
          },
          client
        );
        await memoryEmbeddingRepository.create(
          { memoryId, embedding },
          client
        );
        if (metadata?.latitude != null || metadata?.longitude != null || metadata?.locationName) {
          await memoryContextRepository.upsert(
            {
              memoryId,
              latitude: metadata.latitude,
              longitude: metadata.longitude,
              locationName: metadata.locationName,
              confirmed: true,
            },
            client
          );
        }
        return mem;
      });

      const processingTimeMs = Date.now() - startTime;

      logger.info('Memory processing completed', {
        memoryId: updated.id,
        processingTimeMs,
      });

      this.triggerEventFormation(memoryId).catch((err) => {
        logger.error('Event formation failed (async)', { error: err, memoryId });
      });

      contextInferenceService.inferAndStoreContext(memoryId, userId).catch((err) => {
        logger.error('Context inference failed (async)', { error: err, memoryId });
      });

      return { memory: updated, processingTimeMs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await memoryRepository.update(memoryId, {
        processingStatus: ProcessingStatus.Failed,
      });
      logger.error('Memory processing failed', { error, memoryId });
      throw new ProcessingError(`Failed to process memory: ${errorMessage}`, { memoryId });
    }
  }

  private async extractText(storagePath: string, mediaType: MediaType): Promise<string> {
    const absolutePath = storageService.getAbsolutePath(storagePath);
    logger.info('Extracting text', { mediaType, path: storagePath });

    if (mediaType === MediaType.Audio) {
      const result = await whisperService.transcribe(absolutePath);
      return result.text;
    }
    const result = await visionService.caption(absolutePath);
    return result.caption;
  }

  private async triggerEventFormation(memoryId: string): Promise<void> {
    const { eventFormationService } = await import('../events/eventFormationService');
    await eventFormationService.processMemory(memoryId);
  }

  private generateSummary(text: string, maxLength: number = 100): string {
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= maxLength) return firstSentence;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  async retryFailedMemory(memoryId: string): Promise<ProcessMemoryResult> {
    logger.info('Retrying failed memory', { memoryId });
    const memory = await memoryRepository.findById(memoryId);
    if (memory.processingStatus !== ProcessingStatus.Failed) {
      throw new ProcessingError(
        `Memory is not in failed state: ${memory.processingStatus}`,
        { memoryId }
      );
    }
    await memoryRepository.update(memoryId, { processingStatus: ProcessingStatus.Pending });
    return this.processMemory({
      memoryId,
      ...(memory.userId && { userId: memory.userId }),
    });
  }
}

export const memoryPipeline = new MemoryPipeline();
