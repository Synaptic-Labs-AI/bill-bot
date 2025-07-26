import cors from 'cors';
import { config } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { Request } from 'express';

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (config.cors.origins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Railway preview URLs
    if (origin.match(/^https:\/\/.*\.railway\.app$/)) {
      return callback(null, true);
    }

    // Allow localhost in development
    if (config.environment === 'development' && origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
      return callback(null, true);
    }

    // Log rejected origins for debugging
    logger.warn('CORS origin rejected', { 
      origin, 
      allowedOrigins: config.cors.origins 
    });
    
    callback(new Error('Not allowed by CORS'), false);
  },
  
  credentials: config.cors.credentials,
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-Connection-ID',
    'Cache-Control',
  ],
  
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
  ],
  
  maxAge: 86400, // 24 hours
  
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Create CORS middleware
export const corsMiddleware = cors(corsOptions);

// Custom CORS middleware for SSE endpoints
export const ssecorsMiddleware = (req: Request, res: any, next: any) => {
  const origin = req.headers.origin;
  
  // Set CORS headers for SSE
  if (origin && (
    config.cors.origins.includes(origin) ||
    origin.match(/^https:\/\/.*\.railway\.app$/) ||
    (config.environment === 'development' && origin.match(/^https?:\/\/localhost(:\d+)?$/))
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Connection-ID');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
  
  next();
};

// Preflight handler for complex requests
export const preflightHandler = (req: Request, res: any) => {
  logger.debug('CORS preflight request', {
    origin: req.headers.origin,
    method: req.headers['access-control-request-method'],
    headers: req.headers['access-control-request-headers'],
  });

  res.status(204).end();
};