import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { MCPServiceError } from '../utils/errors.js';
import { 
  MCPMessage, 
  MCPTool, 
  MCPToolCall, 
  MCPToolResult, 
  MCPError 
} from '../types/mcp.js';

export class MCPClient extends EventEmitter {
  private mcpProcess: ChildProcess | null = null;
  private messageQueue = new Map<string, (result: any) => void>();
  private nextMessageId = 1;
  private isInitialized = false;
  private isRestarting = false;
  private availableTools: MCPTool[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized && this.mcpProcess && !this.mcpProcess.killed) {
      return;
    }

    try {
      await this.start();
      await this.handshake();
      await this.loadAvailableTools();
      this.startHeartbeat();
      this.isInitialized = true;
      logger.info('MCP client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP client', { error: error.message });
      throw new MCPServiceError(`MCP initialization failed: ${error.message}`);
    }
  }

  private async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Starting MCP server process', { 
          serverPath: config.mcp.serverPath 
        });

        this.mcpProcess = spawn('node', [config.mcp.serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: config.environment }
        });

        if (!this.mcpProcess.stdout || !this.mcpProcess.stdin || !this.mcpProcess.stderr) {
          throw new Error('Failed to establish stdio communication with MCP server');
        }

        // Handle stdout messages
        this.mcpProcess.stdout.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          logger.mcpEvent('stdout', { message });
          this.handleMCPMessage(message);
        });

        // Handle stderr for debugging
        this.mcpProcess.stderr.on('data', (data: Buffer) => {
          const error = data.toString().trim();
          logger.warn('MCP server stderr', { error });
        });

        // Handle process exit
        this.mcpProcess.on('exit', (code, signal) => {
          logger.warn('MCP process exited', { code, signal });
          this.isInitialized = false;
          this.emit('disconnect');
          
          if (!this.isRestarting) {
            setTimeout(() => this.restart(), config.mcp.restartDelay);
          }
        });

        // Handle process errors
        this.mcpProcess.on('error', (error) => {
          logger.error('MCP process error', { error: error.message });
          this.isInitialized = false;
          reject(error);
        });

        // Give the process a moment to start
        setTimeout(resolve, 1000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async handshake(): Promise<void> {
    const initMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'bill-bot-backend',
          version: '1.0.0'
        }
      }
    };

    try {
      const response = await this.sendMessage(initMessage);
      logger.info('MCP handshake completed', { serverInfo: response.result?.serverInfo });
    } catch (error) {
      throw new Error(`MCP handshake failed: ${error.message}`);
    }
  }

  private async loadAvailableTools(): Promise<void> {
    const listToolsMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'tools/list'
    };

    try {
      const response = await this.sendMessage(listToolsMessage);
      this.availableTools = response.result?.tools || [];
      logger.info('Loaded MCP tools', { 
        toolCount: this.availableTools.length,
        tools: this.availableTools.map(t => t.name)
      });
    } catch (error) {
      logger.warn('Failed to load MCP tools', { error: error.message });
      this.availableTools = [];
    }
  }

  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const toolCallMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    try {
      logger.mcpEvent('tool_call_start', { tool: toolName, args });
      const startTime = Date.now();
      
      const response = await this.sendMessage(toolCallMessage, config.mcp.timeout);
      const duration = Date.now() - startTime;
      
      if (response.error) {
        throw new MCPError(
          response.error.message || 'Tool call failed',
          response.error.code?.toString() || 'TOOL_ERROR',
          { tool: toolName, args, mcpError: response.error }
        );
      }

      logger.mcpEvent('tool_call_success', { 
        tool: toolName, 
        duration,
        resultSize: JSON.stringify(response.result).length
      });

      return this.parseToolResult(response.result);
      
    } catch (error) {
      logger.error('MCP tool call failed', { 
        tool: toolName, 
        args, 
        error: error.message 
      });
      
      if (error instanceof MCPError) {
        throw error;
      }
      
      throw new MCPError(
        `Tool call failed: ${error.message}`,
        'TOOL_CALL_ERROR',
        { tool: toolName, args }
      );
    }
  }

  private parseToolResult(result: any): any {
    if (!result || !result.content) {
      return null;
    }

    // Extract text content from MCP tool result
    const textContent = result.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');

    try {
      // Try to parse as JSON if it looks like JSON
      if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
        return JSON.parse(textContent);
      }
      return textContent;
    } catch (error) {
      // Return as string if JSON parsing fails
      return textContent;
    }
  }

  private async sendMessage(
    message: MCPMessage, 
    timeoutMs: number = config.mcp.timeout
  ): Promise<MCPMessage> {
    return new Promise((resolve, reject) => {
      if (!this.mcpProcess?.stdin) {
        reject(new Error('MCP process not available'));
        return;
      }

      const messageId = message.id.toString();
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId);
        reject(new Error(`MCP request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.messageQueue.set(messageId, (response: MCPMessage) => {
        clearTimeout(timeout);
        resolve(response);
      });

      try {
        const serialized = JSON.stringify(message) + '\n';
        this.mcpProcess.stdin.write(serialized);
        logger.mcpEvent('message_sent', { id: messageId, method: message.method });
      } catch (error) {
        clearTimeout(timeout);
        this.messageQueue.delete(messageId);
        reject(error);
      }
    });
  }

  private handleMCPMessage(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const message: MCPMessage = JSON.parse(line);
        logger.mcpEvent('message_received', { id: message.id, method: message.method });
        
        if (message.id) {
          const callback = this.messageQueue.get(message.id.toString());
          if (callback) {
            callback(message);
            this.messageQueue.delete(message.id.toString());
          }
        }
      } catch (error) {
        logger.warn('Failed to parse MCP message', { data: line, error: error.message });
      }
    }
  }

  private async restart(): Promise<void> {
    if (this.isRestarting) {
      return;
    }

    this.isRestarting = true;
    logger.info('Restarting MCP server...');

    try {
      await this.cleanup();
      await new Promise(resolve => setTimeout(resolve, config.mcp.restartDelay));
      await this.initialize();
      this.emit('reconnect');
    } catch (error) {
      logger.error('Failed to restart MCP server', { error: error.message });
      this.emit('error', error);
    } finally {
      this.isRestarting = false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        // Simple health check by listing tools
        await this.callTool('health_check', {});
      } catch (error) {
        logger.warn('MCP heartbeat failed', { error: error.message });
        // Don't restart immediately on heartbeat failure
        // Let the process exit handler deal with it
      }
    }, config.mcp.healthCheckInterval);
  }

  private setupEventHandlers(): void {
    this.on('disconnect', () => {
      logger.warn('MCP client disconnected');
    });

    this.on('reconnect', () => {
      logger.info('MCP client reconnected');
    });

    this.on('error', (error) => {
      logger.error('MCP client error', { error: error.message });
    });
  }

  async cleanup(): Promise<void> {
    this.isInitialized = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear pending messages
    for (const [id, callback] of this.messageQueue.entries()) {
      try {
        callback({ 
          jsonrpc: '2.0', 
          id, 
          error: { code: -1, message: 'Connection closed' } 
        });
      } catch (error) {
        // Ignore callback errors during cleanup
      }
    }
    this.messageQueue.clear();

    if (this.mcpProcess && !this.mcpProcess.killed) {
      try {
        this.mcpProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.mcpProcess && !this.mcpProcess.killed) {
            this.mcpProcess.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        logger.warn('Error during MCP process cleanup', { error: error.message });
      }
    }

    this.mcpProcess = null;
  }

  private getNextMessageId(): string {
    return `msg_${this.nextMessageId++}`;
  }

  getAvailableTools(): MCPTool[] {
    return [...this.availableTools];
  }

  isConnected(): boolean {
    return this.isInitialized && 
           this.mcpProcess !== null && 
           !this.mcpProcess.killed;
  }

  async healthCheck(): Promise<{ status: string; tools: number }> {
    if (!this.isConnected()) {
      throw new MCPServiceError('MCP client not connected');
    }

    try {
      await this.callTool('health_check', {});
      return {
        status: 'healthy',
        tools: this.availableTools.length
      };
    } catch (error) {
      throw new MCPServiceError(`MCP health check failed: ${error.message}`);
    }
  }
}