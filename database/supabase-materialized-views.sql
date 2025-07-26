-- =====================================================================
-- MATERIALIZED VIEWS FOR CONTEXT INJECTION
-- =====================================================================
-- These materialized views provide fast access to aggregated data for
-- context injection and discovery. They should be refreshed periodically.
-- =====================================================================

BEGIN;

-- =====================================================================
-- SPONSOR STATISTICS MATERIALIZED VIEW
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

-- =====================================================================
-- TOPIC STATISTICS MATERIALIZED VIEW
-- =====================================================================

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

-- =====================================================================
-- STATUS STATISTICS MATERIALIZED VIEW
-- =====================================================================

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

-- =====================================================================
-- COMMITTEE STATISTICS MATERIALIZED VIEW
-- =====================================================================

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

-- =====================================================================
-- ADMINISTRATION STATISTICS MATERIALIZED VIEW
-- =====================================================================

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

-- =====================================================================
-- AGENCY STATISTICS MATERIALIZED VIEW
-- =====================================================================

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

COMMIT;