import { v4 as uuidv4 } from 'uuid';
import { OpenRouterClient } from './openRouterClient.js';
import { MCPClient } from './mcpClient.js';
import { StreamingService } from './streamingService.js';
import { config } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { AppError, MCPServiceError, OpenRouterServiceError } from '../utils/errors.js';
import { 
  ChatRequest, 
  ChatOptions, 
  ChatMessage 
} from '../types/chat.js';
import { 
  OpenRouterMessage, 
  OpenRouterTool 
} from '../types/openrouter.js';
import { Citation, BillResult } from '../types/common.js';

export class ChatOrchestrator {
  private openRouter: OpenRouterClient;
  private mcpClient: MCPClient;
  private streamingService: StreamingService;
  private activeSessions = new Map<string, AbortController>();

  constructor() {
    this.openRouter = new OpenRouterClient();
    this.mcpClient = new MCPClient();
    this.streamingService = new StreamingService();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing chat orchestrator...');
      await this.mcpClient.initialize();
      logger.info('Chat orchestrator initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize chat orchestrator', { error: error.message });
      throw new AppError(`Chat orchestrator initialization failed: ${error.message}`);
    }
  }

  async processChat(request: ChatRequest): Promise<void> {
    const { message, sessionId, connectionId, options } = request;
    const startTime = Date.now();
    const messageId = uuidv4();
    
    // Create abort controller for this session
    const abortController = new AbortController();
    if (sessionId) {
      this.activeSessions.set(sessionId, abortController);
    }

    try {
      logger.info('Processing chat request', { 
        sessionId, 
        connectionId, 
        messageLength: message.length 
      });

      // Send start event
      this.streamingService.streamStart(connectionId, {
        sessionId: sessionId || 'anonymous',
        messageId,
        timestamp: new Date().toISOString()
      });

      // Ensure MCP client is initialized
      if (!this.mcpClient.isConnected()) {
        await this.mcpClient.initialize();
      }

      // Build system prompt and messages
      const systemPrompt = this.buildSystemPrompt(options);
      const messages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ];

      // Get available tools from MCP
      const mcpTools = this.mcpClient.getAvailableTools();
      const openRouterTools = this.convertMCPToolsToOpenRouter(mcpTools);

      logger.info('Starting LLM completion with tools', { 
        toolCount: openRouterTools.length,
        model: options?.model || config.openRouter.model
      });

      // Start streaming completion with tool support
      await this.processStreamingCompletionWithTools(
        messages,
        openRouterTools,
        connectionId,
        messageId,
        options,
        abortController.signal
      );

      // Send successful end event
      this.streamingService.streamEnd(connectionId, {
        messageId,
        status: 'completed'
      }, startTime);

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.info('Chat session cancelled', { sessionId, connectionId });
        this.streamingService.streamEnd(connectionId, {
          messageId,
          status: 'stopped'
        }, startTime);
        return;
      }

      logger.error('Chat processing failed', {
        sessionId,
        connectionId,
        error: error.message
      });

      this.streamingService.streamError(
        connectionId,
        error instanceof AppError ? error.message : 'An unexpected error occurred',
        error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        error instanceof AppError ? true : false
      );

      this.streamingService.streamEnd(connectionId, {
        messageId,
        status: 'error'
      }, startTime);

    } finally {
      if (sessionId) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  private async processStreamingCompletionWithTools(
    messages: OpenRouterMessage[],
    tools: OpenRouterTool[],
    connectionId: string,
    messageId: string,
    options?: ChatOptions,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const conversationMessages = [...messages];
    let iteration = 0;
    const maxIterations = options?.maxIterations || config.search.maxIterations;

    while (iteration < maxIterations) {
      if (abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      logger.debug('Starting completion iteration', { iteration, messageCount: conversationMessages.length });

      // Create streaming completion
      const streamGenerator = this.openRouter.createStreamingCompletion(
        conversationMessages,
        {
          model: options?.model || config.openRouter.model,
          tools: tools.length > 0 ? tools : undefined,
          temperature: options?.temperature || config.openRouter.temperature,
          maxTokens: 4000
        }
      );

      let assistantMessage = '';
      let toolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];

      // Process streaming chunks
      for await (const chunk of streamGenerator) {
        if (abortSignal?.aborted) {
          throw new Error('Aborted');
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        // Handle content streaming
        if (choice.delta.content) {
          assistantMessage += choice.delta.content;
          this.streamingService.streamContent(connectionId, choice.delta.content, messageId);
        }

        // Handle tool calls
        if (choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            if (toolCall.id && toolCall.function?.name) {
              // Find or create tool call entry
              let existingCall = toolCalls.find(tc => tc.id === toolCall.id);
              if (!existingCall) {
                existingCall = {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  arguments: ''
                };
                toolCalls.push(existingCall);

                // Stream tool call start
                this.streamingService.streamToolCall(connectionId, {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  arguments: {},
                  status: 'started'
                });
              }

              // Accumulate arguments
              if (toolCall.function.arguments) {
                existingCall.arguments += toolCall.function.arguments;
              }
            }
          }
        }
      }

      // Add assistant message to conversation
      conversationMessages.push({
        role: 'assistant',
        content: assistantMessage || null
      });

      // Process any tool calls
      if (toolCalls.length > 0) {
        await this.processToolCalls(
          toolCalls,
          conversationMessages,
          connectionId,
          abortSignal
        );
        iteration++;
      } else {
        // No more tool calls, we're done
        break;
      }
    }

    if (iteration >= maxIterations) {
      logger.warn('Maximum iterations reached', { 
        maxIterations, 
        connectionId 
      });
    }
  }

  private async processToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    conversationMessages: OpenRouterMessage[],
    connectionId: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const toolResults: OpenRouterMessage[] = [];

    for (const toolCall of toolCalls) {
      if (abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      try {
        logger.debug('Executing tool call', { 
          toolId: toolCall.id, 
          toolName: toolCall.name 
        });

        // Parse arguments
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.arguments || '{}');
        } catch (error) {
          throw new Error(`Invalid tool arguments: ${error.message}`);
        }

        // Execute tool via MCP
        const startTime = Date.now();
        const result = await this.mcpClient.callTool(toolCall.name, args);
        const duration = Date.now() - startTime;

        // Stream tool completion
        this.streamingService.streamToolCall(connectionId, {
          id: toolCall.id,
          name: toolCall.name,
          arguments: args,
          status: 'completed',
          result,
          metadata: {
            duration,
            resultCount: this.extractResultCount(result)
          }
        });

        // Generate citations if the result contains bills
        const citations = this.extractCitations(result, toolCall.name, args);
        for (const citation of citations) {
          this.streamingService.streamCitation(connectionId, citation);
        }

        // Add tool result to conversation
        toolResults.push({
          role: 'user', // Tool results are sent as user messages in OpenRouter
          content: this.formatToolResult(toolCall.name, result)
        });

      } catch (error) {
        logger.error('Tool execution failed', {
          toolId: toolCall.id,
          toolName: toolCall.name,
          error: error.message
        });

        // Stream tool failure
        this.streamingService.streamToolCall(connectionId, {
          id: toolCall.id,
          name: toolCall.name,
          arguments: JSON.parse(toolCall.arguments || '{}'),
          status: 'failed',
          error: error.message
        });

        // Add error result to conversation
        toolResults.push({
          role: 'user',
          content: `Tool ${toolCall.name} failed: ${error.message}`
        });
      }
    }

    // Add all tool results to conversation
    conversationMessages.push(...toolResults);
  }

  private convertMCPToolsToOpenRouter(mcpTools: any[]): OpenRouterTool[] {
    return mcpTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  private buildSystemPrompt(options?: ChatOptions): string {
    return `You are Bill Bot, an AI assistant specialized in helping users explore and understand legislative bills from the U.S. Congress.

Your capabilities include:
- Searching for bills by keyword, sponsor, topic, or status using the search_bills tool
- Providing detailed analysis of bill content and implications
- Explaining legislative processes and procedures
- Offering insights into bill progression and voting records

Guidelines:
- Always provide accurate, factual information based on search results
- Include proper citations for all information you reference
- Be clear about limitations and uncertainties in the data
- Use iterative search to find the most relevant and comprehensive information
- Provide context about legislative processes when helpful
- If search results are insufficient, try refining your search terms or using different approaches

Available tools allow you to search bills with up to ${options?.maxIterations || config.search.maxIterations} iterations to find comprehensive information.

When searching for bills:
1. Start with the user's exact query
2. If results are limited, try related terms or broader searches
3. Consider different time periods if needed
4. Look for both recent and historical bills if relevant
5. Provide summaries and analysis based on the search results

Always cite your sources and provide relevant bill numbers, sponsors, and status information.`;
  }

  private formatToolResult(toolName: string, result: any): string {
    if (typeof result === 'string') {
      return `Tool ${toolName} result: ${result}`;
    }
    
    if (typeof result === 'object') {
      return `Tool ${toolName} result: ${JSON.stringify(result, null, 2)}`;
    }
    
    return `Tool ${toolName} completed successfully`;
  }

  private extractResultCount(result: any): number {
    if (result && Array.isArray(result.results)) {
      return result.results.length;
    }
    if (Array.isArray(result)) {
      return result.length;
    }
    return 0;
  }

  private extractCitations(result: any, toolName: string, args: any): Citation[] {
    const citations: Citation[] = [];

    // Extract bills from search results
    if (result && Array.isArray(result.results)) {
      for (const [index, bill] of result.results.entries()) {
        if (bill && typeof bill === 'object') {
          citations.push(this.createCitationFromBill(bill, index + 1, args.query || ''));
        }
      }
    }

    return citations;
  }

  private createCitationFromBill(bill: BillResult, rank: number, query: string): Citation {
    return {
      id: bill.id || uuidv4(),
      type: 'bill',
      title: bill.title || 'Untitled Bill',
      url: `https://congress.gov/bill/${bill.billNumber?.toLowerCase()}`,
      relevanceScore: bill.relevanceScore || bill.similarity || 0,
      excerpt: this.generateExcerpt(bill, query),
      billNumber: bill.billNumber,
      sponsor: bill.sponsor,
      chamber: bill.chamber,
      status: bill.status,
      introducedDate: bill.introducedDate,
      source: {
        name: 'U.S. Congress',
        type: 'official',
        publishedDate: bill.introducedDate,
        author: bill.sponsor
      },
      searchContext: {
        query,
        searchMethod: 'hybrid',
        rank,
        searchTimestamp: new Date().toISOString(),
        iterationsUsed: 1
      }
    };
  }

  private generateExcerpt(bill: BillResult, query: string): string {
    const text = bill.summary || bill.title || '';
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    if (queryTerms.length === 0) {
      return text.substring(0, 200) + (text.length > 200 ? '...' : '');
    }

    // Find the best sentence that contains query terms
    const sentences = text.split(/[.!?]+/);
    let bestSentence = sentences[0] || text;
    let maxScore = 0;

    for (const sentence of sentences) {
      let score = 0;
      const lowerSentence = sentence.toLowerCase();
      for (const term of queryTerms) {
        if (lowerSentence.includes(term)) {
          score += 1;
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestSentence = sentence;
      }
    }

    let excerpt = bestSentence.trim();
    
    // Highlight query terms
    for (const term of queryTerms) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      excerpt = excerpt.replace(regex, `**$&**`);
    }

    if (excerpt.length > 300) {
      excerpt = excerpt.substring(0, 300) + '...';
    }

    return excerpt;
  }

  async cancelSession(sessionId?: string): Promise<void> {
    if (!sessionId) return;

    const abortController = this.activeSessions.get(sessionId);
    if (abortController) {
      abortController.abort();
      this.activeSessions.delete(sessionId);
      logger.info('Session cancelled', { sessionId });
    }
  }

  async healthCheck(): Promise<{
    status: string;
    services: {
      openrouter: string;
      mcp: string;
    };
  }> {
    const health = {
      status: 'healthy',
      services: {
        openrouter: 'unknown',
        mcp: 'unknown'
      }
    };

    try {
      await this.openRouter.healthCheck();
      health.services.openrouter = 'healthy';
    } catch (error) {
      health.services.openrouter = 'unhealthy';
      health.status = 'degraded';
    }

    try {
      await this.mcpClient.healthCheck();
      health.services.mcp = 'healthy';
    } catch (error) {
      health.services.mcp = 'unhealthy';
      health.status = 'degraded';
    }

    return health;
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  async cleanup(): Promise<void> {
    // Cancel all active sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.cancelSession(sessionId);
    }

    // Close all streaming connections
    this.streamingService.closeAllConnections();

    // Cleanup MCP client
    await this.mcpClient.cleanup();

    logger.info('Chat orchestrator cleanup completed');
  }
}