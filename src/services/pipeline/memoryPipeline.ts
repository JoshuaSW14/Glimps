/**
 * Memory Processing Pipeline
 * Phase 2: Orchestrates the end-to-end memory ingestion flow
 */

import { withTransaction } from '../../db';
import {
  memorySourceRepository,
  memoryRepository,
  memoryEmbeddingRepository,
} from '../../db/repositories';
import { storageService } from '../storage/storageService';
import {
  whisperService,
  visionService,
  normalizationService,
  embeddingService,
} from '../ai';
import { logger } from '../../utils/logger';
import { ProcessingError } from '../../utils/errors';
import { Modality, Memory, ProcessingStatus } from '../../types';

export interface ProcessMemoryInput {
  memorySourceId: string;
  recordedAt: Date;
  modality: Modality;
  storagePath: string;
  metadata?: Record<string, any>;
  userId?: string;
}

export interface ProcessMemoryResult {
  memory: Memory;
  processingTimeMs: number;
}

export class MemoryPipeline {
  /**
   * Process a memory through the complete pipeline:
   * 1. Transcribe/caption (Whisper or Vision)
   * 2. Normalize text (GPT-4o-mini)
   * 3. Generate embedding (text-embedding-3-large)
   * 4. Store in database (transaction)
   */
  async processMemory(input: ProcessMemoryInput): Promise<ProcessMemoryResult> {
    const startTime = Date.now();
    
    logger.info('Starting memory processing pipeline', {
      memorySourceId: input.memorySourceId,
      modality: input.modality,
    });
    
    try {
      // Update status to 'processing'
      await memorySourceRepository.updateStatus(
        input.memorySourceId,
        ProcessingStatus.Processing
      );
      
      // Step 1: Extract text (transcribe or caption)
      const rawText = await this.extractText(input.storagePath, input.modality);
      
      // Step 2: Normalize text
      const normalizedText = await normalizationService.normalize(rawText);
      
      // Step 3: Generate summary (optional, using first sentence for now)
      const aiSummary = this.generateSummary(normalizedText);
      
      // Step 4: Generate embedding
      const embedding = await embeddingService.generateEmbedding(normalizedText);
      
      // Step 5: Store everything in a transaction
      const result = await withTransaction(async (client) => {
        // Create memory
        const memory = await memoryRepository.create(
          {
            memorySourceId: input.memorySourceId,
            userId: input.userId,
            recordedAt: input.recordedAt,
            modality: input.modality,
            rawText,
            normalizedText,
            aiSummary,
            latitude: input.metadata?.latitude,
            longitude: input.metadata?.longitude,
            locationName: input.metadata?.locationName,
          },
          client
        );
        
        // Create embedding
        await memoryEmbeddingRepository.create(
          {
            memoryId: memory.id,
            embedding,
          },
          client
        );
        
        return memory;
      });
      
      // Update status to 'completed'
      await memorySourceRepository.updateStatus(
        input.memorySourceId,
        ProcessingStatus.Completed
      );
      
      const processingTimeMs = Date.now() - startTime;
      
      logger.info('Memory processing completed', {
        memoryId: result.id,
        memorySourceId: input.memorySourceId,
        processingTimeMs,
      });
      
      // Trigger event formation asynchronously (fire-and-forget)
      // Don't await - let it run in background
      this.triggerEventFormation(result.id).catch(error => {
        logger.error('Event formation failed (async)', { error, memoryId: result.id });
      });
      
      return {
        memory: result,
        processingTimeMs,
      };
    } catch (error) {
      // Update status to 'failed' with error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await memorySourceRepository.updateStatus(
        input.memorySourceId,
        ProcessingStatus.Failed,
        errorMessage
      );
      
      logger.error('Memory processing failed', error, {
        memorySourceId: input.memorySourceId,
      });
      
      throw new ProcessingError(
        `Failed to process memory: ${errorMessage}`,
        { memorySourceId: input.memorySourceId }
      );
    }
  }
  
  /**
   * Extract text from file based on modality
   */
  private async extractText(storagePath: string, modality: Modality): Promise<string> {
    const absolutePath = storageService.getAbsolutePath(storagePath);
    
    logger.info('Extracting text', { modality, path: storagePath });
    
    if (modality === 'voice') {
      const result = await whisperService.transcribe(absolutePath);
      return result.text;
    } else {
      const result = await visionService.caption(absolutePath);
      return result.caption;
    }
  }
  
  /**
   * Trigger event formation for a memory (async, non-blocking)
   */
  private async triggerEventFormation(memoryId: string): Promise<void> {
    const { eventFormationService } = await import('../events/eventFormationService');
    
    logger.info('Triggering event formation', { memoryId });
    await eventFormationService.processMemory(memoryId);
  }
  
  /**
   * Generate a short summary (first sentence or truncated text)
   */
  private generateSummary(text: string, maxLength: number = 100): string {
    // Try to get first sentence
    const firstSentence = text.split(/[.!?]/)[0].trim();
    
    if (firstSentence.length > 0 && firstSentence.length <= maxLength) {
      return firstSentence;
    }
    
    // Fallback: truncate to maxLength
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Retry a failed memory source
   */
  async retryFailedMemory(memorySourceId: string): Promise<ProcessMemoryResult> {
    logger.info('Retrying failed memory', { memorySourceId });
    
    // Get memory source
    const source = await memorySourceRepository.findById(memorySourceId);
    
    if (source.processingStatus !== ProcessingStatus.Failed) {
      throw new ProcessingError(
        `Memory source is not in failed state: ${source.processingStatus}`
      );
    }
    
    // Reset status and retry
    await memorySourceRepository.updateStatus(memorySourceId, ProcessingStatus.Pending);
    
    return this.processMemory({
      memorySourceId: source.id,
      recordedAt: new Date(), // Use current time for retry
      modality: source.modality,
      storagePath: source.storagePath,
      metadata: source.metadata,
    });
  }
}

export const memoryPipeline = new MemoryPipeline();
