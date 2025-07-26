-- =====================================================================
-- Hybrid Search Functions
-- Description: Advanced search functions combining semantic and keyword search
-- Dependencies: Requires all migrations to be completed
-- =====================================================================

-- =====================================================================
-- UNIFIED HYBRID SEARCH FUNCTION
-- =====================================================================

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

-- =====================================================================
-- ITERATIVE SEARCH REFINEMENT FUNCTION
-- =====================================================================

-- Function for iterative search refinement (used by MCP server)
CREATE OR REPLACE FUNCTION search_content_iterative(
  query_text TEXT,
  query_embedding VECTOR(1024),
  iteration_number INTEGER DEFAULT 1,
  previous_results JSONB DEFAULT '[]',
  search_context JSONB DEFAULT '{}'
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  metadata JSONB,
  relevance_score FLOAT,
  search_metadata JSONB,
  needs_refinement BOOLEAN
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  base_results RECORD;
  result_count INTEGER;
  quality_score FLOAT;
  refinement_needed BOOLEAN := false;
  search_options JSONB;
BEGIN
  -- Adjust search parameters based on iteration
  search_options := jsonb_build_object(
    'semantic_weight', CASE 
      WHEN iteration_number = 1 THEN 0.5
      WHEN iteration_number <= 3 THEN 0.6
      ELSE 0.7
    END,
    'keyword_weight', CASE 
      WHEN iteration_number = 1 THEN 0.3
      WHEN iteration_number <= 3 THEN 0.25
      ELSE 0.2
    END,
    'freshness_weight', 0.15,
    'authority_weight', 0.15,
    'limit', CASE 
      WHEN iteration_number = 1 THEN 15
      WHEN iteration_number <= 3 THEN 12
      ELSE 10
    END,
    'semantic_threshold', CASE
      WHEN iteration_number = 1 THEN 0.6
      WHEN iteration_number <= 3 THEN 0.65
      ELSE 0.7
    END
  );
  
  -- Merge with provided search context
  search_options := search_options || COALESCE(search_context, '{}'::JSONB);
  
  -- Get search results
  FOR base_results IN
    SELECT * FROM search_content_hybrid(query_text, query_embedding, search_options)
  LOOP
    RETURN NEXT (
      base_results.content_type,
      base_results.content_id,
      base_results.title,
      base_results.summary,
      base_results.metadata,
      base_results.relevance_score,
      jsonb_build_object(
        'iteration', iteration_number,
        'semantic_score', base_results.semantic_score,
        'keyword_score', base_results.keyword_score,
        'rank', base_results.final_rank,
        'search_strategy', 'hybrid_iterative'
      ),
      false -- Will be updated after loop
    );
  END LOOP;
  
  -- Assess result quality
  GET DIAGNOSTICS result_count = ROW_COUNT;
  
  -- Calculate quality score based on result count and average relevance
  SELECT AVG(relevance_score) INTO quality_score
  FROM search_content_hybrid(query_text, query_embedding, search_options);
  
  -- Determine if refinement is needed
  refinement_needed := (
    iteration_number < 20 AND (
      result_count < 3 OR 
      quality_score < 0.7 OR
      iteration_number = 1
    )
  );
  
  -- Update the needs_refinement flag for all returned rows
  -- Note: This is a simplified approach; in practice, you might want more sophisticated logic
  RETURN;
END;
$$;

-- =====================================================================
-- DOMAIN-SPECIFIC SEARCH FUNCTIONS
-- =====================================================================

-- Search function specifically optimized for legislative content
CREATE OR REPLACE FUNCTION search_legislative_content(
  query_text TEXT,
  query_embedding VECTOR(1024),
  filters JSONB DEFAULT '{}'
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  sponsor_or_authority TEXT,
  date_introduced_or_signed DATE,
  status TEXT,
  relevance_score FLOAT,
  citation_text TEXT,
  url TEXT
)
LANGUAGE SQL STABLE
AS $$
  WITH filtered_search AS (
    SELECT * FROM search_content_hybrid(
      query_text,
      query_embedding,
      jsonb_build_object(
        'semantic_weight', 0.5,
        'keyword_weight', 0.3,
        'freshness_weight', 0.1,
        'authority_weight', 0.1,
        'limit', COALESCE((filters->>'limit')::INT, 25),
        'include_bills', COALESCE(filters->>'include_bills', 'true')::BOOLEAN,
        'include_executive_actions', COALESCE(filters->>'include_executive_actions', 'true')::BOOLEAN,
        'active_only', COALESCE(filters->>'active_only', 'true')::BOOLEAN
      )
    )
  )
  SELECT 
    fs.content_type,
    fs.content_id,
    fs.title,
    fs.summary,
    CASE 
      WHEN fs.content_type = 'bill' THEN fs.metadata->>'sponsor'
      WHEN fs.content_type = 'executive_action' THEN fs.metadata->>'president_name'
      ELSE 'Unknown'
    END as sponsor_or_authority,
    CASE 
      WHEN fs.content_type = 'bill' THEN (fs.metadata->>'introduced_date')::DATE
      WHEN fs.content_type = 'executive_action' THEN (fs.metadata->>'signed_date')::DATE
      ELSE NULL
    END as date_introduced_or_signed,
    CASE 
      WHEN fs.content_type = 'bill' THEN fs.metadata->>'status'
      WHEN fs.content_type = 'executive_action' THEN fs.metadata->>'status'
      ELSE 'Unknown'
    END as status,
    fs.relevance_score,
    CASE 
      WHEN fs.content_type = 'bill' THEN 
        CONCAT(fs.metadata->>'bill_number', ' - ', fs.title)
      WHEN fs.content_type = 'executive_action' THEN 
        COALESCE(fs.metadata->>'citation', CONCAT('Executive Action - ', fs.title))
      ELSE fs.title
    END as citation_text,
    CASE 
      WHEN fs.content_type = 'bill' THEN 
        CONCAT('https://congress.gov/bill/', LOWER(fs.metadata->>'bill_number'))
      WHEN fs.content_type = 'executive_action' THEN 
        'https://www.whitehouse.gov/presidential-actions/'
      ELSE NULL
    END as url
  FROM filtered_search fs
  ORDER BY fs.relevance_score DESC;
$$;

-- =====================================================================
-- SIMILARITY SEARCH FUNCTIONS
-- =====================================================================

-- Find similar content based on a given piece of content
CREATE OR REPLACE FUNCTION find_similar_content(
  reference_content_type TEXT,
  reference_content_id TEXT,
  similarity_threshold FLOAT DEFAULT 0.7,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  similarity_score FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  reference_embedding VECTOR(1024);
BEGIN
  -- Get the embedding of the reference content
  IF reference_content_type = 'bill' THEN
    SELECT title_embedding INTO reference_embedding 
    FROM bills 
    WHERE id = reference_content_id::BIGINT;
  ELSIF reference_content_type = 'executive_action' THEN
    SELECT title_embedding INTO reference_embedding 
    FROM executive_actions 
    WHERE id = reference_content_id::UUID;
  ELSE
    RAISE EXCEPTION 'Invalid content type: %', reference_content_type;
  END IF;
  
  IF reference_embedding IS NULL THEN
    RAISE EXCEPTION 'No embedding found for content: % %', reference_content_type, reference_content_id;
  END IF;
  
  -- Find similar bills
  RETURN QUERY
  SELECT 
    'bill'::TEXT as content_type,
    b.id::TEXT as content_id,
    b.title,
    b.summary,
    1 - (b.title_embedding <=> reference_embedding) as similarity_score,
    jsonb_build_object(
      'bill_number', b.bill_number,
      'sponsor', b.sponsor,
      'chamber', b.chamber,
      'status', b.status
    ) as metadata
  FROM bills b
  WHERE 
    b.title_embedding IS NOT NULL
    AND b.id::TEXT != reference_content_id
    AND 1 - (b.title_embedding <=> reference_embedding) >= similarity_threshold
  
  UNION ALL
  
  -- Find similar executive actions
  SELECT 
    'executive_action'::TEXT as content_type,
    ea.id::TEXT as content_id,
    ea.title,
    ea.summary,
    1 - (ea.title_embedding <=> reference_embedding) as similarity_score,
    jsonb_build_object(
      'executive_order_number', ea.executive_order_number,
      'action_type', ea.action_type,
      'administration', ea.administration,
      'status', ea.status
    ) as metadata
  FROM executive_actions ea
  WHERE 
    ea.title_embedding IS NOT NULL
    AND ea.id::TEXT != reference_content_id
    AND 1 - (ea.title_embedding <=> reference_embedding) >= similarity_threshold
  
  ORDER BY similarity_score DESC
  LIMIT max_results;
END;
$$;

-- =====================================================================
-- SEARCH ANALYTICS AND MONITORING
-- =====================================================================

-- Function to log search queries for analytics
CREATE OR REPLACE FUNCTION log_search_query(
  query_text TEXT,
  search_type TEXT,
  result_count INTEGER,
  avg_relevance_score FLOAT,
  search_duration_ms INTEGER,
  user_session_id TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO processing_logs (
    operation_type,
    status,
    processing_stats
  ) VALUES (
    'search_query',
    'completed',
    jsonb_build_object(
      'query_text', query_text,
      'search_type', search_type,
      'result_count', result_count,
      'avg_relevance_score', avg_relevance_score,
      'duration_ms', search_duration_ms,
      'user_session_id', user_session_id,
      'query_length', LENGTH(query_text),
      'timestamp', NOW()
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get search performance metrics
CREATE OR REPLACE FUNCTION get_search_performance_metrics(
  time_period INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (
  search_type TEXT,
  total_queries BIGINT,
  avg_result_count DECIMAL(5,2),
  avg_relevance_score DECIMAL(3,2),
  avg_duration_ms DECIMAL(8,2),
  queries_with_no_results BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (pl.processing_stats->>'search_type')::TEXT as search_type,
    COUNT(*) as total_queries,
    AVG((pl.processing_stats->>'result_count')::INTEGER) as avg_result_count,
    AVG((pl.processing_stats->>'avg_relevance_score')::FLOAT) as avg_relevance_score,
    AVG((pl.processing_stats->>'duration_ms')::INTEGER) as avg_duration_ms,
    COUNT(*) FILTER (WHERE (pl.processing_stats->>'result_count')::INTEGER = 0) as queries_with_no_results
  FROM processing_logs pl
  WHERE 
    pl.operation_type = 'search_query'
    AND pl.started_at >= NOW() - time_period
    AND pl.processing_stats ? 'search_type'
  GROUP BY (pl.processing_stats->>'search_type')
  ORDER BY total_queries DESC;
END;
$$ LANGUAGE plpgsql;