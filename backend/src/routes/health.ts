import { Router } from 'express';
import { OpenRouterClient } from '../services/openRouterClient.js';
import { MCPClient } from '../services/mcpClient.js';
import { StreamingService } from '../services/streamingService.js';
import { config } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { APIErrorFactory } from '../utils/errors.js';
import { asyncHandler } from '../middleware/validation.js';

const router = Router();

// Health check endpoints typically don't need rate limiting for monitoring

// Main health check endpoint
router.get('/', 
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const health = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.environment,
      services: {
        openrouter: { status: 'unknown' as const, responseTime: 0, error: null as string | null },
        mcp: { status: 'unknown' as const, responseTime: 0, error: null as string | null },
        streaming: { status: 'unknown' as const, activeConnections: 0 }
      },
      metrics: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        responseTime: 0
      }
    };

    // Test OpenRouter service
    try {
      const orStartTime = Date.now();
      const openRouter = new OpenRouterClient();
      await openRouter.healthCheck();
      health.services.openrouter = {
        status: 'up',
        responseTime: Date.now() - orStartTime,
        error: null
      };
    } catch (error) {
      health.services.openrouter = {
        status: 'down',
        responseTime: 0,
        error: error.message
      };
      health.status = 'degraded';
    }

    // Test MCP service
    try {
      const mcpStartTime = Date.now();
      const mcpClient = new MCPClient();
      
      if (!mcpClient.isConnected()) {
        await mcpClient.initialize();
      }
      
      await mcpClient.healthCheck();
      health.services.mcp = {
        status: 'up',
        responseTime: Date.now() - mcpStartTime,
        error: null
      };
    } catch (error) {
      health.services.mcp = {
        status: 'down',
        responseTime: 0,
        error: error.message
      };
      health.status = 'degraded';
    }

    // Check streaming service
    try {
      const streamingService = new StreamingService();
      const stats = streamingService.getConnectionStats();
      health.services.streaming = {
        status: 'up',
        activeConnections: stats.activeConnections
      };
    } catch (error) {
      health.services.streaming = {
        status: 'down',
        activeConnections: 0
      };
      health.status = 'degraded';
    }

    // Set overall status
    const downServices = Object.values(health.services).filter(service => service.status === 'down').length;
    if (downServices >= 2) {
      health.status = 'unhealthy';
    } else if (downServices >= 1) {
      health.status = 'degraded';
    }

    health.metrics.responseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 207 : 503;

    res.status(statusCode).json(health);
  })
);

// Detailed health check with more comprehensive tests
router.get('/detailed', 
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const health = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.environment,
      
      services: {
        openrouter: {
          status: 'unknown' as const,
          responseTime: 0,
          rateLimitInfo: null as any,
          availableModels: [] as string[],
          error: null as string | null
        },
        mcp: {
          status: 'unknown' as const,
          responseTime: 0,
          availableTools: [] as string[],
          connectionInfo: null as any,
          error: null as string | null
        },
        streaming: {
          status: 'unknown' as const,
          activeConnections: 0,
          totalEventsStreamed: 0,
          connectionsByAge: {} as any
        }
      },
      
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      
      config: {
        port: config.port,
        environment: config.environment,
        maxIterations: config.search.maxIterations,
        rateLimits: {
          general: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.max },
          chat: { windowMs: config.chatRateLimit.windowMs, max: config.chatRateLimit.max }
        }
      },
      
      responseTime: 0
    };

    // Detailed OpenRouter check
    try {
      const orStartTime = Date.now();
      const openRouter = new OpenRouterClient();
      
      const [healthResult, rateLimitInfo] = await Promise.all([
        openRouter.healthCheck(),
        Promise.resolve(openRouter.getRateLimitInfo())
      ]);
      
      health.services.openrouter = {
        status: 'up',
        responseTime: Date.now() - orStartTime,
        rateLimitInfo,
        availableModels: openRouter.getAvailableModels(),
        error: null
      };
    } catch (error) {
      health.services.openrouter.status = 'down';
      health.services.openrouter.error = error.message;
      health.status = 'degraded';
    }

    // Detailed MCP check
    try {
      const mcpStartTime = Date.now();
      const mcpClient = new MCPClient();
      
      if (!mcpClient.isConnected()) {
        await mcpClient.initialize();
      }
      
      const [healthResult, tools] = await Promise.all([
        mcpClient.healthCheck(),
        Promise.resolve(mcpClient.getAvailableTools())
      ]);
      
      health.services.mcp = {
        status: 'up',
        responseTime: Date.now() - mcpStartTime,
        availableTools: tools.map(tool => tool.name),
        connectionInfo: {
          isConnected: mcpClient.isConnected(),
          toolCount: tools.length
        },
        error: null
      };
    } catch (error) {
      health.services.mcp.status = 'down';
      health.services.mcp.error = error.message;
      health.status = 'degraded';
    }

    // Detailed streaming check
    try {
      const streamingService = new StreamingService();
      const stats = streamingService.getConnectionStats();
      
      health.services.streaming = {
        status: 'up',
        activeConnections: stats.activeConnections,
        totalEventsStreamed: stats.totalEventsStreamed,
        connectionsByAge: stats.connectionsByAge
      };
    } catch (error) {
      health.services.streaming.status = 'down';
      health.status = 'degraded';
    }

    // Set overall status
    const downServices = Object.values(health.services).filter(service => service.status === 'down').length;
    if (downServices >= 2) {
      health.status = 'unhealthy';
    } else if (downServices >= 1) {
      health.status = 'degraded';
    }

    health.responseTime = Date.now() - startTime;

    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 207 : 503;

    res.status(statusCode).json(health);
  })
);

// Liveness probe (simple check that server is running)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

// Readiness probe (check if server is ready to handle requests)
router.get('/ready', 
  asyncHandler(async (req, res) => {
    try {
      // Quick check of critical services
      const checks = await Promise.allSettled([
        // Check if we can create service instances
        Promise.resolve(new OpenRouterClient()),
        Promise.resolve(new MCPClient()),
        Promise.resolve(new StreamingService())
      ]);

      const failedChecks = checks.filter(check => check.status === 'rejected').length;
      
      if (failedChecks > 0) {
        return res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          failedChecks,
          message: 'Some services failed initialization'
        });
      }

      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        message: 'Server is ready to handle requests'
      });

    } catch (error) {
      logger.error('Readiness check failed', { error: error.message });
      
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  })
);

// Service-specific health checks
router.get('/openrouter', 
  asyncHandler(async (req, res) => {
    try {
      const startTime = Date.now();
      const openRouter = new OpenRouterClient();
      const result = await openRouter.healthCheck();
      
      res.json({
        service: 'openrouter',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        result,
        rateLimitInfo: openRouter.getRateLimitInfo(),
        availableModels: openRouter.getAvailableModels(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        service: 'openrouter',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })
);

router.get('/mcp', 
  asyncHandler(async (req, res) => {
    try {
      const startTime = Date.now();
      const mcpClient = new MCPClient();
      
      if (!mcpClient.isConnected()) {
        await mcpClient.initialize();
      }
      
      const result = await mcpClient.healthCheck();
      const tools = mcpClient.getAvailableTools();
      
      res.json({
        service: 'mcp',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        result,
        isConnected: mcpClient.isConnected(),
        availableTools: tools.map(tool => ({
          name: tool.name,
          description: tool.description
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        service: 'mcp',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })
);

router.get('/streaming', (req, res) => {
  try {
    const streamingService = new StreamingService();
    const stats = streamingService.getConnectionStats();
    
    res.json({
      service: 'streaming',
      status: 'healthy',
      stats,
      activeConnections: streamingService.getActiveConnections(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: 'streaming',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;