export interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastCheck: string;
  error?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    mcp: ServiceStatus;
    openrouter: ServiceStatus;
  };
  metrics: {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    activeConnections: number;
  };
}

export interface APIError {
  error: string;
  code?: string;
  message?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  recoverable?: boolean;
}

export interface SearchFilters {
  chamber?: 'house' | 'senate';
  status?: string[];
  congress?: number;
  sponsor?: string;
  dateFrom?: string;
  dateTo?: string;
  topics?: string[];
}

export interface Citation {
  id: string;
  type: 'bill' | 'amendment' | 'vote' | 'committee_report';
  title: string;
  url: string;
  relevanceScore: number;
  excerpt: string;
  billNumber?: string;
  sponsor?: string;
  chamber?: string;
  status?: string;
  introducedDate?: string;
  source: {
    name: string;
    type: 'official' | 'summary';
    publishedDate?: string;
    author?: string;
  };
  searchContext?: {
    query: string;
    searchMethod: string;
    rank: number;
    searchTimestamp: string;
    iterationsUsed: number;
  };
}

export interface BillResult {
  id: string;
  billNumber: string;
  title: string;
  summary?: string;
  sponsor: string;
  chamber: 'house' | 'senate';
  status: string;
  introducedDate: string;
  relevanceScore?: number;
  similarity?: number;
}