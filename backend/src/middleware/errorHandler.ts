import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { 
  AppError, 
  ValidationError, 
  MCPServiceError, 
  OpenRouterServiceError, 
  StreamingError,
  APIErrorFactory 
} from '../utils/errors.js';
import { config } from '../config/app.js';

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle errors that have already been handled
  if (res.headersSent) {
    return next(error);
  }

  // Log the error with context
  logger.error('Request error', {
    error: error.message,
    stack: config.environment === 'development' ? error.stack : undefined,
    method: req.method,
    path: req.path,
    query: req.query,
    body: config.environment === 'development' ? req.body : undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] as string,
  });

  // Handle specific error types
  if (error instanceof ValidationError) {
    res.status(400).json(
      APIErrorFactory.validationError(
        error.message,
        'Validation failed'
      )
    );
    return;
  }

  if (error instanceof MCPServiceError) {
    res.status(503).json(
      APIErrorFactory.serviceUnavailable('Database service')
    );
    return;
  }

  if (error instanceof OpenRouterServiceError) {
    const statusCode = error.statusCode || 502;
    
    if (statusCode === 429) {
      res.status(429).json(
        APIErrorFactory.rateLimitExceeded(60) // Default 1 minute retry
      );
    } else {
      res.status(statusCode).json(
        APIErrorFactory.serviceUnavailable('Language model service')
      );
    }
    return;
  }

  if (error instanceof StreamingError) {
    res.status(500).json(
      APIErrorFactory.internalError('Streaming service error')
    );
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json(
      APIErrorFactory.internalError(error.message, {
        code: error.code,
        operational: error.isOperational
      })
    );
    return;
  }

  // Handle specific Node.js errors
  if (error.name === 'SyntaxError' && 'body' in error) {
    res.status(400).json(
      APIErrorFactory.badRequest('Invalid JSON in request body')
    );
    return;
  }

  if (error.name === 'PayloadTooLargeError') {
    res.status(413).json(
      APIErrorFactory.badRequest('Request payload too large', {
        maxSize: '10MB'
      })
    );
    return;
  }

  if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
    res.status(408).json(
      APIErrorFactory.timeout('Request')
    );
    return;
  }

  // Handle MongoDB/Database errors (if applicable)
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    res.status(503).json(
      APIErrorFactory.serviceUnavailable('Database')
    );
    return;
  }

  // Handle axios/HTTP client errors
  if (error.name === 'AxiosError') {
    const axiosError = error as any;
    const statusCode = axiosError.response?.status || 502;
    
    res.status(statusCode >= 400 && statusCode < 500 ? 400 : 502).json(
      APIErrorFactory.serviceUnavailable('External service')
    );
    return;
  }

  // Default error response
  res.status(500).json(
    APIErrorFactory.internalError(
      config.environment === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      config.environment === 'development' ? {
        stack: error.stack,
        type: error.constructor.name
      } : undefined
    )
  );
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
  });

  res.status(404).json({
    error: 'Not Found',
    code: 'ROUTE_NOT_FOUND',
    message: `Cannot ${req.method} ${req.path}`,
    suggestion: 'Check the API documentation for available endpoints',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] as string,
  });
};

// Async error wrapper to catch errors in async route handlers
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 60000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          path: req.path,
          timeoutMs,
          ip: req.ip,
        });

        res.status(408).json(
          APIErrorFactory.timeout('Request')
        );
      }
    }, timeoutMs);

    // Clear timeout when response is finished
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Unhandled promise rejection handler
export const setupGlobalErrorHandlers = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled promise rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
    });

    // Don't exit in production, but log the error
    if (config.environment !== 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });

    // Always exit on uncaught exceptions
    process.exit(1);
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, starting graceful shutdown');
    
    // Give ongoing requests time to complete
    setTimeout(() => {
      logger.info('Forcefully shutting down');
      process.exit(0);
    }, 30000); // 30 seconds max
  });

  // Graceful shutdown on SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received, starting graceful shutdown');
    process.exit(0);
  });
};