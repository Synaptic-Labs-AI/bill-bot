import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type { APIResponse, APIError, Bill, Citation, SearchFilters, SearchMetadata } from '@/types';

export interface ChatServiceConfig {
  baseURL?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface SendMessageRequest {
  message: string;
  sessionId?: string;
  connectionId: string;
  options?: {
    model?: string;
    temperature?: number;
    maxIterations?: number;
    searchFilters?: SearchFilters;
  };
}

export interface SendMessageResponse {
  success: boolean;
  sessionId: string;
  messageId: string;
}

export interface StopGenerationRequest {
  sessionId: string;
  connectionId: string;
}

export interface BillSearchRequest {
  q: string;
  type?: 'semantic' | 'keyword' | 'hybrid';
  chamber?: 'house' | 'senate';
  status?: string[];
  congress?: number;
  sponsor?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  includeEmbeddings?: boolean;
  includeCitations?: boolean;
}

export interface BillSearchResponse {
  bills: Bill[];
  citations?: Citation[];
  metadata: SearchMetadata;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: ServiceStatus;
    openrouter: ServiceStatus;
    mcp: ServiceStatus;
    redis: ServiceStatus;
  };
  metrics: {
    uptime: number;
    memory: MemoryUsage;
    activeConnections: number;
    requestRate: number;
  };
}

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastCheck: string;
  error?: string;
}

interface MemoryUsage {
  used: number;
  total: number;
  percentage: number;
}

export class ChatService {
  private client: AxiosInstance;
  private config: ChatServiceConfig;

  constructor(config: ChatServiceConfig = {}) {
    this.config = {
      baseURL: '/api',
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add request ID for tracking
        config.headers['X-Request-ID'] = this.generateRequestId();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with retry logic
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        // Don't retry if already exceeded max attempts
        if (!config || config.__retryCount >= (this.config.retryAttempts || 3)) {
          return Promise.reject(this.handleError(error));
        }

        // Initialize retry count
        config.__retryCount = config.__retryCount || 0;
        config.__retryCount++;

        // Only retry on network errors or 5xx responses
        if (
          !error.response || 
          (error.response.status >= 500 && error.response.status < 600)
        ) {
          const delay = this.config.retryDelay! * Math.pow(2, config.__retryCount - 1);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleError(error: any): APIError {
    if (error.response) {
      // Server responded with error status
      return {
        error: error.response.data?.error || 'Server Error',
        code: error.response.data?.code || `HTTP_${error.response.status}`,
        message: error.response.data?.message || error.message,
        details: error.response.data?.details,
        timestamp: new Date().toISOString(),
        recoverable: error.response.status < 500,
      };
    } else if (error.request) {
      // Network error
      return {
        error: 'Network Error',
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to the server',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
    } else {
      // Other error
      return {
        error: 'Unknown Error',
        code: 'UNKNOWN_ERROR',
        message: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
    }
  }

  // Chat Methods
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const response: AxiosResponse<APIResponse<SendMessageResponse>> = await this.client.post(
      '/chat/stream',
      request
    );
    
    return response.data.data;
  }

  async stopGeneration(request: StopGenerationRequest): Promise<void> {
    await this.client.post('/chat/stop', request);
  }

  // Search Methods
  async searchBills(request: BillSearchRequest): Promise<BillSearchResponse> {
    const response: AxiosResponse<APIResponse<BillSearchResponse>> = await this.client.get(
      '/bills/search',
      { params: request }
    );
    
    return response.data.data;
  }

  async getBillDetails(billId: string, options?: {
    includeActions?: boolean;
    includeVotes?: boolean;
    includeAmendments?: boolean;
    includeRelated?: boolean;
  }): Promise<Bill> {
    const response: AxiosResponse<APIResponse<{ bill: Bill }>> = await this.client.get(
      `/bills/${billId}`,
      { params: options }
    );
    
    return response.data.data.bill;
  }

  // Health and Status
  async getHealth(): Promise<HealthStatus> {
    const response: AxiosResponse<HealthStatus> = await this.client.get('/health');
    return response.data;
  }

  // Connection management
  updateTimeout(timeout: number): void {
    this.client.defaults.timeout = timeout;
  }

  updateBaseURL(baseURL: string): void {
    this.client.defaults.baseURL = baseURL;
  }
}

// Default service instance
export const chatService = new ChatService({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
});

// Factory function for creating service instances
export function createChatService(config?: ChatServiceConfig): ChatService {
  return new ChatService(config);
}