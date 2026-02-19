/**
 * Resurfacing Service
 * Phase 6: Daily event selection for notifications (upgraded)
 */

import { eventRepository, retrievalLogRepository } from '../../db/repositories';
import { logger } from '../../utils/logger';
import { Event } from '../../types';

export interface ResurfacingResult {
  event: Event;
  reason: string;
  score: number;
  notificationText: string;
}

export class ResurfacingService {
  /**
   * Select a meaningful event to resurface (scoped to userId)
   */
  async selectEventToResurf(userId: string): Promise<ResurfacingResult | null> {
    logger.info('Starting event resurfacing selection', { userId });

    try {
      // Get all events older than 7 days, scoped to user
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const allEvents = await eventRepository.listRecent(500, userId);

      const eligibleEvents = allEvents.filter(
        (e) => new Date(e.startTime) < sevenDaysAgo
      );

      if (eligibleEvents.length === 0) {
        logger.info('No eligible events for resurfacing', { userId });
        return null;
      }

      // Score each event
      const scoredEvents = eligibleEvents.map((event) => {
        let score = 0;
        let reasons: string[] = [];

        // 1. Temporal significance (anniversaries)
        const eventDate = new Date(event.startTime);
        const now = new Date();
        const daysSince = Math.floor(
          (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Perfect year anniversary
        if (daysSince % 365 === 0 && daysSince >= 365) {
          score += 120;
          reasons.push(`${daysSince / 365} year anniversary`);
        }
        // Close to year anniversary (within 3 days)
        else if (Math.abs((daysSince % 365) - 365) <= 3 && daysSince >= 365) {
          score += 100;
          const years = Math.floor(daysSince / 365);
          reasons.push(`Nearly ${years} year${years > 1 ? 's' : ''} ago`);
        }
        // Month anniversary
        else if (daysSince % 30 === 0 && daysSince >= 30) {
          score += 50;
          reasons.push(`${daysSince / 30} months ago`);
        }
        // Week anniversary
        else if (daysSince % 7 === 0 && daysSince >= 14) {
          score += 25;
          reasons.push(`${daysSince / 7} weeks ago`);
        }

        // 2. Age-based scoring (sweet spot: 2 weeks to 6 months)
        if (daysSince >= 14 && daysSince <= 180) {
          score += 40;
          reasons.push('Perfect age for reflection');
        } else if (daysSince > 180 && daysSince <= 365) {
          score += 30;
        } else if (daysSince > 365) {
          score += 20;
        }

        // 3. Event confidence (higher confidence = more coherent experience)
        const confidenceBonus = Math.round(event.confidenceScore * 30);
        score += confidenceBonus;
        if (event.confidenceScore >= 0.8) {
          reasons.push('High-quality event');
        }

        // 4. Event richness (title + summary)
        const summaryLength = event.summary?.length || 0;
        if (summaryLength > 150) {
          score += 20;
          reasons.push('Rich experience');
        } else if (summaryLength > 50) {
          score += 10;
        }

        // 5. Location presence (events with places are more memorable)
        if (event.locationName) {
          score += 15;
          reasons.push(`From ${event.locationName}`);
        }

        // 6. Emotional significance from title/summary
        const emotionalKeywords = [
          'happy', 'amazing', 'wonderful', 'love', 'beautiful', 'excited',
          'grateful', 'special', 'milestone', 'first', 'last', 'birthday',
          'celebration', 'wedding', 'graduation', 'party', 'anniversary',
          'trip', 'vacation', 'visit', 'meeting',
        ];

        const textToCheck = `${event.title} ${event.summary || ''}`.toLowerCase();
        const emotionalCount = emotionalKeywords.filter((keyword) =>
          textToCheck.includes(keyword)
        ).length;

        if (emotionalCount > 0) {
          score += emotionalCount * 8;
          reasons.push('Emotionally significant');
        }

        // 7. Event duration (longer events might be more significant)
        const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        if (durationHours >= 2) {
          score += 10;
          reasons.push('Extended experience');
        }

        return {
          event,
          score,
          reason: reasons.join(', ') || 'Worth revisiting',
        };
      });

      // Sort by score descending
      scoredEvents.sort((a, b) => b.score - a.score);

      // Diversity guardrail: if top-3 are all within 24 hours of each other, pick randomly from them
      const top3 = scoredEvents.slice(0, 3);
      let selected = scoredEvents[0];
      if (top3.length >= 2) {
        const oldest = top3[top3.length - 1].event.startTime.getTime();
        const newest = top3[0].event.startTime.getTime();
        if (newest - oldest < 24 * 60 * 60 * 1000) {
          selected = top3[Math.floor(Math.random() * top3.length)];
        }
      }

      // Generate notification text
      const notificationText = this.generateNotificationText(selected.event);

      logger.info('Event selected for resurfacing', {
        userId,
        eventId: selected.event.id,
        title: selected.event.title,
        score: selected.score,
        reason: selected.reason,
      });

      return {
        ...selected,
        notificationText,
      };
    } catch (error) {
      logger.error('Failed to select event for resurfacing', error);
      return null;
    }
  }

  /**
   * Generate user-friendly notification text from event
   */
  private generateNotificationText(event: Event): string {
    const eventDate = new Date(event.startTime);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let timePhrase: string;
    if (daysSince % 365 === 0 && daysSince >= 365) {
      const years = daysSince / 365;
      timePhrase = `${years} year${years > 1 ? 's' : ''} ago today`;
    } else if (daysSince >= 365) {
      const years = Math.floor(daysSince / 365);
      timePhrase = `${years} year${years > 1 ? 's' : ''} ago`;
    } else if (daysSince >= 30) {
      const months = Math.floor(daysSince / 30);
      timePhrase = `${months} month${months > 1 ? 's' : ''} ago`;
    } else if (daysSince >= 7) {
      const weeks = Math.floor(daysSince / 7);
      timePhrase = `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      timePhrase = `${daysSince} day${daysSince > 1 ? 's' : ''} ago`;
    }

    let text = `${timePhrase}: ${event.title}`;

    if (event.summary) {
      const summarySnippet = event.summary.length > 80
        ? event.summary.substring(0, 77) + '...'
        : event.summary;
      text += `\n\n${summarySnippet}`;
    }

    return text;
  }

  /**
   * Get daily resurfaced event (scoped to userId)
   */
  async getDailyMemory(userId: string): Promise<ResurfacingResult | null> {
    const result = await this.selectEventToResurf(userId);

    if (result) {
      await retrievalLogRepository.create({
        userId,
        userQuery: 'DAILY_RESURFACING',
        memoryIds: [],
        searchMetadata: {
          type: 'event_resurfacing',
          eventId: result.event.id,
          score: result.score,
          reason: result.reason,
          notificationText: result.notificationText,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return result;
  }
}

export const resurfacingService = new ResurfacingService();
