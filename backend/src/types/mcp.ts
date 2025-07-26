export interface MCPMessage {
  jsonrpc: '2.0';
  id: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface SearchOptions {
  searchType?: 'semantic' | 'keyword' | 'hybrid';
  threshold?: number;
  limit?: number;
  filters?: Record<string, any>;
  enableReranking?: boolean;
}

export interface SearchResult {
  results: any[];
  citations?: any[];
  metadata: {
    searchType: string;
    iteration: number;
    searchTime: number;
    resultCount: number;
    threshold?: number;
    reranked?: boolean;
  };
  needsRefinement?: boolean;
}

export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'MCPError';
  }
}