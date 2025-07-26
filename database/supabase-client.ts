/**
 * Supabase Client Configuration
 * 
 * Provides configured Supabase client with type definitions and connection management
 * for Bill Bot database operations with vector search capabilities.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types/database.types';

// Environment variables validation
const requiredEnvVars = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

// Validate required environment variables
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Connection configuration
const supabaseConfig = {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // Bill Bot is stateless
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-application-name': 'bill-bot',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate limit for real-time updates
    },
  },
};

/**
 * Public Supabase client for general operations
 * Uses anonymous key with RLS policies
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  requiredEnvVars.SUPABASE_URL!,
  requiredEnvVars.SUPABASE_ANON_KEY!,
  supabaseConfig
);

/**
 * Admin Supabase client for privileged operations
 * Uses service role key to bypass RLS
 */
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  requiredEnvVars.SUPABASE_URL!,
  requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY!,
  {
    ...supabaseConfig,
    auth: {
      ...supabaseConfig.auth,
      autoRefreshToken: false,
    },
  }
);

/**
 * Bill Bot specific database client with enhanced functionality
 */
export class BillBotDatabase {
  private client: SupabaseClient<Database>;
  private isAdmin: boolean;

  constructor(useAdmin: boolean = false) {
    this.client = useAdmin ? supabaseAdmin : supabase;
    this.isAdmin = useAdmin;
  }

  // =====================================================================
  // BILLS OPERATIONS
  // =====================================================================

  /**
   * Search bills using semantic similarity
   */
  async searchBillsSemantic(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      statusFilter?: string[];
      chamberFilter?: string;
      dateFrom?: string;
      dateTo?: string;
      activeOnly?: boolean;
    } = {}
  ) {
    const {
      threshold = 0.7,
      limit = 10,
      statusFilter,
      chamberFilter,
      dateFrom,
      dateTo,
      activeOnly = true,
    } = options;

    const { data, error } = await this.client.rpc('search_bills_semantic', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_status: statusFilter || null,
      filter_chamber: chamberFilter || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      active_only: activeOnly,
    });

    if (error) {
      throw new Error(`Semantic search failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Search bills using hybrid approach (semantic + keyword)
   */
  async searchBillsHybrid(
    queryText: string,
    queryEmbedding: number[],
    options: {
      semanticWeight?: number;
      keywordWeight?: number;
      limit?: number;
      chamberFilter?: string;
      activeOnly?: boolean;
    } = {}
  ) {
    const {
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      limit = 10,
      chamberFilter,
      activeOnly = true,
    } = options;

    const { data, error } = await this.client.rpc('search_bills_hybrid', {
      query_text: queryText,
      query_embedding: queryEmbedding,
      semantic_weight: semanticWeight,
      keyword_weight: keywordWeight,
      match_count: limit,
      filter_chamber: chamberFilter || null,
      active_only: activeOnly,
    });

    if (error) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Insert a new bill
   */
  async insertBill(bill: Database['public']['Tables']['bills']['Insert']) {
    const { data, error } = await this.client
      .from('bills')
      .insert(bill)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert bill: ${error.message}`);
    }

    return data;
  }

  /**
   * Update bill embeddings
   */
  async updateBillEmbeddings(
    billId: number,
    embeddings: {
      titleEmbedding?: number[];
      summaryEmbedding?: number[];
      contentEmbedding?: number[];
    }
  ) {
    const updateData: Partial<Database['public']['Tables']['bills']['Update']> = {};
    
    if (embeddings.titleEmbedding) {
      updateData.title_embedding = embeddings.titleEmbedding;
    }
    if (embeddings.summaryEmbedding) {
      updateData.summary_embedding = embeddings.summaryEmbedding;
    }
    if (embeddings.contentEmbedding) {
      updateData.content_embedding = embeddings.contentEmbedding;
    }

    const { data, error } = await this.client
      .from('bills')
      .update(updateData)
      .eq('id', billId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update bill embeddings: ${error.message}`);
    }

    return data;
  }

  // =====================================================================
  // EXECUTIVE ACTIONS OPERATIONS
  // =====================================================================

  /**
   * Search executive actions using semantic similarity
   */
  async searchExecutiveActionsSemantic(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      actionType?: string;
      administration?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      currentOnly?: boolean;
    } = {}
  ) {
    const {
      threshold = 0.7,
      limit = 10,
      actionType,
      administration,
      status,
      dateFrom,
      dateTo,
      currentOnly = false,
    } = options;

    const { data, error } = await this.client.rpc('search_executive_actions_semantic', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_action_type: actionType || null,
      filter_administration: administration || null,
      filter_status: status || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      current_only: currentOnly,
    });

    if (error) {
      throw new Error(`Executive actions semantic search failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Insert a new executive action
   */
  async insertExecutiveAction(action: Database['public']['Tables']['executive_actions']['Insert']) {
    const { data, error } = await this.client
      .from('executive_actions')
      .insert(action)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert executive action: ${error.message}`);
    }

    return data;
  }

  // =====================================================================
  // UNIFIED SEARCH OPERATIONS
  // =====================================================================

  /**
   * Search across both bills and executive actions
   */
  async searchAllContent(
    queryText: string,
    queryEmbedding: number[],
    options: {
      limit?: number;
      billsWeight?: number;
      actionsWeight?: number;
    } = {}
  ) {
    const {
      limit = 20,
      billsWeight = 0.6,
      actionsWeight = 0.4,
    } = options;

    const { data, error } = await this.client.rpc('search_all_content', {
      query_text: queryText,
      query_embedding: queryEmbedding,
      match_count: limit,
      bills_weight: billsWeight,
      actions_weight: actionsWeight,
    });

    if (error) {
      throw new Error(`Unified search failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Advanced hybrid search with custom options
   */
  async searchContentHybrid(
    queryText: string,
    queryEmbedding: number[],
    searchOptions: Record<string, any> = {}
  ) {
    const { data, error } = await this.client.rpc('search_content_hybrid', {
      query_text: queryText,
      query_embedding: queryEmbedding,
      search_options: searchOptions,
    });

    if (error) {
      throw new Error(`Advanced hybrid search failed: ${error.message}`);
    }

    return data || [];
  }

  // =====================================================================
  // CONTEXT DISCOVERY OPERATIONS
  // =====================================================================

  /**
   * Get available sponsors with optional filtering
   */
  async getAvailableSponsors(
    chamber?: string,
    limit: number = 100,
    minBillCount: number = 1,
    searchTerm?: string
  ) {
    const { data, error } = await this.client.rpc('get_available_sponsors', {
      p_chamber: chamber || null,
      p_limit: limit,
      p_min_bill_count: minBillCount,
      p_search_term: searchTerm || null,
    });

    if (error) {
      throw new Error(`Failed to get sponsors: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get topic categories with optional filtering
   */
  async getTopicCategories(
    queryText?: string,
    limit: number = 15,
    minBillCount: number = 1
  ) {
    const { data, error } = await this.client.rpc('discover_topic_categories', {
      p_query_text: queryText || null,
      p_limit: limit,
      p_min_bill_count: minBillCount,
    });

    if (error) {
      throw new Error(`Failed to get topic categories: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get comprehensive context for query enhancement
   */
  async getComprehensiveContext(
    queryHint?: string,
    contentTypes: string[] = ['bills', 'executive_actions']
  ) {
    const { data, error } = await this.client.rpc('get_comprehensive_context', {
      p_query_hint: queryHint || null,
      p_content_types: contentTypes,
    });

    if (error) {
      throw new Error(`Failed to get comprehensive context: ${error.message}`);
    }

    return data;
  }

  // =====================================================================
  // CITATION OPERATIONS
  // =====================================================================

  /**
   * Generate citation for a bill
   */
  async generateBillCitation(billId: number, format: string = 'standard') {
    const { data, error } = await this.client.rpc('generate_bill_citation', {
      p_bill_id: billId,
      p_format: format,
    });

    if (error) {
      throw new Error(`Failed to generate bill citation: ${error.message}`);
    }

    return data;
  }

  /**
   * Generate citation for an executive action
   */
  async generateExecutiveActionCitation(actionId: string, format: string = 'standard') {
    const { data, error } = await this.client.rpc('generate_executive_action_citation', {
      p_action_id: actionId,
      p_format: format,
    });

    if (error) {
      throw new Error(`Failed to generate executive action citation: ${error.message}`);
    }

    return data;
  }

  // =====================================================================
  // RSS AND PROCESSING OPERATIONS
  // =====================================================================

  /**
   * Get next RSS feed to poll
   */
  async getNextFeedToPoll() {
    const { data, error } = await this.client.rpc('get_next_feed_to_poll');

    if (error) {
      throw new Error(`Failed to get next feed: ${error.message}`);
    }

    return data?.[0] || null;
  }

  /**
   * Mark RSS feed as polled
   */
  async markFeedPolled(
    feedId: number,
    success: boolean,
    errorMessage?: string,
    itemsProcessed: number = 0
  ) {
    const { error } = await this.client.rpc('mark_feed_polled', {
      p_feed_id: feedId,
      p_success: success,
      p_error_message: errorMessage || null,
      p_items_processed: itemsProcessed,
    });

    if (error) {
      throw new Error(`Failed to mark feed as polled: ${error.message}`);
    }
  }

  /**
   * Get next embedding task from queue
   */
  async getNextEmbeddingTask() {
    const { data, error } = await this.client.rpc('get_next_embedding_task');

    if (error) {
      throw new Error(`Failed to get embedding task: ${error.message}`);
    }

    return data?.[0] || null;
  }

  /**
   * Complete an embedding task
   */
  async completeEmbeddingTask(
    queueId: number,
    success: boolean,
    embedding?: number[],
    errorMessage?: string
  ) {
    const { error } = await this.client.rpc('complete_embedding_task', {
      p_queue_id: queueId,
      p_success: success,
      p_embedding: embedding || null,
      p_error_message: errorMessage || null,
    });

    if (error) {
      throw new Error(`Failed to complete embedding task: ${error.message}`);
    }
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('bills')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus() {
    try {
      const [
        billsCount,
        actionsCount,
        queueStats,
      ] = await Promise.all([
        this.client.from('bills').select('id', { count: 'exact', head: true }),
        this.client.from('executive_actions').select('id', { count: 'exact', head: true }),
        this.client.rpc('get_embedding_queue_stats'),
      ]);

      return {
        connected: true,
        bills_count: billsCount.count || 0,
        executive_actions_count: actionsCount.count || 0,
        embedding_queue: queueStats.data || [],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Subscribe to real-time changes
   */
  subscribeToChanges(
    table: 'bills' | 'executive_actions',
    callback: (payload: any) => void,
    filters?: Record<string, any>
  ) {
    let subscription = this.client
      .channel(`${table}_changes`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: table,
      }, callback);

    // Apply filters if provided
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        subscription = subscription.filter(key, 'eq', value);
      }
    }

    return subscription.subscribe();
  }

  /**
   * Get the underlying Supabase client
   */
  getClient(): SupabaseClient<Database> {
    return this.client;
  }

  /**
   * Check if client has admin privileges
   */
  isAdminClient(): boolean {
    return this.isAdmin;
  }
}

// Export configured database instances
export const billBotDB = new BillBotDatabase(false); // Public client
export const billBotAdminDB = new BillBotDatabase(true); // Admin client

// Export types for use in other modules
export type { Database } from './types/database.types';

// Export utility functions
export const createBillBotDatabase = (useAdmin: boolean = false) => {
  return new BillBotDatabase(useAdmin);
};

// Connection health check utility
export const checkDatabaseHealth = async () => {
  const db = new BillBotDatabase(false);
  return await db.getHealthStatus();
};

export default BillBotDatabase;