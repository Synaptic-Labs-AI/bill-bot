/**
 * Database Adapter for MCP Server
 * 
 * This adapter provides a bridge between the MCP server and the database layer,
 * transforming database results into MCP-compatible types and handling errors.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  BillResult, 
  ExecutiveActionResult, 
  UnifiedResult,
  SponsorInfo,
  TopicInfo,
  StatusInfo,
  AdministrationInfo,
  AgencyInfo,
  DateRangeInfo,
  SearchFilters,
  MCPSearchError,
  MCPContextError
} from '../types/mcp.types.js';

// Database types - simplified from the main database types
interface DatabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export class DatabaseAdapter {
  private client: SupabaseClient;
  private isConnected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  // =====================================================================
  // CONNECTION MANAGEMENT
  // =====================================================================

  async connect(): Promise<void> {
    try {
      // Test connection with a simple query
      const { error } = await this.client
        .from('bills')
        .select('id')
        .limit(1);

      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      this.isConnected = true;
    } catch (error) {
      this.isConnected = false;
      throw new MCPSearchError(
        'Failed to connect to database',
        'DATABASE_CONNECTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async healthCheck(): Promise<{ connected: boolean; stats?: any }> {
    try {
      const { data, error } = await this.client
        .from('bills')
        .select('id', { count: 'exact', head: true });

      if (error) {
        return { connected: false };
      }

      return {
        connected: true,
        stats: {
          billsCount: data || 0,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return { connected: false };
    }
  }

  // =====================================================================
  // SEARCH OPERATIONS
  // =====================================================================

  async searchBillsSemantic(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      filters?: SearchFilters;
    } = {}
  ): Promise<BillResult[]> {
    const { threshold = 0.7, limit = 10, filters } = options;

    try {
      const { data, error } = await this.client.rpc('search_bills_semantic', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_chamber: filters?.chamber || null,
        filter_status: filters?.status || null,
        filter_congress: filters?.congress || null,
        date_from: filters?.dateRange?.start || null,
        date_to: filters?.dateRange?.end || null,
        active_only: true
      });

      if (error) {
        throw new MCPSearchError(
          `Semantic search failed: ${error.message}`,
          'SEMANTIC_SEARCH_ERROR',
          { queryEmbedding: queryEmbedding.length, filters }
        );
      }

      return this.transformBillResults(data || []);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error in semantic search',
        'SEARCH_EXECUTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async searchBillsHybrid(
    queryText: string,
    queryEmbedding: number[],
    options: {
      semanticWeight?: number;
      keywordWeight?: number;
      limit?: number;
      filters?: SearchFilters;
    } = {}
  ): Promise<BillResult[]> {
    const { 
      semanticWeight = 0.7, 
      keywordWeight = 0.3, 
      limit = 10, 
      filters 
    } = options;

    try {
      const { data, error } = await this.client.rpc('search_bills_hybrid', {
        query_text: queryText,
        query_embedding: queryEmbedding,
        semantic_weight: semanticWeight,
        keyword_weight: keywordWeight,
        match_count: limit,
        filter_chamber: filters?.chamber || null,
        active_only: true
      });

      if (error) {
        throw new MCPSearchError(
          `Hybrid search failed: ${error.message}`,
          'HYBRID_SEARCH_ERROR',
          { queryText, filters }
        );
      }

      return this.transformBillResults(data || []);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error in hybrid search',
        'SEARCH_EXECUTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async searchExecutiveActionsSemantic(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      filters?: SearchFilters;
    } = {}
  ): Promise<ExecutiveActionResult[]> {
    const { threshold = 0.7, limit = 10, filters } = options;

    try {
      const { data, error } = await this.client.rpc('search_executive_actions_semantic', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_action_type: filters?.actionType || null,
        filter_administration: filters?.administration || null,
        filter_status: filters?.status?.[0] || null, // Take first status if array
        date_from: filters?.dateRange?.start || null,
        date_to: filters?.dateRange?.end || null,
        current_only: false
      });

      if (error) {
        throw new MCPSearchError(
          `Executive actions search failed: ${error.message}`,
          'EXECUTIVE_ACTIONS_SEARCH_ERROR',
          { queryEmbedding: queryEmbedding.length, filters }
        );
      }

      return this.transformExecutiveActionResults(data || []);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error in executive actions search',
        'SEARCH_EXECUTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async searchAllContent(
    queryText: string,
    queryEmbedding: number[],
    options: {
      limit?: number;
      billsWeight?: number;
      actionsWeight?: number;
    } = {}
  ): Promise<UnifiedResult[]> {
    const { limit = 20, billsWeight = 0.6, actionsWeight = 0.4 } = options;

    try {
      const { data, error } = await this.client.rpc('search_all_content', {
        query_text: queryText,
        query_embedding: queryEmbedding,
        match_count: limit,
        bills_weight: billsWeight,
        actions_weight: actionsWeight
      });

      if (error) {
        throw new MCPSearchError(
          `Unified search failed: ${error.message}`,
          'UNIFIED_SEARCH_ERROR',
          { queryText }
        );
      }

      return this.transformUnifiedResults(data || []);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error in unified search',
        'SEARCH_EXECUTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // =====================================================================
  // CONTEXT DISCOVERY
  // =====================================================================

  async getAvailableSponsors(
    chamber?: string,
    limit: number = 100,
    minBillCount: number = 1,
    searchTerm?: string
  ): Promise<SponsorInfo[]> {
    try {
      const { data, error } = await this.client.rpc('get_available_sponsors', {
        p_chamber: chamber || null,
        p_limit: limit,
        p_min_bill_count: minBillCount,
        p_search_term: searchTerm || null
      });

      if (error) {
        throw new MCPContextError(
          `Failed to get sponsors: ${error.message}`,
          { chamber, limit, minBillCount, searchTerm }
        );
      }

      return this.transformSponsorResults(data || []);
    } catch (error) {
      if (error instanceof MCPContextError) throw error;
      throw new MCPContextError(
        'Unexpected error getting sponsors',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getTopicCategories(
    queryText?: string,
    limit: number = 15,
    minBillCount: number = 1
  ): Promise<TopicInfo[]> {
    try {
      const { data, error } = await this.client.rpc('discover_topic_categories', {
        p_query_text: queryText || null,
        p_limit: limit,
        p_min_bill_count: minBillCount
      });

      if (error) {
        throw new MCPContextError(
          `Failed to get topic categories: ${error.message}`,
          { queryText, limit, minBillCount }
        );
      }

      return this.transformTopicResults(data || []);
    } catch (error) {
      if (error instanceof MCPContextError) throw error;
      throw new MCPContextError(
        'Unexpected error getting topics',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getStatusInfo(): Promise<StatusInfo[]> {
    try {
      // Use materialized view for fast status stats
      const { data, error } = await this.client
        .from('mv_status_stats')
        .select('*')
        .order('total_count', { ascending: false });

      if (error) {
        throw new MCPContextError(
          `Failed to get status info: ${error.message}`
        );
      }

      return this.transformStatusResults(data || []);
    } catch (error) {
      if (error instanceof MCPContextError) throw error;
      throw new MCPContextError(
        'Unexpected error getting status info',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getAdministrationInfo(): Promise<AdministrationInfo[]> {
    try {
      const { data, error } = await this.client
        .from('mv_administration_stats')
        .select('*')
        .order('last_action_date', { ascending: false });

      if (error) {
        throw new MCPContextError(
          `Failed to get administration info: ${error.message}`
        );
      }

      return this.transformAdministrationResults(data || []);
    } catch (error) {
      if (error instanceof MCPContextError) throw error;
      throw new MCPContextError(
        'Unexpected error getting administration info',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getAgencyInfo(limit: number = 25): Promise<AgencyInfo[]> {
    try {
      const { data, error } = await this.client
        .from('mv_agency_stats')
        .select('*')
        .order('action_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw new MCPContextError(
          `Failed to get agency info: ${error.message}`,
          { limit }
        );
      }

      return this.transformAgencyResults(data || []);
    } catch (error) {
      if (error instanceof MCPContextError) throw error;
      throw new MCPContextError(
        'Unexpected error getting agency info',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // =====================================================================
  // DETAIL OPERATIONS
  // =====================================================================

  async getBillDetails(billId: string): Promise<BillResult | null> {
    try {
      // Try to parse as number first, then search by bill number
      let query = this.client.from('bills').select('*');
      
      if (/^\d+$/.test(billId)) {
        query = query.eq('id', parseInt(billId));
      } else {
        query = query.eq('bill_number', billId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null;
        }
        throw new MCPSearchError(
          `Failed to get bill details: ${error.message}`,
          'BILL_DETAILS_ERROR',
          { billId }
        );
      }

      return this.transformSingleBillResult(data);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error getting bill details',
        'BILL_DETAILS_ERROR',
        { billId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getExecutiveActionDetails(actionId: string): Promise<ExecutiveActionResult | null> {
    try {
      const { data, error } = await this.client
        .from('executive_actions')
        .select('*')
        .eq('id', actionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return null;
        }
        throw new MCPSearchError(
          `Failed to get executive action details: ${error.message}`,
          'EXECUTIVE_ACTION_DETAILS_ERROR',
          { actionId }
        );
      }

      return this.transformSingleExecutiveActionResult(data);
    } catch (error) {
      if (error instanceof MCPSearchError) throw error;
      throw new MCPSearchError(
        'Unexpected error getting executive action details',
        'EXECUTIVE_ACTION_DETAILS_ERROR',
        { actionId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // =====================================================================
  // TRANSFORMATION METHODS
  // =====================================================================

  private transformBillResults(rawResults: any[]): BillResult[] {
    return rawResults.map((result, index) => ({
      id: result.id,
      billNumber: result.bill_number,
      title: result.title,
      summary: result.summary,
      sponsor: result.sponsor,
      chamber: result.chamber,
      status: result.status,
      introducedDate: result.introduced_date,
      lastActionDate: result.last_action_date,
      committee: result.committee,
      relevanceScore: result.similarity || result.combined_score || result.relevance_score,
      similarity: result.similarity,
      rank: index + 1,
      sourceUrl: result.source_url,
      congressNumber: result.congress_number,
      billType: result.bill_type,
      actions: result.actions,
      votes: result.votes
    }));
  }

  private transformExecutiveActionResults(rawResults: any[]): ExecutiveActionResult[] {
    return rawResults.map((result, index) => ({
      id: result.id,
      executiveOrderNumber: result.executive_order_number,
      actionType: result.action_type,
      title: result.title,
      summary: result.summary,
      administration: result.administration,
      presidentName: result.president_name,
      signedDate: result.signed_date,
      status: result.status,
      relevanceScore: result.similarity || result.relevance_score,
      similarity: result.similarity,
      rank: index + 1,
      citation: result.citation,
      contentUrl: result.content_url,
      pdfUrl: result.pdf_url,
      agenciesAffected: result.agencies_affected,
      policyAreas: result.policy_areas
    }));
  }

  private transformUnifiedResults(rawResults: any[]): UnifiedResult[] {
    return rawResults.map((result, index) => {
      const baseFields = {
        rank: index + 1,
        relevanceScore: result.relevance_score
      };

      if (result.content_type === 'bill') {
        return {
          ...baseFields,
          id: parseInt(result.content_id),
          billNumber: result.metadata?.bill_number || 'Unknown',
          title: result.title,
          summary: result.summary,
          sponsor: result.metadata?.sponsor,
          chamber: result.metadata?.chamber || 'unknown',
          status: result.metadata?.status || 'unknown',
          introducedDate: result.metadata?.introduced_date,
          lastActionDate: result.metadata?.last_action_date,
          committee: result.metadata?.committee
        } as BillResult;
      } else {
        return {
          ...baseFields,
          id: result.content_id,
          executiveOrderNumber: result.metadata?.executive_order_number,
          actionType: result.metadata?.action_type || 'unknown',
          title: result.title,
          summary: result.summary,
          administration: result.metadata?.administration || 'unknown',
          presidentName: result.metadata?.president_name || 'unknown',
          signedDate: result.metadata?.signed_date,
          status: result.metadata?.status || 'unknown',
          citation: result.metadata?.citation || '',
          contentUrl: result.metadata?.content_url,
          pdfUrl: result.metadata?.pdf_url,
          agenciesAffected: result.metadata?.agencies_affected,
          policyAreas: result.metadata?.policy_areas
        } as ExecutiveActionResult;
      }
    });
  }

  private transformSingleBillResult(data: any): BillResult {
    return {
      id: data.id,
      billNumber: data.bill_number,
      title: data.title,
      summary: data.summary,
      sponsor: data.sponsor,
      chamber: data.chamber,
      status: data.status,
      introducedDate: data.introduced_date,
      lastActionDate: data.last_action_date,
      committee: data.committee,
      rank: 1,
      sourceUrl: data.source_url,
      congressNumber: data.congress_number,
      billType: data.bill_type,
      actions: data.actions,
      votes: data.votes
    };
  }

  private transformSingleExecutiveActionResult(data: any): ExecutiveActionResult {
    return {
      id: data.id,
      executiveOrderNumber: data.executive_order_number,
      actionType: data.action_type,
      title: data.title,
      summary: data.summary,
      administration: data.administration,
      presidentName: data.president_name,
      signedDate: data.signed_date,
      status: data.status,
      rank: 1,
      citation: data.citation,
      contentUrl: data.content_url,
      pdfUrl: data.pdf_url,
      agenciesAffected: data.agencies_affected,
      policyAreas: data.policy_areas
    };
  }

  private transformSponsorResults(rawResults: any[]): SponsorInfo[] {
    return rawResults.map(result => ({
      name: result.name,
      party: result.party,
      state: result.state,
      chamber: result.chamber,
      billCount: result.bill_count,
      activeBillCount: result.active_bill_count || result.bill_count,
      latestBillDate: result.latest_bill_date,
      topicsSponsored: result.topics_sponsored || [],
      matchScore: result.match_score || 1.0
    }));
  }

  private transformTopicResults(rawResults: any[]): TopicInfo[] {
    return rawResults.map(result => ({
      topicName: result.topic_name,
      category: result.category,
      description: result.description,
      billCount: result.bill_count,
      activeBillCount: result.active_bill_count || result.bill_count,
      sponsorCount: result.sponsor_count,
      relevanceScore: result.relevance_score || 1.0,
      recentActivityScore: result.recent_activity_score || 0.5
    }));
  }

  private transformStatusResults(rawResults: any[]): StatusInfo[] {
    return rawResults.map(result => ({
      status: result.status,
      description: result.description || this.getStatusDescription(result.status),
      count: result.total_count || result.count,
      chamberBreakdown: {
        house: result.house_count || 0,
        senate: result.senate_count || 0
      }
    }));
  }

  private transformAdministrationResults(rawResults: any[]): AdministrationInfo[] {
    return rawResults.map(result => ({
      administration: result.administration,
      presidentName: result.president_name,
      actionCount: result.total_actions,
      activeActionCount: result.active_actions || result.total_actions,
      firstActionDate: result.first_action_date,
      lastActionDate: result.last_action_date,
      actionTypes: result.action_types || []
    }));
  }

  private transformAgencyResults(rawResults: any[]): AgencyInfo[] {
    return rawResults.map(result => ({
      agencyName: result.agency_name,
      agencyCode: result.agency_code,
      actionCount: result.action_count,
      activeActionCount: result.active_action_count || result.action_count,
      roles: result.roles || [],
      administrations: result.administrations_involved || [],
      actionTypes: result.action_types_involved || [],
      latestActionDate: result.latest_action_date
    }));
  }

  private getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      'introduced': 'Bill has been introduced in Congress',
      'referred': 'Bill has been referred to committee',
      'reported': 'Bill has been reported by committee',
      'passed_house': 'Bill has passed the House of Representatives',
      'passed_senate': 'Bill has passed the Senate',
      'enrolled': 'Bill has been enrolled and sent to President',
      'signed': 'Bill has been signed into law',
      'vetoed': 'Bill has been vetoed by the President'
    };
    
    return descriptions[status] || 'Other legislative status';
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================

  isConnected(): boolean {
    return this.isConnected;
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}