/**
 * Event Synthesis Service
 * Phase 2: Generate event titles and summaries using LLM
 */

import { openai } from '../ai/openaiClient';
import { Memory } from '../../types';
import { logger } from '../../utils/logger';
import { AIServiceError } from '../../utils/errors';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';

/**
 * Result of event synthesis
 */
export interface EventSynthesis {
  title: string;
  summary: string;
  confidenceScore: number;
}

/**
 * Input for event synthesis
 */
export interface SynthesisInput {
  memories: Memory[];
  existingTitle?: string;
  existingSummary?: string;
}

export class EventSynthesisService {
  private readonly systemPrompt = `You are an event synthesis assistant for a personal memory system.

Your job: Given a list of memories (voice notes or photo captions) from the same timeframe, create:
1. A short, human-readable event title (2-6 words)
2. A one-paragraph summary of what happened
3. A confidence score (0-1) indicating how coherent these memories are as a single event

Rules:
- Titles should be natural like "Coffee with Sam" or "Morning at the park", not "Event 1" or "Memory Collection"
- Summaries should be first-person past tense, like recalling your own experience
- High confidence (0.8-1.0): Clear single event with temporal/spatial coherence
- Medium confidence (0.5-0.8): Related but spanning different sub-moments
- Low confidence (0-0.5): Loosely related or possibly multiple separate events

- Never make up details not in the memories
- If memories are too sparse, keep summary brief and confidence lower
- Focus on what happened, not analysis`;

  /**
   * Generate event title and summary from a cluster of memories
   */
  async synthesizeEvent(input: SynthesisInput): Promise<EventSynthesis> {
    const { memories, existingTitle, existingSummary } = input;
    
    if (memories.length === 0) {
      throw new AIServiceError('Event Synthesis', 'Cannot synthesize event from zero memories');
    }
    
    try {
      return await withRetry(async () => {
        const startTime = Date.now();
        
        // Build memory context
        const memoryContext = memories
          .map((m, i) => {
            const time = m.capturedAt.toLocaleString();
            const location = m.locationName ? ` at ${m.locationName}` : '';
            const text = m.transcript || '';
            return `[Memory ${i + 1}] ${time}${location}\n${text}`;
          })
          .join('\n\n');
        
        const userPrompt = this.buildUserPrompt(memoryContext, existingTitle, existingSummary);
        
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        
        const content = response.choices[0].message.content || '';
        const synthesis = this.parseResponse(content);
        
        const duration = Date.now() - startTime;
        logger.info('Event synthesis completed', {
          memoryCount: memories.length,
          title: synthesis.title,
          confidence: synthesis.confidenceScore,
          durationMs: duration,
        });
        
        return synthesis;
      }, {
        maxRetries: config.maxRetries,
        backoffMs: config.retryBackoffMs,
      });
    } catch (error) {
      logger.error('Event synthesis failed', { error, memoryCount: memories.length });
      
      // Fallback: generate basic title from timestamps
      const fallbackTitle = this.generateFallbackTitle(memories);
      return {
        title: fallbackTitle,
        summary: `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} from this time period.`,
        confidenceScore: 0.3, // Low confidence for fallback
      };
    }
  }
  
  /**
   * Build user prompt for synthesis
   */
  private buildUserPrompt(
    memoryContext: string,
    existingTitle?: string,
    existingSummary?: string
  ): string {
    let prompt = 'Memories:\n\n' + memoryContext + '\n\n';
    
    if (existingTitle || existingSummary) {
      prompt += 'This event already exists with:\n';
      if (existingTitle) prompt += `Title: ${existingTitle}\n`;
      if (existingSummary) prompt += `Summary: ${existingSummary}\n`;
      prompt += '\nUpdate the title and summary if the new memories significantly change the event. Otherwise, keep it stable.\n\n';
    }
    
    prompt += `Generate:
1. Title: (2-6 words, natural and specific)
2. Summary: (one paragraph, first-person past tense)
3. Confidence: (0.0-1.0)

Format your response as:
TITLE: [title here]
SUMMARY: [summary here]
CONFIDENCE: [score here]`;
    
    return prompt;
  }
  
  /**
   * Parse LLM response into EventSynthesis
   */
  private parseResponse(content: string): EventSynthesis {
    const titleMatch = content.match(/TITLE:\s*(.+?)(?:\n|$)/i);
    const summaryMatch = content.match(/SUMMARY:\s*(.+?)(?:\n(?:CONFIDENCE|$)|$)/is);
    const confidenceMatch = content.match(/CONFIDENCE:\s*([\d.]+)/i);
    
    const title = titleMatch?.[1]?.trim() || 'Untitled Event';
    const summary = summaryMatch?.[1]?.trim() || 'No summary available.';
    const confidenceScore = confidenceMatch?.[1] ? parseFloat(confidenceMatch[1]) : 0.5;
    
    return {
      title,
      summary,
      confidenceScore: Math.max(0, Math.min(1, confidenceScore)), // Clamp to [0, 1]
    };
  }
  
  /**
   * Generate fallback title when LLM fails
   */
  private generateFallbackTitle(memories: Memory[]): string {
    if (memories.length === 0) {
      return 'Untitled Event';
    }
    
    const date = memories[0].capturedAt;
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    const location = memories.find(m => m.locationName)?.locationName;
    
    if (location) {
      return `${timeStr} at ${location}`;
    }
    
    const dayStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    
    return `${dayStr} ${timeStr}`;
  }
  
  /**
   * Check if existing event needs updating based on new memories
   */
  shouldUpdateEvent(
    existingMemoryCount: number,
    newMemoryCount: number,
    lastUpdated: Date
  ): boolean {
    // Don't update if just added 1-2 memories to a large event
    if (existingMemoryCount >= 5 && newMemoryCount <= 2) {
      return false;
    }
    
    // Don't update if recently updated (within 1 hour)
    const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (60 * 60 * 1000);
    if (hoursSinceUpdate < 1) {
      return false;
    }
    
    // Update if new memories are significant (>20% increase)
    const percentIncrease = newMemoryCount / existingMemoryCount;
    return percentIncrease > 0.2;
  }
}

export const eventSynthesisService = new EventSynthesisService();
