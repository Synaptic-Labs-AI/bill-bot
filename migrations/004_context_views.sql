-- =====================================================================
-- Migration 004: Context Views for Context Injection
-- Description: Create materialized views for fast context discovery
-- Dependencies: Requires all previous migrations
-- =====================================================================

BEGIN;

-- =====================================================================
-- MATERIALIZED VIEWS FOR CONTEXT INJECTION
-- =====================================================================

-- Sponsor statistics materialized view for fast context lookup
CREATE MATERIALIZED VIEW mv_sponsor_stats AS
SELECT 
  b.sponsor as name,
  COALESCE(
    (b.processing_metadata->>'sponsor_party')::TEXT, 
    'Unknown'
  ) as party,
  COALESCE(
    (b.processing_metadata->>'sponsor_state')::TEXT, 
    'Unknown'
  ) as state,
  b.chamber,
  COUNT(*) as bill_count,
  COUNT(*) FILTER (WHERE b.is_active = true) as active_bill_count,
  MAX(b.introduced_date) as latest_bill_date,
  MIN(b.introduced_date) as earliest_bill_date,
  ARRAY_AGG(DISTINCT b.status) as statuses_sponsored,
  ARRAY_AGG(DISTINCT bt.name ORDER BY bt.name) FILTER (WHERE bt.name IS NOT NULL) as topics_sponsored
FROM bills b
LEFT JOIN bill_topic_assignments bta ON b.id = bta.bill_id
LEFT JOIN bill_topics bt ON bta.topic_id = bt.id
WHERE b.sponsor IS NOT NULL
GROUP BY b.sponsor, b.chamber, 
         (b.processing_metadata->>'sponsor_party'),
         (b.processing_metadata->>'sponsor_state')
HAVING COUNT(*) >= 1;

-- Unique index for fast lookups and concurrent refresh
CREATE UNIQUE INDEX idx_mv_sponsor_stats_unique ON mv_sponsor_stats(name, chamber);
CREATE INDEX idx_mv_sponsor_stats_bill_count ON mv_sponsor_stats(bill_count DESC);
CREATE INDEX idx_mv_sponsor_stats_chamber ON mv_sponsor_stats(chamber);
CREATE INDEX idx_mv_sponsor_stats_party ON mv_sponsor_stats(party);

-- Topic statistics materialized view
CREATE MATERIALIZED VIEW mv_topic_stats AS
SELECT 
  bt.name as topic_name,
  bt.category,
  bt.description,
  COUNT(DISTINCT bta.bill_id) as bill_count,
  COUNT(DISTINCT bta.bill_id) FILTER (WHERE b.is_active = true) as active_bill_count,
  COUNT(DISTINCT b.sponsor) as sponsor_count,
  ARRAY_AGG(DISTINCT b.chamber) as chambers,
  MAX(b.introduced_date) as latest_bill_date,
  AVG(bta.confidence_score) as avg_confidence_score
FROM bill_topics bt
LEFT JOIN bill_topic_assignments bta ON bt.id = bta.topic_id
LEFT JOIN bills b ON bta.bill_id = b.id
GROUP BY bt.id, bt.name, bt.category, bt.description
HAVING COUNT(DISTINCT bta.bill_id) >= 1;

CREATE UNIQUE INDEX idx_mv_topic_stats_unique ON mv_topic_stats(topic_name);
CREATE INDEX idx_mv_topic_stats_bill_count ON mv_topic_stats(bill_count DESC);
CREATE INDEX idx_mv_topic_stats_category ON mv_topic_stats(category);

-- Status statistics materialized view
CREATE MATERIALIZED VIEW mv_status_stats AS
SELECT 
  b.status,
  CASE b.status
    WHEN 'introduced' THEN 'Bill has been introduced in Congress'
    WHEN 'referred' THEN 'Referred to committee for consideration'
    WHEN 'reported' THEN 'Reported out of committee'
    WHEN 'passed_house' THEN 'Passed by the House of Representatives'
    WHEN 'passed_senate' THEN 'Passed by the Senate'
    WHEN 'enrolled' THEN 'Enrolled and sent to President'
    WHEN 'presented' THEN 'Presented to President for signature'
    WHEN 'signed' THEN 'Signed into law by the President'
    WHEN 'vetoed' THEN 'Vetoed by the President'
    WHEN 'withdrawn' THEN 'Withdrawn by sponsor'
    WHEN 'failed' THEN 'Failed to pass'
    ELSE 'Other legislative status'
  END as description,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE b.chamber = 'house') as house_count,
  COUNT(*) FILTER (WHERE b.chamber = 'senate') as senate_count,
  COUNT(DISTINCT b.sponsor) as unique_sponsors,
  AVG(EXTRACT(DAYS FROM (COALESCE(b.last_action_date, NOW()::DATE) - b.introduced_date))) as avg_days_in_status
FROM bills b
GROUP BY b.status;

CREATE UNIQUE INDEX idx_mv_status_stats_unique ON mv_status_stats(status);
CREATE INDEX idx_mv_status_stats_count ON mv_status_stats(total_count DESC);

-- Committee statistics materialized view
CREATE MATERIALIZED VIEW mv_committee_stats AS
SELECT 
  b.committee,
  b.chamber,
  COUNT(*) as bill_count,
  COUNT(*) FILTER (WHERE b.is_active = true) as active_bill_count,
  COUNT(DISTINCT b.sponsor) as unique_sponsors,
  ARRAY_AGG(DISTINCT b.status) as statuses_handled,
  MAX(b.introduced_date) as latest_bill_date,
  AVG(EXTRACT(DAYS FROM (COALESCE(b.last_action_date, NOW()::DATE) - b.introduced_date))) as avg_processing_days
FROM bills b
WHERE b.committee IS NOT NULL
GROUP BY b.committee, b.chamber
HAVING COUNT(*) >= 1;

CREATE UNIQUE INDEX idx_mv_committee_stats_unique ON mv_committee_stats(committee, chamber);
CREATE INDEX idx_mv_committee_stats_bill_count ON mv_committee_stats(bill_count DESC);
CREATE INDEX idx_mv_committee_stats_chamber ON mv_committee_stats(chamber);

-- Executive action administration statistics
CREATE MATERIALIZED VIEW mv_administration_stats AS
SELECT 
  ea.administration,
  ea.president_name,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE ea.status = 'active') as active_actions,
  COUNT(*) FILTER (WHERE ea.action_type = 'executive_order') as executive_orders,
  COUNT(*) FILTER (WHERE ea.action_type = 'presidential_memorandum') as memoranda,
  COUNT(*) FILTER (WHERE ea.action_type = 'proclamation') as proclamations,
  MIN(ea.signed_date) as first_action_date,
  MAX(ea.signed_date) as last_action_date,
  ARRAY_AGG(DISTINCT unnest(ea.agencies_affected)) FILTER (WHERE ea.agencies_affected IS NOT NULL) as agencies_involved
FROM executive_actions ea
GROUP BY ea.administration, ea.president_name;

CREATE UNIQUE INDEX idx_mv_administration_stats_unique ON mv_administration_stats(administration, president_name);
CREATE INDEX idx_mv_administration_stats_total ON mv_administration_stats(total_actions DESC);

-- Agency involvement statistics
CREATE MATERIALIZED VIEW mv_agency_stats AS
SELECT 
  eaa.agency_name,
  eaa.agency_code,
  COUNT(DISTINCT eaa.executive_action_id) as action_count,
  COUNT(DISTINCT eaa.executive_action_id) FILTER (WHERE ea.status = 'active') as active_action_count,
  ARRAY_AGG(DISTINCT eaa.implementation_role) as roles,
  ARRAY_AGG(DISTINCT ea.administration) as administrations_involved,
  ARRAY_AGG(DISTINCT ea.action_type) as action_types_involved,
  MAX(ea.signed_date) as latest_action_date
FROM executive_action_agencies eaa
JOIN executive_actions ea ON eaa.executive_action_id = ea.id
GROUP BY eaa.agency_name, eaa.agency_code
HAVING COUNT(DISTINCT eaa.executive_action_id) >= 1;

CREATE UNIQUE INDEX idx_mv_agency_stats_unique ON mv_agency_stats(agency_name);
CREATE INDEX idx_mv_agency_stats_count ON mv_agency_stats(action_count DESC);
CREATE INDEX idx_mv_agency_stats_code ON mv_agency_stats(agency_code);

-- =====================================================================
-- FAST CONTEXT DISCOVERY FUNCTIONS
-- =====================================================================

-- Get top sponsors with caching from materialized view
CREATE OR REPLACE FUNCTION get_top_sponsors(
  p_limit INTEGER DEFAULT 20,
  p_chamber TEXT DEFAULT NULL,
  p_min_bill_count INTEGER DEFAULT 3
)
RETURNS TABLE (
  name TEXT,
  party TEXT,
  state TEXT,
  chamber TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.name,
    ms.party,
    ms.state,
    ms.chamber,
    ms.bill_count,
    ms.active_bill_count
  FROM mv_sponsor_stats ms
  WHERE 
    (p_chamber IS NULL OR ms.chamber = p_chamber OR p_chamber = 'both')
    AND ms.bill_count >= p_min_bill_count
  ORDER BY ms.bill_count DESC, ms.name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get topic categories with statistics
CREATE OR REPLACE FUNCTION get_topic_categories(
  p_limit INTEGER DEFAULT 15,
  p_category_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  topic_name TEXT,
  category TEXT,
  description TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT,
  sponsor_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mts.topic_name,
    mts.category,
    mts.description,
    mts.bill_count,
    mts.active_bill_count,
    mts.sponsor_count
  FROM mv_topic_stats mts
  WHERE 
    (p_category_filter IS NULL OR mts.category = p_category_filter)
  ORDER BY mts.bill_count DESC, mts.topic_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get available bill statuses with descriptions
CREATE OR REPLACE FUNCTION get_bill_statuses()
RETURNS TABLE (
  status TEXT,
  description TEXT,
  total_count BIGINT,
  house_count BIGINT,
  senate_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mss.status,
    mss.description,
    mss.total_count,
    mss.house_count,
    mss.senate_count
  FROM mv_status_stats mss
  ORDER BY mss.total_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Get active committees with statistics
CREATE OR REPLACE FUNCTION get_active_committees(
  p_limit INTEGER DEFAULT 30,
  p_chamber TEXT DEFAULT NULL
)
RETURNS TABLE (
  committee TEXT,
  chamber TEXT,
  bill_count BIGINT,
  active_bill_count BIGINT,
  unique_sponsors BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mcs.committee,
    mcs.chamber,
    mcs.bill_count,
    mcs.active_bill_count,
    mcs.unique_sponsors
  FROM mv_committee_stats mcs
  WHERE 
    (p_chamber IS NULL OR mcs.chamber = p_chamber OR p_chamber = 'both')
  ORDER BY mcs.bill_count DESC, mcs.committee
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get administrations with action counts
CREATE OR REPLACE FUNCTION get_administrations()
RETURNS TABLE (
  administration TEXT,
  president_name TEXT,
  total_actions BIGINT,
  active_actions BIGINT,
  executive_orders BIGINT,
  first_action_date DATE,
  last_action_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mas.administration,
    mas.president_name,
    mas.total_actions,
    mas.active_actions,
    mas.executive_orders,
    mas.first_action_date,
    mas.last_action_date
  FROM mv_administration_stats mas
  ORDER BY mas.last_action_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Get top agencies involved in executive actions
CREATE OR REPLACE FUNCTION get_top_agencies(
  p_limit INTEGER DEFAULT 25,
  p_min_action_count INTEGER DEFAULT 1
)
RETURNS TABLE (
  agency_name TEXT,
  agency_code TEXT,
  action_count BIGINT,
  active_action_count BIGINT,
  roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mas.agency_name,
    mas.agency_code,
    mas.action_count,
    mas.active_action_count,
    mas.roles
  FROM mv_agency_stats mas
  WHERE mas.action_count >= p_min_action_count
  ORDER BY mas.action_count DESC, mas.agency_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get available date ranges for different congressional sessions
CREATE OR REPLACE FUNCTION get_available_date_ranges()
RETURNS TABLE (
  session TEXT,
  congress_number INTEGER,
  start_date DATE,
  end_date DATE,
  bill_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CONCAT(b.congress_number, 'th Congress') as session,
    b.congress_number,
    MIN(b.introduced_date) as start_date,
    MAX(b.introduced_date) as end_date,
    COUNT(*) as bill_count
  FROM bills b
  GROUP BY b.congress_number
  ORDER BY b.congress_number DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CONTEXT CACHE MANAGEMENT
-- =====================================================================

-- Function to refresh all materialized views (for scheduled maintenance)
CREATE OR REPLACE FUNCTION refresh_context_cache()
RETURNS TEXT AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  result_message TEXT;
BEGIN
  start_time := NOW();
  
  -- Refresh all materialized views concurrently where possible
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sponsor_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_topic_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_status_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_committee_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_administration_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_agency_stats;
  
  end_time := NOW();
  
  result_message := format(
    'Context cache refreshed successfully in %s seconds',
    EXTRACT(EPOCH FROM (end_time - start_time))
  );
  
  -- Log the refresh
  INSERT INTO processing_logs (operation_type, status, started_at, completed_at, processing_stats)
  VALUES (
    'context_cache_refresh',
    'completed',
    start_time,
    end_time,
    jsonb_build_object(
      'duration_seconds', EXTRACT(EPOCH FROM (end_time - start_time)),
      'views_refreshed', 6
    )
  );
  
  RETURN result_message;
END;
$$ LANGUAGE plpgsql;

-- Function to get context cache status
CREATE OR REPLACE FUNCTION get_context_cache_status()
RETURNS TABLE (
  view_name TEXT,
  last_refresh TIMESTAMP WITH TIME ZONE,
  row_count BIGINT,
  size_pretty TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    matviewname::TEXT as view_name,
    GREATEST(
      pg_stat_get_last_autoanalyze_time(c.oid),
      pg_stat_get_last_analyze_time(c.oid)
    ) as last_refresh,
    reltuples::BIGINT as row_count,
    pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'm' 
    AND n.nspname = 'public'
    AND c.relname LIKE 'mv_%'
  ORDER BY c.relname;
END;
$$ LANGUAGE plpgsql;

COMMIT;