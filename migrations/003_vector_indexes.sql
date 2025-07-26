-- =====================================================================
-- Migration 003: Vector Indexes for Semantic Search
-- Description: Create optimized pgvector indexes for semantic search
-- Dependencies: Requires 001_initial_bills_schema.sql, 002_executive_actions_schema.sql
-- =====================================================================

BEGIN;

-- =====================================================================
-- BILLS VECTOR INDEXES
-- =====================================================================

-- Primary vector similarity indexes using IVFFlat
-- Optimized for Cohere embed-english-v3.0 embeddings (1024 dimensions)

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

-- Full-text search indexes for bills
CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);
CREATE INDEX bills_title_text_idx ON bills USING GIN(to_tsvector('english', title));
CREATE INDEX bills_summary_text_idx ON bills USING GIN(to_tsvector('english', summary));

-- =====================================================================
-- EXECUTIVE ACTIONS VECTOR INDEXES
-- =====================================================================

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

-- Full-text search indexes for executive actions
CREATE INDEX executive_actions_search_vector_idx ON executive_actions USING GIN(search_vector);
CREATE INDEX executive_actions_title_text_idx ON executive_actions USING GIN(to_tsvector('english', title));
CREATE INDEX executive_actions_summary_text_idx ON executive_actions USING GIN(to_tsvector('english', summary));

-- =====================================================================
-- VECTOR SEARCH FUNCTIONS
-- =====================================================================

-- Semantic search for bills with filtering and ranking
CREATE OR REPLACE FUNCTION search_bills_semantic(
  query_embedding VECTOR(1024),
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

-- Semantic search for executive actions
CREATE OR REPLACE FUNCTION search_executive_actions_semantic(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_action_type executive_action_type DEFAULT NULL,
  filter_administration TEXT DEFAULT NULL,
  filter_status executive_action_status DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  current_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  executive_order_number INTEGER,
  action_type executive_action_type,
  title TEXT,
  summary TEXT,
  administration TEXT,
  president_name TEXT,
  signed_date DATE,
  status executive_action_status,
  similarity FLOAT,
  rank INTEGER
)
LANGUAGE SQL STABLE
AS $$
  WITH ranked_results AS (
    SELECT 
      ea.id,
      ea.executive_order_number,
      ea.action_type,
      ea.title,
      ea.summary,
      ea.administration,
      ea.president_name,
      ea.signed_date,
      ea.status,
      1 - (ea.title_embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (ORDER BY (ea.title_embedding <=> query_embedding)) AS rank
    FROM executive_actions ea
    WHERE 
      1 - (ea.title_embedding <=> query_embedding) > match_threshold
      AND (filter_action_type IS NULL OR ea.action_type = filter_action_type)
      AND (filter_administration IS NULL OR ea.administration = filter_administration)
      AND (filter_status IS NULL OR ea.status = filter_status)
      AND (date_from IS NULL OR ea.signed_date >= date_from)
      AND (date_to IS NULL OR ea.signed_date <= date_to)
      AND (current_only = false OR ea.is_current = true)
      AND ea.title_embedding IS NOT NULL
    ORDER BY (ea.title_embedding <=> query_embedding) ASC
    LIMIT match_count
  )
  SELECT * FROM ranked_results;
$$;

-- Hybrid search combining semantic and keyword search for bills
CREATE OR REPLACE FUNCTION search_bills_hybrid(
  query_text TEXT,
  query_embedding VECTOR(1024),
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

-- Hybrid search for executive actions
CREATE OR REPLACE FUNCTION search_executive_actions_hybrid(
  query_text TEXT,
  query_embedding VECTOR(1024),
  semantic_weight FLOAT DEFAULT 0.7,
  keyword_weight FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10,
  filter_administration TEXT DEFAULT NULL,
  current_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  executive_order_number INTEGER,
  title TEXT,
  summary TEXT,
  administration TEXT,
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
      executive_order_number,
      title,
      summary,
      administration,
      1 - (title_embedding <=> query_embedding) AS semantic_score
    FROM executive_actions
    WHERE 
      title_embedding IS NOT NULL
      AND (filter_administration IS NULL OR administration = filter_administration)
      AND (current_only = false OR is_current = true)
  ),
  keyword_search AS (
    SELECT 
      id,
      ts_rank(search_vector, plainto_tsquery('english', query_text)) AS keyword_score
    FROM executive_actions
    WHERE 
      search_vector @@ plainto_tsquery('english', query_text)
      AND (filter_administration IS NULL OR administration = filter_administration)
      AND (current_only = false OR is_current = true)
  ),
  combined_search AS (
    SELECT 
      s.id,
      s.executive_order_number,
      s.title,
      s.summary,
      s.administration,
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

-- Unified search across both bills and executive actions
CREATE OR REPLACE FUNCTION search_all_content(
  query_text TEXT,
  query_embedding VECTOR(1024),
  match_count INT DEFAULT 20,
  bills_weight FLOAT DEFAULT 0.6,
  actions_weight FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  relevance_score FLOAT,
  metadata JSONB,
  rank INTEGER
)
LANGUAGE SQL STABLE
AS $$
  WITH bill_results AS (
    SELECT 
      'bill'::TEXT as content_type,
      b.id::TEXT as content_id,
      b.title,
      b.summary,
      (1 - (b.title_embedding <=> query_embedding)) * bills_weight as relevance_score,
      jsonb_build_object(
        'bill_number', b.bill_number,
        'sponsor', b.sponsor,
        'chamber', b.chamber,
        'status', b.status,
        'introduced_date', b.introduced_date
      ) as metadata
    FROM bills b
    WHERE 
      b.title_embedding IS NOT NULL
      AND b.is_active = true
      AND (1 - (b.title_embedding <=> query_embedding)) > 0.6
  ),
  action_results AS (
    SELECT 
      'executive_action'::TEXT as content_type,
      ea.id::TEXT as content_id,
      ea.title,
      ea.summary,
      (1 - (ea.title_embedding <=> query_embedding)) * actions_weight as relevance_score,
      jsonb_build_object(
        'executive_order_number', ea.executive_order_number,
        'action_type', ea.action_type,
        'administration', ea.administration,
        'president_name', ea.president_name,
        'signed_date', ea.signed_date,
        'status', ea.status
      ) as metadata
    FROM executive_actions ea
    WHERE 
      ea.title_embedding IS NOT NULL
      AND ea.is_current = true
      AND (1 - (ea.title_embedding <=> query_embedding)) > 0.6
  ),
  combined_results AS (
    SELECT * FROM bill_results
    UNION ALL
    SELECT * FROM action_results
  )
  SELECT 
    *,
    ROW_NUMBER() OVER (ORDER BY relevance_score DESC) AS rank
  FROM combined_results
  ORDER BY relevance_score DESC
  LIMIT match_count;
$$;

-- =====================================================================
-- INDEX OPTIMIZATION FUNCTIONS
-- =====================================================================

-- Function to analyze vector index performance
CREATE OR REPLACE FUNCTION analyze_vector_index_performance()
RETURNS TABLE (
  table_name TEXT,
  index_name TEXT,
  index_scans BIGINT,
  tuples_read BIGINT,
  tuples_fetched BIGINT,
  avg_tuples_per_scan DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||tablename::TEXT as table_name,
    indexname::TEXT as index_name,
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
END;
$$ LANGUAGE plpgsql;

-- Function to get optimal lists parameter for vector indexes
CREATE OR REPLACE FUNCTION get_optimal_lists_parameter(
  p_table_name TEXT,
  p_vector_column TEXT
)
RETURNS INTEGER AS $$
DECLARE
  row_count BIGINT;
  optimal_lists INTEGER;
BEGIN
  -- Get row count for the table
  EXECUTE format('SELECT COUNT(*) FROM %I', p_table_name) INTO row_count;
  
  -- Calculate optimal lists = SQRT(row_count), minimum 10, maximum 1000
  optimal_lists := GREATEST(10, LEAST(1000, SQRT(row_count)::INTEGER));
  
  RETURN optimal_lists;
END;
$$ LANGUAGE plpgsql;

-- Function to recreate vector index with optimal parameters
CREATE OR REPLACE FUNCTION recreate_vector_index(
  p_table_name TEXT,
  p_vector_column TEXT,
  p_index_name TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  optimal_lists INTEGER;
  index_name TEXT;
  result_message TEXT;
BEGIN
  -- Calculate optimal parameters
  optimal_lists := get_optimal_lists_parameter(p_table_name, p_vector_column);
  
  -- Generate index name if not provided
  IF p_index_name IS NULL THEN
    index_name := p_table_name || '_' || p_vector_column || '_idx';
  ELSE
    index_name := p_index_name;
  END IF;
  
  -- Drop existing index
  EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
  
  -- Create new index with optimal parameters
  EXECUTE format(
    'CREATE INDEX %I ON %I USING ivfflat (%I vector_cosine_ops) WITH (lists = %s)',
    index_name, p_table_name, p_vector_column, optimal_lists
  );
  
  result_message := format(
    'Recreated index %s with %s lists for %s rows',
    index_name, optimal_lists, 
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = p_table_name)
  );
  
  RETURN result_message;
END;
$$ LANGUAGE plpgsql;

COMMIT;