/**
 * OpenAI Client
 * Phase 2: Shared OpenAI client instance
 */

import OpenAI from 'openai';
import { config } from '../../config';

export const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});
