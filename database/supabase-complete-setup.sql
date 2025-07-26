-- =====================================================================
-- COMPLETE SUPABASE SETUP SCRIPT FOR BILL BOT
-- =====================================================================
-- This is the master script that sets up the entire database schema
-- Run this script in the Supabase SQL Editor to create everything
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONS AND ENUMS
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For similarity search

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

-- =====================================================================
-- 2. MAIN TABLES
-- =====================================================================

-- Bills table with vector embeddings
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
  title_embedding VECTOR(1024),
  summary_embedding VECTOR(1024),
  content_embedding VECTOR(1024),
  
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

-- Bill topics table for categorization
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

-- Executive actions table with vector embeddings
CREATE TABLE executive_actions (
  -- Primary identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Executive action identification
  executive_order_number INTEGER,
  action_type executive_action_type NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  
  -- Administrative metadata
  signed_date DATE NOT NULL,
  effective_date DATE,
  administration TEXT NOT NULL,
  president_name TEXT NOT NULL,
  citation TEXT NOT NULL,
  status executive_action_status DEFAULT 'active',
  
  -- Content and processing
  content_url TEXT,
  pdf_url TEXT,
  html_content TEXT,
  
  -- Metadata
  agencies_affected TEXT[],
  policy_areas TEXT[],
  keywords TEXT[],
  related_legislation TEXT[],
  supersedes UUID[],
  superseded_by UUID,
  
  -- Vector embeddings
  title_embedding VECTOR(1024),
  summary_embedding VECTOR(1024),
  content_embedding VECTOR(1024),
  
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
  agency_code TEXT,
  implementation_role TEXT,
  
  UNIQUE(executive_action_id, agency_name)
);

-- Cross-references between executive actions and bills
CREATE TABLE executive_action_bill_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  bill_id BIGINT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(executive_action_id, bill_id, relationship_type),
  
  CONSTRAINT valid_relationship_type CHECK (relationship_type IN (
    'implements', 'modifies', 'relates_to', 'references', 'supersedes'
  ))
);

-- RSS feed source configuration table
CREATE TABLE rss_feed_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  feed_type VARCHAR(50) NOT NULL,
  chamber VARCHAR(20) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  polling_frequency INTERVAL NOT NULL DEFAULT INTERVAL '1 hour',
  last_polled_at TIMESTAMP WITH TIME ZONE,
  last_successful_poll TIMESTAMP WITH TIME ZONE,
  error_count INTEGER DEFAULT 0,
  max_error_count INTEGER DEFAULT 5,
  configuration JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_feed_chamber CHECK (chamber IN ('house', 'senate', 'both', 'executive')),
  CONSTRAINT valid_feed_type CHECK (feed_type IN (
    'house_bills', 'senate_bills', 'all_bills',
    'executive_orders', 'presidential_memoranda', 'proclamations',
    'federal_register', 'white_house_actions'
  ))
);

-- Processing logs table
CREATE TABLE processing_logs (
  id BIGSERIAL PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL,
  source_id INTEGER REFERENCES rss_feed_sources(id),
  bill_id BIGINT REFERENCES bills(id),
  executive_action_id UUID REFERENCES executive_actions(id),
  batch_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  error_details JSONB,
  processing_stats JSONB DEFAULT '{}',
  
  CONSTRAINT valid_processing_status CHECK (
    status IN ('started', 'completed', 'failed', 'retrying', 'skipped')
  ),
  CONSTRAINT valid_content_reference CHECK (
    (bill_id IS NOT NULL AND executive_action_id IS NULL) OR
    (bill_id IS NULL AND executive_action_id IS NOT NULL) OR
    (bill_id IS NULL AND executive_action_id IS NULL)
  )
);

-- Feed item tracking table
CREATE TABLE feed_item_tracking (
  id BIGSERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES rss_feed_sources(id),
  external_id TEXT NOT NULL,
  guid TEXT,
  url TEXT,
  title TEXT NOT NULL,
  published_date TIMESTAMP WITH TIME ZONE,
  content_hash TEXT,
  bill_id BIGINT REFERENCES bills(id),
  executive_action_id UUID REFERENCES executive_actions(id),
  processing_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(source_id, external_id),
  UNIQUE(source_id, guid),
  
  CONSTRAINT valid_processing_status CHECK (
    processing_status IN ('pending', 'processed', 'failed', 'skipped', 'duplicate')
  )
);

-- Embedding queue table
CREATE TABLE embedding_queue (
  id BIGSERIAL PRIMARY KEY,
  content_type VARCHAR(20) NOT NULL,
  content_id TEXT NOT NULL,
  embedding_type VARCHAR(20) NOT NULL,
  text_content TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  embedding_result VECTOR(1024),
  
  UNIQUE(content_type, content_id, embedding_type),
  
  CONSTRAINT valid_content_type CHECK (content_type IN ('bill', 'executive_action')),
  CONSTRAINT valid_embedding_type CHECK (embedding_type IN ('title', 'summary', 'content')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 10)
);

-- =====================================================================
-- 3. CREATE INDEXES
-- =====================================================================

-- Vector indexes
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_summary_embedding_idx ON bills 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX bills_content_embedding_idx ON bills 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_title_embedding_idx ON executive_actions 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_summary_embedding_idx ON executive_actions 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_content_embedding_idx ON executive_actions 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 25);

-- Full-text search indexes
CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);
CREATE INDEX bills_title_text_idx ON bills USING GIN(to_tsvector('english', title));
CREATE INDEX bills_summary_text_idx ON bills USING GIN(to_tsvector('english', summary));
CREATE INDEX executive_actions_search_vector_idx ON executive_actions USING GIN(search_vector);
CREATE INDEX executive_actions_title_text_idx ON executive_actions USING GIN(to_tsvector('english', title));

-- B-tree indexes for filtering
CREATE INDEX bills_bill_number_idx ON bills (bill_number);
CREATE INDEX bills_chamber_status_idx ON bills (chamber, status);
CREATE INDEX bills_introduced_date_idx ON bills (introduced_date DESC);
CREATE INDEX bills_sponsor_idx ON bills (sponsor);
CREATE INDEX bills_is_active_idx ON bills (is_active) WHERE is_active = true;

CREATE INDEX executive_actions_signed_date_idx ON executive_actions (signed_date DESC);
CREATE INDEX executive_actions_administration_idx ON executive_actions (administration);
CREATE INDEX executive_actions_current_idx ON executive_actions (is_current, signed_date DESC) WHERE is_current = true;

-- Processing indexes
CREATE INDEX processing_logs_operation_idx ON processing_logs(operation_type);
CREATE INDEX processing_logs_status_idx ON processing_logs(status);
CREATE INDEX embedding_queue_status_idx ON embedding_queue(status);
CREATE INDEX embedding_queue_priority_idx ON embedding_queue(priority, created_at);

-- =====================================================================
-- 4. CREATE FUNCTIONS AND TRIGGERS
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

-- Trigger for bills
CREATE TRIGGER update_bills_search_vector
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_search_vector();

-- Function to update executive action search vectors
CREATE OR REPLACE FUNCTION update_executive_action_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', NEW.title), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.president_name, '')), 'C');
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for executive actions
CREATE TRIGGER update_executive_actions_search_vector
  BEFORE INSERT OR UPDATE ON executive_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_executive_action_search_vector();

-- =====================================================================
-- 5. SEARCH FUNCTIONS
-- =====================================================================

-- Basic semantic search for bills
CREATE OR REPLACE FUNCTION search_bills_semantic(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  bill_number VARCHAR(50),
  title TEXT,
  summary TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    b.id,
    b.bill_number,
    b.title,
    b.summary,
    1 - (b.title_embedding <=> query_embedding) AS similarity
  FROM bills b
  WHERE 
    b.title_embedding IS NOT NULL
    AND 1 - (b.title_embedding <=> query_embedding) > match_threshold
  ORDER BY (b.title_embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;

-- Basic semantic search for executive actions
CREATE OR REPLACE FUNCTION search_executive_actions_semantic(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  summary TEXT,
  administration TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    ea.id,
    ea.title,
    ea.summary,
    ea.administration,
    1 - (ea.title_embedding <=> query_embedding) AS similarity
  FROM executive_actions ea
  WHERE 
    ea.title_embedding IS NOT NULL
    AND 1 - (ea.title_embedding <=> query_embedding) > match_threshold
  ORDER BY (ea.title_embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;

-- =====================================================================
-- 6. INITIAL DATA
-- =====================================================================

-- Insert bill topics
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
('Veterans', 'veterans', 'Veterans affairs and military personnel'),
('Social Services', 'social_services', 'Social welfare and public assistance'),
('Taxation', 'taxation', 'Tax policy and revenue legislation'),
('Trade', 'trade', 'International trade and commerce'),
('Civil Rights', 'civil_rights', 'Civil rights and equality legislation'),
('Government Reform', 'government_reform', 'Government operations and reform'),
('Climate Change', 'environment', 'Climate change mitigation and adaptation');

-- Insert RSS feed sources
INSERT INTO rss_feed_sources (name, url, feed_type, chamber, polling_frequency, configuration) VALUES
('House Bills RSS', 'https://www.govinfo.gov/rss/billstatus-hr.xml', 'house_bills', 'house', INTERVAL '2 hours', 
 '{"format": "rss", "parser": "govinfo", "bill_type": "hr"}'),
('Senate Bills RSS', 'https://www.govinfo.gov/rss/billstatus-s.xml', 'senate_bills', 'senate', INTERVAL '2 hours',
 '{"format": "rss", "parser": "govinfo", "bill_type": "s"}'),
('White House Presidential Actions', 'https://www.whitehouse.gov/briefing-room/presidential-actions/feed/',
 'white_house_actions', 'executive', INTERVAL '1 hour',
 '{"format": "rss", "parser": "white_house", "content_type": "presidential_actions"}');

-- =====================================================================
-- 7. ENABLE RLS (BASIC SETUP)
-- =====================================================================

-- Enable RLS and allow public read access
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bills_public_read" ON bills FOR SELECT USING (true);

ALTER TABLE bill_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bill_topics_public_read" ON bill_topics FOR SELECT USING (true);

ALTER TABLE executive_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "executive_actions_public_read" ON executive_actions FOR SELECT USING (true);

-- =====================================================================
-- 8. GRANT PERMISSIONS
-- =====================================================================

-- Grant execute on search functions to public
GRANT EXECUTE ON FUNCTION search_bills_semantic TO public;
GRANT EXECUTE ON FUNCTION search_executive_actions_semantic TO public;

-- =====================================================================
-- 9. LOG SETUP COMPLETION
-- =====================================================================

INSERT INTO processing_logs (
  operation_type, status, processing_stats
) VALUES (
  'database_setup',
  'completed',
  jsonb_build_object(
    'tables_created', 11,
    'indexes_created', 15,
    'functions_created', 4,
    'topics_inserted', (SELECT COUNT(*) FROM bill_topics),
    'rss_feeds_configured', (SELECT COUNT(*) FROM rss_feed_sources),
    'setup_timestamp', NOW()
  )
);

-- Display setup summary
SELECT 
  'Setup completed successfully!' as message,
  (SELECT COUNT(*) FROM bill_topics) as topics_configured,
  (SELECT COUNT(*) FROM rss_feed_sources) as rss_feeds_configured,
  NOW() as completed_at;