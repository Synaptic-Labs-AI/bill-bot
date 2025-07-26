import { SearchFilters } from './common.js';

export interface ChatRequest {
  message: string;
  sessionId?: string;
  connectionId: string;
  options?: ChatOptions;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxIterations?: number;
  searchFilters?: SearchFilters;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatRequest {
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

export interface StopGenerationRequest {
  sessionId: string;
  connectionId: string;
}

export interface StopGenerationResponse {
  success: boolean;
  message: string;
  stoppedAt: string;
}