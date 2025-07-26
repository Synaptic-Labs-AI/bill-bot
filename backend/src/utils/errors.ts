import { APIError } from '../types/common.js';

export class APIErrorFactory {
  static badRequest(message: string, details?: any): APIError {
    return {
      error: 'Bad Request',
      code: 'BAD_REQUEST',
      message,
      details,
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }

  static unauthorized(message: string = 'Unauthorized'): APIError {
    return {
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      message,
      timestamp: new Date().toISOString(),
      recoverable: false,
    };
  }

  static rateLimitExceeded(retryAfter: number): APIError {
    return {
      error: 'Rate Limit Exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Try again in ${retryAfter} seconds.`,
      details: { retryAfter },
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }

  static internalError(message: string, details?: any): APIError {
    return {
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : message,
      details: process.env.NODE_ENV === 'production' ? undefined : details,
      timestamp: new Date().toISOString(),
      recoverable: false,
    };
  }

  static serviceUnavailable(service: string): APIError {
    return {
      error: 'Service Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      message: `${service} is temporarily unavailable`,
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }

  static timeout(operation: string): APIError {
    return {
      error: 'Request Timeout',
      code: 'TIMEOUT',
      message: `${operation} operation timed out`,
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }

  static validationError(field: string, message: string): APIError {
    return {
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      message: `Validation failed for field '${field}': ${message}`,
      details: { field, validationMessage: message },
      timestamp: new Date().toISOString(),
      recoverable: true,
    };
  }
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class MCPServiceError extends AppError {
  constructor(message: string, operation?: string) {
    super(message, 503, 'MCP_SERVICE_ERROR');
    this.name = 'MCPServiceError';
  }
}

export class OpenRouterServiceError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(message, statusCode, 'OPENROUTER_SERVICE_ERROR');
    this.name = 'OpenRouterServiceError';
  }
}

export class StreamingError extends AppError {
  constructor(message: string, connectionId?: string) {
    super(message, 500, 'STREAMING_ERROR');
    this.name = 'StreamingError';
  }
}