/**
 * Performance Monitoring
 * 
 * Database performance monitoring, query optimization, and analytics for Bill Bot.
 * Provides tools for tracking query performance, identifying bottlenecks, and optimizing database operations.
 */

import { BillBotDatabase } from './supabase-client';
import type { Database, ProcessingLog } from './types/database.types';

// =====================================================================
// PERFORMANCE METRICS TYPES
// =====================================================================

export interface QueryMetrics {
  queryId: string;
  queryType: string;
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  resultCount: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface DatabasePerformanceStats {
  totalQueries: number;
  averageDuration: number;
  slowQueries: number;
  errorRate: number;
  topSlowQueries: QueryMetrics[];
  queryTypeBreakdown: Record<string, number>;
  hourlyDistribution: Record<string, number>;
}

export interface VectorSearchMetrics {
  searchType: 'semantic' | 'hybrid' | 'unified';
  embeddingDimensions: number;
  threshold: number;
  resultCount: number;
  duration: number;
  semanticScore?: number;
  keywordScore?: number;
  relevanceScore: number;
}

export interface IndexPerformanceMetrics {
  indexName: string;
  tableName: string;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
  avgTuplesPerScan: number;
  indexSize: string;
  lastUsed?: Date;
}

// =====================================================================
// PERFORMANCE MONITOR CLASS
// =====================================================================

export class DatabasePerformanceMonitor {
  private db: BillBotDatabase;
  private metrics: QueryMetrics[] = [];
  private readonly maxMetricsHistory = 10000;
  private slowQueryThreshold = 1000; // 1 second
  
  constructor(useAdmin: boolean = false) {
    this.db = new BillBotDatabase(useAdmin);
  }

  // =====================================================================
  // QUERY PERFORMANCE TRACKING
  // =====================================================================

  /**
   * Start tracking a query
   */
  startQuery(queryType: string, operation: string, metadata?: Record<string, any>): string {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    // Store initial metrics
    this.metrics.push({
      queryId,
      queryType,
      operation,
      startTime,
      endTime: 0,
      duration: 0,
      resultCount: 0,
      success: false,
      metadata,
    });
    
    return queryId;
  }

  /**
   * End tracking a query
   */
  endQuery(
    queryId: string, 
    resultCount: number = 0, 
    success: boolean = true, 
    error?: string
  ): QueryMetrics | null {
    const metricIndex = this.metrics.findIndex(m => m.queryId === queryId);
    if (metricIndex === -1) {
      return null;
    }

    const endTime = Date.now();
    const metric = this.metrics[metricIndex];
    
    // Update metrics
    metric.endTime = endTime;
    metric.duration = endTime - metric.startTime;
    metric.resultCount = resultCount;
    metric.success = success;
    metric.error = error;

    // Log slow queries
    if (metric.duration > this.slowQueryThreshold) {
      this.logSlowQuery(metric);
    }

    // Cleanup old metrics to prevent memory leaks
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    return metric;
  }

  /**
   * Track query execution with automatic timing
   */
  async trackQuery<T>(
    queryType: string,
    operation: string,
    queryFn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const queryId = this.startQuery(queryType, operation, metadata);
    
    try {
      const result = await queryFn();
      const resultCount = Array.isArray(result) ? result.length : 1;
      this.endQuery(queryId, resultCount, true);
      return result;
    } catch (error) {
      this.endQuery(queryId, 0, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // =====================================================================
  // VECTOR SEARCH PERFORMANCE
  // =====================================================================

  /**
   * Track vector search performance
   */
  async trackVectorSearch(
    searchFn: () => Promise<any[]>,
    searchType: 'semantic' | 'hybrid' | 'unified',
    embeddingDimensions: number = 1024,
    threshold: number = 0.7,
    metadata?: Record<string, any>
  ): Promise<{ results: any[]; metrics: VectorSearchMetrics }> {
    const startTime = Date.now();
    
    try {
      const results = await searchFn();
      const duration = Date.now() - startTime;
      
      // Calculate relevance score
      const relevanceScore = results.length > 0 
        ? results.reduce((sum, r) => sum + (r.relevance_score || r.similarity || 0), 0) / results.length
        : 0;

      const metrics: VectorSearchMetrics = {
        searchType,
        embeddingDimensions,
        threshold,
        resultCount: results.length,
        duration,
        relevanceScore,
        semanticScore: metadata?.semanticScore,
        keywordScore: metadata?.keywordScore,
      };

      // Log to database for analysis
      await this.logVectorSearchMetrics(metrics);

      return { results, metrics };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failed search
      await this.logVectorSearchMetrics({
        searchType,
        embeddingDimensions,
        threshold,
        resultCount: 0,
        duration,
        relevanceScore: 0,
      });
      
      throw error;
    }
  }

  // =====================================================================
  // DATABASE STATISTICS
  // =====================================================================

  /**
   * Get comprehensive performance statistics
   */
  async getPerformanceStats(timePeriod: string = '24 hours'): Promise<DatabasePerformanceStats> {
    const recentMetrics = this.getRecentMetrics(timePeriod);
    
    const totalQueries = recentMetrics.length;
    const successfulQueries = recentMetrics.filter(m => m.success);
    const slowQueries = recentMetrics.filter(m => m.duration > this.slowQueryThreshold);
    
    const averageDuration = successfulQueries.length > 0
      ? successfulQueries.reduce((sum, m) => sum + m.duration, 0) / successfulQueries.length
      : 0;
    
    const errorRate = totalQueries > 0 
      ? ((totalQueries - successfulQueries.length) / totalQueries) * 100
      : 0;

    // Get top slow queries
    const topSlowQueries = [...recentMetrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // Query type breakdown
    const queryTypeBreakdown = recentMetrics.reduce((acc, m) => {
      acc[m.queryType] = (acc[m.queryType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Hourly distribution
    const hourlyDistribution = recentMetrics.reduce((acc, m) => {
      const hour = new Date(m.startTime).getHours().toString();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalQueries,
      averageDuration,
      slowQueries: slowQueries.length,
      errorRate,
      topSlowQueries,
      queryTypeBreakdown,
      hourlyDistribution,
    };
  }

  /**
   * Get index performance metrics
   */
  async getIndexPerformanceMetrics(): Promise<IndexPerformanceMetrics[]> {
    try {
      const { data, error } = await this.db.getClient().rpc('analyze_vector_index_performance');
      
      if (error) {
        throw new Error(`Failed to get index performance: ${error.message}`);
      }

      return (data || []).map(row => ({
        indexName: row.index_name,
        tableName: row.table_name,
        indexScans: row.index_scans,
        tuplesRead: row.tuples_read,
        tuplesFetched: row.tuples_fetched,
        avgTuplesPerScan: row.avg_tuples_per_scan,
        indexSize: 'Unknown', // Would need additional query
      }));
    } catch (error) {
      console.error('Error getting index performance:', error);
      return [];
    }
  }

  /**
   * Get vector search analytics
   */
  async getVectorSearchAnalytics(days: number = 7): Promise<any> {
    try {
      const { data, error } = await this.db.getClient().rpc('get_search_performance_metrics', {
        time_period: `${days} days`
      });

      if (error) {
        throw new Error(`Failed to get search analytics: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error getting vector search analytics:', error);
      return [];
    }
  }

  // =====================================================================
  // OPTIMIZATION RECOMMENDATIONS
  // =====================================================================

  /**
   * Analyze performance and provide optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const stats = await this.getPerformanceStats();
    
    // Check for slow queries
    if (stats.errorRate > 5) {
      recommendations.push('High error rate detected. Review query patterns and database connections.');
    }

    if (stats.averageDuration > 500) {
      recommendations.push('Average query duration is high. Consider optimizing frequently used queries.');
    }

    if (stats.slowQueries > stats.totalQueries * 0.1) {
      recommendations.push('Many slow queries detected. Review indexes and query optimization.');
    }

    // Check index performance
    const indexMetrics = await this.getIndexPerformanceMetrics();
    const unusedIndexes = indexMetrics.filter(idx => idx.indexScans === 0);
    
    if (unusedIndexes.length > 0) {
      recommendations.push(`${unusedIndexes.length} unused indexes detected. Consider removing them to improve write performance.`);
    }

    // Check for unoptimized vector searches
    const vectorMetrics = await this.getVectorSearchAnalytics(7);
    const lowRelevanceSearches = vectorMetrics.filter((m: any) => m.avg_relevance_score < 0.5);
    
    if (lowRelevanceSearches.length > 0) {
      recommendations.push('Some vector searches have low relevance scores. Consider adjusting thresholds or improving embeddings.');
    }

    return recommendations;
  }

  /**
   * Optimize vector indexes based on current data
   */
  async optimizeVectorIndexes(): Promise<string[]> {
    const results: string[] = [];
    
    try {
      // Get optimization recommendations for bills table
      const { data: billsOptimization, error: billsError } = await this.db.getClient()
        .rpc('get_optimal_lists_parameter', {
          p_table_name: 'bills',
          p_vector_column: 'title_embedding'
        });

      if (!billsError && billsOptimization) {
        results.push(`Bills title embedding index optimized with ${billsOptimization} lists`);
      }

      // Get optimization recommendations for executive actions
      const { data: actionsOptimization, error: actionsError } = await this.db.getClient()
        .rpc('get_optimal_lists_parameter', {
          p_table_name: 'executive_actions',
          p_vector_column: 'title_embedding'
        });

      if (!actionsError && actionsOptimization) {
        results.push(`Executive actions title embedding index optimized with ${actionsOptimization} lists`);
      }

    } catch (error) {
      results.push(`Error optimizing indexes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return results;
  }

  // =====================================================================
  // ALERT SYSTEM
  // =====================================================================

  /**
   * Check for performance alerts
   */
  async checkPerformanceAlerts(): Promise<Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }>> {
    const alerts = [];
    const stats = await this.getPerformanceStats('1 hour');
    
    // High error rate alert
    if (stats.errorRate > 10) {
      alerts.push({
        type: 'high_error_rate',
        message: `Error rate is ${stats.errorRate.toFixed(1)}% in the last hour`,
        severity: 'high' as const
      });
    }

    // Slow query alert
    if (stats.averageDuration > 2000) {
      alerts.push({
        type: 'slow_queries',
        message: `Average query duration is ${stats.averageDuration.toFixed(0)}ms`,
        severity: 'medium' as const
      });
    }

    // High query volume alert
    if (stats.totalQueries > 1000) {
      alerts.push({
        type: 'high_volume',
        message: `High query volume: ${stats.totalQueries} queries in the last hour`,
        severity: 'low' as const
      });
    }

    return alerts;
  }

  // =====================================================================
  // REPORTING
  // =====================================================================

  /**
   * Generate performance report
   */
  async generatePerformanceReport(days: number = 7): Promise<string> {
    const stats = await this.getPerformanceStats(`${days} days`);
    const indexMetrics = await this.getIndexPerformanceMetrics();
    const recommendations = await this.getOptimizationRecommendations();
    
    let report = `# Database Performance Report (Last ${days} Days)\n\n`;
    
    report += `## Query Statistics\n`;
    report += `- Total Queries: ${stats.totalQueries}\n`;
    report += `- Average Duration: ${stats.averageDuration.toFixed(1)}ms\n`;
    report += `- Slow Queries: ${stats.slowQueries}\n`;
    report += `- Error Rate: ${stats.errorRate.toFixed(1)}%\n\n`;
    
    report += `## Query Type Breakdown\n`;
    Object.entries(stats.queryTypeBreakdown).forEach(([type, count]) => {
      report += `- ${type}: ${count}\n`;
    });
    report += '\n';
    
    report += `## Top Slow Queries\n`;
    stats.topSlowQueries.slice(0, 5).forEach((query, i) => {
      report += `${i + 1}. ${query.operation} (${query.duration}ms)\n`;
    });
    report += '\n';
    
    report += `## Index Performance\n`;
    indexMetrics.slice(0, 10).forEach(idx => {
      report += `- ${idx.indexName}: ${idx.indexScans} scans, ${idx.avgTuplesPerScan} avg tuples/scan\n`;
    });
    report += '\n';
    
    if (recommendations.length > 0) {
      report += `## Optimization Recommendations\n`;
      recommendations.forEach((rec, i) => {
        report += `${i + 1}. ${rec}\n`;
      });
    }
    
    return report;
  }

  // =====================================================================
  // PRIVATE HELPER METHODS
  // =====================================================================

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getRecentMetrics(timePeriod: string): QueryMetrics[] {
    const now = Date.now();
    let cutoffTime = now;
    
    // Parse time period
    if (timePeriod.includes('hour')) {
      const hours = parseInt(timePeriod) || 1;
      cutoffTime = now - (hours * 60 * 60 * 1000);
    } else if (timePeriod.includes('day')) {
      const days = parseInt(timePeriod) || 1;
      cutoffTime = now - (days * 24 * 60 * 60 * 1000);
    }
    
    return this.metrics.filter(m => m.startTime >= cutoffTime);
  }

  private async logSlowQuery(metric: QueryMetrics): Promise<void> {
    try {
      await this.db.getClient()
        .from('processing_logs')
        .insert({
          operation_type: 'slow_query',
          status: 'completed',
          processing_stats: {
            queryId: metric.queryId,
            queryType: metric.queryType,
            operation: metric.operation,
            duration: metric.duration,
            resultCount: metric.resultCount,
            metadata: metric.metadata,
          }
        });
    } catch (error) {
      console.error('Failed to log slow query:', error);
    }
  }

  private async logVectorSearchMetrics(metrics: VectorSearchMetrics): Promise<void> {
    try {
      await this.db.getClient()
        .rpc('log_search_query', {
          query_text: 'vector_search',
          search_type: metrics.searchType,
          result_count: metrics.resultCount,
          avg_relevance_score: metrics.relevanceScore,
          search_duration_ms: metrics.duration,
          user_session_id: null,
        });
    } catch (error) {
      console.error('Failed to log vector search metrics:', error);
    }
  }

  // =====================================================================
  // PUBLIC UTILITY METHODS
  // =====================================================================

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(milliseconds: number): void {
    this.slowQueryThreshold = milliseconds;
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get current metrics count
   */
  getMetricsCount(): number {
    return this.metrics.length;
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): QueryMetrics[] {
    return [...this.metrics];
  }
}

// =====================================================================
// SINGLETON INSTANCE
// =====================================================================

let performanceMonitorInstance: DatabasePerformanceMonitor | null = null;

export function getPerformanceMonitor(useAdmin: boolean = false): DatabasePerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new DatabasePerformanceMonitor(useAdmin);
  }
  return performanceMonitorInstance;
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Decorator for automatic query tracking
 */
export function trackDatabaseQuery(queryType: string, operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const monitor = getPerformanceMonitor();
      return await monitor.trackQuery(queryType, operation, () => method.apply(this, args));
    };
  };
}

/**
 * Create performance middleware for database operations
 */
export function createPerformanceMiddleware() {
  const monitor = getPerformanceMonitor();
  
  return {
    beforeQuery: (queryType: string, operation: string, metadata?: Record<string, any>) => {
      return monitor.startQuery(queryType, operation, metadata);
    },
    
    afterQuery: (queryId: string, resultCount: number = 0, success: boolean = true, error?: string) => {
      return monitor.endQuery(queryId, resultCount, success, error);
    },
    
    trackQuery: async <T>(
      queryType: string, 
      operation: string, 
      queryFn: () => Promise<T>,
      metadata?: Record<string, any>
    ) => {
      return await monitor.trackQuery(queryType, operation, queryFn, metadata);
    }
  };
}

export default DatabasePerformanceMonitor;