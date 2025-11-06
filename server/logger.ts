/**
 * Comprehensive logger utility with database persistence and contextual data capture
 * Respects DEBUG_LOGS environment variable for verbose logging
 * Captures: userId, errorCode, source, stack, metadata, userAgent, IP, requestId
 */

import { db } from './db';
import { logs } from '@shared/schema';
import type { Request } from 'express';

const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  userId?: string;
  errorCode?: string;
  source: string;
  stack?: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  ip?: string;
  requestId?: string;
  req?: Request;
}

class Logger {
  /**
   * Write log to database
   */
  private async writeToDb(
    level: LogLevel,
    message: string,
    context: LogContext
  ): Promise<void> {
    try {
      // Extract request info if provided
      const userAgent = context.req?.headers['user-agent'] || context.userAgent;
      const ip = context.req?.ip || context.req?.socket?.remoteAddress || context.ip;
      const requestId = (context.req as any)?.requestId || context.requestId;
      const userId = (context.req as any)?.user?.id || context.userId;

      await db.insert(logs).values({
        level,
        message,
        errorCode: context.errorCode,
        source: context.source,
        stack: context.stack,
        metadata: context.metadata,
        userAgent,
        ip,
        requestId,
        userId,
      });
    } catch (error) {
      // Fallback to console if DB write fails to prevent logging from breaking the app
      console.error('[Logger] Failed to write to database:', error);
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context: LogContext): void {
    console.log(`[INFO] ${context.source}:`, message);
    this.writeToDb('info', message, context).catch(() => {});
  }

  /**
   * Log warnings
   */
  warn(message: string, context: LogContext): void {
    console.warn(`[WARN] ${context.source}:`, message);
    this.writeToDb('warn', message, context).catch(() => {});
  }

  /**
   * Log errors with stack trace
   */
  error(message: string, error: Error | unknown, context: LogContext): void {
    const stack = error instanceof Error ? error.stack : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMessage}`;
    
    console.error(`[ERROR] ${context.source}:`, fullMessage);
    if (stack) console.error(stack);
    
    this.writeToDb('error', fullMessage, { ...context, stack }).catch(() => {});
  }

  /**
   * Log fatal errors (critical system failures)
   */
  fatal(message: string, error: Error | unknown, context: LogContext): void {
    const stack = error instanceof Error ? error.stack : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMessage}`;
    
    console.error(`[FATAL] ${context.source}:`, fullMessage);
    if (stack) console.error(stack);
    
    this.writeToDb('fatal', fullMessage, { ...context, stack }).catch(() => {});
  }

  /**
   * Log debug messages (only shown when DEBUG_LOGS=true)
   */
  debug(message: string, context: LogContext): void {
    if (DEBUG_LOGS) {
      console.log(`[DEBUG] ${context.source}:`, message);
      this.writeToDb('debug', message, context).catch(() => {});
    }
  }

  /**
   * Log development-only messages (no DB write, console only)
   */
  dev(...args: any[]): void {
    if (NODE_ENV === 'development') {
      console.log('[DEV]', ...args);
    }
  }
}

export const logger = new Logger();
