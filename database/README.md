# Bill Bot Database Implementation

This directory contains the complete database implementation for Bill Bot, including migrations, functions, TypeScript clients, and performance monitoring tools.

## 📁 Directory Structure

```
database/
├── migrations/                  # Database migration files
├── functions/                   # SQL functions for search and operations
├── types/                       # TypeScript type definitions
├── supabase-client.ts          # Main database client
├── schema-validation.ts        # Runtime schema validation
├── performance-monitoring.ts   # Performance tracking and optimization
└── README.md                   # This file
```

## 🗄️ Database Schema Overview

The Bill Bot database is built on **PostgreSQL with pgvector extension** for semantic search capabilities. It supports:

- **Bills**: Congressional legislation with full metadata and vector embeddings
- **Executive Actions**: Presidential orders, memoranda, and proclamations
- **Context Injection**: Materialized views for fast context discovery
- **RSS Processing**: Automated data ingestion and processing
- **Performance Monitoring**: Query optimization and analytics

## 🚀 Migration Files

### Sequential Migration Order
1. **001_initial_bills_schema.sql** - Core bills table with vector support
2. **002_executive_actions_schema.sql** - Executive actions and cross-references
3. **003_vector_indexes.sql** - Optimized pgvector indexes for semantic search
4. **004_context_views.sql** - Materialized views for context injection
5. **005_rss_feeds_config.sql** - RSS feed configuration and processing

### Running Migrations

```sql
-- Run migrations in order
\i migrations/001_initial_bills_schema.sql
\i migrations/002_executive_actions_schema.sql
\i migrations/003_vector_indexes.sql
\i migrations/004_context_views.sql
\i migrations/005_rss_feeds_config.sql
```

## 🔍 Core Database Functions

### Search Functions (`functions/hybrid_search.sql`)
- `search_content_hybrid()` - Advanced hybrid search with customizable weights
- `search_content_iterative()` - Iterative search refinement for MCP server
- `search_legislative_content()` - Optimized legislative search
- `find_similar_content()` - Content similarity discovery

### Context Discovery (`functions/context_discovery.sql`)
- `get_available_sponsors()` - Sponsor discovery with fuzzy matching
- `discover_topic_categories()` - Topic discovery with relevance scoring
- `get_comprehensive_context()` - Complete context for query enhancement
- `validate_sponsor_names()` - Sponsor name validation and suggestions

### Citation Generation (`functions/citation_generation.sql`)
- `generate_bill_citation()` - Multiple citation formats (APA, MLA, Chicago, etc.)
- `generate_executive_action_citation()` - Executive action citations
- `search_with_citations()` - Search results with automatic citations
- `export_citations_bibliography()` - Bibliography export functionality

### Embedding Management (`functions/embedding_triggers.sql`)
- `smart_queue_embedding()` - Intelligent embedding generation prioritization
- `batch_generate_missing_embeddings()` - Bulk embedding generation
- `get_embedding_queue_stats()` - Queue monitoring and management
- Automatic triggers for real-time embedding generation

## 📊 Key Database Tables

### Bills Table
```sql
CREATE TABLE bills (
  id BIGSERIAL PRIMARY KEY,
  bill_number VARCHAR(50) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  sponsor VARCHAR(255),
  chamber VARCHAR(20) NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'introduced',
  -- Vector embeddings (Cohere 1024 dimensions)
  title_embedding VECTOR(1024),
  summary_embedding VECTOR(1024),
  content_embedding VECTOR(1024),
  -- Full-text search support
  search_vector TSVECTOR,
  -- ... additional fields
);
```

### Executive Actions Table
```sql
CREATE TABLE executive_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_order_number INTEGER,
  action_type executive_action_type NOT NULL,
  title TEXT NOT NULL,
  administration TEXT NOT NULL,
  president_name TEXT NOT NULL,
  -- Vector embeddings
  title_embedding VECTOR(1024),
  summary_embedding VECTOR(1024),
  content_embedding VECTOR(1024),
  -- ... additional fields
);
```

## 🔧 TypeScript Integration

### Database Client Usage

```typescript
import { BillBotDatabase, billBotDB } from './database/supabase-client';

// Search bills semantically
const results = await billBotDB.searchBillsSemantic(
  queryEmbedding,
  {
    threshold: 0.7,
    limit: 10,
    chamberFilter: 'house',
    activeOnly: true
  }
);

// Get context for query enhancement
const context = await billBotDB.getComprehensiveContext(
  'healthcare legislation',
  ['bills', 'executive_actions']
);

// Generate citations
const citation = await billBotDB.generateBillCitation(123, 'apa');
```

### Schema Validation

```typescript
import { validateBillInsert, validateSearchOptions } from './database/schema-validation';

// Validate data before insertion
const validBill = validateBillInsert(rawBillData);
const validOptions = validateSearchOptions(searchParams);
```

### Performance Monitoring

```typescript
import { getPerformanceMonitor } from './database/performance-monitoring';

const monitor = getPerformanceMonitor();

// Track query performance
const result = await monitor.trackQuery(
  'semantic_search',
  'search_bills',
  () => billBotDB.searchBillsSemantic(embedding)
);

// Get performance report
const report = await monitor.generatePerformanceReport(7);
```

## 🚀 Deployment Instructions

### Environment Variables Required

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Supabase Setup

1. **Create Supabase Project**
2. **Enable pgvector Extension**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. **Run Migrations in Order** (001 through 005)
4. **Configure Row Level Security** (optional)
5. **Set up Connection Pooling** for production

### Initial Data Population

```sql
-- Refresh materialized views
SELECT refresh_context_cache();

-- Queue embeddings for existing data
SELECT batch_generate_missing_embeddings('both', 'all', 100);
```

## 📈 Performance Optimization

### Vector Index Optimization

```sql
-- Optimize vector indexes based on data size
SELECT recreate_vector_index('bills', 'title_embedding');
SELECT recreate_vector_index('executive_actions', 'title_embedding');
```

### Materialized View Maintenance

```sql
-- Schedule regular refresh (via cron or application)
SELECT refresh_context_cache();
```

### Query Performance Monitoring

```sql
-- Check index performance
SELECT * FROM analyze_vector_index_performance();

-- Get search performance metrics
SELECT * FROM get_search_performance_metrics('7 days');
```

## 🔍 Key Features

### ✅ Vector Search Capabilities
- **Semantic Search**: Using Cohere embeddings (1024 dimensions)
- **Hybrid Search**: Combining semantic and keyword search
- **Iterative Refinement**: For MCP server integration
- **Cross-Content Search**: Unified search across bills and executive actions

### ✅ Context Injection System
- **Dynamic Context Discovery**: Real-time sponsor, topic, and metadata discovery
- **Materialized Views**: Fast context lookup with automatic refresh
- **Validation Functions**: Prevent LLM hallucination with validated parameters
- **Fuzzy Matching**: Intelligent name and term matching

### ✅ Citation Management
- **Multiple Formats**: APA, MLA, Chicago, standard formats
- **Automatic Generation**: Integrated with search results
- **Cross-References**: Bills ↔ Executive actions relationships
- **Bibliography Export**: Complete bibliography generation

### ✅ Performance & Monitoring
- **Query Tracking**: Automatic performance monitoring
- **Index Optimization**: Dynamic index parameter optimization
- **Slow Query Detection**: Automatic alerting and logging
- **Analytics Dashboard**: Comprehensive performance reporting

### ✅ Data Processing Pipeline
- **RSS Feed Integration**: Automated content ingestion
- **Embedding Queue**: Prioritized embedding generation
- **Deduplication**: Content hash-based duplicate detection
- **Error Handling**: Robust retry and error management

## 🛠️ Maintenance Tasks

### Regular Maintenance

```sql
-- Weekly: Refresh context cache
SELECT refresh_context_cache();

-- Monthly: Optimize vector indexes
SELECT recreate_vector_index('bills', 'title_embedding');

-- Monthly: Clean up old processing logs
SELECT cleanup_embedding_queue(30);
```

### Monitoring Commands

```sql
-- Check database health
SELECT * FROM get_rss_processing_stats();
SELECT * FROM get_embedding_queue_stats();
SELECT * FROM get_context_cache_status();
```

This database implementation provides a robust, scalable foundation for Bill Bot's legislative search and analysis capabilities, with comprehensive monitoring, optimization, and maintenance tools built-in.