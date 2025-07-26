-- =====================================================================
-- Migration 001: Initial Bills Schema
-- Description: Create bills table with full metadata and vector support
-- Dependencies: Requires pgvector extension
-- =====================================================================

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create bills table with vector embeddings
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
  
  -- Vector embeddings (Cohere embed-english-v3.0 dimensions)
  title_embedding VECTOR(1024),      -- Cohere embed-english-v3.0 medium
  summary_embedding VECTOR(1024),    -- For summary-based search
  content_embedding VECTOR(1024),    -- For full content search
  
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

-- Create bill topics table for categorization
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

-- Standard B-tree indexes for filtering and sorting
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

-- JSONB indexes for metadata queries
CREATE INDEX bills_actions_gin_idx ON bills USING GIN(actions);
CREATE INDEX bills_cosponsors_gin_idx ON bills USING GIN(cosponsors);
CREATE INDEX bills_processing_metadata_gin_idx ON bills USING GIN(processing_metadata);

-- Specific JSONB path indexes for common queries
CREATE INDEX bills_action_dates_idx ON bills USING GIN((actions -> 'date'));
CREATE INDEX bills_sponsor_party_idx ON bills USING GIN((processing_metadata -> 'sponsor_party'));

-- Function to update search vectors automatically
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

-- Insert initial topic categories
INSERT INTO bill_topics (name, category, description) VALUES
('Healthcare', 'health', 'Bills related to healthcare policy and medical services'),
('Environment', 'environment', 'Environmental protection and climate change legislation'),
('Education', 'education', 'Educational policy and funding bills'),
('Defense', 'defense', 'Military and national security legislation'),
('Economy', 'economy', 'Economic policy and financial regulation'),
('Immigration', 'immigration', 'Immigration and border security bills'),
('Infrastructure', 'infrastructure', 'Transportation and infrastructure development'),
('Technology', 'technology', 'Technology policy and digital rights legislation'),
('Agriculture', 'agriculture', 'Agricultural policy and food security'),
('Energy', 'energy', 'Energy production and renewable resources'),
('Labor', 'labor', 'Employment and workers rights legislation'),
('Justice', 'justice', 'Criminal justice and legal system reforms'),
('Housing', 'housing', 'Housing policy and urban development'),
('Transportation', 'transportation', 'Transportation systems and regulations'),
('Veterans', 'veterans', 'Veterans affairs and military personnel'),
('Social Services', 'social_services', 'Social welfare and public assistance'),
('Taxation', 'taxation', 'Tax policy and revenue legislation'),
('Trade', 'trade', 'International trade and commerce'),
('Civil Rights', 'civil_rights', 'Civil rights and equality legislation'),
('Government Reform', 'government_reform', 'Government operations and reform');

-- Create function for bill statistics
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

-- Create function to get available bill statuses
CREATE OR REPLACE FUNCTION get_available_statuses()
RETURNS TABLE (
  status TEXT,
  description TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.status::TEXT,
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
    COUNT(*) as count
  FROM bills b
  GROUP BY b.status
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

COMMIT;