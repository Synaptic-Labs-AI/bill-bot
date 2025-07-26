import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { config } from '../config/app.js';
import { logger } from '../utils/logger.js';
import { OpenRouterServiceError } from '../utils/errors.js';
import {
  OpenRouterMessage,
  OpenRouterTool,
  OpenRouterCompletionRequest,
  OpenRouterCompletionResponse,
  OpenRouterStreamChunk,
  OpenRouterError
} from '../types/openrouter.js';

export class OpenRouterClient {
  private client: AxiosInstance;
  private rateLimitInfo = {
    remaining: Infinity,
    resetTime: 0,
    limit: Infinity
  };

  constructor() {
    this.client = axios.create({
      baseURL: config.openRouter.baseUrl,
      timeout: 60000, // 60 seconds
      headers: {
        'Authorization': `Bearer ${config.openRouter.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bill-bot.app',
        'X-Title': 'Bill Bot - Legislative AI Assistant'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.openRouterEvent('request_start', {
          url: config.url,
          method: config.method,
          data: config.data ? JSON.stringify(config.data).substring(0, 200) + '...' : undefined
        });
        return config;
      },
      (error) => {
        logger.error('OpenRouter request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for rate limit tracking and error handling
    this.client.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response);
        logger.openRouterEvent('request_success', {
          status: response.status,
          rateLimitRemaining: this.rateLimitInfo.remaining
        });
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response);
          this.handleAPIError(error);
        }
        return Promise.reject(error);
      }
    );
  }

  private updateRateLimitInfo(response: AxiosResponse): void {
    const remaining = response.headers['x-ratelimit-remaining'];
    const limit = response.headers['x-ratelimit-limit'];
    const reset = response.headers['x-ratelimit-reset'];

    if (remaining !== undefined) {
      this.rateLimitInfo.remaining = parseInt(remaining, 10);
    }
    if (limit !== undefined) {
      this.rateLimitInfo.limit = parseInt(limit, 10);
    }
    if (reset !== undefined) {
      this.rateLimitInfo.resetTime = parseInt(reset, 10) * 1000; // Convert to milliseconds
    }
  }

  private handleAPIError(error: any): void {
    const status = error.response?.status;
    const data = error.response?.data;

    logger.error('OpenRouter API error', {
      status,
      error: data?.error?.message || error.message,
      rateLimitRemaining: this.rateLimitInfo.remaining
    });

    if (status === 429) {
      const retryAfter = error.response?.headers['retry-after'] || 60;
      throw new OpenRouterServiceError(
        `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        429
      );
    }

    if (status === 401) {
      throw new OpenRouterServiceError('Invalid API key', 401);
    }

    if (status === 400) {
      throw new OpenRouterServiceError(
        data?.error?.message || 'Invalid request parameters',
        400
      );
    }

    if (status >= 500) {
      throw new OpenRouterServiceError(
        'OpenRouter service unavailable',
        status
      );
    }

    throw new OpenRouterServiceError(
      data?.error?.message || 'OpenRouter API error',
      status || 500
    );
  }

  async createCompletion(
    messages: OpenRouterMessage[],
    options: {
      model?: string;
      tools?: OpenRouterTool[];
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<OpenRouterCompletionResponse> {
    const {
      model = config.openRouter.model,
      tools,
      temperature = config.openRouter.temperature,
      maxTokens = 4000,
      stream = false
    } = options;

    const request: OpenRouterCompletionRequest = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
      ...(tools && { tools })
    };

    try {
      await this.checkRateLimit();
      
      const response = await this.client.post<OpenRouterCompletionResponse>(
        '/chat/completions',
        request
      );

      return response.data;
    } catch (error) {
      if (error instanceof OpenRouterServiceError) {
        throw error;
      }
      
      logger.error('Completion request failed', { 
        error: error.message,
        model,
        messageCount: messages.length
      });
      
      throw new OpenRouterServiceError(
        `Completion failed: ${error.message}`,
        error.response?.status || 500
      );
    }
  }

  async *createStreamingCompletion(
    messages: OpenRouterMessage[],
    options: {
      model?: string;
      tools?: OpenRouterTool[];
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<OpenRouterStreamChunk, void, unknown> {
    const {
      model = config.openRouter.model,
      tools,
      temperature = config.openRouter.temperature,
      maxTokens = 4000
    } = options;

    const request: OpenRouterCompletionRequest = {
      model,
      messages,
      tools,
      temperature,
      max_tokens: maxTokens,
      stream: true
    };

    try {
      await this.checkRateLimit();

      const response = await this.client.post('/chat/completions', request, {
        responseType: 'stream',
        timeout: 120000 // 2 minutes for streaming
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) {
            continue;
          }

          const data = trimmed.slice(6); // Remove 'data: ' prefix
          
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed: OpenRouterStreamChunk = JSON.parse(data);
            yield parsed;
          } catch (error) {
            logger.warn('Failed to parse streaming chunk', { data, error: error.message });
          }
        }
      }
    } catch (error) {
      if (error instanceof OpenRouterServiceError) {
        throw error;
      }
      
      logger.error('Streaming completion failed', {
        error: error.message,
        model,
        messageCount: messages.length
      });
      
      throw new OpenRouterServiceError(
        `Streaming completion failed: ${error.message}`,
        error.response?.status || 500
      );
    }
  }

  async createToolCompletion(
    messages: OpenRouterMessage[],
    tools: OpenRouterTool[],
    options: {
      model?: string;
      temperature?: number;
      maxIterations?: number;
    } = {}
  ): Promise<{
    messages: OpenRouterMessage[];
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, any>;
      result: any;
    }>;
    finalResponse: string;
  }> {
    const {
      model = config.openRouter.model,
      temperature = config.openRouter.temperature,
      maxIterations = config.search.maxIterations
    } = options;

    const conversationMessages = [...messages];
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, any>;
      result: any;
    }> = [];

    let iteration = 0;
    let hasToolCalls = true;

    while (hasToolCalls && iteration < maxIterations) {
      const completion = await this.createCompletion(conversationMessages, {
        model,
        tools,
        temperature,
        stream: false
      });

      const choice = completion.choices[0];
      if (!choice?.message) {
        break;
      }

      conversationMessages.push(choice.message);

      if (choice.message.tool_calls) {
        hasToolCalls = true;
        
        for (const toolCall of choice.message.tool_calls) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            
            // This would be handled by the chat orchestrator
            // For now, we'll just record the tool call
            toolCalls.push({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: args,
              result: null // Will be filled by orchestrator
            });
          } catch (error) {
            logger.warn('Failed to parse tool call arguments', {
              toolCall,
              error: error.message
            });
          }
        }
      } else {
        hasToolCalls = false;
      }

      iteration++;
    }

    const finalMessage = conversationMessages[conversationMessages.length - 1];
    const finalResponse = finalMessage?.content || '';

    return {
      messages: conversationMessages,
      toolCalls,
      finalResponse
    };
  }

  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitInfo.remaining <= 1) {
      const now = Date.now();
      const resetTime = this.rateLimitInfo.resetTime;
      
      if (resetTime > now) {
        const waitTime = resetTime - now;
        logger.warn('Rate limit reached, waiting for reset', { waitTimeMs: waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async healthCheck(): Promise<{ status: string; model: string }> {
    try {
      const testMessages: OpenRouterMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const response = await this.createCompletion(testMessages, {
        model: config.openRouter.model,
        maxTokens: 10
      });

      return {
        status: 'healthy',
        model: response.model
      };
    } catch (error) {
      throw new OpenRouterServiceError(`Health check failed: ${error.message}`);
    }
  }

  getRateLimitInfo(): {
    remaining: number;
    limit: number;
    resetTime: number;
  } {
    return { ...this.rateLimitInfo };
  }

  getAvailableModels(): string[] {
    return [
      config.openRouter.model,
      config.openRouter.fallbackModel,
      'anthropic/claude-3-haiku',
      'openai/gpt-4o',
      'openai/gpt-3.5-turbo'
    ];
  }
}