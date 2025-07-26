import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/app.js';
import { APIErrorFactory } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Memory store for rate limiting
class MemoryStore {
  private hits = new Map<string, { count: number; resetTime: number }>();

  init() {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.hits.entries()) {
        if (now > value.resetTime) {
          this.hits.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  incr(key: string, cb: (error: any, result?: { totalHits: number; resetTime?: Date }) => void): void {
    const now = Date.now();
    const windowMs = config.rateLimit.windowMs;
    const current = this.hits.get(key);

    if (!current || now > current.resetTime) {
      // New window or expired entry
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      cb(null, { totalHits: 1, resetTime: new Date(resetTime) });
    } else {
      // Increment existing window
      current.count++;
      cb(null, { totalHits: current.count, resetTime: new Date(current.resetTime) });
    }
  }

  decrement(key: string): void {
    const current = this.hits.get(key);
    if (current && current.count > 0) {
      current.count--;
    }
  }

  resetKey(key: string): void {
    this.hits.delete(key);
  }

  resetAll(): void {
    this.hits.clear();
  }
}

const store = new MemoryStore();
store.init();

// Custom key generator that includes user agent for better tracking
const generateKey = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'] as string;
  const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Create a simple hash of user agent to avoid long keys
  const agentHash = Buffer.from(userAgent).toString('base64').substring(0, 8);
  
  return `${ip}_${agentHash}`;
};

// Custom error handler
const rateLimitHandler = (req: Request, res: Response) => {
  const retryAfter = Math.ceil(config.rateLimit.windowMs / 1000);
  
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
    retryAfter
  });

  res.status(429).json(
    APIErrorFactory.rateLimitExceeded(retryAfter)
  );
};

// Custom skip function for internal health checks
const skipInternalRequests = (req: Request): boolean => {
  // Skip rate limiting for health checks from localhost
  if (req.path === '/api/health' && req.ip === '127.0.0.1') {
    return true;
  }
  
  // Skip for internal service calls (with special header)
  if (req.headers['x-internal-service'] === 'true') {
    return true;
  }
  
  return false;
};

// General rate limiter for all API endpoints
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: APIErrorFactory.rateLimitExceeded(Math.ceil(config.rateLimit.windowMs / 1000)),
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
  skip: skipInternalRequests,
  onLimitReached: (req, res, options) => {
    logger.warn('Rate limit reached', {
      ip: req.ip,
      path: req.path,
      limit: options.max,
      windowMs: options.windowMs,
    });
  },
});

// Stricter rate limiter for chat endpoints
export const chatRateLimiter = rateLimit({
  windowMs: config.chatRateLimit.windowMs,
  max: config.chatRateLimit.max,
  message: APIErrorFactory.rateLimitExceeded(Math.ceil(config.chatRateLimit.windowMs / 1000)),
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: generateKey,
  handler: (req, res) => {
    const retryAfter = Math.ceil(config.chatRateLimit.windowMs / 1000);
    
    logger.warn('Chat rate limit exceeded', {
      ip: req.ip,
      connectionId: req.body?.connectionId,
      retryAfter
    });

    res.status(429).json({
      ...APIErrorFactory.rateLimitExceeded(retryAfter),
      message: 'Too many chat requests. Please slow down to ensure quality responses.',
    });
  },
  skip: skipInternalRequests,
  onLimitReached: (req, res, options) => {
    logger.warn('Chat rate limit reached', {
      ip: req.ip,
      connectionId: req.body?.connectionId,
      limit: options.max,
      windowMs: options.windowMs,
    });
  },
});

// Very strict rate limiter for resource-intensive operations
export const heavyOperationRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requests per 5 minutes
  message: APIErrorFactory.rateLimitExceeded(300), // 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: generateKey,
  handler: (req, res) => {
    logger.warn('Heavy operation rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      ...APIErrorFactory.rateLimitExceeded(300),
      message: 'This operation is resource-intensive. Please try again in 5 minutes.',
    });
  },
  skip: skipInternalRequests,
});

// Rate limiter for search endpoints (moderate restrictions)
export const searchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: APIErrorFactory.rateLimitExceeded(60),
  standardHeaders: true,
  legacyHeaders: false,
  store,
  keyGenerator: generateKey,
  handler: (req, res) => {
    logger.warn('Search rate limit exceeded', {
      ip: req.ip,
      query: req.query?.q,
      retryAfter: 60
    });

    res.status(429).json({
      ...APIErrorFactory.rateLimitExceeded(60),
      message: 'Too many search requests. Please wait a moment before searching again.',
    });
  },
  skip: skipInternalRequests,
});

// Progressive rate limiter that gets stricter with repeated violations
export class ProgressiveRateLimiter {
  private violations = new Map<string, { count: number; lastViolation: number }>();

  getMultiplier(key: string): number {
    const violation = this.violations.get(key);
    if (!violation) {
      return 1;
    }

    const hoursSinceLastViolation = (Date.now() - violation.lastViolation) / (1000 * 60 * 60);
    
    // Reset if more than 24 hours since last violation
    if (hoursSinceLastViolation > 24) {
      this.violations.delete(key);
      return 1;
    }

    // Progressive penalties: 1x, 2x, 4x, 8x (max)
    return Math.min(Math.pow(2, violation.count - 1), 8);
  }

  recordViolation(key: string): void {
    const existing = this.violations.get(key);
    if (existing) {
      existing.count++;
      existing.lastViolation = Date.now();
    } else {
      this.violations.set(key, { count: 1, lastViolation: Date.now() });
    }
  }

  createLimiter(baseConfig: { windowMs: number; max: number }) {
    return rateLimit({
      ...baseConfig,
      store,
      keyGenerator: generateKey,
      max: (req) => {
        const key = generateKey(req);
        const multiplier = this.getMultiplier(key);
        return Math.max(1, Math.floor(baseConfig.max / multiplier));
      },
      windowMs: (req) => {
        const key = generateKey(req);
        const multiplier = this.getMultiplier(key);
        return baseConfig.windowMs * multiplier;
      },
      handler: (req, res) => {
        const key = generateKey(req);
        this.recordViolation(key);
        
        const multiplier = this.getMultiplier(key);
        const retryAfter = Math.ceil((baseConfig.windowMs * multiplier) / 1000);
        
        logger.warn('Progressive rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          violationCount: this.violations.get(key)?.count || 0,
          multiplier,
          retryAfter
        });

        res.status(429).json({
          ...APIErrorFactory.rateLimitExceeded(retryAfter),
          message: `Rate limit exceeded. Due to repeated violations, your limit is temporarily reduced. Please wait ${retryAfter} seconds.`,
          details: {
            violationLevel: multiplier,
            baseLimit: baseConfig.max,
            currentLimit: Math.max(1, Math.floor(baseConfig.max / multiplier)),
          }
        });
      },
      skip: skipInternalRequests,
    });
  }
}

// Export progressive limiter instance
export const progressiveRateLimiter = new ProgressiveRateLimiter();

// Export rate limit status checker
export const getRateLimitStatus = (req: Request) => {
  const key = generateKey(req);
  // This would need to be implemented based on the store's internal structure
  // For now, return basic info
  return {
    key,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
};