import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatOrchestrator } from '../services/chatOrchestrator.js';
import { StreamingService } from '../services/streamingService.js';
import { logger } from '../utils/logger.js';
import { APIErrorFactory, AppError } from '../utils/errors.js';
import { 
  validateChatRequest, 
  validateStopGeneration,
  validateConnectionId,
  asyncHandler 
} from '../middleware/validation.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';
import { sseCorsMiddleware } from '../middleware/cors.js';

const router = Router();
const chatOrchestrator = new ChatOrchestrator();
const streamingService = new StreamingService();

// Initialize chat orchestrator
let isInitialized = false;
const initializeOrchestrator = async () => {
  if (!isInitialized) {
    try {
      await chatOrchestrator.initialize();
      isInitialized = true;
      logger.info('Chat orchestrator initialized for routes');
    } catch (error) {
      logger.error('Failed to initialize chat orchestrator', { error: error.message });
      throw new AppError('Chat service unavailable', 503, 'SERVICE_INITIALIZATION_ERROR');
    }
  }
};

// Streaming chat endpoint
router.post('/stream', 
  sseCorsMiddleware,
  chatRateLimiter,
  validateChatRequest,
  asyncHandler(async (req, res) => {
    await initializeOrchestrator();

    const { message, sessionId, connectionId, options } = req.body;
    
    logger.info('Starting chat stream', {
      sessionId,
      connectionId,
      messageLength: message.length,
      options: {
        model: options?.model,
        maxIterations: options?.maxIterations,
        hasFilters: !!options?.searchFilters
      }
    });

    try {
      // Create SSE connection
      const writer = streamingService.createConnection(connectionId, res);
      
      // Process chat request
      await chatOrchestrator.processChat({
        message,
        sessionId,
        connectionId,
        options
      });

    } catch (error) {
      logger.error('Chat stream error', {
        sessionId,
        connectionId,
        error: error.message
      });

      // If connection is still open, send error
      if (streamingService.isConnectionActive(connectionId)) {
        streamingService.streamError(
          connectionId,
          error instanceof AppError ? error.message : 'Chat processing failed',
          error instanceof AppError ? error.code : 'CHAT_ERROR',
          true
        );
        streamingService.streamEnd(connectionId, {
          messageId: uuidv4(),
          status: 'error'
        });
      }
      
      // Don't send HTTP error response for SSE - error was already streamed
      if (!res.headersSent) {
        res.status(500).json(
          APIErrorFactory.internalError('Chat processing failed')
        );
      }
    }
  })
);

// Stop generation endpoint
router.post('/stop', 
  chatRateLimiter,
  validateStopGeneration,
  asyncHandler(async (req, res) => {
    const { sessionId, connectionId } = req.body;

    logger.info('Stopping chat generation', { sessionId, connectionId });

    try {
      // Cancel the session if it exists
      if (sessionId) {
        await chatOrchestrator.cancelSession(sessionId);
      }

      // Close the streaming connection
      streamingService.closeConnection(connectionId);

      res.json({
        success: true,
        message: 'Generation stopped successfully',
        stoppedAt: new Date().toISOString(),
        sessionId,
        connectionId
      });

    } catch (error) {
      logger.error('Failed to stop generation', {
        sessionId,
        connectionId,
        error: error.message
      });

      res.status(500).json(
        APIErrorFactory.internalError('Failed to stop generation')
      );
    }
  })
);

// Get chat session status
router.get('/status/:sessionId', 
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    try {
      const activeSessions = chatOrchestrator.getActiveSessions();
      const isActive = activeSessions.includes(sessionId);

      res.json({
        sessionId,
        status: isActive ? 'active' : 'inactive',
        activeSessions: activeSessions.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get session status', {
        sessionId,
        error: error.message
      });

      res.status(500).json(
        APIErrorFactory.internalError('Failed to get session status')
      );
    }
  })
);

// Get streaming connection status
router.get('/connection/:connectionId', 
  validateConnectionId,
  asyncHandler(async (req, res) => {
    const { connectionId } = req.params;

    try {
      const isActive = streamingService.isConnectionActive(connectionId);
      const stats = streamingService.getConnectionStats();

      res.json({
        connectionId,
        status: isActive ? 'active' : 'inactive',
        stats: {
          activeConnections: stats.activeConnections,
          totalEventsStreamed: stats.totalEventsStreamed,
          connectionsByAge: stats.connectionsByAge
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get connection status', {
        connectionId,
        error: error.message
      });

      res.status(500).json(
        APIErrorFactory.internalError('Failed to get connection status')
      );
    }
  })
);

// Get available chat models
router.get('/models', 
  asyncHandler(async (req, res) => {
    try {
      // This would typically come from the OpenRouter client or config
      const models = [
        {
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          description: 'Latest Claude model with enhanced reasoning',
          maxTokens: 8192,
          isDefault: true
        },
        {
          id: 'anthropic/claude-3-sonnet',
          name: 'Claude 3 Sonnet',
          description: 'Balanced performance and capability',
          maxTokens: 4096,
          isDefault: false
        },
        {
          id: 'anthropic/claude-3-haiku',
          name: 'Claude 3 Haiku',
          description: 'Fast and efficient for simpler tasks',
          maxTokens: 4096,
          isDefault: false
        }
      ];

      res.json({
        models,
        default: 'anthropic/claude-sonnet-4',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get available models', { error: error.message });
      
      res.status(500).json(
        APIErrorFactory.internalError('Failed to get available models')
      );
    }
  })
);

// Health check for chat service
router.get('/health', 
  asyncHandler(async (req, res) => {
    try {
      await initializeOrchestrator();
      const health = await chatOrchestrator.healthCheck();
      
      res.json({
        ...health,
        streamingConnections: streamingService.getConnectionStats(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Chat health check failed', { error: error.message });
      
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })
);

export default router;