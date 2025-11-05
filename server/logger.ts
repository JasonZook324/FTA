/**
 * Simple logger utility for consistent logging throughout the application
 * Respects DEBUG_LOGS environment variable for verbose logging
 */

const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

export const logger = {
  /**
   * Log informational messages (always shown)
   */
  info: (...args: any[]) => {
    console.log(...args);
  },

  /**
   * Log success messages (always shown)
   */
  success: (...args: any[]) => {
    console.log(...args);
  },

  /**
   * Log warnings (always shown)
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Log errors (always shown)
   */
  error: (...args: any[]) => {
    console.error(...args);
  },

  /**
   * Log debug messages (only shown when DEBUG_LOGS=true)
   */
  debug: (...args: any[]) => {
    if (DEBUG_LOGS) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log development-only messages (only shown in development mode)
   */
  dev: (...args: any[]) => {
    if (NODE_ENV === 'development') {
      console.log('[DEV]', ...args);
    }
  }
};
