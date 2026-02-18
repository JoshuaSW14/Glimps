/**
 * Embedding Service
 * Phase 2: Generate embeddings using text-embedding-3-large
 */

import { openai } from './openaiClient';
import { logger } from '../../utils/logger';
import { AIServiceError } from '../../utils/errors';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';

export class EmbeddingService {
  private model = 'text-embedding-3-large';
  private dimensions = 2000; // Neon HNSW limit
  
  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    logger.info('Generating embedding', {
      textLength: text.length,
      model: this.model,
      dimensions: this.dimensions,
    });
    
    if (!text || text.trim().length === 0) {
      throw new AIServiceError('Embedding', 'Text cannot be empty');
    }
    
    try {
      const result = await withRetry(
        async () => {
          const response = await openai.embeddings.create({
            model: this.model,
            input: text,
            dimensions: this.dimensions, // CRITICAL: Must match database schema
          });
          
          return response.data[0].embedding;
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      logger.info('Embedding generated', {
        vectorLength: result.length,
      });
      
      // Verify dimensions
      if (result.length !== this.dimensions) {
        throw new AIServiceError(
          'Embedding',
          `Expected ${this.dimensions} dimensions, got ${result.length}`
        );
      }
      
      return result;
    } catch (error) {
      logger.error('Embedding generation failed', error);
      throw new AIServiceError(
        'Embedding',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
  
  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    logger.info('Generating embeddings (batch)', {
      count: texts.length,
      model: this.model,
      dimensions: this.dimensions,
    });
    
    if (texts.length === 0) {
      return [];
    }
    
    try {
      const result = await withRetry(
        async () => {
          const response = await openai.embeddings.create({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
          });
          
          return response.data.map(item => item.embedding);
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      logger.info('Embeddings generated (batch)', {
        count: result.length,
      });
      
      return result;
    } catch (error) {
      logger.error('Batch embedding generation failed', error);
      throw new AIServiceError(
        'Embedding',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export const embeddingService = new EmbeddingService();
