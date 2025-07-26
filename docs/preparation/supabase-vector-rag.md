# Supabase Vector Embeddings and RAG Implementation

## Executive Summary

Supabase provides a complete vector database solution using PostgreSQL with the pgvector extension, enabling sophisticated RAG (Retrieval Augmented Generation) implementations. The platform offers automatic embeddings, hybrid search capabilities, and seamless integration with various AI providers. For Bill Bot, this enables semantic search across legislative documents with real-time updates and robust scalability.

## Technology Overview

Supabase's vector capabilities include:
- **pgvector Extension**: High-performance vector operations in PostgreSQL
- **Automatic Embeddings**: Background processing for vector generation
- **Hybrid Search**: Combining semantic and keyword search
- **Real-time Subscriptions**: Live updates for new document embeddings
- **Multi-modal Support**: Text, document, and image embedding storage

## Database Setup and Configuration

### Enable pgvector Extension

```sql
-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Create Bills Table with Vector Support

```sql
-- Bills table with embedding support
CREATE TABLE bills (
  id BIGSERIAL PRIMARY KEY,
  bill_number VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  sponsor VARCHAR(255),
  introduced_date DATE,
  status VARCHAR(100),
  chamber VARCHAR(20),
  committee VARCHAR(255),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Vector embeddings (adjust dimensions based on model)
  title_embedding VECTOR(384),      -- For title-based search
  summary_embedding VECTOR(384),    -- For summary search  
  content_embedding VECTOR(1536),   -- For full content (OpenAI ada-002 size)
  
  -- Full-text search support
  search_vector TSVECTOR
);

-- Create indexes for performance
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_summary_embedding_idx ON bills 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_content_embedding_idx ON bills 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Full-text search index
CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);

-- Composite indexes for filtering
CREATE INDEX bills_status_date_idx ON bills (status, introduced_date);
CREATE INDEX bills_chamber_idx ON bills (chamber);
CREATE INDEX bills_metadata_gin_idx ON bills USING GIN(metadata);
```

### Vector Search Functions

```sql
-- Semantic search function with filters
CREATE OR REPLACE FUNCTION search_bills_semantic(
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_status TEXT[] DEFAULT NULL,
  filter_chamber TEXT DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  bill_number VARCHAR(50),
  title TEXT,
  summary TEXT,
  sponsor VARCHAR(255),
  status VARCHAR(100),
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    b.id,
    b.bill_number,
    b.title,
    b.summary,
    b.sponsor,
    b.status,
    1 - (b.title_embedding <=> query_embedding) AS similarity,
    b.metadata
  FROM bills b
  WHERE 
    1 - (b.title_embedding <=> query_embedding) > match_threshold
    AND (filter_status IS NULL OR b.status = ANY(filter_status))
    AND (filter_chamber IS NULL OR b.chamber = filter_chamber)
    AND (date_from IS NULL OR b.introduced_date >= date_from)
    AND (date_to IS NULL OR b.introduced_date <= date_to)
  ORDER BY (b.title_embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;

-- Hybrid search combining semantic and keyword search
CREATE OR REPLACE FUNCTION search_bills_hybrid(
  query_text TEXT,
  query_embedding VECTOR(384),
  semantic_weight FLOAT DEFAULT 0.7,
  keyword_weight FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  bill_number VARCHAR(50),
  title TEXT,
  summary TEXT,
  combined_score FLOAT,
  semantic_score FLOAT,
  keyword_score FLOAT
)
LANGUAGE SQL STABLE
AS $$
  WITH semantic_search AS (
    SELECT 
      id,
      bill_number,
      title,
      summary,
      1 - (title_embedding <=> query_embedding) AS semantic_score
    FROM bills
    WHERE title_embedding IS NOT NULL
  ),
  keyword_search AS (
    SELECT 
      id,
      ts_rank(search_vector, plainto_tsquery(query_text)) AS keyword_score
    FROM bills
    WHERE search_vector @@ plainto_tsquery(query_text)
  )
  SELECT 
    s.id,
    s.bill_number,
    s.title,
    s.summary,
    (s.semantic_score * semantic_weight + COALESCE(k.keyword_score, 0) * keyword_weight) AS combined_score,
    s.semantic_score,
    COALESCE(k.keyword_score, 0) AS keyword_score
  FROM semantic_search s
  LEFT JOIN keyword_search k ON s.id = k.id
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;
```

## Automatic Embeddings Setup

### Configure Automatic Embedding Generation

```sql
-- Create function to generate embedding input
CREATE OR REPLACE FUNCTION embedding_input_bills(bills)
RETURNS TEXT AS $$
  SELECT $1.title || ' ' || COALESCE($1.summary, '') || ' ' || COALESCE($1.sponsor, '');
$$ LANGUAGE SQL IMMUTABLE;

-- Enable automatic embeddings for bills table
SELECT ai.create_embedding(
  'bills',           -- table name
  'title_embedding', -- embedding column
  'embedding_input_bills', -- input function
  'text-embedding-ada-002' -- model (or your preferred model)
);

-- Create triggers for automatic updates
CREATE OR REPLACE FUNCTION update_bill_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', NEW.title), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sponsor, '')), 'C');
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bills_search_vector
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_search_vector();
```

## TypeScript Integration

### Supabase Client Setup

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Database {
  public: {
    Tables: {
      bills: {
        Row: {
          id: number;
          bill_number: string;
          title: string;
          summary: string | null;
          full_text: string | null;
          sponsor: string | null;
          introduced_date: string | null;
          status: string | null;
          chamber: string | null;
          committee: string | null;
          metadata: any;
          created_at: string;
          updated_at: string;
          title_embedding: number[] | null;
          summary_embedding: number[] | null;
          content_embedding: number[] | null;
        };
        Insert: {
          bill_number: string;
          title: string;
          summary?: string;
          full_text?: string;
          sponsor?: string;
          introduced_date?: string;
          status?: string;
          chamber?: string;
          committee?: string;
          metadata?: any;
        };
        Update: {
          bill_number?: string;
          title?: string;
          summary?: string;
          full_text?: string;
          sponsor?: string;
          introduced_date?: string;
          status?: string;
          chamber?: string;
          committee?: string;
          metadata?: any;
        };
      };
    };
  };
}

class SupabaseVectorClient {
  private client: SupabaseClient<Database>;

  constructor() {
    this.client = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async searchBillsSemantic(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      statusFilter?: string[];
      chamberFilter?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ) {
    const {
      threshold = 0.7,
      limit = 10,
      statusFilter,
      chamberFilter,
      dateFrom,
      dateTo,
    } = options;

    const { data, error } = await this.client.rpc('search_bills_semantic', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_status: statusFilter || null,
      filter_chamber: chamberFilter || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    });

    if (error) throw error;
    return data;
  }

  async searchBillsHybrid(
    queryText: string,
    queryEmbedding: number[],
    options: {
      semanticWeight?: number;
      keywordWeight?: number;
      limit?: number;
    } = {}
  ) {
    const {
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      limit = 10,
    } = options;

    const { data, error } = await this.client.rpc('search_bills_hybrid', {
      query_text: queryText,
      query_embedding: queryEmbedding,
      semantic_weight: semanticWeight,
      keyword_weight: keywordWeight,
      match_count: limit,
    });

    if (error) throw error;
    return data;
  }

  async insertBill(bill: Database['public']['Tables']['bills']['Insert']) {
    const { data, error } = await this.client
      .from('bills')
      .insert(bill)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateBillEmbeddings(
    billId: number,
    embeddings: {
      titleEmbedding?: number[];
      summaryEmbedding?: number[];
      contentEmbedding?: number[];
    }
  ) {
    const updateData: any = {};
    
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

    if (error) throw error;
    return data;
  }

  // Real-time subscriptions for new bills
  subscribeToNewBills(
    callback: (payload: any) => void,
    filters?: { status?: string; chamber?: string }
  ) {
    let query = this.client
      .channel('bills_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bills',
      }, callback);

    if (filters?.status) {
      query = query.filter('status', 'eq', filters.status);
    }
    if (filters?.chamber) {
      query = query.filter('chamber', 'eq', filters.chamber);
    }

    return query.subscribe();
  }
}

export { SupabaseVectorClient };
```

## Embedding Generation with Cohere

```typescript
import { CohereClient } from 'cohere-ai';

class CohereEmbeddingService {
  private cohere: CohereClient;

  constructor() {
    this.cohere = new CohereClient({
      token: process.env.COHERE_API_KEY!,
    });
  }

  async generateEmbeddings(
    texts: string[],
    inputType: 'search_document' | 'search_query' = 'search_document'
  ): Promise<number[][]> {
    const response = await this.cohere.embed({
      texts,
      model: 'embed-english-v3.0',
      inputType,
      embeddingTypes: ['float'],
    });

    return response.embeddings.float!;
  }

  async generateSingleEmbedding(
    text: string,
    inputType: 'search_document' | 'search_query' = 'search_document'
  ): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text], inputType);
    return embeddings[0];
  }

  async rerankResults(
    query: string,
    documents: Array<{ id: string; text: string }>,
    topK: number = 10
  ) {
    const response = await this.cohere.rerank({
      query,
      documents: documents.map(doc => doc.text),
      topK,
      model: 'rerank-english-v3.0',
    });

    return response.results.map(result => ({
      ...documents[result.index],
      relevanceScore: result.relevanceScore,
    }));
  }
}
```

## RAG Implementation Pattern

```typescript
interface RAGContext {
  query: string;
  retrievedDocuments: any[];
  citations: Citation[];
  metadata: {
    searchMethod: 'semantic' | 'hybrid' | 'keyword';
    totalResults: number;
    searchTime: number;
  };
}

class BillBotRAG {
  private vectorClient: SupabaseVectorClient;
  private embeddingService: CohereEmbeddingService;

  constructor() {
    this.vectorClient = new SupabaseVectorClient();
    this.embeddingService = new CohereEmbeddingService();
  }

  async performRAGSearch(
    query: string,
    options: {
      searchMethod?: 'semantic' | 'hybrid';
      maxResults?: number;
      useReranking?: boolean;
      filters?: {
        status?: string[];
        chamber?: string;
        dateRange?: { from: string; to: string };
      };
    } = {}
  ): Promise<RAGContext> {
    const startTime = Date.now();
    const {
      searchMethod = 'hybrid',
      maxResults = 10,
      useReranking = true,
      filters = {},
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateSingleEmbedding(
      query,
      'search_query'
    );

    let results: any[];

    // Perform search based on method
    if (searchMethod === 'semantic') {
      results = await this.vectorClient.searchBillsSemantic(queryEmbedding, {
        limit: useReranking ? maxResults * 2 : maxResults,
        statusFilter: filters.status,
        chamberFilter: filters.chamber,
        dateFrom: filters.dateRange?.from,
        dateTo: filters.dateRange?.to,
      });
    } else {
      results = await this.vectorClient.searchBillsHybrid(
        query,
        queryEmbedding,
        {
          limit: useReranking ? maxResults * 2 : maxResults,
        }
      );
    }

    // Apply reranking if enabled
    if (useReranking && results.length > 0) {
      const documents = results.map(bill => ({
        id: bill.id.toString(),
        text: `${bill.title} ${bill.summary || ''}`,
      }));

      const rerankedResults = await this.embeddingService.rerankResults(
        query,
        documents,
        maxResults
      );

      // Merge reranked results with original data
      results = rerankedResults.map(reranked => {
        const original = results.find(r => r.id.toString() === reranked.id);
        return {
          ...original,
          relevanceScore: reranked.relevanceScore,
        };
      });
    }

    // Generate citations
    const citations = this.generateCitations(results, query);

    const searchTime = Date.now() - startTime;

    return {
      query,
      retrievedDocuments: results,
      citations,
      metadata: {
        searchMethod,
        totalResults: results.length,
        searchTime,
      },
    };
  }

  private generateCitations(results: any[], query: string): Citation[] {
    return results.map((bill, index) => ({
      id: `bill-${bill.id}`,
      type: 'bill' as const,
      title: bill.title,
      url: this.generateBillURL(bill.bill_number),
      relevanceScore: bill.relevanceScore || bill.similarity || 0,
      excerpt: this.extractRelevantExcerpt(bill.summary || bill.title, query),
      metadata: {
        billNumber: bill.bill_number,
        sponsor: bill.sponsor,
        status: bill.status,
        chamber: bill.chamber,
        index: index + 1,
      },
    }));
  }

  private generateBillURL(billNumber: string): string {
    // Generate URL to official bill page
    return `https://congress.gov/bill/${billNumber}`;
  }

  private extractRelevantExcerpt(text: string, query: string): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const sentences = text.split(/[.!?]+/);
    
    // Find sentence with most query term matches
    let bestSentence = sentences[0] || text.substring(0, 200);
    let maxMatches = 0;

    for (const sentence of sentences) {
      const matches = queryTerms.filter(term => 
        sentence.toLowerCase().includes(term)
      ).length;
      
      if (matches > maxMatches) {
        maxMatches = matches;
        bestSentence = sentence;
      }
    }

    return bestSentence.trim() + (bestSentence.length < text.length ? '...' : '');
  }
}

interface Citation {
  id: string;
  type: 'bill' | 'amendment' | 'vote';
  title: string;
  url: string;
  relevanceScore: number;
  excerpt: string;
  metadata: any;
}
```

## Advanced Features

### Multi-modal Embeddings

```typescript
class MultiModalEmbeddings {
  async processDocumentWithImages(
    billId: number,
    documentText: string,
    imageUrls: string[]
  ) {
    // Process text
    const textEmbedding = await this.embeddingService.generateSingleEmbedding(
      documentText
    );

    // Process images (if using multi-modal model)
    const imageEmbeddings = await Promise.all(
      imageUrls.map(url => this.processImage(url))
    );

    // Combine embeddings or store separately
    await this.vectorClient.updateBillEmbeddings(billId, {
      contentEmbedding: textEmbedding,
    });

    // Store image embeddings in separate table if needed
    await this.storeImageEmbeddings(billId, imageEmbeddings);
  }

  private async processImage(imageUrl: string): Promise<number[]> {
    // Implement image embedding logic
    return [];
  }

  private async storeImageEmbeddings(billId: number, embeddings: number[][]) {
    // Store in separate images table
  }
}
```

### Performance Optimization

```typescript
class VectorPerformanceOptimizer {
  private cache = new Map<string, any>();

  async optimizeIndex(tableName: string, vectorColumn: string) {
    // Analyze data distribution for optimal index parameters
    const { data } = await this.vectorClient.client.rpc('analyze_vector_distribution', {
      table_name: tableName,
      vector_column: vectorColumn,
    });

    const optimalLists = Math.ceil(Math.sqrt(data.row_count));
    
    // Recreate index with optimal parameters
    await this.vectorClient.client.rpc('recreate_vector_index', {
      table_name: tableName,
      vector_column: vectorColumn,
      lists: optimalLists,
    });
  }

  async cachedVectorSearch(
    query: string,
    searchFn: () => Promise<any[]>,
    ttlMs: number = 300000 // 5 minutes
  ): Promise<any[]> {
    const cacheKey = `search:${query}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.results;
    }

    const results = await searchFn();
    this.cache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });

    return results;
  }
}
```

## Best Practices

### 1. Embedding Strategy

```typescript
interface EmbeddingStrategy {
  // Use different embedding dimensions for different use cases
  titleEmbedding: 384;      // Fast search, smaller size
  summaryEmbedding: 384;    // Content overview
  fullTextEmbedding: 1536;  // Detailed content search
  
  // Update strategies
  updateFrequency: 'real-time' | 'batch' | 'scheduled';
  batchSize: number;
  retryLogic: boolean;
}

const embeddingBestPractices = {
  // 1. Use appropriate dimensions for your use case
  dimensionSelection: {
    small: 384,   // Fast searches, lower accuracy
    medium: 768,  // Balanced performance
    large: 1536,  // High accuracy, slower
  },
  
  // 2. Implement chunking for large documents
  chunkingStrategy: {
    maxChunkSize: 1000,
    overlapSize: 100,
    preserveSentences: true,
  },
  
  // 3. Use different embeddings for different search types
  searchTypes: {
    title: 'Quick discovery',
    summary: 'Content overview',
    fullText: 'Detailed analysis',
  },
};
```

### 2. Index Management

```sql
-- Monitor index performance
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE indexname LIKE '%embedding%';

-- Optimize index parameters based on data size
-- For tables with < 1K rows: lists = 10
-- For tables with 1K-10K rows: lists = 100  
-- For tables with > 10K rows: lists = SQRT(row_count)

-- Recreate index with optimal parameters
DROP INDEX IF EXISTS bills_title_embedding_idx;
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);
```

### 3. Error Handling and Monitoring

```typescript
class VectorSearchMonitoring {
  async searchWithMetrics(
    searchFn: () => Promise<any[]>,
    searchContext: {
      query: string;
      method: string;
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    let error: Error | null = null;
    let resultCount = 0;

    try {
      const results = await searchFn();
      resultCount = results.length;
      return results;
    } catch (e) {
      error = e as Error;
      throw e;
    } finally {
      const duration = Date.now() - startTime;
      
      // Log metrics
      await this.logSearchMetrics({
        ...searchContext,
        duration,
        resultCount,
        error: error?.message,
        timestamp: new Date(),
      });
    }
  }

  private async logSearchMetrics(metrics: any) {
    // Log to monitoring service or database
    console.log('Search metrics:', metrics);
  }
}
```

## Common Pitfalls to Avoid

1. **Wrong Vector Dimensions**: Ensure consistent dimensions across embeddings
2. **Missing Indexes**: Always create appropriate vector indexes for performance
3. **Poor Chunking**: Large documents need proper chunking strategies
4. **Inconsistent Models**: Use the same embedding model for search and storage
5. **No Fallback**: Always have keyword search as fallback for vector search
6. **Memory Issues**: Monitor memory usage with large vector operations
7. **Stale Embeddings**: Keep embeddings updated when content changes

## Resource Links

- [Supabase Vector Documentation](https://supabase.com/docs/guides/ai)
- [pgvector Extension Guide](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase AI Examples](https://supabase.com/docs/guides/ai/examples)
- [Vector Search Best Practices](https://supabase.com/blog/openai-embeddings-postgres-vector)