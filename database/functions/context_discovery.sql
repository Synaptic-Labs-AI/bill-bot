-- =====================================================================
-- Context Discovery Functions
-- Description: Functions for dynamic context injection and discovery
-- Dependencies: Requires all migrations and materialized views
-- =====================================================================

-- =====================================================================
-- SPONSOR DISCOVERY FUNCTIONS
-- =====================================================================

-- Enhanced sponsor lookup with fuzzy matching
CREATE OR REPLACE FUNCTION get_available_sponsors(
  p_chamber TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_min_bill_count INTEGER DEFAULT 1,
  p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
  name TEXT,
  party TEXT,
  state TEXT,
  chamber TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT,
  latest_bill_date DATE,
  topics_sponsored TEXT[],
  match_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.name,
    ms.party,
    ms.state,
    ms.chamber,
    ms.bill_count,
    ms.active_bill_count,
    ms.latest_bill_date,
    ms.topics_sponsored,
    CASE 
      WHEN p_search_term IS NULL THEN 1.0
      ELSE GREATEST(
        similarity(ms.name, p_search_term),
        similarity(CONCAT(ms.name, ' ', ms.party, '-', ms.state), p_search_term)
      )
    END as match_score
  FROM mv_sponsor_stats ms
  WHERE 
    (p_chamber IS NULL OR ms.chamber = p_chamber OR p_chamber = 'both')
    AND ms.bill_count >= p_min_bill_count
    AND (
      p_search_term IS NULL 
      OR ms.name ILIKE '%' || p_search_term || '%'
      OR similarity(ms.name, p_search_term) > 0.3
    )
  ORDER BY 
    CASE 
      WHEN p_search_term IS NULL THEN ms.bill_count 
      ELSE GREATEST(
        similarity(ms.name, p_search_term),
        similarity(CONCAT(ms.name, ' ', ms.party, '-', ms.state), p_search_term)
      ) * 100 + ms.bill_count
    END DESC,
    ms.name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to validate and suggest sponsor names
CREATE OR REPLACE FUNCTION validate_sponsor_names(
  sponsor_names TEXT[]
)
RETURNS TABLE (
  original_name TEXT,
  suggested_name TEXT,
  match_confidence FLOAT,
  validation_status TEXT,
  sponsor_details JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH sponsor_validations AS (
    SELECT 
      sn.sponsor_name as original_name,
      ms.name as suggested_name,
      GREATEST(
        similarity(ms.name, sn.sponsor_name),
        similarity(LOWER(ms.name), LOWER(sn.sponsor_name))
      ) as match_confidence,
      CASE 
        WHEN ms.name = sn.sponsor_name THEN 'exact_match'
        WHEN similarity(ms.name, sn.sponsor_name) >= 0.8 THEN 'high_confidence'
        WHEN similarity(ms.name, sn.sponsor_name) >= 0.6 THEN 'medium_confidence'
        WHEN similarity(ms.name, sn.sponsor_name) >= 0.4 THEN 'low_confidence'
        ELSE 'no_match'
      END as validation_status,
      jsonb_build_object(
        'party', ms.party,
        'state', ms.state,
        'chamber', ms.chamber,
        'bill_count', ms.bill_count,
        'active_bill_count', ms.active_bill_count
      ) as sponsor_details,
      ROW_NUMBER() OVER (
        PARTITION BY sn.sponsor_name 
        ORDER BY similarity(ms.name, sn.sponsor_name) DESC
      ) as rn
    FROM unnest(sponsor_names) as sn(sponsor_name)
    LEFT JOIN mv_sponsor_stats ms ON similarity(ms.name, sn.sponsor_name) >= 0.3
  )
  SELECT 
    sv.original_name,
    sv.suggested_name,
    sv.match_confidence,
    sv.validation_status,
    sv.sponsor_details
  FROM sponsor_validations sv
  WHERE sv.rn = 1; -- Get best match for each input name
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TOPIC DISCOVERY FUNCTIONS
-- =====================================================================

-- Enhanced topic category discovery with semantic matching
CREATE OR REPLACE FUNCTION discover_topic_categories(
  p_query_text TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 15,
  p_min_bill_count INTEGER DEFAULT 1
)
RETURNS TABLE (
  topic_name TEXT,
  category TEXT,
  description TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT,
  sponsor_count BIGINT,
  relevance_score FLOAT,
  recent_activity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mts.topic_name,
    mts.category,
    mts.description,
    mts.bill_count,
    mts.active_bill_count,
    mts.sponsor_count,
    CASE 
      WHEN p_query_text IS NULL THEN 1.0
      ELSE GREATEST(
        similarity(mts.topic_name, p_query_text),
        similarity(mts.category, p_query_text),
        similarity(mts.description, p_query_text),
        CASE WHEN mts.description ILIKE '%' || p_query_text || '%' THEN 0.8 ELSE 0 END
      )
    END as relevance_score,
    -- Recent activity score based on latest bill date
    CASE 
      WHEN mts.latest_bill_date IS NULL THEN 0
      ELSE GREATEST(0, 1 - (EXTRACT(DAYS FROM (NOW() - mts.latest_bill_date)) / 365.0))
    END as recent_activity_score
  FROM mv_topic_stats mts
  WHERE 
    mts.bill_count >= p_min_bill_count
    AND (
      p_query_text IS NULL 
      OR mts.topic_name ILIKE '%' || p_query_text || '%'
      OR mts.category ILIKE '%' || p_query_text || '%'
      OR mts.description ILIKE '%' || p_query_text || '%'
      OR similarity(mts.topic_name, p_query_text) > 0.3
    )
  ORDER BY 
    CASE 
      WHEN p_query_text IS NULL THEN mts.bill_count 
      ELSE (
        GREATEST(
          similarity(mts.topic_name, p_query_text),
          similarity(mts.category, p_query_text),
          similarity(mts.description, p_query_text),
          CASE WHEN mts.description ILIKE '%' || p_query_text || '%' THEN 0.8 ELSE 0 END
        ) * 10 + LOG(mts.bill_count + 1)
      )
    END DESC,
    mts.bill_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get topic hierarchy with parent-child relationships
CREATE OR REPLACE FUNCTION get_topic_hierarchy()
RETURNS TABLE (
  parent_category TEXT,
  topics JSONB,
  total_bills BIGINT,
  active_bills BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mts.category as parent_category,
    jsonb_agg(
      jsonb_build_object(
        'name', mts.topic_name,
        'bill_count', mts.bill_count,
        'active_bill_count', mts.active_bill_count,
        'description', mts.description
      ) ORDER BY mts.bill_count DESC
    ) as topics,
    SUM(mts.bill_count) as total_bills,
    SUM(mts.active_bill_count) as active_bills
  FROM mv_topic_stats mts
  GROUP BY mts.category
  ORDER BY total_bills DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- ADMINISTRATION AND AGENCY DISCOVERY
-- =====================================================================

-- Enhanced administration discovery with detailed statistics
CREATE OR REPLACE FUNCTION get_available_administrations_detailed()
RETURNS TABLE (
  administration TEXT,
  president_name TEXT,
  total_actions BIGINT,
  active_actions BIGINT,
  action_types JSONB,
  date_range JSONB,
  top_agencies TEXT[],
  policy_focus_areas TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mas.administration,
    mas.president_name,
    mas.total_actions,
    mas.active_actions,
    jsonb_build_object(
      'executive_orders', mas.executive_orders,
      'memoranda', mas.memoranda,
      'proclamations', mas.proclamations
    ) as action_types,
    jsonb_build_object(
      'first_action', mas.first_action_date,
      'last_action', mas.last_action_date,
      'duration_days', EXTRACT(DAYS FROM (mas.last_action_date - mas.first_action_date))
    ) as date_range,
    (
      SELECT ARRAY_AGG(agency_name ORDER BY action_count DESC)
      FROM (
        SELECT DISTINCT unnest(mas.agencies_involved) as agency_name, 
               COUNT(*) as action_count
        FROM mv_administration_stats mas2 
        WHERE mas2.administration = mas.administration
        GROUP BY agency_name
        LIMIT 10
      ) top_agencies_subq
    ) as top_agencies,
    ARRAY[]::TEXT[] as policy_focus_areas -- Could be enhanced with topic analysis
  FROM mv_administration_stats mas
  ORDER BY mas.last_action_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get agency involvement patterns
CREATE OR REPLACE FUNCTION analyze_agency_involvement(
  p_agency_filter TEXT DEFAULT NULL,
  p_min_action_count INTEGER DEFAULT 1
)
RETURNS TABLE (
  agency_name TEXT,
  agency_code TEXT,
  action_count BIGINT,
  active_action_count BIGINT,
  roles TEXT[],
  administrations TEXT[],
  action_types TEXT[],
  involvement_trend JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mas.agency_name,
    mas.agency_code,
    mas.action_count,
    mas.active_action_count,
    mas.roles,
    mas.administrations_involved as administrations,
    mas.action_types_involved as action_types,
    jsonb_build_object(
      'latest_action_date', mas.latest_action_date,
      'activity_score', CASE 
        WHEN mas.latest_action_date IS NULL THEN 0
        ELSE GREATEST(0, 1 - (EXTRACT(DAYS FROM (NOW() - mas.latest_action_date)) / 365.0))
      END,
      'cross_administration_involvement', array_length(mas.administrations_involved, 1)
    ) as involvement_trend
  FROM mv_agency_stats mas
  WHERE 
    mas.action_count >= p_min_action_count
    AND (
      p_agency_filter IS NULL 
      OR mas.agency_name ILIKE '%' || p_agency_filter || '%'
      OR mas.agency_code ILIKE '%' || p_agency_filter || '%'
    )
  ORDER BY mas.action_count DESC, mas.agency_name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- DATE RANGE AND TEMPORAL DISCOVERY
-- =====================================================================

-- Enhanced date range discovery with activity analysis
CREATE OR REPLACE FUNCTION get_temporal_context(
  p_content_type TEXT DEFAULT 'both' -- 'bills', 'executive_actions', 'both'
)
RETURNS TABLE (
  time_period TEXT,
  period_type TEXT,
  start_date DATE,
  end_date DATE,
  bill_count BIGINT,
  executive_action_count BIGINT,
  activity_level TEXT,
  significant_events JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH congressional_sessions AS (
    SELECT 
      CONCAT(congress_number, 'th Congress') as time_period,
      'congressional_session' as period_type,
      MIN(introduced_date) as start_date,
      MAX(introduced_date) as end_date,
      COUNT(*) as bill_count,
      0::BIGINT as executive_action_count
    FROM bills
    GROUP BY congress_number
  ),
  presidential_terms AS (
    SELECT 
      CONCAT(administration, ' Administration') as time_period,
      'presidential_term' as period_type,
      MIN(signed_date) as start_date,
      MAX(signed_date) as end_date,
      0::BIGINT as bill_count,
      COUNT(*) as executive_action_count
    FROM executive_actions
    GROUP BY administration, president_name
  ),
  yearly_periods AS (
    SELECT 
      EXTRACT(YEAR FROM date_col)::TEXT as time_period,
      'year' as period_type,
      DATE_TRUNC('year', date_col)::DATE as start_date,
      (DATE_TRUNC('year', date_col) + INTERVAL '1 year - 1 day')::DATE as end_date,
      SUM(CASE WHEN content_type = 'bill' THEN 1 ELSE 0 END) as bill_count,
      SUM(CASE WHEN content_type = 'executive_action' THEN 1 ELSE 0 END) as executive_action_count
    FROM (
      SELECT introduced_date as date_col, 'bill' as content_type FROM bills WHERE introduced_date IS NOT NULL
      UNION ALL
      SELECT signed_date as date_col, 'executive_action' as content_type FROM executive_actions WHERE signed_date IS NOT NULL
    ) combined_dates
    GROUP BY EXTRACT(YEAR FROM date_col)
  )
  SELECT 
    tp.time_period,
    tp.period_type,
    tp.start_date,
    tp.end_date,
    tp.bill_count,
    tp.executive_action_count,
    CASE 
      WHEN tp.bill_count + tp.executive_action_count >= 1000 THEN 'high'
      WHEN tp.bill_count + tp.executive_action_count >= 500 THEN 'medium'
      WHEN tp.bill_count + tp.executive_action_count >= 100 THEN 'low'
      ELSE 'minimal'
    END as activity_level,
    jsonb_build_object(
      'total_items', tp.bill_count + tp.executive_action_count,
      'bill_percentage', CASE 
        WHEN tp.bill_count + tp.executive_action_count = 0 THEN 0
        ELSE ROUND((tp.bill_count::DECIMAL / (tp.bill_count + tp.executive_action_count)) * 100, 1)
      END
    ) as significant_events
  FROM (
    SELECT * FROM congressional_sessions WHERE p_content_type IN ('bills', 'both')
    UNION ALL
    SELECT * FROM presidential_terms WHERE p_content_type IN ('executive_actions', 'both')
    UNION ALL
    SELECT * FROM yearly_periods WHERE p_content_type = 'both'
  ) tp
  ORDER BY tp.start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMMITTEE DISCOVERY FUNCTIONS
-- =====================================================================

-- Function to get active committees with detailed statistics
CREATE OR REPLACE FUNCTION get_committee_context(
  p_chamber TEXT DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
  committee_name TEXT,
  chamber TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT,
  unique_sponsors BIGINT,
  avg_processing_days DECIMAL(8,2),
  recent_activity_score FLOAT,
  top_topics TEXT[],
  success_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mcs.committee as committee_name,
    mcs.chamber,
    mcs.bill_count,
    mcs.active_bill_count,
    mcs.unique_sponsors,
    mcs.avg_processing_days,
    CASE 
      WHEN mcs.latest_bill_date IS NULL THEN 0
      ELSE GREATEST(0, 1 - (EXTRACT(DAYS FROM (NOW() - mcs.latest_bill_date)) / 365.0))
    END as recent_activity_score,
    ARRAY[]::TEXT[] as top_topics, -- Could be enhanced with topic analysis
    CASE 
      WHEN mcs.bill_count = 0 THEN 0
      ELSE ROUND((mcs.active_bill_count::DECIMAL / mcs.bill_count) * 100, 2)
    END as success_rate
  FROM mv_committee_stats mcs
  WHERE 
    (p_chamber IS NULL OR mcs.chamber = p_chamber OR p_chamber = 'both')
    AND (
      p_search_term IS NULL 
      OR mcs.committee ILIKE '%' || p_search_term || '%'
      OR similarity(mcs.committee, p_search_term) > 0.3
    )
  ORDER BY 
    CASE 
      WHEN p_search_term IS NULL THEN mcs.bill_count 
      ELSE similarity(mcs.committee, p_search_term) * 100 + LOG(mcs.bill_count + 1)
    END DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMPREHENSIVE CONTEXT DISCOVERY
-- =====================================================================

-- Master function to get all available context for query enhancement
CREATE OR REPLACE FUNCTION get_comprehensive_context(
  p_query_hint TEXT DEFAULT NULL,
  p_content_types TEXT[] DEFAULT ARRAY['bills', 'executive_actions']
)
RETURNS JSONB AS $$
DECLARE
  context_data JSONB := '{}';
  query_keywords TEXT[];
BEGIN
  -- Extract keywords from query hint
  IF p_query_hint IS NOT NULL THEN
    query_keywords := string_to_array(LOWER(p_query_hint), ' ');
  END IF;
  
  -- Get sponsors context
  context_data := context_data || jsonb_build_object(
    'sponsors', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', name,
          'party', party,
          'state', state,
          'chamber', chamber,
          'bill_count', bill_count
        )
      )
      FROM get_available_sponsors(NULL, 50, 3, p_query_hint)
    )
  );
  
  -- Get topics context
  context_data := context_data || jsonb_build_object(
    'topics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', topic_name,
          'category', category,
          'description', description,
          'bill_count', bill_count,
          'relevance_score', relevance_score
        )
      )
      FROM discover_topic_categories(p_query_hint, 20, 1)
    )
  );
  
  -- Get status context
  context_data := context_data || jsonb_build_object(
    'statuses', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'status', status,
          'description', description,
          'count', total_count
        )
      )
      FROM get_bill_statuses()
    )
  );
  
  -- Get administrations context if executive actions are included
  IF 'executive_actions' = ANY(p_content_types) THEN
    context_data := context_data || jsonb_build_object(
      'administrations', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'administration', administration,
            'president_name', president_name,
            'total_actions', total_actions,
            'active_actions', active_actions,
            'date_range', date_range
          )
        )
        FROM get_available_administrations_detailed()
      )
    );
    
    -- Get agencies context
    context_data := context_data || jsonb_build_object(
      'agencies', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', agency_name,
            'code', agency_code,
            'action_count', action_count,
            'roles', roles
          )
        )
        FROM analyze_agency_involvement(NULL, 2)
        LIMIT 30
      )
    );
  END IF;
  
  -- Get temporal context
  context_data := context_data || jsonb_build_object(
    'date_ranges', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'period', time_period,
          'type', period_type,
          'start_date', start_date,
          'end_date', end_date,
          'activity_level', activity_level
        )
      )
      FROM get_temporal_context('both')
      LIMIT 10
    )
  );
  
  -- Add metadata about the context
  context_data := context_data || jsonb_build_object(
    'metadata', jsonb_build_object(
      'generated_at', NOW(),
      'query_hint', p_query_hint,
      'content_types', p_content_types,
      'cache_duration_minutes', 5
    )
  );
  
  RETURN context_data;
END;
$$ LANGUAGE plpgsql;