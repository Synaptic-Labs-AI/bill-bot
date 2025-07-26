-- =====================================================================
-- Migration 002: Executive Actions Schema
-- Description: Create executive actions tables with cross-references to bills
-- Dependencies: Requires 001_initial_bills_schema.sql
-- =====================================================================

BEGIN;

-- Create executive action types enum
CREATE TYPE executive_action_type AS ENUM (
  'executive_order',
  'presidential_memorandum', 
  'proclamation',
  'presidential_directive',
  'national_security_directive'
);

-- Create executive action status enum  
CREATE TYPE executive_action_status AS ENUM (
  'active',
  'revoked',
  'superseded',
  'expired',
  'amended'
);

-- Create executive actions table with vector embeddings
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
  
  -- Vector embeddings (Cohere embed-english-v3.0 dimensions)
  title_embedding VECTOR(1024),      -- For title-based search
  summary_embedding VECTOR(1024),    -- For summary-based search
  content_embedding VECTOR(1024),    -- Full content embedding
  
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
  ) STORED,
  
  -- Foreign key constraint for superseded_by
  CONSTRAINT fk_superseded_by FOREIGN KEY (superseded_by) REFERENCES executive_actions(id)
);

-- Executive action topics/categories
CREATE TABLE executive_action_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  primary_topic TEXT NOT NULL,
  secondary_topic TEXT,
  relevance_score DECIMAL(3,2) DEFAULT 1.0,
  
  UNIQUE(executive_action_id, primary_topic, secondary_topic)
);

-- Agencies affected by executive actions
CREATE TABLE executive_action_agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  agency_name TEXT NOT NULL,
  agency_code TEXT, -- e.g., "EPA", "DOD", "HHS"
  implementation_role TEXT, -- "primary", "supporting", "advisory"
  
  UNIQUE(executive_action_id, agency_name)
);

-- Cross-references between executive actions and bills
CREATE TABLE executive_action_bill_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- "implements", "modifies", "relates_to"
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(executive_action_id, bill_id, relationship_type),
  
  CONSTRAINT valid_relationship_type CHECK (relationship_type IN (
    'implements', 'modifies', 'relates_to', 'references', 'supersedes'
  ))
);

-- Amendment and supersession tracking
CREATE TABLE executive_action_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_action_id UUID NOT NULL REFERENCES executive_actions(id),
  revising_action_id UUID NOT NULL REFERENCES executive_actions(id),
  revision_type TEXT NOT NULL, -- "amendment", "supersession", "revocation"
  sections_affected TEXT[], -- Which sections were changed
  effective_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(original_action_id, revising_action_id),
  
  CONSTRAINT valid_revision_type CHECK (revision_type IN (
    'amendment', 'supersession', 'revocation', 'partial_revocation'
  ))
);

-- Core search indexes for executive actions
CREATE INDEX idx_executive_actions_number ON executive_actions(executive_order_number);
CREATE INDEX idx_executive_actions_type ON executive_actions(action_type);
CREATE INDEX idx_executive_actions_administration ON executive_actions(administration);
CREATE INDEX idx_executive_actions_signed_date ON executive_actions(signed_date DESC);
CREATE INDEX idx_executive_actions_status ON executive_actions(status);
CREATE INDEX idx_executive_actions_president ON executive_actions(president_name);

-- Composite indexes for common queries
CREATE INDEX idx_executive_actions_admin_type ON executive_actions(administration, action_type);
CREATE INDEX idx_executive_actions_date_status ON executive_actions(signed_date DESC, status);
CREATE INDEX idx_executive_actions_current ON executive_actions(is_current, signed_date DESC) 
WHERE is_current = true;

-- Topic and agency indexes
CREATE INDEX idx_executive_action_topics_primary ON executive_action_topics(primary_topic);
CREATE INDEX idx_executive_action_agencies_name ON executive_action_agencies(agency_name);
CREATE INDEX idx_executive_action_agencies_code ON executive_action_agencies(agency_code);

-- Array indexes for metadata
CREATE INDEX idx_executive_actions_agencies_gin ON executive_actions USING GIN(agencies_affected);
CREATE INDEX idx_executive_actions_policy_areas_gin ON executive_actions USING GIN(policy_areas);
CREATE INDEX idx_executive_actions_keywords_gin ON executive_actions USING GIN(keywords);

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

-- Trigger for automatic search vector updates
CREATE TRIGGER update_executive_actions_search_vector
  BEFORE INSERT OR UPDATE ON executive_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_executive_action_search_vector();

-- Function to get available administrations
CREATE OR REPLACE FUNCTION get_available_administrations()
RETURNS TABLE (
  administration TEXT,
  president_name TEXT,
  action_count BIGINT,
  first_action DATE,
  last_action DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    ea.administration,
    ea.president_name,
    COUNT(*) as action_count,
    MIN(ea.signed_date) as first_action,
    MAX(ea.signed_date) as last_action
  FROM executive_actions ea
  GROUP BY ea.administration, ea.president_name
  ORDER BY MAX(ea.signed_date) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get available action types with counts
CREATE OR REPLACE FUNCTION get_available_action_types()
RETURNS TABLE (
  action_type executive_action_type,
  description TEXT,
  count BIGINT,
  active_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ea.action_type,
    CASE ea.action_type
      WHEN 'executive_order' THEN 'Presidential directives with force of law'
      WHEN 'presidential_memorandum' THEN 'Instructions to federal agencies'
      WHEN 'proclamation' THEN 'Presidential announcements and ceremonial declarations'
      WHEN 'presidential_directive' THEN 'National security and policy guidance'
      WHEN 'national_security_directive' THEN 'Classified national security guidance'
      ELSE 'Other presidential action'
    END as description,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE ea.status = 'active') as active_count
  FROM executive_actions ea
  GROUP BY ea.action_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get top agencies affected by executive actions
CREATE OR REPLACE FUNCTION get_top_agencies(
  p_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  agency_name TEXT,
  agency_code TEXT,
  action_count BIGINT,
  roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    eaa.agency_name,
    eaa.agency_code,
    COUNT(DISTINCT eaa.executive_action_id) as action_count,
    ARRAY_AGG(DISTINCT eaa.implementation_role) as roles
  FROM executive_action_agencies eaa
  JOIN executive_actions ea ON eaa.executive_action_id = ea.id
  WHERE ea.status = 'active'
  GROUP BY eaa.agency_name, eaa.agency_code
  ORDER BY action_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get executive action statistics
CREATE OR REPLACE FUNCTION get_executive_action_statistics()
RETURNS TABLE (
  administration TEXT,
  action_type executive_action_type,
  status executive_action_status,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ea.administration,
    ea.action_type,
    ea.status,
    COUNT(*) as count
  FROM executive_actions ea
  GROUP BY ea.administration, ea.action_type, ea.status
  ORDER BY ea.administration DESC, count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to find related executive actions and bills
CREATE OR REPLACE FUNCTION find_related_content(
  p_executive_action_id UUID DEFAULT NULL,
  p_bill_id BIGINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  relationship_type TEXT,
  relevance_score DECIMAL(3,2)
) AS $$
BEGIN
  IF p_executive_action_id IS NOT NULL THEN
    -- Find related bills for an executive action
    RETURN QUERY
    SELECT 
      'bill'::TEXT as content_type,
      b.id::TEXT as content_id,
      b.title,
      eabr.relationship_type,
      1.0::DECIMAL(3,2) as relevance_score
    FROM executive_action_bill_references eabr
    JOIN bills b ON eabr.bill_id = b.id
    WHERE eabr.executive_action_id = p_executive_action_id
    ORDER BY eabr.created_at DESC
    LIMIT p_limit;
    
  ELSIF p_bill_id IS NOT NULL THEN
    -- Find related executive actions for a bill
    RETURN QUERY
    SELECT 
      'executive_action'::TEXT as content_type,
      ea.id::TEXT as content_id,
      ea.title,
      eabr.relationship_type,
      1.0::DECIMAL(3,2) as relevance_score
    FROM executive_action_bill_references eabr
    JOIN executive_actions ea ON eabr.executive_action_id = ea.id
    WHERE eabr.bill_id = p_bill_id
    ORDER BY eabr.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;