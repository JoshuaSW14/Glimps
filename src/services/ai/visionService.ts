/**
 * Vision Service
 * Phase 2: Image captioning using GPT-4 Vision
 */

import fs from 'fs';
import { openai } from './openaiClient';
import { logger } from '../../utils/logger';
import { AIServiceError } from '../../utils/errors';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';

export interface CaptionResult {
  caption: string;
  details?: string;
}

export class VisionService {
  /**
   * Generate a caption for an image
   */
  async caption(imagePath: string): Promise<CaptionResult> {
    logger.info('Starting image captioning', { imagePath });
    
    try {
      const result = await withRetry(
        async () => {
          // Read image as base64
          const imageBuffer = fs.readFileSync(imagePath);
          const base64Image = imageBuffer.toString('base64');
          
          // Determine image type from extension
          const ext = imagePath.split('.').pop()?.toLowerCase();
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Using mini for cost efficiency
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Describe this image in detail as if you are capturing a personal memory. Include what you see, where it might be, and any notable details. Be concise but descriptive (2-3 sentences).',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Image}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 300,
          });
          
          return response.choices[0].message.content || '';
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      logger.info('Image captioning completed', {
        captionLength: result.length,
      });
      
      return {
        caption: result.trim(),
      };
    } catch (error) {
      logger.error('Image captioning failed', error);
      throw new AIServiceError(
        'Vision',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export const visionService = new VisionService();
