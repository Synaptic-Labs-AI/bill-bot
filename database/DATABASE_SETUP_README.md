# Bill Bot Database Implementation

This directory contains the complete Supabase database implementation for the Bill Bot application, featuring vector embeddings, semantic search, and comprehensive legislative data management.

## 🚀 Quick Start

### Option 1: Complete Setup (Recommended)
Run the complete setup script in your Supabase SQL Editor:

```sql
-- Run this single script to set up everything
\i supabase-complete-setup.sql
```

### Option 2: Modular Setup
If you prefer to run components separately:

```sql
-- 1. Core schema and tables
\i supabase-complete-schema.sql

-- 2. Indexes for performance
\i supabase-indexes.sql

-- 3. Materialized views for context
\i supabase-materialized-views.sql

-- 4. Search functions
\i supabase-search-functions.sql

-- 5. Context discovery functions
\i supabase-context-functions.sql

-- 6. Citation generation
\i supabase-citation-functions.sql

-- 7. Embedding management
\i supabase-embedding-functions.sql

-- 8. RSS processing
\i supabase-rss-functions.sql

-- 9. Security policies
\i supabase-rls-policies.sql

-- 10. Initial data
\i supabase-initial-data.sql
```

## 🧪 Testing and Validation

After setup, run the test script to validate everything works:

```sql
\i test-database-setup.sql
```

This will:
- ✅ Verify all tables exist
- ✅ Check indexes are created
- ✅ Validate functions work
- ✅ Test search functionality
- ✅ Insert sample data
- ✅ Verify constraints and triggers

## 📊 Database Architecture

### Core Tables

#### **Bills** (`bills`)
- **Purpose**: Store Congressional bills with vector embeddings
- **Key Features**: 
  - Vector embeddings (1024-dimensional)
  - Full-text search support
  - Legislative metadata and tracking
  - Automatic search vector generation

#### **Executive Actions** (`executive_actions`)
- **Purpose**: Store presidential executive orders and memoranda
- **Key Features**:
  - Vector embeddings for semantic search
  - Cross-references to related bills
  - Agency involvement tracking
  - Status and supersession management

#### **Topics and Categorization**
- `bill_topics`: Predefined topic categories
- `bill_topic_assignments`: Many-to-many bill-topic relationships
- `executive_action_topics`: Executive action categorization

#### **RSS Processing**
- `rss_feed_sources`: RSS feed configuration
- `feed_item_tracking`: Deduplication and processing status
- `processing_logs`: Audit trail for all operations

#### **Embedding Management**
- `embedding_queue`: Queue for vector embedding generation
- Automatic triggers for embedding generation

### Search Capabilities

#### **Vector Search**
```sql
-- Semantic search for bills
SELECT * FROM search_bills_semantic(
  query_embedding := your_1024_vector,
  match_threshold := 0.7,
  match_count := 10
);

-- Semantic search for executive actions
SELECT * FROM search_executive_actions_semantic(
  query_embedding := your_1024_vector,
  match_threshold := 0.7,
  match_count := 10
);
```

#### **Hybrid Search**
```sql
-- Combines semantic + keyword search
SELECT * FROM search_content_hybrid(
  query_text := 'climate change policy',
  query_embedding := your_1024_vector,
  search_options := '{"semantic_weight": 0.7, "keyword_weight": 0.3}'::jsonb
);
```

#### **Full-Text Search**
```sql
-- Traditional keyword search
SELECT * FROM bills 
WHERE search_vector @@ plainto_tsquery('english', 'healthcare reform');
```

### Context Discovery

```sql
-- Get available sponsors
SELECT * FROM get_available_sponsors(
  p_chamber := 'house',
  p_limit := 50,
  p_search_term := 'smith'
);

-- Discover topic categories
SELECT * FROM discover_topic_categories(
  p_query_text := 'environment',
  p_limit := 15
);

-- Get comprehensive context
SELECT get_comprehensive_context(
  p_query_hint := 'healthcare policy',
  p_content_types := ARRAY['bills', 'executive_actions']
);
```

### Citation Generation

```sql
-- Generate citations for bills
SELECT generate_bill_citation(
  p_bill_id := 123,
  p_format := 'apa'
);

-- Generate citations for executive actions
SELECT generate_executive_action_citation(
  p_action_id := 'uuid-here',
  p_format := 'chicago'
);
```

## 🔧 Configuration

### Vector Search Configuration

The database uses **pgvector** with **IVFFlat** indexes optimized for 1024-dimensional embeddings (Cohere embed-english-v3.0):

```sql
-- Vector indexes with optimal list counts
-- Bills: 100 lists (for larger datasets)
-- Executive Actions: 50 lists (for smaller datasets)
-- Content embeddings: 25-50 lists (for longer vectors)
```

### RSS Feed Sources

Pre-configured RSS feeds include:
- **Congressional Bills**: GovInfo RSS feeds for House and Senate
- **Executive Actions**: Federal Register API endpoints
- **White House**: Presidential actions feed

### Topic Categories

40+ predefined topics including:
- **Core Areas**: Healthcare, Environment, Education, Defense
- **Emerging Areas**: Climate Change, AI, Data Privacy
- **Social Issues**: Civil Rights, LGBTQ Rights, Racial Justice
- **Economic Sectors**: Small Business, Manufacturing, Tourism

## 🔒 Security

### Row Level Security (RLS)
- **Public Read Access**: All legislative content is publicly readable
- **Admin Write Access**: Only authenticated admins can modify data
- **System Access**: Service roles can manage RSS and embeddings

### API Access
```sql
-- Functions available to public (anon) users
- search_bills_semantic
- search_executive_actions_semantic  
- search_content_hybrid
- get_comprehensive_context
- generate_bill_citation

-- Functions restricted to service roles
- get_next_embedding_task
- complete_embedding_task
- process_feed_batch
```

## 📈 Performance Optimization

### Indexing Strategy
- **Vector Indexes**: IVFFlat with cosine similarity
- **Full-Text**: GIN indexes for tsvector columns
- **B-Tree**: Composite indexes for common query patterns
- **JSONB**: GIN indexes for metadata queries

### Materialized Views
Fast context discovery through pre-computed aggregations:
- `mv_sponsor_stats`: Sponsor activity and statistics
- `mv_topic_stats`: Topic usage and trends
- `mv_status_stats`: Bill status distributions
- `mv_administration_stats`: Executive action summaries

### Query Optimization
```sql
-- Refresh materialized views periodically
SELECT refresh_context_cache();

-- Monitor performance
SELECT * FROM get_processing_performance();
SELECT * FROM analyze_vector_index_performance();
```

## 🔄 Maintenance

### Regular Maintenance Tasks

```sql
-- Refresh context cache (run daily)
SELECT refresh_context_cache();

-- Clean up old logs (run weekly)
SELECT cleanup_processing_logs(30);

-- Clean up embedding queue (run daily)
SELECT cleanup_embedding_queue(7);

-- Retry failed embeddings (run as needed)
SELECT retry_failed_embeddings(3, true);
```

### Monitoring

```sql
-- Check RSS feed health
SELECT * FROM get_feed_health_status();

-- Monitor embedding queue
SELECT * FROM get_embedding_queue_stats();

-- Database performance metrics
SELECT * FROM get_processing_performance();
```

## 🛠️ Development

### Adding New Content Types

1. **Create tables** with vector embedding columns
2. **Add search functions** following existing patterns
3. **Update context functions** to include new content
4. **Add RSS processing** if applicable
5. **Update RLS policies** for security

### Custom Search Functions

Follow this pattern for new search functions:
```sql
CREATE OR REPLACE FUNCTION search_custom_content(
  query_embedding VECTOR(1024),
  -- other parameters
)
RETURNS TABLE (
  -- return columns
)
LANGUAGE SQL STABLE
AS $$
  -- Your search logic here
$$;
```

## 📚 Documentation

### Database Schema
- See `docs/architecture/database-schema.md` for detailed schema documentation
- TypeScript types are available in `database/types/database.types.ts`

### Migration Files
- `migrations/001_initial_bills_schema.sql`
- `migrations/002_executive_actions_schema.sql`
- `migrations/003_vector_indexes.sql`
- `migrations/004_context_views.sql`
- `migrations/005_rss_feeds_config.sql`

## 🚨 Troubleshooting

### Common Issues

**Vector search returns no results:**
- Verify embeddings are generated: `SELECT COUNT(*) FROM bills WHERE title_embedding IS NOT NULL`
- Check embedding queue: `SELECT * FROM get_embedding_queue_stats()`

**RSS feeds not processing:**
- Check feed health: `SELECT * FROM get_feed_health_status()`
- Reset errors: `SELECT reset_feed_errors()`

**Performance issues:**
- Analyze query plans: `EXPLAIN ANALYZE your_query`
- Check index usage: `SELECT * FROM analyze_vector_index_performance()`

**Permission errors:**
- Verify RLS policies are properly configured
- Check user role assignments

### Support

For issues or questions:
1. Check the test script output for validation errors
2. Review processing logs: `SELECT * FROM processing_logs ORDER BY started_at DESC LIMIT 20`
3. Monitor system health with the provided functions

## 🎯 Next Steps

After successful setup:

1. **Configure RSS Processing**: Set up automated RSS feed polling
2. **Generate Embeddings**: Process existing content through embedding pipeline
3. **Configure MCP Server**: Connect the database to your MCP server
4. **Monitor Performance**: Set up regular maintenance tasks
5. **Customize Search**: Adapt search functions for your specific use cases

The database is now ready to power semantic search and context-aware conversations about legislative content! 🏛️✨