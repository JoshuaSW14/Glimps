/**
 * Retry Utility
 * Phase 2: Exponential backoff for transient failures
 */

import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  backoffMs: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, backoffMs, onRetry } = options;
  
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const delay = backoffMs * Math.pow(2, attempt);
        
        logger.warn('Retry attempt', {
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: lastError.message,
        });
        
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }
        
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
