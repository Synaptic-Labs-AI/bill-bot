-- =====================================================================
-- COMPREHENSIVE SEARCH FUNCTIONS FOR BILL BOT
-- =====================================================================
-- This script contains all search functions including:
-- - Semantic search functions
-- - Hybrid search functions  
-- - Context discovery functions
-- - Citation generation functions
-- =====================================================================

BEGIN;

-- =====================================================================
-- SEARCH VECTOR UPDATE TRIGGERS
-- =====================================================================

-- Function to update search vectors automatically for bills
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

-- Function to update executive action search vectors
CREATE OR REPLACE FUNCTION update_executive_action_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', NEW.title), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.president_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.agencies_affected, ' '), '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.policy_areas, ' '), '')), 'D');
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic search vector updates
CREATE TRIGGER update_bills_search_vector
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_search_vector();

CREATE TRIGGER update_executive_actions_search_vector
  BEFORE INSERT OR UPDATE ON executive_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_executive_action_search_vector();

-- =====================================================================
-- SEMANTIC SEARCH FUNCTIONS
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

-- =====================================================================
-- HYBRID SEARCH FUNCTIONS
-- =====================================================================

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

-- Advanced hybrid search with multiple strategies and ranking
CREATE OR REPLACE FUNCTION search_content_hybrid(
  query_text TEXT,
  query_embedding VECTOR(1024),
  search_options JSONB DEFAULT '{}'
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  metadata JSONB,
  relevance_score FLOAT,
  semantic_score FLOAT,
  keyword_score FLOAT,
  freshness_score FLOAT,
  authority_score FLOAT,
  final_rank INTEGER
)
LANGUAGE SQL STABLE
AS $$
  WITH search_config AS (
    SELECT 
      COALESCE((search_options->>'semantic_weight')::FLOAT, 0.4) as semantic_weight,
      COALESCE((search_options->>'keyword_weight')::FLOAT, 0.3) as keyword_weight,
      COALESCE((search_options->>'freshness_weight')::FLOAT, 0.2) as freshness_weight,
      COALESCE((search_options->>'authority_weight')::FLOAT, 0.1) as authority_weight,
      COALESCE((search_options->>'limit')::INT, 20) as result_limit,
      COALESCE((search_options->>'semantic_threshold')::FLOAT, 0.6) as semantic_threshold,
      COALESCE((search_options->>'keyword_threshold')::FLOAT, 0.1) as keyword_threshold,
      COALESCE(search_options->>'include_bills', 'true'::TEXT)::BOOLEAN as include_bills,
      COALESCE(search_options->>'include_executive_actions', 'true'::TEXT)::BOOLEAN as include_executive_actions,
      COALESCE(search_options->>'active_only', 'true'::TEXT)::BOOLEAN as active_only
  ),
  
  -- Bills search results
  bill_results AS (
    SELECT 
      'bill'::TEXT as content_type,
      b.id::TEXT as content_id,
      b.title,
      b.summary,
      jsonb_build_object(
        'bill_number', b.bill_number,
        'sponsor', b.sponsor,
        'chamber', b.chamber,
        'status', b.status,
        'introduced_date', b.introduced_date,
        'congress_number', b.congress_number,
        'committee', b.committee
      ) as metadata,
      
      -- Semantic similarity score
      GREATEST(0, 1 - (b.title_embedding <=> query_embedding)) as semantic_score,
      
      -- Keyword relevance score
      GREATEST(0, ts_rank_cd(b.search_vector, plainto_tsquery('english', query_text))) as keyword_score,
      
      -- Freshness score (newer bills score higher)
      CASE 
        WHEN b.introduced_date IS NULL THEN 0
        ELSE GREATEST(0, 1 - (EXTRACT(DAYS FROM (NOW() - b.introduced_date::TIMESTAMP)) / 365.0 / 5))
      END as freshness_score,
      
      -- Authority score (based on sponsor activity and bill progress)
      CASE 
        WHEN b.status IN ('signed', 'enrolled') THEN 1.0
        WHEN b.status IN ('passed_house', 'passed_senate') THEN 0.8
        WHEN b.status = 'reported' THEN 0.6
        WHEN b.status = 'referred' THEN 0.4
        WHEN b.status = 'introduced' THEN 0.2
        ELSE 0.1
      END as authority_score
      
    FROM bills b, search_config sc
    WHERE 
      sc.include_bills = true
      AND b.title_embedding IS NOT NULL
      AND (sc.active_only = false OR b.is_active = true)
      AND (
        (1 - (b.title_embedding <=> query_embedding)) >= sc.semantic_threshold
        OR ts_rank_cd(b.search_vector, plainto_tsquery('english', query_text)) >= sc.keyword_threshold
      )
  ),
  
  -- Executive actions search results
  executive_action_results AS (
    SELECT 
      'executive_action'::TEXT as content_type,
      ea.id::TEXT as content_id,
      ea.title,
      ea.summary,
      jsonb_build_object(
        'executive_order_number', ea.executive_order_number,
        'action_type', ea.action_type,
        'administration', ea.administration,
        'president_name', ea.president_name,
        'signed_date', ea.signed_date,
        'status', ea.status,
        'citation', ea.citation
      ) as metadata,
      
      -- Semantic similarity score
      GREATEST(0, 1 - (ea.title_embedding <=> query_embedding)) as semantic_score,
      
      -- Keyword relevance score
      GREATEST(0, ts_rank_cd(ea.search_vector, plainto_tsquery('english', query_text))) as keyword_score,
      
      -- Freshness score (newer actions score higher)
      CASE 
        WHEN ea.signed_date IS NULL THEN 0
        ELSE GREATEST(0, 1 - (EXTRACT(DAYS FROM (NOW() - ea.signed_date::TIMESTAMP)) / 365.0 / 5))
      END as freshness_score,
      
      -- Authority score (based on action type and status)
      CASE 
        WHEN ea.action_type = 'executive_order' THEN 1.0
        WHEN ea.action_type = 'presidential_memorandum' THEN 0.8
        WHEN ea.action_type = 'presidential_directive' THEN 0.9
        WHEN ea.action_type = 'proclamation' THEN 0.6
        ELSE 0.7
      END * CASE 
        WHEN ea.status = 'active' THEN 1.0
        WHEN ea.status = 'amended' THEN 0.8
        WHEN ea.status = 'superseded' THEN 0.3
        WHEN ea.status = 'revoked' THEN 0.1
        ELSE 0.5
      END as authority_score
      
    FROM executive_actions ea, search_config sc
    WHERE 
      sc.include_executive_actions = true
      AND ea.title_embedding IS NOT NULL
      AND (sc.active_only = false OR ea.is_current = true)
      AND (
        (1 - (ea.title_embedding <=> query_embedding)) >= sc.semantic_threshold
        OR ts_rank_cd(ea.search_vector, plainto_tsquery('english', query_text)) >= sc.keyword_threshold
      )
  ),
  
  -- Combined results with weighted scoring
  combined_results AS (
    SELECT 
      *,
      (
        semantic_score * (SELECT semantic_weight FROM search_config) +
        keyword_score * (SELECT keyword_weight FROM search_config) +
        freshness_score * (SELECT freshness_weight FROM search_config) +
        authority_score * (SELECT authority_weight FROM search_config)
      ) as relevance_score
    FROM (
      SELECT * FROM bill_results
      UNION ALL
      SELECT * FROM executive_action_results
    ) all_results
  )
  
  SELECT 
    cr.*,
    ROW_NUMBER() OVER (ORDER BY cr.relevance_score DESC, cr.semantic_score DESC) as final_rank
  FROM combined_results cr, search_config sc
  WHERE cr.relevance_score > 0
  ORDER BY cr.relevance_score DESC, cr.semantic_score DESC
  LIMIT (SELECT result_limit FROM search_config);
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

COMMIT;