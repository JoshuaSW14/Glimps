/**
 * Structured Logger
 * Phase 2: JSON logging with context
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    
    return JSON.stringify(logEntry);
  }
  
  debug(message: string, context?: LogContext): void {
    console.debug(this.formatMessage('debug', message, context));
  }
  
  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('info', message, context));
  }
  
  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }
  
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = error instanceof Error
      ? { error: error.message, stack: error.stack, ...context }
      : { error: String(error), ...context };
    
    console.error(this.formatMessage('error', message, errorContext));
  }
}

export const logger = new Logger();
