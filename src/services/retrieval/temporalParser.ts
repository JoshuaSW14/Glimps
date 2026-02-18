/**
 * Temporal Query Parser
 * Phase 4: Extract temporal intent from natural language queries
 */

/**
 * Temporal intent extracted from query
 */
export interface TemporalIntent {
  /** Type of temporal query */
  type: 'first' | 'last' | 'before' | 'after' | 'around' | 'between' | 'recent' | 'none';
  
  /** Parsed date/time if available */
  referenceDate?: Date;
  
  /** Time range for queries like "last week" */
  startDate?: Date;
  endDate?: Date;
  
  /** Original temporal phrase found */
  phrase?: string;
  
  /** Sort order based on intent */
  sortOrder: 'asc' | 'desc';
}

export class TemporalParser {
  /**
   * Parse temporal intent from a natural language query
   */
  parse(query: string): TemporalIntent {
    const lowerQuery = query.toLowerCase();
    
    // Check for "first time" / "earliest"
    if (this.matchesPattern(lowerQuery, ['first time', 'earliest', 'when did i first', 'initial'])) {
      return {
        type: 'first',
        sortOrder: 'asc',
        phrase: this.extractPhrase(lowerQuery, ['first time', 'earliest']),
      };
    }
    
    // Check for "last time" / "most recent"
    if (this.matchesPattern(lowerQuery, ['last time', 'most recent', 'latest', 'when did i last'])) {
      return {
        type: 'last',
        sortOrder: 'desc',
        phrase: this.extractPhrase(lowerQuery, ['last time', 'most recent', 'latest']),
      };
    }
    
    // Check for "before X"
    const beforeMatch = lowerQuery.match(/before (.+?)(?:\?|$)/);
    if (beforeMatch) {
      const dateStr = beforeMatch[1];
      const parsedDate = this.parseRelativeDate(dateStr);
      return {
        type: 'before',
        referenceDate: parsedDate,
        endDate: parsedDate,
        sortOrder: 'desc',
        phrase: `before ${dateStr}`,
      };
    }
    
    // Check for "after X"
    const afterMatch = lowerQuery.match(/after (.+?)(?:\?|$)/);
    if (afterMatch) {
      const dateStr = afterMatch[1];
      const parsedDate = this.parseRelativeDate(dateStr);
      return {
        type: 'after',
        referenceDate: parsedDate,
        startDate: parsedDate,
        sortOrder: 'asc',
        phrase: `after ${dateStr}`,
      };
    }
    
    // Check for "around X" / "near X"
    const aroundMatch = lowerQuery.match(/(?:around|near|about) (.+?)(?:\?|$)/);
    if (aroundMatch) {
      const dateStr = aroundMatch[1];
      const centerDate = this.parseRelativeDate(dateStr);
      
      // ±3 days window
      const startDate = new Date(centerDate);
      startDate.setDate(startDate.getDate() - 3);
      const endDate = new Date(centerDate);
      endDate.setDate(endDate.getDate() + 3);
      
      return {
        type: 'around',
        referenceDate: centerDate,
        startDate,
        endDate,
        sortOrder: 'desc',
        phrase: `around ${dateStr}`,
      };
    }
    
    // Check for relative time ranges
    const timeRange = this.parseTimeRange(lowerQuery);
    if (timeRange) {
      return {
        type: 'between',
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
        sortOrder: 'desc',
        phrase: timeRange.phrase,
      };
    }
    
    // Check for recent queries
    if (this.matchesPattern(lowerQuery, ['recently', 'lately', 'these days', 'this week'])) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      
      return {
        type: 'recent',
        startDate,
        endDate,
        sortOrder: 'desc',
        phrase: 'recently',
      };
    }
    
    // Default: no temporal intent
    return {
      type: 'none',
      sortOrder: 'desc', // Most recent first by default
    };
  }
  
  /**
   * Check if query matches any pattern
   */
  private matchesPattern(query: string, patterns: string[]): boolean {
    return patterns.some(pattern => query.includes(pattern));
  }
  
  /**
   * Extract temporal phrase from query
   */
  private extractPhrase(query: string, patterns: string[]): string | undefined {
    for (const pattern of patterns) {
      if (query.includes(pattern)) {
        return pattern;
      }
    }
    return undefined;
  }
  
  /**
   * Parse relative date expressions
   */
  private parseRelativeDate(dateStr: string): Date {
    const now = new Date();
    const lowerStr = dateStr.trim().toLowerCase();
    
    // Today/yesterday/tomorrow
    if (lowerStr === 'today') {
      return now;
    }
    if (lowerStr === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    if (lowerStr === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Last/this week
    if (lowerStr.includes('last week')) {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return lastWeek;
    }
    if (lowerStr.includes('this week')) {
      return now;
    }
    
    // Last/this month
    if (lowerStr.includes('last month')) {
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return lastMonth;
    }
    if (lowerStr.includes('this month')) {
      return now;
    }
    
    // Last/this year
    if (lowerStr.includes('last year')) {
      const lastYear = new Date(now);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      return lastYear;
    }
    
    // Try parsing as date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    // Default to now
    return now;
  }
  
  /**
   * Parse time range expressions like "last week", "this month"
   */
  private parseTimeRange(query: string): {
    startDate: Date;
    endDate: Date;
    phrase: string;
  } | null {
    const now = new Date();
    
    // Last N days
    const lastDaysMatch = query.match(/(?:last|past) (\d+) days?/);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1]);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      return {
        startDate,
        endDate: now,
        phrase: `last ${days} days`,
      };
    }
    
    // Last week
    if (query.includes('last week')) {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      return {
        startDate,
        endDate: now,
        phrase: 'last week',
      };
    }
    
    // This week
    if (query.includes('this week')) {
      const startDate = new Date(now);
      const dayOfWeek = startDate.getDay();
      startDate.setDate(startDate.getDate() - dayOfWeek); // Start of week (Sunday)
      return {
        startDate,
        endDate: now,
        phrase: 'this week',
      };
    }
    
    // Last month
    if (query.includes('last month')) {
      const startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setDate(1); // First of the month
      const endDate = new Date(now);
      endDate.setDate(0); // Last day of last month
      return {
        startDate,
        endDate,
        phrase: 'last month',
      };
    }
    
    // This month
    if (query.includes('this month')) {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate,
        endDate: now,
        phrase: 'this month',
      };
    }
    
    return null;
  }
}

export const temporalParser = new TemporalParser();
