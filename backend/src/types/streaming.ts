import { Citation } from './common.js';

export interface SSEMessage {
  type: 'start' | 'content' | 'tool_call' | 'citation' | 'error' | 'end';
  data: any;
  timestamp: number;
}

export interface StartMessage {
  type: 'start';
  data: {
    sessionId: string;
    messageId: string;
    timestamp: string;
  };
}

export interface ContentMessage {
  type: 'content';
  data: {
    content: string;
    messageId: string;
  };
}

export interface ToolCallMessage {
  type: 'tool_call';
  data: {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'started' | 'completed' | 'failed';
    result?: any;
    error?: string;
    metadata?: {
      iteration?: number;
      searchType?: string;
      resultCount?: number;
      duration?: number;
    };
  };
}

export interface CitationMessage {
  type: 'citation';
  data: Citation;
}

export interface ErrorMessage {
  type: 'error';
  data: {
    error: string;
    code?: string;
    recoverable: boolean;
  };
}

export interface EndMessage {
  type: 'end';
  data: {
    messageId: string;
    totalTokens?: number;
    cost?: number;
    duration: number;
    status: 'completed' | 'error' | 'stopped';
  };
}

export type SSEEvent = StartMessage | ContentMessage | ToolCallMessage | CitationMessage | ErrorMessage | EndMessage;