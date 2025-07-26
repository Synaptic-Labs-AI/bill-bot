-- =====================================================================
-- COMPLETE SUPABASE DATABASE SCHEMA FOR BILL BOT
-- =====================================================================
-- This script creates the complete database schema for the Bill Bot application
-- including tables, indexes, functions, triggers, and materialized views.
-- 
-- Run this script in the Supabase SQL Editor to set up the entire database.
-- =====================================================================

BEGIN;

-- =====================================================================
-- EXTENSIONS
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For similarity search

-- =====================================================================
-- ENUMS
-- =====================================================================

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
-- MAIN TABLES
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

-- RSS feed source configuration table
CREATE TABLE rss_feed_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  feed_type VARCHAR(50) NOT NULL, -- 'house_bills', 'senate_bills', 'executive_actions', etc.
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

-- Enhanced processing logs table for all content types
CREATE TABLE processing_logs (
  id BIGSERIAL PRIMARY KEY,
  operation_type VARCHAR(50) NOT NULL, -- 'rss_poll', 'embedding_generation', 'context_refresh', etc.
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

-- Feed item tracking to prevent duplicates
CREATE TABLE feed_item_tracking (
  id BIGSERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES rss_feed_sources(id),
  external_id TEXT NOT NULL, -- ID from the RSS feed
  guid TEXT, -- RSS GUID
  url TEXT, -- Item URL
  title TEXT NOT NULL,
  published_date TIMESTAMP WITH TIME ZONE,
  content_hash TEXT, -- SHA256 hash of content for deduplication
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

-- Queue for embedding generation tasks
CREATE TABLE embedding_queue (
  id BIGSERIAL PRIMARY KEY,
  content_type VARCHAR(20) NOT NULL, -- 'bill', 'executive_action'
  content_id TEXT NOT NULL, -- ID of the content (bills.id or executive_actions.id)
  embedding_type VARCHAR(20) NOT NULL, -- 'title', 'summary', 'content'
  text_content TEXT NOT NULL,
  priority INTEGER DEFAULT 5, -- 1 = highest, 10 = lowest
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

COMMIT;