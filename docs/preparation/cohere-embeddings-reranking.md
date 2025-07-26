# Cohere Embeddings and Reranking API

## Executive Summary

Cohere provides state-of-the-art embedding and reranking models optimized for semantic search and RAG applications. The embed-v4.0 model offers multilingual capabilities and content quality assessment, while Rerank 3.0 significantly improves result relevance. For Bill Bot, Cohere enables sophisticated semantic understanding of legislative documents with advanced reranking for optimal result ordering.

## Technology Overview

Cohere's AI platform offers:
- **Embeddings**: High-quality vector representations with embed-v4.0
- **Reranking**: Semantic result reordering with Rerank 3.0
- **Multilingual Support**: Cross-language semantic understanding
- **Multimodal Capabilities**: Text and document processing
- **Content Quality Assessment**: Beyond simple topic similarity

## API Setup and Authentication

### Client Initialization

```typescript
import { CohereClientV2 } from 'cohere-ai';

class CohereService {
  private client: CohereClientV2;

  constructor() {
    this.client = new CohereClientV2({
      token: process.env.COHERE_API_KEY!,
    });
  }
}

// Alternative initialization for specific regions/endpoints
const cohereClient = new CohereClientV2({
  token: process.env.COHERE_API_KEY!,
  environment: 'production', // or 'staging'
  // clientName: 'bill-bot/1.0.0', // Optional client identification
});
```

### Environment Configuration

```typescript
// .env configuration
interface CohereConfig {
  COHERE_API_KEY: string;
  COHERE_EMBED_MODEL: string; // 'embed-english-v3.0' or 'embed-multilingual-v3.0'
  COHERE_RERANK_MODEL: string; // 'rerank-english-v3.0' or 'rerank-multilingual-v3.0'
  COHERE_MAX_BATCH_SIZE: number; // Default: 96 for embeddings
  COHERE_TIMEOUT_MS: number; // Request timeout
}

const cohereConfig: CohereConfig = {
  COHERE_API_KEY: process.env.COHERE_API_KEY!,
  COHERE_EMBED_MODEL: 'embed-english-v3.0',
  COHERE_RERANK_MODEL: 'rerank-english-v3.0',
  COHERE_MAX_BATCH_SIZE: 96,
  COHERE_TIMEOUT_MS: 30000,
};
```

## Embeddings API

### Basic Embedding Generation

```typescript
class CohereEmbeddingService {
  private client: CohereClientV2;

  constructor() {
    this.client = new CohereClientV2({
      token: process.env.COHERE_API_KEY!,
    });
  }

  async generateEmbeddings(
    texts: string[],
    options: {
      inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
      model?: string;
      embeddingTypes?: ('float' | 'int8' | 'uint8' | 'binary' | 'ubinary')[];
      truncate?: 'NONE' | 'START' | 'END';
    } = {}
  ): Promise<{
    embeddings: number[][];
    meta?: any;
  }> {
    const {
      inputType = 'search_document',
      model = 'embed-english-v3.0',
      embeddingTypes = ['float'],
      truncate = 'END',
    } = options;

    try {
      const response = await this.client.embed({
        texts,
        model,
        inputType,
        embeddingTypes,
        truncate,
      });

      return {
        embeddings: response.embeddings.float || [],
        meta: response.meta,
      };
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw new Error(`Failed to generate embeddings: ${error}`);
    }
  }

  async generateSingleEmbedding(
    text: string,
    inputType: 'search_document' | 'search_query' = 'search_document'
  ): Promise<number[]> {
    const result = await this.generateEmbeddings([text], { inputType });
    return result.embeddings[0];
  }
}
```

### Bill-Specific Embedding Implementation

```typescript
interface BillDocument {
  id: string;
  billNumber: string;
  title: string;
  summary?: string;
  fullText?: string;
  sponsor?: string;
  metadata?: any;
}

class BillEmbeddingService extends CohereEmbeddingService {
  
  async embedBillDocuments(bills: BillDocument[]): Promise<{
    titleEmbeddings: number[][];
    summaryEmbeddings: number[][];
    contentEmbeddings: number[][];
  }> {
    // Prepare text arrays
    const titles = bills.map(bill => bill.title);
    const summaries = bills.map(bill => 
      bill.summary || bill.title // Fallback to title if no summary
    );
    const contents = bills.map(bill => 
      this.prepareBillContent(bill)
    );

    // Generate embeddings in parallel
    const [titleEmbeddings, summaryEmbeddings, contentEmbeddings] = await Promise.all([
      this.generateEmbeddings(titles, { inputType: 'search_document' }),
      this.generateEmbeddings(summaries, { inputType: 'search_document' }),
      this.generateEmbeddings(contents, { inputType: 'search_document' }),
    ]);

    return {
      titleEmbeddings: titleEmbeddings.embeddings,
      summaryEmbeddings: summaryEmbeddings.embeddings,
      contentEmbeddings: contentEmbeddings.embeddings,
    };
  }

  private prepareBillContent(bill: BillDocument): string {
    // Combine bill information for comprehensive embedding
    const parts = [
      bill.title,
      bill.summary || '',
      bill.sponsor ? `Sponsored by: ${bill.sponsor}` : '',
      bill.metadata?.committee ? `Committee: ${bill.metadata.committee}` : '',
      bill.fullText ? bill.fullText.substring(0, 2000) : '', // Truncate if too long
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.generateSingleEmbedding(query, 'search_query');
  }

  // Batch processing for large datasets
  async embedBillsBatch(
    bills: BillDocument[],
    batchSize: number = 96
  ): Promise<Map<string, { title: number[]; summary: number[]; content: number[] }>> {
    const results = new Map<string, any>();
    
    for (let i = 0; i < bills.length; i += batchSize) {
      const batch = bills.slice(i, i + batchSize);
      const embeddings = await this.embedBillDocuments(batch);
      
      batch.forEach((bill, index) => {
        results.set(bill.id, {
          title: embeddings.titleEmbeddings[index],
          summary: embeddings.summaryEmbeddings[index],
          content: embeddings.contentEmbeddings[index],
        });
      });

      // Rate limiting - wait between batches
      if (i + batchSize < bills.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}
```

## Reranking API

### Basic Reranking Implementation

```typescript
interface RerankResult {
  index: number;
  relevanceScore: number;
  document?: any;
}

class CohereRerankingService {
  private client: CohereClientV2;

  constructor() {
    this.client = new CohereClientV2({
      token: process.env.COHERE_API_KEY!,
    });
  }

  async rerankDocuments(
    query: string,
    documents: string[],
    options: {
      model?: string;
      topK?: number;
      maxChunksPerDoc?: number;
      returnDocuments?: boolean;
    } = {}
  ): Promise<RerankResult[]> {
    const {
      model = 'rerank-english-v3.0',
      topK,
      maxChunksPerDoc,
      returnDocuments = false,
    } = options;

    try {
      const response = await this.client.rerank({
        query,
        documents,
        model,
        topK,
        maxChunksPerDoc,
        returnDocuments,
      });

      return response.results.map(result => ({
        index: result.index,
        relevanceScore: result.relevanceScore,
        document: result.document,
      }));
    } catch (error) {
      console.error('Reranking failed:', error);
      throw new Error(`Failed to rerank documents: ${error}`);
    }
  }

  async rerankBills(
    query: string,
    bills: BillDocument[],
    topK: number = 10
  ): Promise<Array<BillDocument & { relevanceScore: number }>> {
    // Prepare documents for reranking
    const documents = bills.map(bill => this.prepareBillForReranking(bill));
    
    // Rerank documents
    const rerankedResults = await this.rerankDocuments(query, documents, {
      topK,
      returnDocuments: false,
    });

    // Map results back to bills with relevance scores
    return rerankedResults.map(result => ({
      ...bills[result.index],
      relevanceScore: result.relevanceScore,
    }));
  }

  private prepareBillForReranking(bill: BillDocument): string {
    // Create a comprehensive text representation for reranking
    const sections = [
      `Title: ${bill.title}`,
      bill.summary ? `Summary: ${bill.summary}` : '',
      bill.sponsor ? `Sponsor: ${bill.sponsor}` : '',
      bill.metadata?.status ? `Status: ${bill.metadata.status}` : '',
      bill.metadata?.committee ? `Committee: ${bill.metadata.committee}` : '',
    ].filter(Boolean);

    return sections.join('\n');
  }
}
```

### Advanced Reranking with Metadata

```typescript
interface EnhancedBillDocument extends BillDocument {
  relevanceScore?: number;
  searchMetadata?: {
    originalRank: number;
    vectorSimilarity: number;
    keywordScore?: number;
  };
}

class AdvancedBillReranking extends CohereRerankingService {
  
  async hybridRerank(
    query: string,
    bills: EnhancedBillDocument[],
    options: {
      topK?: number;
      rerankWeight?: number; // Weight of rerank score vs original score
      preserveTopResults?: number; // Always include top N from original ranking
    } = {}
  ): Promise<EnhancedBillDocument[]> {
    const {
      topK = 10,
      rerankWeight = 0.7,
      preserveTopResults = 2,
    } = options;

    // Always preserve top results from original ranking
    const preservedBills = bills.slice(0, preserveTopResults);
    const billsToRerank = bills.slice(preserveTopResults);

    // Rerank the remaining bills
    const rerankedBills = await this.rerankBills(query, billsToRerank, topK - preserveTopResults);

    // Combine preserved and reranked results
    const combinedResults = [
      ...preservedBills.map(bill => ({
        ...bill,
        relevanceScore: bill.searchMetadata?.vectorSimilarity || 0,
        finalScore: bill.searchMetadata?.vectorSimilarity || 0,
      })),
      ...rerankedBills.map(bill => {
        const originalScore = bill.searchMetadata?.vectorSimilarity || 0;
        const finalScore = (bill.relevanceScore * rerankWeight) + (originalScore * (1 - rerankWeight));
        
        return {
          ...bill,
          finalScore,
        };
      }),
    ];

    // Sort by final score and return top K
    return combinedResults
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);
  }

  async contextualRerank(
    query: string,
    bills: BillDocument[],
    context: {
      userPreferences?: {
        preferredTopics?: string[];
        preferredSponsors?: string[];
        preferredStatuses?: string[];
      };
      historicalInteractions?: string[]; // Previous queries or viewed bills
      sessionContext?: string; // Current conversation context
    } = {}
  ): Promise<Array<BillDocument & { relevanceScore: number; contextScore?: number }>> {
    // Enhance query with context
    const enhancedQuery = this.buildContextualQuery(query, context);
    
    // Perform standard reranking
    const rerankedBills = await this.rerankBills(enhancedQuery, bills);
    
    // Apply contextual scoring
    return rerankedBills.map(bill => {
      const contextScore = this.calculateContextScore(bill, context);
      return {
        ...bill,
        contextScore,
        relevanceScore: (bill.relevanceScore * 0.8) + (contextScore * 0.2), // Weighted combination
      };
    });
  }

  private buildContextualQuery(
    originalQuery: string,
    context: any
  ): string {
    const queryParts = [originalQuery];
    
    if (context.userPreferences?.preferredTopics) {
      queryParts.push(`Topics: ${context.userPreferences.preferredTopics.join(', ')}`);
    }
    
    if (context.sessionContext) {
      queryParts.push(`Context: ${context.sessionContext}`);
    }
    
    return queryParts.join('\n');
  }

  private calculateContextScore(bill: BillDocument, context: any): number {
    let score = 0.5; // Base score
    
    // Preferred topics boost
    if (context.userPreferences?.preferredTopics) {
      const billText = `${bill.title} ${bill.summary || ''}`.toLowerCase();
      const matchingTopics = context.userPreferences.preferredTopics.filter((topic: string) =>
        billText.includes(topic.toLowerCase())
      );
      score += matchingTopics.length * 0.1;
    }
    
    // Preferred sponsors boost
    if (context.userPreferences?.preferredSponsors && bill.sponsor) {
      const isPreferredSponsor = context.userPreferences.preferredSponsors.includes(bill.sponsor);
      if (isPreferredSponsor) score += 0.2;
    }
    
    // Status preferences
    if (context.userPreferences?.preferredStatuses && bill.metadata?.status) {
      const isPreferredStatus = context.userPreferences.preferredStatuses.includes(bill.metadata.status);
      if (isPreferredStatus) score += 0.1;
    }
    
    return Math.min(score, 1.0); // Cap at 1.0
  }
}
```

## Integration with Supabase

```typescript
class CohereSupabaseIntegration {
  private cohereEmbedding: BillEmbeddingService;
  private cohereReranking: AdvancedBillReranking;
  private supabase: SupabaseClient;

  constructor() {
    this.cohereEmbedding = new BillEmbeddingService();
    this.cohereReranking = new AdvancedBillReranking();
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async searchAndRerank(
    query: string,
    options: {
      initialResults?: number;
      finalResults?: number;
      searchMethod?: 'vector' | 'hybrid';
      useReranking?: boolean;
      filters?: any;
    } = {}
  ): Promise<any[]> {
    const {
      initialResults = 50,
      finalResults = 10,
      searchMethod = 'hybrid',
      useReranking = true,
      filters = {},
    } = options;

    // Step 1: Generate query embedding
    const queryEmbedding = await this.cohereEmbedding.embedQuery(query);

    // Step 2: Perform initial vector search
    const { data: initialSearchResults, error } = await this.supabase
      .rpc('search_bills_semantic', {
        query_embedding: queryEmbedding,
        match_count: initialResults,
        match_threshold: 0.6,
        ...filters,
      });

    if (error) throw error;

    if (!useReranking) {
      return initialSearchResults.slice(0, finalResults);
    }

    // Step 3: Rerank results using Cohere
    const rerankedResults = await this.cohereReranking.rerankBills(
      query,
      initialSearchResults,
      finalResults
    );

    return rerankedResults;
  }

  async storeEmbeddingsForBill(bill: BillDocument): Promise<void> {
    // Generate embeddings using Cohere
    const embeddings = await this.cohereEmbedding.embedBillDocuments([bill]);
    
    // Store in Supabase
    await this.supabase
      .from('bills')
      .upsert({
        id: bill.id,
        bill_number: bill.billNumber,
        title: bill.title,
        summary: bill.summary,
        sponsor: bill.sponsor,
        metadata: bill.metadata,
        title_embedding: embeddings.titleEmbeddings[0],
        summary_embedding: embeddings.summaryEmbeddings[0],
        content_embedding: embeddings.contentEmbeddings[0],
      });
  }

  // Batch processing for bulk data ingestion
  async processBillsBatch(bills: BillDocument[]): Promise<void> {
    const embeddings = await this.cohereEmbedding.embedBillsBatch(bills);
    
    const billsWithEmbeddings = bills.map(bill => {
      const billEmbeddings = embeddings.get(bill.id);
      return {
        id: bill.id,
        bill_number: bill.billNumber,
        title: bill.title,
        summary: bill.summary,
        sponsor: bill.sponsor,
        metadata: bill.metadata,
        title_embedding: billEmbeddings?.title,
        summary_embedding: billEmbeddings?.summary,
        content_embedding: billEmbeddings?.content,
      };
    });

    // Batch insert to Supabase
    const { error } = await this.supabase
      .from('bills')
      .upsert(billsWithEmbeddings);

    if (error) throw error;
  }
}
```

## Rate Limiting and Error Handling

```typescript
class CohereServiceWithRetry {
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second
  private rateLimitTracker = new Map<string, number>();

  async callWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Check rate limiting
        await this.checkRateLimit(context);
        
        const result = await operation();
        
        // Reset rate limit counter on success
        this.rateLimitTracker.delete(context);
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Handle specific error types
        if (error.status === 429 || error.message?.includes('rate limit')) {
          const delay = this.calculateBackoffDelay(attempt, error);
          console.log(`Rate limited. Waiting ${delay}ms before retry ${attempt}/${this.maxRetries}`);
          await this.sleep(delay);
          continue;
        }
        
        if (error.status >= 500) {
          // Server error - retry with exponential backoff
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`Server error. Waiting ${delay}ms before retry ${attempt}/${this.maxRetries}`);
          await this.sleep(delay);
          continue;
        }
        
        // Client error - don't retry
        throw error;
      }
    }
    
    throw lastError!;
  }

  private async checkRateLimit(context: string): Promise<void> {
    const now = Date.now();
    const lastCall = this.rateLimitTracker.get(context) || 0;
    const minInterval = 100; // Minimum 100ms between calls
    
    if (now - lastCall < minInterval) {
      await this.sleep(minInterval - (now - lastCall));
    }
    
    this.rateLimitTracker.set(context, Date.now());
  }

  private calculateBackoffDelay(attempt: number, error: any): number {
    // Check if error includes retry-after header
    const retryAfter = error.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000;
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Performance Optimization

```typescript
class CoherePerformanceOptimizer {
  private embeddingCache = new LRUCache<string, number[]>({ max: 1000 });
  private rerankCache = new LRUCache<string, RerankResult[]>({ max: 500 });

  async optimizedEmbedding(
    text: string,
    inputType: 'search_document' | 'search_query' = 'search_document'
  ): Promise<number[]> {
    const cacheKey = `${text}:${inputType}`;
    
    // Check cache first
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) return cached;
    
    // Generate embedding
    const embedding = await this.cohereEmbedding.generateSingleEmbedding(text, inputType);
    
    // Cache result
    this.embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  }

  async batchOptimizedProcessing(
    items: Array<{ id: string; text: string }>,
    batchSize: number = 96
  ): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();
    const uncachedItems: Array<{ id: string; text: string; index: number }> = [];
    
    // Check cache for existing embeddings
    items.forEach((item, index) => {
      const cached = this.embeddingCache.get(item.text);
      if (cached) {
        results.set(item.id, cached);
      } else {
        uncachedItems.push({ ...item, index });
      }
    });
    
    // Process uncached items in batches
    for (let i = 0; i < uncachedItems.length; i += batchSize) {
      const batch = uncachedItems.slice(i, i + batchSize);
      const texts = batch.map(item => item.text);
      
      const embeddings = await this.cohereEmbedding.generateEmbeddings(texts);
      
      batch.forEach((item, batchIndex) => {
        const embedding = embeddings.embeddings[batchIndex];
        results.set(item.id, embedding);
        this.embeddingCache.set(item.text, embedding);
      });
      
      // Rate limiting between batches
      if (i + batchSize < uncachedItems.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
}

// LRU Cache implementation
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(options: { max: number }) {
    this.maxSize = options.max;
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

## Best Practices

### 1. Embedding Strategy

```typescript
const embeddingBestPractices = {
  // Use appropriate input types
  inputTypes: {
    'search_document': 'For bills and documents to be searched',
    'search_query': 'For user queries',
    'classification': 'For categorizing bills',
    'clustering': 'For grouping similar bills',
  },
  
  // Optimize text preparation
  textPreparation: {
    maxLength: 512, // Tokens for embed-english-v3.0
    cleanHtml: true,
    normalizeWhitespace: true,
    preserveStructure: false, // For bills, structure might be important
  },
  
  // Batch processing
  batching: {
    maxBatchSize: 96,
    parallelBatches: 3,
    delayBetweenBatches: 200, // ms
  },
};
```

### 2. Reranking Strategy

```typescript
const rerankingBestPractices = {
  // When to use reranking
  useReranking: {
    initialResultsMin: 10, // Only rerank if you have enough initial results
    queryComplexity: 'moderate', // Simple queries might not need reranking
    performanceRequirement: 'quality_over_speed',
  },
  
  // Optimal parameters
  parameters: {
    topK: '20-50', // Sweet spot for most use cases
    maxChunksPerDoc: 10, // For long documents
    preserveTopResults: 2, // Always keep top semantic matches
  },
  
  // Cost optimization
  costOptimization: {
    cacheResults: true,
    batchSimilarQueries: true,
    fallbackToVectorSearch: true, // If reranking fails
  },
};
```

## Common Pitfalls to Avoid

1. **Wrong Input Types**: Use 'search_query' for queries, 'search_document' for content
2. **Exceeding Token Limits**: Monitor text length before embedding
3. **Ignoring Rate Limits**: Implement proper retry logic and backoff
4. **Poor Caching Strategy**: Cache embeddings and rerank results appropriately
5. **Over-reranking**: Don't rerank every query - use for complex searches only
6. **Missing Error Handling**: Handle API failures gracefully
7. **Inefficient Batching**: Use optimal batch sizes for embeddings

## Resource Links

- [Cohere Embeddings Documentation](https://docs.cohere.com/docs/embeddings)
- [Cohere Rerank Documentation](https://docs.cohere.com/docs/reranking)
- [Cohere API Reference](https://docs.cohere.com/reference/)
- [Semantic Search Guide](https://docs.cohere.com/docs/semantic-search)