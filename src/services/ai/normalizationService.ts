/**
 * Normalization Service
 * Phase 2: Text normalization using GPT-4o-mini
 */

import { openai } from './openaiClient';
import { logger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';

export class NormalizationService {
  private systemPrompt = `You are a text normalizer for a personal memory system.

Your task is to clean and normalize text while preserving the meaning and essential details.

Rules:
1. Remove filler words (um, uh, like, you know, etc.)
2. Fix grammatical errors
3. Maintain first-person perspective
4. Preserve all facts, names, dates, and locations
5. Keep the tone natural and conversational
6. Do NOT add information that wasn't present
7. If the input is already clean, return it unchanged
8. Output only the normalized text, no explanations

Examples:
Input: "Um, so like, I went to the park today, you know, and I saw Sarah there"
Output: "I went to the park today and saw Sarah there"

Input: "I met with John at 3pm about the project"
Output: "I met with John at 3pm about the project"`;

  /**
   * Normalize text by removing filler words and improving grammar
   */
  async normalize(text: string): Promise<string> {
    logger.info('Starting text normalization', { textLength: text.length });
    
    // If text is very short or already clean, skip normalization
    if (text.length < 20 || this.isAlreadyClean(text)) {
      logger.info('Text is already clean, skipping normalization');
      return text.trim();
    }
    
    try {
      const result = await withRetry(
        async () => {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: this.systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.3, // Low temperature for consistency
            max_tokens: 500,
          });
          
          return response.choices[0].message.content || text;
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      const normalized = result.trim();
      
      logger.info('Text normalization completed', {
        originalLength: text.length,
        normalizedLength: normalized.length,
      });
      
      return normalized;
    } catch (error) {
      // Graceful fallback: if normalization fails, use original text
      logger.warn('Text normalization failed, using original text', { error });
      return text.trim();
    }
  }
  
  /**
   * Quick heuristic to check if text is already clean
   */
  private isAlreadyClean(text: string): boolean {
    const fillerWords = ['um', 'uh', 'like', 'you know', 'so like'];
    const lowerText = text.toLowerCase();
    return !fillerWords.some(filler => lowerText.includes(filler));
  }
}

export const normalizationService = new NormalizationService();
