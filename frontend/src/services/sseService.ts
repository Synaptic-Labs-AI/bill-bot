import type { SSEEvent } from '@/types';

export interface SSEServiceOptions {
  onMessage?: (event: SSEEvent) => void;
  onError?: (error: Event) => void;
  onOpen?: (event: Event) => void;
  onClose?: (event: Event) => void;
  timeout?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export class SSEService {
  private eventSource: EventSource | null = null;
  private url: string;
  private options: SSEServiceOptions;
  private reconnectAttempts = 0;
  private isConnected = false;
  private isClosed = false;

  constructor(url: string, options: SSEServiceOptions = {}) {
    this.url = url;
    this.options = {
      timeout: 30000, // 30 seconds
      reconnectDelay: 1000, // 1 second
      maxReconnectAttempts: 5,
      ...options,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.url);
        
        this.eventSource.onopen = (event) => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.options.onOpen?.(event);
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const data: SSEEvent = JSON.parse(event.data);
            this.options.onMessage?.(data);
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        this.eventSource.onerror = (event) => {
          this.isConnected = false;
          this.options.onError?.(event);
          
          // Only attempt reconnection if not manually closed
          if (!this.isClosed && this.shouldReconnect()) {
            this.reconnect();
          } else {
            reject(new Error('SSE connection failed'));
          }
        };

        // Set up timeout
        if (this.options.timeout) {
          setTimeout(() => {
            if (!this.isConnected) {
              reject(new Error('SSE connection timeout'));
              this.close();
            }
          }, this.options.timeout);
        }

      } catch (error) {
        reject(error);
      }
    });
  }

  private shouldReconnect(): boolean {
    return this.reconnectAttempts < (this.options.maxReconnectAttempts || 5);
  }

  private reconnect(): void {
    if (this.isClosed) return;

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay! * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting SSE reconnection ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isClosed) {
        this.close();
        this.connect().catch(console.error);
      }
    }, delay);
  }

  close(): void {
    this.isClosed = true;
    this.isConnected = false;
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.options.onClose?.(new Event('close'));
  }

  getReadyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Factory function for creating SSE connections
export function createSSEConnection(
  url: string, 
  options?: SSEServiceOptions
): SSEService {
  return new SSEService(url, options);
}

// Utility function to build SSE URL with query parameters
export function buildSSEUrl(
  baseUrl: string, 
  params: Record<string, string>
): string {
  const url = new URL(baseUrl, window.location.origin);
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  
  return url.toString();
}