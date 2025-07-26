/**
 * MCP Server Type Definitions
 * 
 * Custom types for the Bill Bot MCP server implementation.
 * These types are separate from the backend types to avoid tight coupling.
 */

import { z } from 'zod';

// =====================================================================
// SEARCH TYPES
// =====================================================================

export interface SearchIteration {
  iteration: number;
  query: string;
  strategy: RefinementStrategy;
  resultCount: number;
  newResultCount?: number;
  cumulativeCount: number;
  searchMetadata: SearchMetadata;
  timestamp: string;
}

export interface SearchSession {
  sessionId: string;
  originalQuery: string;
  iterations: SearchIteration[];
  startTime: string;
  endTime?: string;
  totalResults: number;
  completionReason: CompletionReason;
}

export interface SearchMetadata {
  searchType: 'semantic' | 'keyword' | 'hybrid';
  iteration: number;
  searchTime: number;
  resultCount: number;
  threshold?: number;
  reranked: boolean;
}

export type RefinementStrategy = 
  | 'initial'
  | 'expand_terms' 
  | 'narrow_focus' 
  | 'change_timeframe' 
  | 'adjust_filters'
  | 'broaden_scope'
  | 'deepen_search';

export type CompletionReason = 
  | 'max_iterations' 
  | 'sufficient_results' 
  | 'no_new_results' 
  | 'error' 
  | 'user_abort';

// =====================================================================
// BILL TYPES
// =====================================================================

export interface BillResult {
  id: number;
  billNumber: string;
  title: string;
  summary: string | null;
  sponsor: string | null;
  chamber: string;
  status: string;
  introducedDate: string | null;
  lastActionDate: string | null;
  committee: string | null;
  relevanceScore?: number;
  similarity?: number;
  rank: number;
  // Additional metadata for citations
  sourceUrl?: string;
  congressNumber?: number;
  billType?: string;
  actions?: any[];
  votes?: any[];
}

export interface ExecutiveActionResult {
  id: string;
  executiveOrderNumber?: number;
  actionType: string;
  title: string;
  summary: string | null;
  administration: string;
  presidentName: string;
  signedDate: string;
  status: string;
  relevanceScore?: number;
  similarity?: number;
  rank: number;
  // Additional metadata for citations
  citation: string;
  contentUrl?: string;
  pdfUrl?: string;
  agenciesAffected?: string[];
  policyAreas?: string[];
}

export type UnifiedResult = BillResult | ExecutiveActionResult;

// =====================================================================
// CONTEXT TYPES
// =====================================================================

export interface SponsorInfo {
  name: string;
  party: string;
  state: string;
  chamber: string;
  billCount: number;
  activeBillCount: number;
  latestBillDate: string;
  topicsSponsored: string[];
  matchScore: number;
}

export interface TopicInfo {
  topicName: string;
  category: string;
  description: string;
  billCount: number;
  activeBillCount: number;
  sponsorCount: number;
  relevanceScore: number;
  recentActivityScore: number;
}

export interface StatusInfo {
  status: string;
  description: string;
  count: number;
  chamberBreakdown?: {
    house: number;
    senate: number;
  };
}

export interface AdministrationInfo {
  administration: string;
  presidentName: string;
  actionCount: number;
  activeActionCount: number;
  firstActionDate: string;
  lastActionDate: string;
  actionTypes: string[];
}

export interface AgencyInfo {
  agencyName: string;
  agencyCode?: string;
  actionCount: number;
  activeActionCount: number;
  roles: string[];
  administrations: string[];
  actionTypes: string[];
  latestActionDate: string;
}

export interface ContextData {
  sponsors: SponsorInfo[];
  statuses: StatusInfo[];
  topics: TopicInfo[];
  administrations: AdministrationInfo[];
  agencies: AgencyInfo[];
  dateRanges: DateRangeInfo[];
  lastUpdated: string;
  buildTime?: number;
}

export interface DateRangeInfo {
  session: string;
  startDate: string;
  endDate: string;
  billCount: number;
}

// =====================================================================
// SEARCH OPTIONS AND FILTERS
// =====================================================================

export interface SearchFilters {
  chamber?: 'house' | 'senate' | 'both';
  status?: string[];
  congress?: number;
  sponsor?: string[];
  committee?: string;
  topics?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  // Executive action specific
  actionType?: string;
  administration?: string;
  agencies?: string[];
}

export interface SearchOptions {
  searchType?: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
  threshold?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  enableReranking?: boolean;
  filters?: SearchFilters;
  includeBills?: boolean;
  includeExecutiveActions?: boolean;
}

// =====================================================================
// CITATION TYPES
// =====================================================================

export interface Citation {
  id: string;
  type: 'bill' | 'executive_action';
  title: string;
  url: string;
  relevanceScore: number;
  excerpt: string;
  
  // Content-specific metadata
  billNumber?: string;
  sponsor?: string;
  chamber?: string;
  status?: string;
  introducedDate?: string;
  
  // Executive action metadata
  executiveOrderNumber?: number;
  actionType?: string;
  administration?: string;
  presidentName?: string;
  signedDate?: string;
  citation?: string;
  
  // Source information
  source: {
    name: string;
    type: 'official' | 'congressional' | 'whitehouse';
    publishedDate?: string;
    author?: string;
  };
  
  // Search context
  searchContext: {
    query: string;
    searchMethod: string;
    rank: number;
    searchTimestamp: string;
    iterationsUsed: number;
  };
  
  // Relevance indicators
  relevanceIndicators: {
    titleRelevance: number;
    summaryRelevance: number;
    termMatches: number;
    semanticScore: number;
    recency: number;
    legislativeImportance: number;
  };
}

// =====================================================================
// MCP TOOL SCHEMAS
// =====================================================================

export const SearchBillsSchema = z.object({
  query: z.string().describe('Search query for bills (keywords, topics, or natural language)'),
  searchType: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid').describe('Type of search to perform'),
  filters: z.object({
    chamber: z.enum(['house', 'senate', 'both']).optional().describe('Filter by chamber of origin'),
    status: z.array(z.string()).optional().describe('Filter by bill status'),
    congress: z.number().min(100).optional().describe('Filter by Congress number'),
    sponsor: z.array(z.string()).optional().describe('Filter by sponsor names (use exact names)'),
    committee: z.string().optional().describe('Filter by committee name'),
    topics: z.array(z.string()).optional().describe('Filter by topic categories'),
    dateRange: z.object({
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)')
    }).optional().describe('Filter by introduction date range')
  }).optional(),
  limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return'),
  iteration: z.number().min(1).max(20).default(1).describe('Current iteration number for iterative search'),
  previousResults: z.array(z.string()).optional().describe('Previous search result IDs for deduplication')
});

export const GetBillDetailsSchema = z.object({
  billId: z.string().describe('Bill ID or bill number (e.g., "H.R.1234" or database ID)'),
  includeActions: z.boolean().default(true).describe('Include legislative actions timeline'),
  includeVotes: z.boolean().default(true).describe('Include voting records'),
  includeAmendments: z.boolean().default(false).describe('Include amendment information'),
  includeRelated: z.boolean().default(false).describe('Include related bills and executive actions')
});

export const SearchExecutiveActionsSchema = z.object({
  query: z.string().describe('Search query for executive actions'),
  searchType: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
  filters: z.object({
    actionType: z.enum(['executive_order', 'presidential_memorandum', 'proclamation', 'presidential_directive']).optional(),
    administration: z.string().optional().describe('Presidential administration (use exact names)'),
    status: z.enum(['active', 'revoked', 'superseded', 'expired', 'amended']).optional(),
    agencies: z.array(z.string()).optional().describe('Federal agencies affected (use exact names)'),
    dateRange: z.object({
      start: z.string(),
      end: z.string()
    }).optional()
  }).optional(),
  limit: z.number().min(1).max(50).default(10),
  iteration: z.number().min(1).max(20).default(1)
});

export const RefineSearchSchema = z.object({
  originalQuery: z.string().describe('Original search query'),
  previousResults: z.array(z.object({
    id: z.string(),
    title: z.string(),
    relevanceScore: z.number(),
    type: z.enum(['bill', 'executive_action'])
  })).describe('Results from previous searches'),
  refinementStrategy: z.enum(['expand_terms', 'narrow_focus', 'change_timeframe', 'adjust_filters', 'broaden_scope', 'deepen_search']),
  targetResultCount: z.number().min(1).max(50).default(10),
  iteration: z.number().min(1).max(20)
});

// Context discovery schemas
export const GetAvailableSponsorsSchema = z.object({
  chamber: z.enum(['house', 'senate', 'both']).optional(),
  limit: z.number().min(1).max(100).default(20),
  searchTerm: z.string().optional().describe('Search term to filter sponsors'),
  minBillCount: z.number().min(1).default(1).describe('Minimum number of bills to include sponsor')
});

export const GetAvailableStatusesSchema = z.object({
  includeCounts: z.boolean().default(true).describe('Include bill counts for each status'),
  chamberBreakdown: z.boolean().default(false).describe('Include chamber-specific counts')
});

export const GetTopicCategoriesSchema = z.object({
  queryHint: z.string().optional().describe('Query hint to get relevant topics'),
  limit: z.number().min(1).max(50).default(15),
  minBillCount: z.number().min(1).default(1)
});

export const GetAdministrationsSchema = z.object({
  includeStats: z.boolean().default(true).describe('Include statistics for each administration'),
  activeOnly: z.boolean().default(false).describe('Only include administrations with active actions')
});

export const GetAgenciesSchema = z.object({
  limit: z.number().min(1).max(100).default(25),
  administration: z.string().optional().describe('Filter by specific administration'),
  minActionCount: z.number().min(1).default(1)
});

// =====================================================================
// RESPONSE TYPES
// =====================================================================

export interface IterativeSearchResult {
  query: string;
  results: UnifiedResult[];
  citations: Citation[];
  searchSession: SearchSession;
  metadata: {
    totalIterations: number;
    finalResultCount: number;
    searchDuration: number;
    completionReason: CompletionReason;
    performanceMetrics?: {
      avgIterationTime: number;
      cacheHitRate: number;
      totalDbQueries: number;
    };
  };
}

export interface SingleSearchResult {
  results: UnifiedResult[];
  metadata: SearchMetadata;
  needsRefinement?: boolean;
  suggestedRefinements?: RefinementStrategy[];
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      text: string;
      mimeType?: string;
    };
  }>;
  isError?: boolean;
  metadata?: Record<string, any>;
}

// =====================================================================
// ERROR TYPES
// =====================================================================

export class MCPSearchError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'MCPSearchError';
  }
}

export class MCPContextError extends Error {
  constructor(
    message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'MCPContextError';
  }
}

export class MCPValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public validationDetails?: Record<string, any>
  ) {
    super(message);
    this.name = 'MCPValidationError';
  }
}

// =====================================================================
// UTILITY TYPES
// =====================================================================

export type MCPToolName = 
  | 'search_bills'
  | 'search_executive_actions'
  | 'get_bill_details'
  | 'get_executive_action_details'
  | 'refine_search'
  | 'get_available_sponsors'
  | 'get_available_statuses'
  | 'get_topic_categories'
  | 'get_administrations'
  | 'get_agencies'
  | 'health_check';

export interface ToolCallContext {
  toolName: MCPToolName;
  args: Record<string, any>;
  iteration?: number;
  sessionId?: string;
  timestamp: string;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface PerformanceMetrics {
  toolCalls: Map<MCPToolName, {
    totalCalls: number;
    avgDuration: number;
    successRate: number;
    lastCall: string;
  }>;
  searchSessions: {
    totalSessions: number;
    avgIterations: number;
    avgDuration: number;
    avgResults: number;
  };
  cacheStats: {
    hitRate: number;
    totalRequests: number;
    cacheSize: number;
  };
  dbStats: {
    totalQueries: number;
    avgQueryTime: number;
    connectionHealth: boolean;
  };
}

// Type guards
export const isBillResult = (result: UnifiedResult): result is BillResult => {
  return 'billNumber' in result;
};

export const isExecutiveActionResult = (result: UnifiedResult): result is ExecutiveActionResult => {
  return 'actionType' in result;
};

export const isValidSearchType = (type: string): type is SearchOptions['searchType'] => {
  return ['semantic', 'keyword', 'hybrid'].includes(type);
};

export const isValidRefinementStrategy = (strategy: string): strategy is RefinementStrategy => {
  return [
    'initial',
    'expand_terms',
    'narrow_focus',
    'change_timeframe',
    'adjust_filters',
    'broaden_scope',
    'deepen_search'
  ].includes(strategy);
};