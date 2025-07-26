import { Response } from 'express';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { StreamingError } from '../utils/errors.js';
import { 
  SSEMessage, 
  SSEEvent, 
  StartMessage, 
  ContentMessage, 
  ToolCallMessage,
  CitationMessage,
  ErrorMessage,
  EndMessage
} from '../types/streaming.js';
import { Citation } from '../types/common.js';

export class SSEWriter {
  private isClosed = false;

  constructor(private res: Response, private connectionId: string) {
    this.setupSSE();
    this.setupCleanup();
  }

  private setupSSE(): void {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial connection confirmation
    this.res.write('data: {"type":"connection","data":{"status":"connected"}}\n\n');
  }

  private setupCleanup(): void {
    // Handle client disconnect
    this.res.on('close', () => {
      this.isClosed = true;
      logger.streamingEvent(this.connectionId, 'client_disconnected');
    });

    this.res.on('error', (error) => {
      this.isClosed = true;
      logger.error('SSE connection error', { 
        connectionId: this.connectionId, 
        error: error.message 
      });
    });
  }

  write(event: SSEEvent): void {
    if (this.isClosed) {
      logger.warn('Attempted to write to closed SSE connection', { 
        connectionId: this.connectionId 
      });
      return;
    }

    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      this.res.write(data);
      
      logger.streamingEvent(this.connectionId, 'event_sent', { 
        type: event.type,
        dataSize: data.length
      });
    } catch (error) {
      logger.error('Failed to write SSE event', {
        connectionId: this.connectionId,
        error: error.message,
        event: event.type
      });
      this.isClosed = true;
    }
  }

  close(): void {
    if (!this.isClosed) {
      try {
        this.res.end();
        this.isClosed = true;
        logger.streamingEvent(this.connectionId, 'connection_closed');
      } catch (error) {
        logger.error('Error closing SSE connection', {
          connectionId: this.connectionId,
          error: error.message
        });
      }
    }
  }

  isOpen(): boolean {
    return !this.isClosed;
  }

  getConnectionId(): string {
    return this.connectionId;
  }
}

export class StreamingService extends EventEmitter {
  private connections = new Map<string, SSEWriter>();
  private connectionMetrics = new Map<string, {
    createdAt: number;
    eventsCount: number;
    lastActivity: number;
  }>();

  constructor() {
    super();
    this.startCleanupTimer();
  }

  createConnection(connectionId: string, res: Response): SSEWriter {
    // Close existing connection with same ID if it exists
    this.closeConnection(connectionId);

    const writer = new SSEWriter(res, connectionId);
    this.connections.set(connectionId, writer);
    this.connectionMetrics.set(connectionId, {
      createdAt: Date.now(),
      eventsCount: 0,
      lastActivity: Date.now()
    });

    logger.streamingEvent(connectionId, 'connection_created');
    this.emit('connection_created', connectionId);

    return writer;
  }

  streamToConnection(connectionId: string, event: SSEEvent): void {
    const writer = this.connections.get(connectionId);
    if (!writer) {
      logger.warn('Attempted to stream to non-existent connection', { connectionId });
      return;
    }

    if (!writer.isOpen()) {
      this.closeConnection(connectionId);
      return;
    }

    try {
      writer.write(event);
      this.updateConnectionMetrics(connectionId);
    } catch (error) {
      logger.error('Failed to stream to connection', {
        connectionId,
        error: error.message,
        eventType: event.type
      });
      this.closeConnection(connectionId);
    }
  }

  streamStart(connectionId: string, data: StartMessage['data']): void {
    this.streamToConnection(connectionId, {
      type: 'start',
      data,
      timestamp: Date.now()
    });
  }

  streamContent(connectionId: string, content: string, messageId?: string): void {
    this.streamToConnection(connectionId, {
      type: 'content',
      data: {
        content,
        messageId: messageId || uuidv4()
      },
      timestamp: Date.now()
    });
  }

  streamToolCall(
    connectionId: string, 
    toolCall: ToolCallMessage['data']
  ): void {
    this.streamToConnection(connectionId, {
      type: 'tool_call',
      data: toolCall,
      timestamp: Date.now()
    });
  }

  streamCitation(connectionId: string, citation: Citation): void {
    this.streamToConnection(connectionId, {
      type: 'citation',
      data: citation,
      timestamp: Date.now()
    });
  }

  streamError(
    connectionId: string, 
    error: string, 
    code?: string, 
    recoverable: boolean = false
  ): void {
    this.streamToConnection(connectionId, {
      type: 'error',
      data: {
        error,
        code,
        recoverable
      },
      timestamp: Date.now()
    });
  }

  streamEnd(
    connectionId: string, 
    data: Omit<EndMessage['data'], 'duration'>,
    startTime?: number
  ): void {
    const duration = startTime ? Date.now() - startTime : 0;
    
    this.streamToConnection(connectionId, {
      type: 'end',
      data: {
        ...data,
        duration
      },
      timestamp: Date.now()
    });

    // Close connection after sending end event
    setTimeout(() => this.closeConnection(connectionId), 100);
  }

  closeConnection(connectionId: string): void {
    const writer = this.connections.get(connectionId);
    if (writer) {
      writer.close();
      this.connections.delete(connectionId);
      this.connectionMetrics.delete(connectionId);
      
      logger.streamingEvent(connectionId, 'connection_removed');
      this.emit('connection_closed', connectionId);
    }
  }

  closeAllConnections(): void {
    for (const connectionId of this.connections.keys()) {
      this.closeConnection(connectionId);
    }
  }

  private updateConnectionMetrics(connectionId: string): void {
    const metrics = this.connectionMetrics.get(connectionId);
    if (metrics) {
      metrics.eventsCount++;
      metrics.lastActivity = Date.now();
    }
  }

  private startCleanupTimer(): void {
    // Clean up stale connections every 5 minutes
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000);
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [connectionId, metrics] of this.connectionMetrics.entries()) {
      if (now - metrics.lastActivity > staleThreshold) {
        logger.warn('Cleaning up stale connection', {
          connectionId,
          ageMinutes: (now - metrics.createdAt) / (60 * 1000),
          eventsCount: metrics.eventsCount
        });
        this.closeConnection(connectionId);
      }
    }
  }

  // Utility methods for complex streaming scenarios
  async streamLLMResponse(
    connectionId: string,
    streamGenerator: AsyncGenerator<any, void, unknown>,
    messageId: string
  ): Promise<void> {
    try {
      for await (const chunk of streamGenerator) {
        if (!this.connections.has(connectionId)) {
          break; // Connection was closed
        }

        // Extract content from different streaming formats
        const content = this.extractContentFromChunk(chunk);
        if (content) {
          this.streamContent(connectionId, content, messageId);
        }

        // Handle tool calls in streaming response
        const toolCalls = this.extractToolCallsFromChunk(chunk);
        if (toolCalls) {
          for (const toolCall of toolCalls) {
            this.streamToolCall(connectionId, {
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments || '{}'),
              status: 'started'
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error streaming LLM response', {
        connectionId,
        messageId,
        error: error.message
      });
      
      this.streamError(
        connectionId, 
        'Streaming interrupted',
        'STREAMING_ERROR',
        true
      );
    }
  }

  private extractContentFromChunk(chunk: any): string | null {
    // Handle OpenRouter streaming format
    if (chunk.choices && chunk.choices[0]?.delta?.content) {
      return chunk.choices[0].delta.content;
    }
    
    // Handle other potential formats
    if (typeof chunk === 'string') {
      return chunk;
    }
    
    return null;
  }

  private extractToolCallsFromChunk(chunk: any): any[] | null {
    if (chunk.choices && chunk.choices[0]?.delta?.tool_calls) {
      return chunk.choices[0].delta.tool_calls;
    }
    
    return null;
  }

  // Metrics and monitoring
  getConnectionStats(): {
    activeConnections: number;
    totalEventsStreamed: number;
    connectionsByAge: { [ageRange: string]: number };
  } {
    const now = Date.now();
    const totalEvents = Array.from(this.connectionMetrics.values())
      .reduce((sum, metrics) => sum + metrics.eventsCount, 0);

    const connectionsByAge = {
      'under_1min': 0,
      '1_5min': 0,
      '5_10min': 0,
      'over_10min': 0
    };

    for (const metrics of this.connectionMetrics.values()) {
      const ageMinutes = (now - metrics.createdAt) / (60 * 1000);
      
      if (ageMinutes < 1) {
        connectionsByAge.under_1min++;
      } else if (ageMinutes < 5) {
        connectionsByAge['1_5min']++;
      } else if (ageMinutes < 10) {
        connectionsByAge['5_10min']++;
      } else {
        connectionsByAge.over_10min++;
      }
    }

    return {
      activeConnections: this.connections.size,
      totalEventsStreamed: totalEvents,
      connectionsByAge
    };
  }

  isConnectionActive(connectionId: string): boolean {
    const writer = this.connections.get(connectionId);
    return writer ? writer.isOpen() : false;
  }

  getActiveConnections(): string[] {
    return Array.from(this.connections.keys()).filter(id => {
      const writer = this.connections.get(id);
      return writer && writer.isOpen();
    });
  }
}