// Core message types
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  tokens?: number;
  cost?: number;
  duration?: number;
  model?: string;
  [key: string]: any;
}

// Citation types
export interface Citation {
  id: string;
  type: 'bill' | 'amendment' | 'vote' | 'executive_action';
  title: string;
  url: string;
  relevanceScore: number;
  excerpt: string;
  billNumber?: string;
  sponsor?: string;
  chamber?: 'house' | 'senate';
  status?: string;
  introducedDate?: string;
  source: {
    name: string;
    type: string;
    publishedDate?: string;
  };
  searchContext: {
    query: string;
    rank: number;
    searchTimestamp: string;
  };
}

// Tool call types
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  stage?: ToolCallStage;
  duration?: number;
  timestamp: Date;
  metadata?: ToolCallMetadata;
}

export type ToolCallStage = 
  | 'preparing_search'
  | 'executing_query'
  | 'processing_results'
  | 'refining_search'
  | 'finalizing';

export interface ToolCallMetadata {
  iteration?: number;
  searchType?: string;
  resultCount?: number;
  query?: string;
  filters_applied?: string[];
  error_message?: string;
  retry_count?: number;
  max_iterations?: number;
  total_results?: number;
  context_type?: 'sponsors' | 'topics' | 'statuses';
  options_found?: number;
  content_id?: string;
  content_type?: 'bill' | 'executive_action';
}

// Bill types
export interface Bill {
  id: string;
  billNumber: string;
  title: string;
  summary?: string;
  sponsor: string;
  introducedDate: string;
  status: BillStatus;
  chamber: Chamber;
  committee?: string;
  metadata: BillMetadata;
}

export type BillStatus = 
  | 'introduced'
  | 'committee'
  | 'passed_house'
  | 'passed_senate'
  | 'enacted'
  | 'vetoed'
  | 'failed';

export type Chamber = 'house' | 'senate';

export interface BillMetadata {
  congress?: number;
  session?: number;
  committees?: string[];
  subjects?: string[];
  cosponsors?: string[];
  actions?: LegislativeAction[];
  votes?: Vote[];
  amendments?: Amendment[];
  [key: string]: any;
}

export interface LegislativeAction {
  id: string;
  date: string;
  description: string;
  chamber?: Chamber;
  actionType: string;
}

export interface Vote {
  id: string;
  date: string;
  description: string;
  chamber: Chamber;
  result: 'passed' | 'failed';
  votes: {
    yes: number;
    no: number;
    present: number;
    not_voting: number;
  };
}

export interface Amendment {
  id: string;
  number: string;
  title: string;
  sponsor: string;
  description?: string;
  status: string;
}

// Search types
export interface SearchFilters {
  status?: BillStatus[];
  chamber?: Chamber;
  dateRange?: {
    from: string;
    to: string;
  };
  sponsor?: string;
  committee?: string;
  congress?: number;
  subjects?: string[];
}

export interface SearchMetadata {
  totalResults: number;
  searchTime: number;
  searchType: 'semantic' | 'keyword' | 'hybrid';
  filters: SearchFilters;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// API types
export interface APIResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
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

// SSE types
export type SSEEvent = 
  | {
      type: 'start';
      data: {
        sessionId: string;
        messageId: string;
        timestamp: string;
      };
    }
  | {
      type: 'content';
      data: {
        content: string;
        messageId: string;
      };
    }
  | {
      type: 'tool_call';
      data: {
        id: string;
        tool_name: string;
        status: 'starting' | 'in_progress' | 'completed' | 'failed' | 'retrying';
        stage: ToolCallStage;
        metadata: ToolCallMetadata;
        timestamp: string;
      };
    }
  | {
      type: 'citation';
      data: Citation;
    }
  | {
      type: 'error';
      data: {
        error: string;
        code: string;
        recoverable: boolean;
      };
    }
  | {
      type: 'end';
      data: {
        messageId: string;
        totalTokens?: number;
        cost?: number;
        duration: number;
        status: 'completed' | 'error' | 'stopped';
      };
    };

// Chat session types
export interface ChatSession {
  id: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    title?: string;
    summary?: string;
    totalMessages: number;
    totalTokens?: number;
    totalCost?: number;
  };
}

// UI state types
export interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;
  toolCallsExpanded: Record<string, boolean>;
  citationsExpanded: Record<string, boolean>;
}

// Configuration types
export interface AppConfig {
  apiUrl: string;
  sseUrl: string;
  maxMessageLength: number;
  maxIterations: number;
  models: {
    default: string;
    options: string[];
  };
  features: {
    toolCallFeedback: boolean;
    citations: boolean;
    darkMode: boolean;
    voiceInput: boolean;
  };
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface ChatComponentProps extends BaseComponentProps {
  disabled?: boolean;
  loading?: boolean;
}

// Event types
export interface ChatEvents {
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
  onClearChat: () => void;
  onMessageRegenerate?: (messageId: string) => void;
  onMessageEdit?: (messageId: string, content: string) => void;
  onToolCallToggle?: (messageId: string, toolCallId: string) => void;
  onCitationClick?: (citation: Citation) => void;
}