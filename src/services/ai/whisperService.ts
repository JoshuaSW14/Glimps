/**
 * Whisper Service
 * Phase 2: Speech-to-text transcription
 */

import fs from 'fs';
import { openai } from './openaiClient';
import { logger } from '../../utils/logger';
import { AIServiceError } from '../../utils/errors';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export class WhisperService {
  /**
   * Transcribe an audio file to text
   */
  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    logger.info('Starting transcription', { audioPath });
    
    try {
      const result = await withRetry(
        async () => {
          const fileStream = fs.createReadStream(audioPath);
          
          const response = await openai.audio.transcriptions.create({
            file: fileStream,
            model: 'whisper-1',
            response_format: 'verbose_json', // Includes language and duration
          });
          
          return response;
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      logger.info('Transcription completed', {
        textLength: result.text.length,
        language: result.language,
        duration: result.duration,
      });
      
      return {
        text: result.text,
        language: result.language,
        duration: result.duration,
      };
    } catch (error) {
      logger.error('Transcription failed', error);
      throw new AIServiceError(
        'Whisper',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export const whisperService = new WhisperService();
