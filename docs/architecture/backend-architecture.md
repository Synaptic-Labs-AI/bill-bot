# Backend Server Architecture

## Executive Summary

The Bill Bot backend serves as the central orchestration layer, coordinating between the React frontend, OpenRouter LLM API, and MCP server. Built with Express.js and TypeScript, it handles SSE streaming, manages MCP communication, and provides a RESTful API for chat interactions.

## Backend Server Overview

### Core Responsibilities
- **Chat Orchestration**: Coordinate user queries with LLM and MCP server
- **SSE Streaming**: Provide real-time response streaming to frontend
- **MCP Communication**: Manage lifecycle and communication with MCP server
- **API Gateway**: Expose REST endpoints for chat and system operations
- **Error Handling**: Graceful failure management across all integrations

### Technology Stack
- **Runtime**: Node.js 20+
- **Framework**: Express.js 4.x
- **Language**: TypeScript 5.x
- **Process Management**: PM2 (production)
- **HTTP Client**: Axios for OpenRouter integration
- **Streaming**: Server-Sent Events (SSE)

## Folder Structure

```
backend/
├── src/
│   ├── controllers/          # HTTP request handlers
│   │   ├── chat.controller.ts
│   │   ├── health.controller.ts
│   │   └── admin.controller.ts
│   ├── services/            # Business logic services
│   │   ├── chat.service.ts
│   │   ├── mcp.service.ts
│   │   ├── openrouter.service.ts
│   │   └── streaming.service.ts
│   ├── middleware/          # Express middleware
│   │   ├── cors.middleware.ts
│   │   ├── rateLimiter.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/              # Express route definitions
│   │   ├── chat.routes.ts
│   │   ├── health.routes.ts
│   │   └── admin.routes.ts
│   ├── types/               # TypeScript type definitions
│   │   ├── chat.types.ts
│   │   ├── mcp.types.ts
│   │   ├── openrouter.types.ts
│   │   └── streaming.types.ts
│   ├── utils/               # Utility functions
│   │   ├── logger.ts
│   │   ├── config.ts
│   │   └── validation.ts
│   ├── config/              # Configuration files
│   │   ├── app.config.ts
│   │   └── env.config.ts
│   └── app.ts               # Express app setup
├── package.json
├── tsconfig.json
├── Dockerfile
└── ecosystem.config.js      # PM2 configuration
```

## Backend-MCP Communication Pattern

### Communication Strategy: Child Process with stdio

The backend spawns the MCP server as a child process and communicates via stdio (standard input/output). This approach provides:

- **Process Isolation**: MCP server failures don't crash backend
- **Resource Management**: Backend controls MCP server lifecycle
- **Direct Communication**: Fast, low-latency stdio communication
- **Restart Capability**: Backend can restart failed MCP servers

### MCP Service Implementation

```typescript
// src/services/mcp.service.ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface MCPMessage {
  id: string;
  method: string;
  params?: any;
  result?: any;
  error?: any;
}

export class MCPService extends EventEmitter {
  private mcpProcess: ChildProcess | null = null;
  private messageQueue: Map<string, (result: any) => void> = new Map();
  private nextMessageId = 1;

  async start(): Promise<void> {
    // Spawn MCP server as child process
    this.mcpProcess = spawn('node', ['../mcp-server/dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    // Handle process communication
    this.mcpProcess.stdout?.on('data', (data) => {
      this.handleMCPMessage(data.toString());
    });

    this.mcpProcess.stderr?.on('data', (data) => {
      console.error('MCP Error:', data.toString());
    });

    this.mcpProcess.on('exit', (code) => {
      console.log(`MCP process exited with code ${code}`);
      this.restart();
    });

    // Initialize MCP session
    await this.initialize();
  }

  async callTool(toolName: string, args: any): Promise<any> {
    const messageId = `msg_${this.nextMessageId++}`;
    
    const message: MCPMessage = {
      id: messageId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      this.messageQueue.set(messageId, (result) => {
        if (result.error) {
          reject(new Error(result.error.message));
        } else {
          resolve(result.result);
        }
      });

      this.sendMessage(message);
    });
  }

  private sendMessage(message: MCPMessage): void {
    if (!this.mcpProcess?.stdin) {
      throw new Error('MCP process not available');
    }

    this.mcpProcess.stdin.write(JSON.stringify(message) + '\n');
  }

  private handleMCPMessage(data: string): void {
    try {
      const message: MCPMessage = JSON.parse(data.trim());
      const callback = this.messageQueue.get(message.id);
      
      if (callback) {
        callback(message);
        this.messageQueue.delete(message.id);
      }
    } catch (error) {
      console.error('Failed to parse MCP message:', error);
    }
  }

  private async restart(): Promise<void> {
    console.log('Restarting MCP server...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await this.start();
  }
}
```

### MCP Failure Handling

```typescript
// Error handling and restart logic
export class MCPHealthMonitor {
  private mcpService: MCPService;
  private healthCheckInterval: NodeJS.Timeout;

  constructor(mcpService: MCPService) {
    this.mcpService = mcpService;
    this.startHealthChecks();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        // Test MCP server health with a simple tool call
        await this.mcpService.callTool('health_check', {});
      } catch (error) {
        console.error('MCP health check failed:', error);
        await this.mcpService.restart();
      }
    }, 30000); // Check every 30 seconds
  }
}
```

## Chat Service Architecture

### Chat Flow Orchestration

```typescript
// src/services/chat.service.ts
export class ChatService {
  constructor(
    private mcpService: MCPService,
    private openRouterService: OpenRouterService,
    private streamingService: StreamingService
  ) {}

  async processQuery(
    query: string, 
    sessionId: string,
    streamWriter: SSEWriter
  ): Promise<void> {
    try {
      // Start streaming session
      streamWriter.write({
        type: 'start',
        data: { sessionId, query }
      });

      // Iterative search through MCP
      streamWriter.write({
        type: 'tool_call',
        data: { tool: 'search_bills', status: 'starting' }
      });

      const searchResults = await this.performIterativeSearch(
        query, 
        streamWriter
      );

      // Generate citations
      const citations = this.generateCitations(searchResults);
      
      // Prepare context for LLM
      const context = this.prepareContext(searchResults, citations);

      // Stream LLM response
      await this.streamLLMResponse(
        query,
        context,
        citations,
        streamWriter
      );

      streamWriter.write({
        type: 'end',
        data: { status: 'completed' }
      });

    } catch (error) {
      streamWriter.write({
        type: 'error',
        data: { error: error.message }
      });
    } finally {
      streamWriter.close();
    }
  }

  private async performIterativeSearch(
    query: string,
    streamWriter: SSEWriter
  ): Promise<any[]> {
    let iteration = 0;
    let allResults: any[] = [];
    let needsRefinement = true;

    while (needsRefinement && iteration < 20) {
      streamWriter.write({
        type: 'tool_call',
        data: { 
          tool: 'search_bills', 
          iteration: iteration + 1,
          status: 'searching'
        }
      });

      const searchResult = await this.mcpService.callTool('search_bills', {
        query,
        iteration,
        previousResults: allResults.map(r => r.id)
      });

      allResults.push(...searchResult.results);
      needsRefinement = searchResult.needsRefinement;
      iteration++;

      streamWriter.write({
        type: 'tool_call',
        data: {
          tool: 'search_bills',
          iteration,
          status: 'found',
          count: searchResult.results.length,
          total: allResults.length
        }
      });
    }

    return allResults;
  }
}
```

## Streaming Service Implementation

### Server-Sent Events Management

```typescript
// src/services/streaming.service.ts
export interface SSEMessage {
  type: 'start' | 'content' | 'tool_call' | 'citation' | 'error' | 'end';
  data: any;
}

export class SSEWriter {
  constructor(private res: Response) {
    this.setupSSE();
  }

  private setupSSE(): void {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
  }

  write(message: SSEMessage): void {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    this.res.write(data);
  }

  close(): void {
    this.res.end();
  }
}

export class StreamingService {
  async streamLLMResponse(
    messages: any[],
    writer: SSEWriter
  ): Promise<void> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages,
        stream: true
      })
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              writer.write({
                type: 'content',
                data: { content }
              });
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
          }
        }
      }
    }
  }
}
```

## API Endpoints Design

### Chat Routes

```typescript
// src/routes/chat.routes.ts
import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { rateLimiter } from '../middleware/rateLimiter.middleware';
import { validateChat } from '../middleware/validation.middleware';

const router = Router();
const chatController = new ChatController();

// Main chat endpoint with streaming
router.post('/stream', 
  rateLimiter,
  validateChat,
  chatController.streamChat
);

// Get available context options
router.get('/context/sponsors', chatController.getAvailableSponsors);
router.get('/context/statuses', chatController.getAvailableStatuses);
router.get('/context/topics', chatController.getAvailableTopics);

export { router as chatRoutes };
```

### Chat Controller

```typescript
// src/controllers/chat.controller.ts
export class ChatController {
  constructor(private chatService: ChatService) {}

  streamChat = async (req: Request, res: Response): Promise<void> => {
    const { query } = req.body;
    const sessionId = `session_${Date.now()}_${Math.random()}`;
    
    const writer = new SSEWriter(res);
    
    await this.chatService.processQuery(query, sessionId, writer);
  };

  getAvailableSponsors = async (req: Request, res: Response): Promise<void> => {
    try {
      const sponsors = await this.chatService.getAvailableSponsors();
      res.json({ sponsors });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  // Similar methods for statuses and topics
}
```

## Middleware Implementation

### Rate Limiting

```typescript
// src/middleware/rateLimiter.middleware.ts
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit chat requests to 10 per minute
  message: {
    error: 'Too many chat requests, please slow down'
  }
});
```

### Error Handling

```typescript
// src/middleware/error.middleware.ts
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation failed',
      details: error.details
    });
    return;
  }

  if (error instanceof MCPError) {
    res.status(503).json({
      error: 'Database service temporarily unavailable'
    });
    return;
  }

  if (error instanceof OpenRouterError) {
    res.status(502).json({
      error: 'Language model service unavailable'
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error'
  });
};
```

## Configuration Management

### Application Configuration

```typescript
// src/config/app.config.ts
export interface AppConfig {
  port: number;
  environment: 'development' | 'production';
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  mcp: {
    serverPath: string;
    restartDelay: number;
    healthCheckInterval: number;
  };
  openRouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
    fallbackModel: string;
  };
}

export const loadConfig = (): AppConfig => {
  return {
    port: parseInt(process.env.PORT || '3001'),
    environment: process.env.NODE_ENV as 'development' | 'production' || 'development',
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    },
    mcp: {
      serverPath: process.env.MCP_SERVER_PATH || '../mcp-server/dist/index.js',
      restartDelay: parseInt(process.env.MCP_RESTART_DELAY || '1000'),
      healthCheckInterval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000')
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
      fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL || 'anthropic/claude-3-sonnet'
    }
  };
};
```

## Health Monitoring

### Health Check Implementation

```typescript
// src/controllers/health.controller.ts
export class HealthController {
  constructor(
    private mcpService: MCPService,
    private openRouterService: OpenRouterService
  ) {}

  getHealth = async (req: Request, res: Response): Promise<void> => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        backend: 'healthy',
        mcp: 'unknown',
        openrouter: 'unknown',
        database: 'unknown'
      }
    };

    try {
      // Check MCP service
      await this.mcpService.callTool('health_check', {});
      health.services.mcp = 'healthy';
    } catch (error) {
      health.services.mcp = 'unhealthy';
      health.status = 'degraded';
    }

    try {
      // Check OpenRouter service
      await this.openRouterService.healthCheck();
      health.services.openrouter = 'healthy';
    } catch (error) {
      health.services.openrouter = 'unhealthy';
      health.status = 'degraded';
    }

    try {
      // Check database through MCP
      await this.mcpService.callTool('get_available_sponsors', {});
      health.services.database = 'healthy';
    } catch (error) {
      health.services.database = 'unhealthy';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  };
}
```

## Performance Optimization

### In-Memory Context Caching

Since Bill Bot uses single-use conversations without persistence, we only need minimal in-memory caching for context data that changes infrequently (sponsors, statuses, topics).

```typescript
// src/services/context-cache.service.ts
export class ContextCacheService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached || Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  // Only cache context data, not conversation or search results
  async getSponsors(): Promise<SponsorInfo[]> {
    const cached = this.get<SponsorInfo[]>('sponsors');
    if (cached) return cached;

    const sponsors = await this.fetchSponsors();
    this.set('sponsors', sponsors);
    return sponsors;
  }
}
```

## Deployment Configuration

### Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY dist/ ./dist/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "dist/app.js"]
```

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'bill-bot-backend',
    script: 'dist/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

This backend architecture provides a robust foundation for the Bill Bot system, with proper separation of concerns, comprehensive error handling, and scalable design patterns. The MCP communication pattern ensures reliable database access while the streaming implementation provides real-time user experience.