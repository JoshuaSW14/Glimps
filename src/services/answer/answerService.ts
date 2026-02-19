/**
 * Answer Service
 * Phase 4: LLM-based answer generation with grounding
 */

import { openai } from '../ai/openaiClient';
import { eventRetrievalService } from '../retrieval/eventRetrievalService';
import { memoryLabelRepository } from '../../db/repositories';
import { logger } from '../../utils/logger';
import { AIServiceError } from '../../utils/errors';
import { withRetry } from '../../utils/retry';
import { config } from '../../config';
import { Memory, Event } from '../../types';

export interface AnswerResult {
  answer: string;
  memoryIds: string[];
  memories: Memory[];
  eventIds: string[]; // Phase 3: Event citations
  events: Event[];    // Phase 3: Full event data
  confidence: 'high' | 'medium' | 'low';
  searchTimeMs: number;
  answerTimeMs: number;
}

export class AnswerService {
  private systemPrompt = `You are a personal memory assistant for Glimps, a personal memory search engine.

Your role is to answer questions ONLY using the provided events and memories. You must follow these strict rules:

1. **ONLY use information from the supplied events and memories** - Never add external knowledge
2. **Cite events and memories** - Reference which events were most helpful
3. **Be honest about limitations** - If events/memories don't contain enough information, say "I don't have enough information to answer that"
4. **Never fabricate or infer** - Don't make assumptions about experiences not recorded
5. **Be conversational but factual** - Answer naturally but stick to the facts from events
6. **Preserve dates, names, locations** - Don't change or interpret specific details
7. **Think in terms of experiences** - Events represent experiences; memories are supporting evidence
8. **Labels on memories are user-defined** - When a memory shows tags in brackets (e.g. [Mom, Birthday]), use those names to refer to people, pets, or events the user has tagged. Use them to make answers more personal and accurate.

Response format:
- Provide a direct answer based on the events
- Be concise (2-4 sentences typically)
- Naturally reference events in your answer (use event titles)

Examples:

User: "What did I do last Tuesday?"
Events: [Event "Morning workout" - went to gym at 6am on Tuesday]
Assistant: "Last Tuesday, you had a morning workout and went to the gym at 6am."

User: "What movies have I watched recently?"
Events: [No movie-related events]
Assistant: "I don't have any memories of you watching movies recently. You might want to record that next time!"

User: "Did I meet with John?"
Events: [Event "Project meeting with John" - discussed timeline at 3pm]
Assistant: "Yes, you met with John for a project meeting where you discussed the timeline at 3pm."`;

  /**
   * Generate an answer to a question using retrieved events and memories
   * Phase 3: Event-first retrieval
   */
  async generateAnswer(question: string, userId: string): Promise<AnswerResult> {
    logger.info('Generating answer', { question });

    try {
      // Step 1: Retrieve relevant events scoped to this user
      const searchStart = Date.now();
      const eventResults = await eventRetrievalService.search(question, 5, {}, userId);
      const searchTimeMs = Date.now() - searchStart;
      
      if (eventResults.events.length === 0) {
        return {
          answer: "I don't have any memories that could answer this question. Try recording more memories!",
          memoryIds: [],
          memories: [],
          eventIds: [],
          events: [],
          confidence: 'low',
          searchTimeMs,
          answerTimeMs: 0,
        };
      }
      
      // Step 2: Load labels for all memories in the result set
      const allMemoryIds = new Set<string>();
      eventResults.events.forEach(eventWithMemories => {
        const memories = [
          eventWithMemories.primaryMemory,
          ...eventWithMemories.supportingMemories,
          ...eventWithMemories.contextMemories,
        ].filter((m): m is Memory => m != null);
        memories.forEach(m => allMemoryIds.add(m.id));
      });
      const labelsByMemoryId = await memoryLabelRepository.getLabelsByMemoryIds(Array.from(allMemoryIds));

      // Step 3: Build context from events and their memories (include label tags)
      const eventsContext = eventResults.events
        .map((eventWithMemories, index) => {
          const event = eventWithMemories.event;
          const dateRange = event.startTime.toLocaleDateString();
          
          const allMemories = [
            eventWithMemories.primaryMemory,
            ...eventWithMemories.supportingMemories,
          ].filter(Boolean) as Memory[];
          
          const memoriesText = allMemories
            .slice(0, 3)
            .map(m => {
              const labels = labelsByMemoryId.get(m.id) ?? [];
              const tag = labels.length > 0 ? `[${labels.map(l => l.name).join(', ')}] ` : '';
              return `  - ${tag}${m.transcript || ''}`;
            })
            .join('\n');
          
          return `Event ${index + 1} (ID: ${event.id}, Relevance: ${eventWithMemories.relevanceScore.toFixed(2)}, Date: ${dateRange}):
Title: ${event.title}
Summary: ${event.summary || 'No summary'}
Memories:
${memoriesText}`;
        })
        .join('\n\n');
      
      // Step 4: Generate answer with LLM
      const answerStartTime = Date.now();
      
      const answer = await withRetry(
        async () => {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: this.systemPrompt },
              {
                role: 'user',
                content: `Question: ${question}\n\nEvents:\n${eventsContext}\n\nProvide an answer based ONLY on these events and their memories.`,
              },
            ],
            temperature: 0.3, // Low temperature for consistency
            max_tokens: 500,
          });
          
          return response.choices[0].message.content || '';
        },
        {
          maxRetries: config.maxRetries,
          backoffMs: config.retryBackoffMs,
        }
      );
      
      const answerTimeMs = Date.now() - answerStartTime;
      
      // Step 5: Determine confidence based on relevance scores
      const avgRelevance = eventResults.events.reduce((sum, e) => sum + e.relevanceScore, 0) / eventResults.events.length;
      const confidence: 'high' | 'medium' | 'low' =
        avgRelevance > 0.7 ? 'high' : avgRelevance > 0.5 ? 'medium' : 'low';
      
      // Step 6: Extract event and memory IDs
      const eventIds = eventResults.events.map(e => e.event.id);
      const events = eventResults.events.map(e => e.event);
      
      // Collect all unique memories from events
      const allMemories = new Map<string, Memory>();
      eventResults.events.forEach(eventWithMemories => {
        const memories = [
          eventWithMemories.primaryMemory,
          ...eventWithMemories.supportingMemories,
          ...eventWithMemories.contextMemories,
        ].filter(Boolean) as Memory[];
        
        memories.forEach(m => allMemories.set(m.id, m));
      });
      
      const memoryIds = Array.from(allMemories.keys());
      const memories = Array.from(allMemories.values());
      
      logger.info('Answer generated (event-first)', {
        question,
        confidence,
        eventCount: events.length,
        memoryCount: memories.length,
        answerTimeMs,
      });
      
      return {
        answer: answer.trim(),
        memoryIds,
        memories,
        eventIds,
        events,
        confidence,
        searchTimeMs,
        answerTimeMs,
      };
    } catch (error) {
      logger.error('Answer generation failed', error, { question });
      throw new AIServiceError(
        'Answer Generation',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export const answerService = new AnswerService();
