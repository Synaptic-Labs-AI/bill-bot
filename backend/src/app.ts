import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/app.js';
import { logger } from './utils/logger.js';
import { 
  errorHandler, 
  notFoundHandler, 
  requestTimeout,
  setupGlobalErrorHandlers,
  asyncHandler 
} from './middleware/errorHandler.js';
import { corsMiddleware } from './middleware/cors.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';
import { validateContentType, validateRequestSize } from './middleware/validation.js';

// Import routes
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';
import billRoutes from './routes/bills.js';

class BillBotAPI {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupGlobalHandlers();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupGlobalHandlers(): void {
    setupGlobalErrorHandlers();
  }

  private setupMiddleware(): void {
    // Trust proxy (for Railway deployment)
    this.app.set('trust proxy', 1);

    // Request timeout
    this.app.use(requestTimeout(config.security.requestTimeout));

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", ...config.cors.origins],
          imgSrc: ["'self'", "data:", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS
    this.app.use(corsMiddleware);

    // Compression
    this.app.use(compression({
      filter: (req, res) => {
        // Don't compress SSE streams
        if (req.path.includes('/stream')) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024, // Only compress responses larger than 1KB
      level: 6 // Balanced compression level
    }));

    // Request logging
    const morganFormat = config.environment === 'production' 
      ? 'combined' 
      : 'dev';
    
    this.app.use(morgan(morganFormat, {
      stream: {
        write: (message) => logger.info(message.trim())
      },
      skip: (req, res) => {
        // Skip logging for health checks in production
        return config.environment === 'production' && req.path === '/api/health';
      }
    }));

    // Request parsing
    this.app.use(express.json({ 
      limit: config.security.bodyLimit,
      strict: true,
      type: 'application/json'
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.security.bodyLimit 
    }));

    // Request validation middleware
    this.app.use(validateRequestSize);
    this.app.use('/api', validateContentType);

    // Rate limiting (applied to all API routes)
    this.app.use('/api', generalRateLimiter);

    // Request ID middleware
    this.app.use((req, res, next) => {
      const requestId = req.headers['x-request-id'] as string || 
                       `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    });

    // Request timing middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
        
        if (duration > 5000) { // Log slow requests
          logger.warn('Slow request detected', {
            method: req.method,
            path: req.path,
            duration,
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        }
      });
      
      next();
    });
  }

  private setupRoutes(): void {
    // Health check (before rate limiting for monitoring)
    this.app.use('/health', healthRoutes);
    this.app.use('/api/health', healthRoutes);

    // Main API routes
    this.app.use('/api/chat', chatRoutes);
    this.app.use('/api/bills', billRoutes);

    // Root endpoint
    this.app.get('/', asyncHandler(async (req, res) => {
      res.json({
        name: 'Bill Bot API',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        environment: config.environment,
        documentation: '/api/docs',
        health: '/api/health',
        timestamp: new Date().toISOString(),
        endpoints: {
          chat: '/api/chat/stream',
          search: '/api/bills/search',
          health: '/api/health'
        }
      });
    }));

    // API documentation placeholder
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'Bill Bot API Documentation',
        version: '1.0.0',
        description: 'Legislative AI Assistant API for exploring Congressional bills',
        endpoints: {
          'POST /api/chat/stream': 'Start streaming chat session',
          'POST /api/chat/stop': 'Stop chat generation',
          'GET /api/chat/models': 'Get available AI models',
          'GET /api/bills/search': 'Search bills with filters',
          'GET /api/bills/:billId': 'Get bill details',
          'GET /api/bills/recent/:chamber?': 'Get recent bills',
          'GET /api/health': 'Service health check'
        },
        support: {
          documentation: 'https://github.com/your-repo/bill-bot',
          issues: 'https://github.com/your-repo/bill-bot/issues'
        }
      });
    });

    // Catch-all for API routes (must be after all API routes)
    this.app.use('/api/*', notFoundHandler);
    
    // Catch-all for non-API routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: 'This endpoint does not exist',
        suggestion: 'Check /api/docs for available endpoints',
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(config.port, () => {
          logger.info(`Bill Bot API server started`, {
            port: config.port,
            environment: config.environment,
            nodeVersion: process.version,
            pid: process.pid
          });
          resolve();
        });

        // Handle server errors
        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${config.port} is already in use`);
            reject(new Error(`Port ${config.port} is already in use`));
          } else {
            logger.error('Server error', { error: error.message });
            reject(error);
          }
        });

        // Graceful shutdown handlers
        const gracefulShutdown = (signal: string) => {
          logger.info(`Received ${signal}, starting graceful shutdown`);
          
          this.server.close((err: any) => {
            if (err) {
              logger.error('Error during server shutdown', { error: err.message });
              process.exit(1);
            }
            
            logger.info('Server closed successfully');
            process.exit(0);
          });

          // Force shutdown after 30 seconds
          setTimeout(() => {
            logger.error('Forced shutdown due to timeout');
            process.exit(1);
          }, 30000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      } catch (error) {
        logger.error('Failed to start server', { error: error.message });
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const api = new BillBotAPI();
  
  api.start().catch((error) => {
    logger.error('Failed to start Bill Bot API', { error: error.message });
    process.exit(1);
  });
}

export default BillBotAPI;