/**
 * Express middleware for request logging and context injection
 * Adds requestId, user info, and other context to all requests
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Middleware to add unique requestId to each request
 * This allows correlating all logs from the same request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  req.startTime = Date.now();
  next();
}

/**
 * Middleware to log all incoming requests
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only log important requests, not every static file or health check
  const shouldLog = req.url.startsWith('/api/') && 
                    !req.url.includes('/api/user') && // Skip frequent user checks
                    req.method !== 'GET'; // Only log mutations (POST, PUT, DELETE)
  
  if (!shouldLog) {
    next();
    return;
  }

  const { method, url, requestId } = req;
  const userId = (req as any).user?.id;
  
  logger.info(`${method} ${url}`, {
    source: 'request',
    userId,
    requestId,
    req,
    metadata: {
      method,
      url,
      query: req.query,
    },
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const { statusCode } = res;
    
    // Only log errors and warnings, not successful requests
    if (statusCode >= 500) {
      logger.error(`${method} ${url} ${statusCode} ${duration}ms`, new Error(`HTTP ${statusCode}`), {
        source: 'response',
        userId,
        requestId,
        req,
        errorCode: `HTTP_${statusCode}`,
        metadata: {
          method,
          url,
          statusCode,
          duration,
        },
      });
    } else if (statusCode >= 400) {
      logger.warn(`${method} ${url} ${statusCode} ${duration}ms`, {
        source: 'response',
        userId,
        requestId,
        req,
        metadata: {
          method,
          url,
          statusCode,
          duration,
        },
      });
    }
  });

  next();
}

/**
 * Error handling middleware to log all errors
 */
export function errorLoggerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { requestId } = req;
  const userId = (req as any).user?.id;
  
  logger.error(`Unhandled error in ${req.method} ${req.url}`, error, {
    source: 'errorMiddleware',
    userId,
    requestId,
    req,
    errorCode: 'UNHANDLED_ERROR',
    metadata: {
      method: req.method,
      url: req.url,
      body: req.body,
      params: req.params,
      query: req.query,
    },
  });

  next(error);
}
