/**
 * Database Type Definitions
 * 
 * Generated TypeScript types for Bill Bot Supabase database schema.
 * These types provide full type safety for database operations.
 */

export interface Database {
  public: {
    Tables: {
      bills: {
        Row: {
          id: number;
          bill_number: string;
          congress_number: number;
          bill_type: string;
          title: string;
          summary: string | null;
          full_text: string | null;
          sponsor: string | null;
          cosponsors: Json;
          introduced_date: string | null;
          last_action_date: string | null;
          status: string;
          chamber: string;
          committee: string | null;
          actions: Json;
          votes: Json;
          amendments: Json;
          source_url: string | null;
          source_feed: string | null;
          processing_metadata: Json;
          created_at: string;
          updated_at: string;
          title_embedding: number[] | null;
          summary_embedding: number[] | null;
          content_embedding: number[] | null;
          search_vector: string | null;
          is_active: boolean | null;
          bill_year: number | null;
        };
        Insert: {
          id?: number;
          bill_number: string;
          congress_number?: number;
          bill_type: string;
          title: string;
          summary?: string | null;
          full_text?: string | null;
          sponsor?: string | null;
          cosponsors?: Json;
          introduced_date?: string | null;
          last_action_date?: string | null;
          status?: string;
          chamber: string;
          committee?: string | null;
          actions?: Json;
          votes?: Json;
          amendments?: Json;
          source_url?: string | null;
          source_feed?: string | null;
          processing_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          title_embedding?: number[] | null;
          summary_embedding?: number[] | null;
          content_embedding?: number[] | null;
          search_vector?: string | null;
        };
        Update: {
          id?: number;
          bill_number?: string;
          congress_number?: number;
          bill_type?: string;
          title?: string;
          summary?: string | null;
          full_text?: string | null;
          sponsor?: string | null;
          cosponsors?: Json;
          introduced_date?: string | null;
          last_action_date?: string | null;
          status?: string;
          chamber?: string;
          committee?: string | null;
          actions?: Json;
          votes?: Json;
          amendments?: Json;
          source_url?: string | null;
          source_feed?: string | null;
          processing_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          title_embedding?: number[] | null;
          summary_embedding?: number[] | null;
          content_embedding?: number[] | null;
          search_vector?: string | null;
        };
      };
      bill_topics: {
        Row: {
          id: number;
          name: string;
          category: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          category: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          category?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      bill_topic_assignments: {
        Row: {
          bill_id: number;
          topic_id: number;
          confidence_score: number | null;
          assigned_at: string;
        };
        Insert: {
          bill_id: number;
          topic_id: number;
          confidence_score?: number | null;
          assigned_at?: string;
        };
        Update: {
          bill_id?: number;
          topic_id?: number;
          confidence_score?: number | null;
          assigned_at?: string;
        };
      };
      executive_actions: {
        Row: {
          id: string;
          executive_order_number: number | null;
          action_type: Database['public']['Enums']['executive_action_type'];
          title: string;
          summary: string | null;
          full_text: string | null;
          signed_date: string;
          effective_date: string | null;
          administration: string;
          president_name: string;
          citation: string;
          status: Database['public']['Enums']['executive_action_status'] | null;
          content_url: string | null;
          pdf_url: string | null;
          html_content: string | null;
          agencies_affected: string[] | null;
          policy_areas: string[] | null;
          keywords: string[] | null;
          related_legislation: string[] | null;
          supersedes: string[] | null;
          superseded_by: string | null;
          title_embedding: number[] | null;
          summary_embedding: number[] | null;
          content_embedding: number[] | null;
          search_vector: string | null;
          created_at: string;
          updated_at: string;
          indexed_at: string | null;
          action_year: number | null;
          is_current: boolean | null;
        };
        Insert: {
          id?: string;
          executive_order_number?: number | null;
          action_type: Database['public']['Enums']['executive_action_type'];
          title: string;
          summary?: string | null;
          full_text?: string | null;
          signed_date: string;
          effective_date?: string | null;
          administration: string;
          president_name: string;
          citation: string;
          status?: Database['public']['Enums']['executive_action_status'] | null;
          content_url?: string | null;
          pdf_url?: string | null;
          html_content?: string | null;
          agencies_affected?: string[] | null;
          policy_areas?: string[] | null;
          keywords?: string[] | null;
          related_legislation?: string[] | null;
          supersedes?: string[] | null;
          superseded_by?: string | null;
          title_embedding?: number[] | null;
          summary_embedding?: number[] | null;
          content_embedding?: number[] | null;
          search_vector?: string | null;
          created_at?: string;
          updated_at?: string;
          indexed_at?: string | null;
        };
        Update: {
          id?: string;
          executive_order_number?: number | null;
          action_type?: Database['public']['Enums']['executive_action_type'];
          title?: string;
          summary?: string | null;
          full_text?: string | null;
          signed_date?: string;
          effective_date?: string | null;
          administration?: string;
          president_name?: string;
          citation?: string;
          status?: Database['public']['Enums']['executive_action_status'] | null;
          content_url?: string | null;
          pdf_url?: string | null;
          html_content?: string | null;
          agencies_affected?: string[] | null;
          policy_areas?: string[] | null;
          keywords?: string[] | null;
          related_legislation?: string[] | null;
          supersedes?: string[] | null;
          superseded_by?: string | null;
          title_embedding?: number[] | null;
          summary_embedding?: number[] | null;
          content_embedding?: number[] | null;
          search_vector?: string | null;
          created_at?: string;
          updated_at?: string;
          indexed_at?: string | null;
        };
      };
      executive_action_topics: {
        Row: {
          id: string;
          executive_action_id: string;
          primary_topic: string;
          secondary_topic: string | null;
          relevance_score: number | null;
        };
        Insert: {
          id?: string;
          executive_action_id: string;
          primary_topic: string;
          secondary_topic?: string | null;
          relevance_score?: number | null;
        };
        Update: {
          id?: string;
          executive_action_id?: string;
          primary_topic?: string;
          secondary_topic?: string | null;
          relevance_score?: number | null;
        };
      };
      executive_action_agencies: {
        Row: {
          id: string;
          executive_action_id: string;
          agency_name: string;
          agency_code: string | null;
          implementation_role: string | null;
        };
        Insert: {
          id?: string;
          executive_action_id: string;
          agency_name: string;
          agency_code?: string | null;
          implementation_role?: string | null;
        };
        Update: {
          id?: string;
          executive_action_id?: string;
          agency_name?: string;
          agency_code?: string | null;
          implementation_role?: string | null;
        };
      };
      executive_action_bill_references: {
        Row: {
          id: string;
          executive_action_id: string;
          bill_id: number;
          relationship_type: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          executive_action_id: string;
          bill_id: number;
          relationship_type: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          executive_action_id?: string;
          bill_id?: number;
          relationship_type?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      rss_feed_sources: {
        Row: {
          id: number;
          name: string;
          url: string;
          feed_type: string;
          chamber: string;
          enabled: boolean;
          polling_frequency: string;
          last_polled_at: string | null;
          last_successful_poll: string | null;
          error_count: number | null;
          max_error_count: number | null;
          configuration: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          url: string;
          feed_type: string;
          chamber: string;
          enabled?: boolean;
          polling_frequency?: string;
          last_polled_at?: string | null;
          last_successful_poll?: string | null;
          error_count?: number | null;
          max_error_count?: number | null;
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          url?: string;
          feed_type?: string;
          chamber?: string;
          enabled?: boolean;
          polling_frequency?: string;
          last_polled_at?: string | null;
          last_successful_poll?: string | null;
          error_count?: number | null;
          max_error_count?: number | null;
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      processing_logs: {
        Row: {
          id: number;
          operation_type: string;
          source_id: number | null;
          bill_id: number | null;
          executive_action_id: string | null;
          batch_id: string | null;
          status: string;
          started_at: string;
          completed_at: string | null;
          error_message: string | null;
          error_details: Json | null;
          processing_stats: Json;
        };
        Insert: {
          id?: number;
          operation_type: string;
          source_id?: number | null;
          bill_id?: number | null;
          executive_action_id?: string | null;
          batch_id?: string | null;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          error_message?: string | null;
          error_details?: Json | null;
          processing_stats?: Json;
        };
        Update: {
          id?: number;
          operation_type?: string;
          source_id?: number | null;
          bill_id?: number | null;
          executive_action_id?: string | null;
          batch_id?: string | null;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          error_message?: string | null;
          error_details?: Json | null;
          processing_stats?: Json;
        };
      };
      feed_item_tracking: {
        Row: {
          id: number;
          source_id: number;
          external_id: string;
          guid: string | null;
          url: string | null;
          title: string;
          published_date: string | null;
          content_hash: string | null;
          bill_id: number | null;
          executive_action_id: string | null;
          processing_status: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: number;
          source_id: number;
          external_id: string;
          guid?: string | null;
          url?: string | null;
          title: string;
          published_date?: string | null;
          content_hash?: string | null;
          bill_id?: number | null;
          executive_action_id?: string | null;
          processing_status?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: number;
          source_id?: number;
          external_id?: string;
          guid?: string | null;
          url?: string | null;
          title?: string;
          published_date?: string | null;
          content_hash?: string | null;
          bill_id?: number | null;
          executive_action_id?: string | null;
          processing_status?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
      };
      embedding_queue: {
        Row: {
          id: number;
          content_type: string;
          content_id: string;
          embedding_type: string;
          text_content: string;
          priority: number | null;
          status: string | null;
          attempts: number | null;
          max_attempts: number | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          error_message: string | null;
          embedding_result: number[] | null;
        };
        Insert: {
          id?: number;
          content_type: string;
          content_id: string;
          embedding_type: string;
          text_content: string;
          priority?: number | null;
          status?: string | null;
          attempts?: number | null;
          max_attempts?: number | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          embedding_result?: number[] | null;
        };
        Update: {
          id?: number;
          content_type?: string;
          content_id?: string;
          embedding_type?: string;
          text_content?: string;
          priority?: number | null;
          status?: string | null;
          attempts?: number | null;
          max_attempts?: number | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          embedding_result?: number[] | null;
        };
      };
    };
    Views: {
      mv_sponsor_stats: {
        Row: {
          name: string | null;
          party: string | null;
          state: string | null;
          chamber: string | null;
          bill_count: number | null;
          active_bill_count: number | null;
          latest_bill_date: string | null;
          earliest_bill_date: string | null;
          statuses_sponsored: string[] | null;
          topics_sponsored: string[] | null;
        };
      };
      mv_topic_stats: {
        Row: {
          topic_name: string | null;
          category: string | null;
          description: string | null;
          bill_count: number | null;
          active_bill_count: number | null;
          sponsor_count: number | null;
          chambers: string[] | null;
          latest_bill_date: string | null;
          avg_confidence_score: number | null;
        };
      };
      mv_status_stats: {
        Row: {
          status: string | null;
          description: string | null;
          total_count: number | null;
          house_count: number | null;
          senate_count: number | null;
          unique_sponsors: number | null;
          avg_days_in_status: number | null;
        };
      };
      mv_committee_stats: {
        Row: {
          committee: string | null;
          chamber: string | null;
          bill_count: number | null;
          active_bill_count: number | null;
          unique_sponsors: number | null;
          statuses_handled: string[] | null;
          latest_bill_date: string | null;
          avg_processing_days: number | null;
        };
      };
      mv_administration_stats: {
        Row: {
          administration: string | null;
          president_name: string | null;
          total_actions: number | null;
          active_actions: number | null;
          executive_orders: number | null;
          memoranda: number | null;
          proclamations: number | null;
          first_action_date: string | null;
          last_action_date: string | null;
          agencies_involved: string[] | null;
        };
      };
      mv_agency_stats: {
        Row: {
          agency_name: string | null;
          agency_code: string | null;
          action_count: number | null;
          active_action_count: number | null;
          roles: string[] | null;
          administrations_involved: string[] | null;
          action_types_involved: string[] | null;
          latest_action_date: string | null;
        };
      };
    };
    Functions: {
      search_bills_semantic: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_chamber?: string;
          filter_status?: string[];
          filter_congress?: number;
          date_from?: string;
          date_to?: string;
          active_only?: boolean;
        };
        Returns: {
          id: number;
          bill_number: string;
          title: string;
          summary: string;
          sponsor: string;
          chamber: string;
          status: string;
          introduced_date: string;
          similarity: number;
          rank: number;
        }[];
      };
      search_executive_actions_semantic: {
        Args: {
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_action_type?: string;
          filter_administration?: string;
          filter_status?: string;
          date_from?: string;
          date_to?: string;
          current_only?: boolean;
        };
        Returns: {
          id: string;
          executive_order_number: number;
          action_type: string;
          title: string;
          summary: string;
          administration: string;
          president_name: string;
          signed_date: string;
          status: string;
          similarity: number;
          rank: number;
        }[];
      };
      search_bills_hybrid: {
        Args: {
          query_text: string;
          query_embedding: number[];
          semantic_weight?: number;
          keyword_weight?: number;
          match_count?: number;
          filter_chamber?: string;
          active_only?: boolean;
        };
        Returns: {
          id: number;
          bill_number: string;
          title: string;
          summary: string;
          combined_score: number;
          semantic_score: number;
          keyword_score: number;
          rank: number;
        }[];
      };
      search_all_content: {
        Args: {
          query_text: string;
          query_embedding: number[];
          match_count?: number;
          bills_weight?: number;
          actions_weight?: number;
        };
        Returns: {
          content_type: string;
          content_id: string;
          title: string;
          summary: string;
          relevance_score: number;
          metadata: Json;
          rank: number;
        }[];
      };
      search_content_hybrid: {
        Args: {
          query_text: string;
          query_embedding: number[];
          search_options?: Json;
        };
        Returns: {
          content_type: string;
          content_id: string;
          title: string;
          summary: string;
          metadata: Json;
          relevance_score: number;
          semantic_score: number;
          keyword_score: number;
          freshness_score: number;
          authority_score: number;
          final_rank: number;
        }[];
      };
      get_available_sponsors: {
        Args: {
          p_chamber?: string;
          p_limit?: number;
          p_min_bill_count?: number;
          p_search_term?: string;
        };
        Returns: {
          name: string;
          party: string;
          state: string;
          chamber: string;
          bill_count: number;
          active_bill_count: number;
          latest_bill_date: string;
          topics_sponsored: string[];
          match_score: number;
        }[];
      };
      discover_topic_categories: {
        Args: {
          p_query_text?: string;
          p_limit?: number;
          p_min_bill_count?: number;
        };
        Returns: {
          topic_name: string;
          category: string;
          description: string;
          bill_count: number;
          active_bill_count: number;
          sponsor_count: number;
          relevance_score: number;
          recent_activity_score: number;
        }[];
      };
      get_comprehensive_context: {
        Args: {
          p_query_hint?: string;
          p_content_types?: string[];
        };
        Returns: Json;
      };
      generate_bill_citation: {
        Args: {
          p_bill_id: number;
          p_format?: string;
        };
        Returns: Json;
      };
      generate_executive_action_citation: {
        Args: {
          p_action_id: string;
          p_format?: string;
        };
        Returns: Json;
      };
      get_next_feed_to_poll: {
        Args: Record<PropertyKey, never>;
        Returns: {
          feed_id: number;
          feed_name: string;
          feed_url: string;
          feed_type: string;
          last_polled_at: string;
          polling_frequency: string;
        }[];
      };
      mark_feed_polled: {
        Args: {
          p_feed_id: number;
          p_success: boolean;
          p_error_message?: string;
          p_items_processed?: number;
        };
        Returns: undefined;
      };
      get_next_embedding_task: {
        Args: Record<PropertyKey, never>;
        Returns: {
          queue_id: number;
          content_type: string;
          content_id: string;
          embedding_type: string;
          text_content: string;
        }[];
      };
      complete_embedding_task: {
        Args: {
          p_queue_id: number;
          p_success: boolean;
          p_embedding?: number[];
          p_error_message?: string;
        };
        Returns: undefined;
      };
      get_embedding_queue_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          content_type: string;
          embedding_type: string;
          status: string;
          count: number;
          avg_attempts: number;
          oldest_pending: string;
          newest_pending: string;
        }[];
      };
      refresh_context_cache: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      executive_action_type: 'executive_order' | 'presidential_memorandum' | 'proclamation' | 'presidential_directive' | 'national_security_directive';
      executive_action_status: 'active' | 'revoked' | 'superseded' | 'expired' | 'amended';
    };
    CompositeTypes: Record<string, never>;
  };
}

// Helper types for common operations
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Bill = Database['public']['Tables']['bills']['Row'];
export type BillInsert = Database['public']['Tables']['bills']['Insert'];
export type BillUpdate = Database['public']['Tables']['bills']['Update'];

export type ExecutiveAction = Database['public']['Tables']['executive_actions']['Row'];
export type ExecutiveActionInsert = Database['public']['Tables']['executive_actions']['Insert'];
export type ExecutiveActionUpdate = Database['public']['Tables']['executive_actions']['Update'];

export type BillTopic = Database['public']['Tables']['bill_topics']['Row'];
export type ProcessingLog = Database['public']['Tables']['processing_logs']['Row'];
export type RSSFeedSource = Database['public']['Tables']['rss_feed_sources']['Row'];
export type EmbeddingQueue = Database['public']['Tables']['embedding_queue']['Row'];

// Search result types
export type BillSearchResult = {
  id: number;
  bill_number: string;
  title: string;
  summary: string;
  sponsor: string;
  chamber: string;
  status: string;
  introduced_date: string;
  similarity: number;
  rank: number;
};

export type ExecutiveActionSearchResult = {
  id: string;
  executive_order_number: number;
  action_type: string;
  title: string;
  summary: string;
  administration: string;
  president_name: string;
  signed_date: string;
  status: string;
  similarity: number;
  rank: number;
};

export type UnifiedSearchResult = {
  content_type: string;
  content_id: string;
  title: string;
  summary: string;
  relevance_score: number;
  metadata: Json;
  rank: number;
};

export type HybridSearchResult = {
  content_type: string;
  content_id: string;
  title: string;
  summary: string;
  metadata: Json;
  relevance_score: number;
  semantic_score: number;
  keyword_score: number;
  freshness_score: number;
  authority_score: number;
  final_rank: number;
};

// Context types
export type SponsorInfo = {
  name: string;
  party: string;
  state: string;
  chamber: string;
  bill_count: number;
  active_bill_count: number;
  latest_bill_date: string;
  topics_sponsored: string[];
  match_score: number;
};

export type TopicInfo = {
  topic_name: string;
  category: string;
  description: string;
  bill_count: number;
  active_bill_count: number;
  sponsor_count: number;
  relevance_score: number;
  recent_activity_score: number;
};

// Citation types
export type CitationData = {
  citation: string;
  url: string;
  format: string;
  content_type: string;
  [key: string]: any;
};

// RSS and processing types
export type FeedInfo = {
  feed_id: number;
  feed_name: string;
  feed_url: string;
  feed_type: string;
  last_polled_at: string;
  polling_frequency: string;
};

export type EmbeddingTask = {
  queue_id: number;
  content_type: string;
  content_id: string;
  embedding_type: string;
  text_content: string;
};

// Materialized view types
export type SponsorStats = Database['public']['Views']['mv_sponsor_stats']['Row'];
export type TopicStats = Database['public']['Views']['mv_topic_stats']['Row'];
export type StatusStats = Database['public']['Views']['mv_status_stats']['Row'];
export type CommitteeStats = Database['public']['Views']['mv_committee_stats']['Row'];
export type AdministrationStats = Database['public']['Views']['mv_administration_stats']['Row'];
export type AgencyStats = Database['public']['Views']['mv_agency_stats']['Row'];

// Utility types for common database operations
export type DatabaseError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

export type DatabaseResult<T> = {
  data: T | null;
  error: DatabaseError | null;
};

// Search filter types
export type BillSearchFilters = {
  chamber?: string;
  status?: string[];
  congress?: number;
  dateFrom?: string;
  dateTo?: string;
  activeOnly?: boolean;
  sponsor?: string;
  committee?: string;
  topics?: string[];
};

export type ExecutiveActionSearchFilters = {
  actionType?: string;
  administration?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  currentOnly?: boolean;
  agencies?: string[];
  policyAreas?: string[];
};

export type SearchOptions = {
  limit?: number;
  threshold?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  freshnessWeight?: number;
  authorityWeight?: number;
  includeBills?: boolean;
  includeExecutiveActions?: boolean;
};

// Export all types
export type {
  Database as default,
  Database,
  Json,
};

// Type guard functions
export const isBill = (content: any): content is Bill => {
  return content && typeof content.bill_number === 'string';
};

export const isExecutiveAction = (content: any): content is ExecutiveAction => {
  return content && typeof content.action_type === 'string';
};

// Utility functions for type checking
export const validateBillInsert = (data: any): data is BillInsert => {
  return (
    data &&
    typeof data.bill_number === 'string' &&
    typeof data.title === 'string' &&
    typeof data.chamber === 'string' &&
    typeof data.bill_type === 'string'
  );
};

export const validateExecutiveActionInsert = (data: any): data is ExecutiveActionInsert => {
  return (
    data &&
    typeof data.title === 'string' &&
    typeof data.administration === 'string' &&
    typeof data.president_name === 'string' &&
    typeof data.citation === 'string' &&
    typeof data.signed_date === 'string' &&
    typeof data.action_type === 'string'
  );
};