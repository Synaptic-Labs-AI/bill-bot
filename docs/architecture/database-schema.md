# Database Schema Design

## Executive Summary

The Bill Bot database schema is designed for optimal performance with vector search operations while maintaining legislative data integrity. Built on PostgreSQL with pgvector extension, the schema supports semantic search, full-text search, and efficient filtering for Congressional bill data. The design emphasizes scalability, query performance, and data consistency for real-time legislative information retrieval.

## Database Overview

### Technology Stack
- **Database Engine**: PostgreSQL 15+
- **Vector Extension**: pgvector for embedding storage and similarity search
- **Hosting**: Supabase (managed PostgreSQL with vector support)
- **Connection**: Connection pooling via pg_bouncer
- **Backup**: Automated backups with point-in-time recovery

### Schema Design Principles
- **Vector-First**: Optimized for embedding-based similarity search
- **Multi-Content Support**: Handles bills and executive actions with unified search
- **Indexing Strategy**: Balanced between query performance and storage efficiency
- **Data Integrity**: Referential integrity with appropriate constraints
- **Scalability**: Designed to handle millions of bills, executive actions, and embeddings
- **Flexibility**: JSON metadata for extensible bill and executive action attributes

## Core Tables Schema

### Bills Table (Primary Entity)

```sql
-- Main bills table with vector embeddings
CREATE TABLE bills (
  -- Primary identifier
  id BIGSERIAL PRIMARY KEY,
  
  -- Bill identification
  bill_number VARCHAR(50) NOT NULL UNIQUE,
  congress_number INTEGER NOT NULL DEFAULT 118,
  bill_type VARCHAR(20) NOT NULL, -- 'hr', 's', 'hjres', 'sjres', etc.
  
  -- Bill content
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  
  -- Legislative metadata
  sponsor VARCHAR(255),
  cosponsors JSONB DEFAULT '[]',
  introduced_date DATE,
  last_action_date DATE,
  status VARCHAR(100) NOT NULL DEFAULT 'introduced',
  chamber VARCHAR(20) NOT NULL, -- 'house', 'senate'
  committee VARCHAR(255),
  
  -- Legislative process tracking
  actions JSONB DEFAULT '[]',
  votes JSONB DEFAULT '[]',
  amendments JSONB DEFAULT '[]',
  
  -- Source and processing metadata
  source_url TEXT,
  source_feed VARCHAR(100),
  processing_metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Vector embeddings (optimized dimensions)
  title_embedding VECTOR(384),      -- Cohere embed-english-v3.0 small
  summary_embedding VECTOR(384),    -- For summary-based search
  content_embedding VECTOR(1024),   -- Cohere embed-english-v3.0 medium (if needed)
  
  -- Full-text search support
  search_vector TSVECTOR,
  
  -- Computed fields for efficient filtering
  is_active BOOLEAN GENERATED ALWAYS AS (
    status NOT IN ('withdrawn', 'failed', 'vetoed')
  ) STORED,
  
  bill_year INTEGER GENERATED ALWAYS AS (
    EXTRACT(YEAR FROM introduced_date)
  ) STORED,
  
  -- Constraints
  CONSTRAINT valid_chamber CHECK (chamber IN ('house', 'senate')),
  CONSTRAINT valid_bill_type CHECK (bill_type IN (
    'hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'
  )),
  CONSTRAINT valid_status CHECK (status IN (
    'introduced', 'referred', 'reported', 'passed_house', 'passed_senate',
    'enrolled', 'presented', 'signed', 'vetoed', 'withdrawn', 'failed'
  ))
);
```

### Bill Topics Table (Many-to-Many Relationship)

```sql
-- Topics/categories for bills
CREATE TABLE bill_topics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for bill-topic relationships
CREATE TABLE bill_topic_assignments (
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES bill_topics(id) ON DELETE CASCADE,
  confidence_score DECIMAL(3,2) DEFAULT 1.0,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (bill_id, topic_id)
);
```

### RSS Feed Sources Table

```sql
-- RSS feed source configuration
CREATE TABLE rss_feed_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  feed_type VARCHAR(50) NOT NULL, -- 'house_bills', 'senate_bills', etc.
  chamber VARCHAR(20) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  polling_frequency INTERVAL NOT NULL DEFAULT INTERVAL '1 hour',
  last_polled_at TIMESTAMP WITH TIME ZONE,
  last_successful_poll TIMESTAMP WITH TIME ZONE,
  error_count INTEGER DEFAULT 0,
  configuration JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_feed_chamber CHECK (chamber IN ('house', 'senate', 'both'))
);
```

## Executive Actions Schema

### Executive Actions Table (Primary Entity)

```sql
-- Executive actions table with vector embeddings
CREATE TABLE executive_actions (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Executive action identification
  executive_order_number INTEGER, -- E.g., 14081
  action_type executive_action_type NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  
  -- Administrative metadata
  signed_date DATE NOT NULL,
  effective_date DATE,
  administration TEXT NOT NULL, -- e.g., "Biden", "Trump", "Obama"
  president_name TEXT NOT NULL,
  citation TEXT NOT NULL, -- e.g., "Executive Order 14081"
  status executive_action_status DEFAULT 'active',
  
  -- Content and processing
  content_url TEXT,
  pdf_url TEXT,
  html_content TEXT,
  
  -- Metadata
  agencies_affected TEXT[], -- List of federal agencies
  policy_areas TEXT[], -- Healthcare, Environment, etc.
  keywords TEXT[],
  related_legislation TEXT[], -- Related bill citations
  supersedes UUID[], -- References to previous executive actions
  superseded_by UUID, -- Reference to superseding action
  
  -- Vector embeddings
  title_embedding VECTOR(384),      -- Cohere embed-english-v3.0 small
  summary_embedding VECTOR(384),    -- For summary-based search
  content_embedding VECTOR(1024),   -- Full content embedding
  
  -- Full-text search support
  search_vector TSVECTOR,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  indexed_at TIMESTAMP WITH TIME ZONE,
  
  -- Computed fields
  action_year INTEGER GENERATED ALWAYS AS (
    EXTRACT(YEAR FROM signed_date)
  ) STORED,
  
  is_current BOOLEAN GENERATED ALWAYS AS (
    status = 'active' AND superseded_by IS NULL
  ) STORED
);

-- Executive action types enum
CREATE TYPE executive_action_type AS ENUM (
  'executive_order',
  'presidential_memorandum', 
  'proclamation',
  'presidential_directive',
  'national_security_directive'
);

-- Executive action status enum  
CREATE TYPE executive_action_status AS ENUM (
  'active',
  'revoked',
  'superseded',
  'expired',
  'amended'
);
```

### Executive Action Topics Table

```sql
-- Executive action topics/categories
CREATE TABLE executive_action_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  primary_topic TEXT NOT NULL,
  secondary_topic TEXT,
  relevance_score DECIMAL(3,2) DEFAULT 1.0,
  
  UNIQUE(executive_action_id, primary_topic, secondary_topic)
);
```

### Executive Action Agencies Table

```sql
-- Agencies affected by executive actions
CREATE TABLE executive_action_agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  agency_name TEXT NOT NULL,
  agency_code TEXT, -- e.g., "EPA", "DOD", "HHS"
  implementation_role TEXT, -- "primary", "supporting", "advisory"
  
  UNIQUE(executive_action_id, agency_name)
);
```

### Cross-References Table

```sql
-- Cross-references between executive actions and bills
CREATE TABLE executive_action_bill_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- "implements", "modifies", "relates_to"
  description TEXT,
  
  UNIQUE(executive_action_id, bill_id, relationship_type)
);
```

### Processing Logs Table

```sql
-- Track RSS processing and embedding generation for all content types
CREATE TABLE processing_logs (
  id BIGSERIAL PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL, -- 'rss_poll', 'embedding_generation', etc.
  source_id INTEGER REFERENCES rss_feed_sources(id),
  bill_id BIGINT REFERENCES bills(id),
  executive_action_id UUID REFERENCES executive_actions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  processing_stats JSONB DEFAULT '{}',
  
  CONSTRAINT valid_processing_status CHECK (
    status IN ('started', 'completed', 'failed', 'retrying')
  ),
  CONSTRAINT valid_content_reference CHECK (
    (bill_id IS NOT NULL AND executive_action_id IS NULL) OR
    (bill_id IS NULL AND executive_action_id IS NOT NULL) OR
    (bill_id IS NULL AND executive_action_id IS NULL)
  )
);
```

## Indexing Strategy

### Vector Indexes (Performance Critical)

```sql
-- Primary vector similarity indexes using IVFFlat
-- Optimized for Cohere embed-english-v3.0 embeddings

-- Title embeddings index (most frequently used)
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Summary embeddings index
CREATE INDEX bills_summary_embedding_idx ON bills 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Content embeddings index (larger vectors, fewer lists)
CREATE INDEX bills_content_embedding_idx ON bills 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 50);

-- For exact similarity search (when needed)
CREATE INDEX bills_title_embedding_exact_idx ON bills 
USING ivfflat (title_embedding vector_l2_ops) 
WITH (lists = 100);

-- Executive Actions Vector Indexes
CREATE INDEX executive_actions_title_embedding_idx ON executive_actions 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_summary_embedding_idx ON executive_actions 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_content_embedding_idx ON executive_actions 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 25);
```

### Full-Text Search Indexes

```sql
-- Bills full-text search indexes
CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);
CREATE INDEX bills_title_text_idx ON bills USING GIN(to_tsvector('english', title));
CREATE INDEX bills_summary_text_idx ON bills USING GIN(to_tsvector('english', summary));

-- Executive Actions full-text search indexes
CREATE INDEX executive_actions_search_vector_idx ON executive_actions USING GIN(search_vector);
CREATE INDEX executive_actions_title_text_idx ON executive_actions USING GIN(to_tsvector('english', title));
CREATE INDEX executive_actions_summary_text_idx ON executive_actions USING GIN(to_tsvector('english', summary));
```

### Standard B-tree Indexes

```sql
-- Filtering and sorting indexes
CREATE INDEX bills_bill_number_idx ON bills (bill_number);
CREATE INDEX bills_chamber_status_idx ON bills (chamber, status);
CREATE INDEX bills_introduced_date_idx ON bills (introduced_date DESC);
CREATE INDEX bills_sponsor_idx ON bills (sponsor);
CREATE INDEX bills_committee_idx ON bills (committee);
CREATE INDEX bills_congress_number_idx ON bills (congress_number);
CREATE INDEX bills_bill_year_idx ON bills (bill_year);
CREATE INDEX bills_is_active_idx ON bills (is_active) WHERE is_active = true;

-- Composite indexes for common query patterns
CREATE INDEX bills_chamber_date_status_idx ON bills (chamber, introduced_date DESC, status);
CREATE INDEX bills_status_date_idx ON bills (status, introduced_date DESC);
CREATE INDEX bills_active_bills_idx ON bills (is_active, introduced_date DESC) 
WHERE is_active = true;

-- Executive Actions indexes
CREATE INDEX executive_actions_number_idx ON executive_actions (executive_order_number);
CREATE INDEX executive_actions_type_idx ON executive_actions (action_type);
CREATE INDEX executive_actions_administration_idx ON executive_actions (administration);
CREATE INDEX executive_actions_signed_date_idx ON executive_actions (signed_date DESC);
CREATE INDEX executive_actions_status_idx ON executive_actions (status);
CREATE INDEX executive_actions_president_idx ON executive_actions (president_name);

-- Executive Actions composite indexes
CREATE INDEX executive_actions_admin_type_idx ON executive_actions (administration, action_type);
CREATE INDEX executive_actions_date_status_idx ON executive_actions (signed_date DESC, status);
CREATE INDEX executive_actions_current_idx ON executive_actions (is_current, signed_date DESC) 
WHERE is_current = true;

-- Executive Action related table indexes
CREATE INDEX executive_action_topics_primary_idx ON executive_action_topics (primary_topic);
CREATE INDEX executive_action_agencies_name_idx ON executive_action_agencies (agency_name);
CREATE INDEX executive_action_agencies_code_idx ON executive_action_agencies (agency_code);
```

### JSONB Indexes

```sql
-- JSONB indexes for metadata queries
CREATE INDEX bills_actions_gin_idx ON bills USING GIN(actions);
CREATE INDEX bills_cosponsors_gin_idx ON bills USING GIN(cosponsors);
CREATE INDEX bills_processing_metadata_gin_idx ON bills USING GIN(processing_metadata);

-- Specific JSONB path indexes for common queries
CREATE INDEX bills_action_dates_idx ON bills USING GIN((actions -> 'date'));
CREATE INDEX bills_sponsor_party_idx ON bills USING GIN((processing_metadata -> 'sponsor_party'));
```

## Database Functions

### Vector Search Functions

```sql
-- Semantic search with filtering and ranking
CREATE OR REPLACE FUNCTION search_bills_semantic(
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_chamber TEXT DEFAULT NULL,
  filter_status TEXT[] DEFAULT NULL,
  filter_congress INTEGER DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  active_only BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id BIGINT,
  bill_number VARCHAR(50),
  title TEXT,
  summary TEXT,
  sponsor VARCHAR(255),
  chamber VARCHAR(20),
  status VARCHAR(100),
  introduced_date DATE,
  similarity FLOAT,
  rank INTEGER
)
LANGUAGE SQL STABLE
AS $$
  WITH ranked_results AS (
    SELECT 
      b.id,
      b.bill_number,
      b.title,
      b.summary,
      b.sponsor,
      b.chamber,
      b.status,
      b.introduced_date,
      1 - (b.title_embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (ORDER BY (b.title_embedding <=> query_embedding)) AS rank
    FROM bills b
    WHERE 
      1 - (b.title_embedding <=> query_embedding) > match_threshold
      AND (filter_chamber IS NULL OR b.chamber = filter_chamber)
      AND (filter_status IS NULL OR b.status = ANY(filter_status))
      AND (filter_congress IS NULL OR b.congress_number = filter_congress)
      AND (date_from IS NULL OR b.introduced_date >= date_from)
      AND (date_to IS NULL OR b.introduced_date <= date_to)
      AND (active_only = false OR b.is_active = true)
      AND b.title_embedding IS NOT NULL
    ORDER BY (b.title_embedding <=> query_embedding) ASC
    LIMIT match_count
  )
  SELECT * FROM ranked_results;
$$;
```

### Hybrid Search Function

```sql
-- Combine semantic and keyword search with weighted scoring
CREATE OR REPLACE FUNCTION search_bills_hybrid(
  query_text TEXT,
  query_embedding VECTOR(384),
  semantic_weight FLOAT DEFAULT 0.7,
  keyword_weight FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10,
  filter_chamber TEXT DEFAULT NULL,
  active_only BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id BIGINT,
  bill_number VARCHAR(50),
  title TEXT,
  summary TEXT,
  combined_score FLOAT,
  semantic_score FLOAT,
  keyword_score FLOAT,
  rank INTEGER
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
    WHERE 
      title_embedding IS NOT NULL
      AND (filter_chamber IS NULL OR chamber = filter_chamber)
      AND (active_only = false OR is_active = true)
  ),
  keyword_search AS (
    SELECT 
      id,
      ts_rank(search_vector, plainto_tsquery('english', query_text)) AS keyword_score
    FROM bills
    WHERE 
      search_vector @@ plainto_tsquery('english', query_text)
      AND (filter_chamber IS NULL OR chamber = filter_chamber)
      AND (active_only = false OR is_active = true)
  ),
  combined_search AS (
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
    WHERE s.semantic_score > 0.5 OR k.keyword_score > 0.1
  )
  SELECT 
    *,
    ROW_NUMBER() OVER (ORDER BY combined_score DESC) AS rank
  FROM combined_search
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;
```

### Maintenance Functions

```sql
-- Update search vectors automatically
CREATE OR REPLACE FUNCTION update_bill_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', NEW.title), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sponsor, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.committee, '')), 'D');
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic search vector updates
CREATE TRIGGER update_bills_search_vector
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_search_vector();
```

### Analytics Functions

```sql
-- Bill statistics by chamber and status
CREATE OR REPLACE FUNCTION get_bill_statistics(
  congress_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  chamber VARCHAR(20),
  status VARCHAR(100),
  count BIGINT,
  percentage DECIMAL(5,2)
)
LANGUAGE SQL STABLE
AS $$
  WITH bill_counts AS (
    SELECT 
      b.chamber,
      b.status,
      COUNT(*) as count
    FROM bills b
    WHERE (congress_number IS NULL OR b.congress_number = congress_number)
    GROUP BY b.chamber, b.status
  ),
  total_counts AS (
    SELECT 
      chamber,
      SUM(count) as total
    FROM bill_counts
    GROUP BY chamber
  )
  SELECT 
    bc.chamber,
    bc.status,
    bc.count,
    ROUND((bc.count::DECIMAL / tc.total) * 100, 2) as percentage
  FROM bill_counts bc
  JOIN total_counts tc ON bc.chamber = tc.chamber
  ORDER BY bc.chamber, bc.count DESC;
$$;
```

## Data Migration Scripts

### Initial Schema Migration

```sql
-- Migration 001: Create initial schema
BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create main tables
-- (Bills table creation from above)
-- (Supporting tables creation from above)

-- Create indexes
-- (All index creation from above)

-- Create functions
-- (All function creation from above)

-- Create triggers
-- (All trigger creation from above)

-- Insert initial data
INSERT INTO bill_topics (name, category, description) VALUES
('Healthcare', 'health', 'Bills related to healthcare policy and medical services'),
('Environment', 'environment', 'Environmental protection and climate change legislation'),
('Education', 'education', 'Educational policy and funding bills'),
('Defense', 'defense', 'Military and national security legislation'),
('Economy', 'economy', 'Economic policy and financial regulation'),
('Immigration', 'immigration', 'Immigration and border security bills'),
('Infrastructure', 'infrastructure', 'Transportation and infrastructure development'),
('Technology', 'technology', 'Technology policy and digital rights legislation');

COMMIT;
```

### Index Optimization Migration

```sql
-- Migration 002: Optimize vector indexes
BEGIN;

-- Analyze table statistics for optimal index parameters
ANALYZE bills;

-- Calculate optimal lists parameter based on data size
DO $$
DECLARE
    bill_count BIGINT;
    optimal_lists INTEGER;
BEGIN
    SELECT COUNT(*) INTO bill_count FROM bills;
    
    -- Optimal lists = SQRT(row_count), minimum 10, maximum 1000
    optimal_lists := GREATEST(10, LEAST(1000, SQRT(bill_count)::INTEGER));
    
    -- Recreate vector indexes with optimal parameters
    DROP INDEX IF EXISTS bills_title_embedding_idx;
    EXECUTE format('CREATE INDEX bills_title_embedding_idx ON bills 
                   USING ivfflat (title_embedding vector_cosine_ops) 
                   WITH (lists = %s)', optimal_lists);
    
    DROP INDEX IF EXISTS bills_summary_embedding_idx;
    EXECUTE format('CREATE INDEX bills_summary_embedding_idx ON bills 
                   USING ivfflat (summary_embedding vector_cosine_ops) 
                   WITH (lists = %s)', optimal_lists);
                   
    RAISE NOTICE 'Optimized vector indexes with % lists for % bills', optimal_lists, bill_count;
END $$;

COMMIT;
```

## Performance Monitoring

### Query Performance Views

```sql
-- View for monitoring vector search performance
CREATE VIEW vector_search_performance AS
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan > 0 THEN ROUND(idx_tup_read::DECIMAL / idx_scan, 2)
    ELSE 0
  END as avg_tuples_per_scan
FROM pg_stat_user_indexes 
WHERE indexname LIKE '%embedding%'
ORDER BY idx_scan DESC;
```

### Storage Usage View

```sql
-- Monitor table and index storage usage
CREATE VIEW storage_usage AS
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                 pg_relation_size(schemaname||'.'||tablename)) as index_size,
  (SELECT COUNT(*) FROM bills) as row_count
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'bills'
UNION ALL
SELECT 
  'indexes' as schemaname,
  indexname as tablename,
  pg_size_pretty(pg_relation_size(indexname)) as total_size,
  '-' as table_size,
  pg_size_pretty(pg_relation_size(indexname)) as index_size,
  NULL as row_count
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'bills'
ORDER BY tablename;
```

## Backup and Recovery

### Backup Strategy

```sql
-- Automated backup configuration
-- Point-in-time recovery enabled through Supabase
-- Daily full backups with 30-day retention
-- Continuous WAL archiving for minimal data loss

-- Manual backup for development
-- pg_dump with custom format for efficient restore
CREATE OR REPLACE FUNCTION create_bills_backup()
RETURNS TEXT AS $$
DECLARE
  backup_filename TEXT;
BEGIN
  backup_filename := 'bills_backup_' || to_char(NOW(), 'YYYY_MM_DD_HH24_MI_SS') || '.dump';
  
  -- This would be executed via pg_dump externally
  -- pg_dump -Fc -t bills -t bill_topics -t bill_topic_assignments -f backup_filename
  
  RETURN backup_filename;
END;
$$ LANGUAGE plpgsql;
```

## Data Retention Policy

```sql
-- Archive old bills and clean up processing logs
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS VOID AS $$
BEGIN
  -- Archive bills older than 10 years
  -- (Implementation would move to archive table)
  
  -- Clean up old processing logs (keep 90 days)
  DELETE FROM processing_logs 
  WHERE started_at < NOW() - INTERVAL '90 days';
  
  -- Clean up failed RSS polling logs (keep 30 days)
  DELETE FROM processing_logs 
  WHERE status = 'failed' 
    AND operation_type = 'rss_poll'
    AND started_at < NOW() - INTERVAL '30 days';
    
  -- Vacuum and analyze after cleanup
  VACUUM ANALYZE;
END;
$$ LANGUAGE plpgsql;
```

This database schema provides a robust foundation for Bill Bot's legislative data management with optimized vector search capabilities, comprehensive indexing, and proper data integrity constraints. The design supports both the current requirements and future scalability needs.