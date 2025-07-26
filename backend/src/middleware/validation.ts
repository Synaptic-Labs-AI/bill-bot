import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { APIErrorFactory, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

// Chat request validation schema
const chatRequestSchema = Joi.object({
  message: Joi.string()
    .min(1)
    .max(2000)
    .required()
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 2000 characters',
      'any.required': 'Message is required',
    }),
    
  sessionId: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'Session ID can only contain alphanumeric characters, hyphens, and underscores',
    }),
    
  connectionId: Joi.string()
    .required()
    .messages({
      'any.required': 'Connection ID is required for streaming',
    }),
    
  options: Joi.object({
    model: Joi.string()
      .valid(
        'anthropic/claude-sonnet-4',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-haiku',
        'openai/gpt-4o',
        'openai/gpt-3.5-turbo'
      )
      .optional()
      .messages({
        'any.only': 'Model must be one of the supported models',
      }),
      
    temperature: Joi.number()
      .min(0)
      .max(2)
      .optional()
      .messages({
        'number.min': 'Temperature must be at least 0',
        'number.max': 'Temperature must be at most 2',
      }),
      
    maxIterations: Joi.number()
      .min(1)
      .max(20)
      .optional()
      .messages({
        'number.min': 'Max iterations must be at least 1',
        'number.max': 'Max iterations cannot exceed 20',
      }),
      
    searchFilters: Joi.object({
      chamber: Joi.string()
        .valid('house', 'senate')
        .optional(),
      status: Joi.array()
        .items(Joi.string())
        .optional(),
      congress: Joi.number()
        .min(100)
        .optional()
        .messages({
          'number.min': 'Congress number must be at least 100',
        }),
      sponsor: Joi.string()
        .optional(),
      dateFrom: Joi.date()
        .iso()
        .optional()
        .messages({
          'date.format': 'Date from must be in ISO format (YYYY-MM-DD)',
        }),
      dateTo: Joi.date()
        .iso()
        .optional()
        .messages({
          'date.format': 'Date to must be in ISO format (YYYY-MM-DD)',
        }),
      topics: Joi.array()
        .items(Joi.string())
        .optional(),
    }).optional(),
  }).optional(),
});

// Stop generation request validation schema
const stopGenerationSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  connectionId: Joi.string()
    .required()
    .messages({
      'any.required': 'Connection ID is required',
    }),
});

// Bill search validation schema
const billSearchSchema = Joi.object({
  q: Joi.string()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.min': 'Search query cannot be empty',
      'string.max': 'Search query cannot exceed 500 characters',
      'any.required': 'Search query is required',
    }),
  type: Joi.string()
    .valid('semantic', 'keyword', 'hybrid')
    .default('hybrid')
    .optional(),
  chamber: Joi.string()
    .valid('house', 'senate')
    .optional(),
  status: Joi.array()
    .items(Joi.string())
    .optional(),
  congress: Joi.number()
    .min(100)
    .optional(),
  sponsor: Joi.string()
    .optional(),
  dateFrom: Joi.date()
    .iso()
    .optional(),
  dateTo: Joi.date()
    .iso()
    .optional(),
  limit: Joi.number()
    .min(1)
    .max(100)
    .default(10)
    .optional(),
  offset: Joi.number()
    .min(0)
    .default(0)
    .optional(),
  includeEmbeddings: Joi.boolean()
    .default(false)
    .optional(),
  includeCitations: Joi.boolean()
    .default(true)
    .optional(),
});

// Generic validation function
function validateSchema(schema: Joi.ObjectSchema): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      logger.warn('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: errorMessages,
        body: req.body,
      });

      return res.status(400).json(
        APIErrorFactory.badRequest('Validation failed', {
          errors: errorMessages,
          fields: error.details.map(detail => detail.path.join('.')),
        })
      );
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
}

// Query parameter validation function
function validateQuery(schema: Joi.ObjectSchema): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      logger.warn('Query validation failed', {
        path: req.path,
        method: req.method,
        errors: errorMessages,
        query: req.query,
      });

      return res.status(400).json(
        APIErrorFactory.badRequest('Query validation failed', {
          errors: errorMessages,
          fields: error.details.map(detail => detail.path.join('.')),
        })
      );
    }

    // Replace req.query with validated and sanitized data
    req.query = value;
    next();
  };
}

// Exported validation middleware functions
export const validateChatRequest = validateSchema(chatRequestSchema);
export const validateStopGeneration = validateSchema(stopGenerationSchema);
export const validateBillSearch = validateQuery(billSearchSchema);

// Custom validation functions
export const validateChatRequestManual = (data: any): ValidationResult => {
  const { error, value } = chatRequestSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return {
      success: false,
      errors: error.details.map(detail => detail.message),
    };
  }

  return {
    success: true,
    data: value,
  };
};

export const validateConnectionId = (req: Request, res: Response, next: NextFunction) => {
  const connectionId = req.body.connectionId || req.query.connectionId;
  
  if (!connectionId) {
    return res.status(400).json(
      APIErrorFactory.badRequest('Connection ID is required')
    );
  }

  if (typeof connectionId !== 'string' || connectionId.length < 1) {
    return res.status(400).json(
      APIErrorFactory.badRequest('Invalid connection ID format')
    );
  }

  next();
};

// Content type validation
export const validateContentType = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    return res.status(400).json(
      APIErrorFactory.badRequest('Content-Type must be application/json')
    );
  }
  next();
};

// Request size validation
export const validateRequestSize = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) { // 10MB
    return res.status(413).json(
      APIErrorFactory.badRequest('Request too large', {
        maxSize: '10MB',
        receivedSize: contentLength,
      })
    );
  }
  next();
};

// URL parameter validation
export const validateBillId = (req: Request, res: Response, next: NextFunction) => {
  const { billId } = req.params;
  
  if (!billId) {
    return res.status(400).json(
      APIErrorFactory.badRequest('Bill ID is required')
    );
  }

  // Validate bill ID format (e.g., H.R.1234, S.567, or UUID)
  const billIdPattern = /^(H\.R\.|S\.)\d+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!billIdPattern.test(billId)) {
    return res.status(400).json(
      APIErrorFactory.badRequest('Invalid bill ID format', {
        expected: 'H.R.1234, S.567, or UUID format',
        received: billId,
      })
    );
  }

  next();
};