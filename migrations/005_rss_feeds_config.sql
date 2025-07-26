-- =====================================================================
-- Migration 005: RSS Feeds Configuration and Processing
-- Description: Create RSS feed configuration and processing tables
-- Dependencies: Requires all previous migrations
-- =====================================================================

BEGIN;

-- =====================================================================
-- RSS FEED SOURCE CONFIGURATION
-- =====================================================================

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

-- Create indexes for RSS feed sources
CREATE INDEX idx_rss_feed_sources_enabled ON rss_feed_sources(enabled) WHERE enabled = true;
CREATE INDEX idx_rss_feed_sources_type ON rss_feed_sources(feed_type);
CREATE INDEX idx_rss_feed_sources_chamber ON rss_feed_sources(chamber);
CREATE INDEX idx_rss_feed_sources_last_poll ON rss_feed_sources(last_polled_at);

-- =====================================================================
-- PROCESSING LOGS AND TRACKING
-- =====================================================================

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

-- Indexes for processing logs
CREATE INDEX idx_processing_logs_operation ON processing_logs(operation_type);
CREATE INDEX idx_processing_logs_status ON processing_logs(status);
CREATE INDEX idx_processing_logs_started_at ON processing_logs(started_at DESC);
CREATE INDEX idx_processing_logs_source ON processing_logs(source_id);
CREATE INDEX idx_processing_logs_batch ON processing_logs(batch_id);

-- =====================================================================
-- FEED ITEM DEDUPLICATION
-- =====================================================================

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

-- Indexes for feed item tracking
CREATE INDEX idx_feed_item_tracking_source ON feed_item_tracking(source_id);
CREATE INDEX idx_feed_item_tracking_status ON feed_item_tracking(processing_status);
CREATE INDEX idx_feed_item_tracking_hash ON feed_item_tracking(content_hash);
CREATE INDEX idx_feed_item_tracking_published ON feed_item_tracking(published_date DESC);

-- =====================================================================
-- EMBEDDING GENERATION QUEUE
-- =====================================================================

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

-- Indexes for embedding queue
CREATE INDEX idx_embedding_queue_status ON embedding_queue(status);
CREATE INDEX idx_embedding_queue_priority ON embedding_queue(priority, created_at);
CREATE INDEX idx_embedding_queue_content ON embedding_queue(content_type, content_id);
CREATE INDEX idx_embedding_queue_attempts ON embedding_queue(attempts) WHERE status = 'failed';

-- =====================================================================
-- RSS FEED CONFIGURATION DATA
-- =====================================================================

-- Insert default RSS feed sources
INSERT INTO rss_feed_sources (name, url, feed_type, chamber, polling_frequency, configuration) VALUES
-- Congressional Bills
('House Bills RSS', 'https://www.govinfo.gov/rss/billstatus-hr.xml', 'house_bills', 'house', INTERVAL '2 hours', 
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'hr')),

('Senate Bills RSS', 'https://www.govinfo.gov/rss/billstatus-s.xml', 'senate_bills', 'senate', INTERVAL '2 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 's')),

('House Joint Resolutions', 'https://www.govinfo.gov/rss/billstatus-hjres.xml', 'house_bills', 'house', INTERVAL '4 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'hjres')),

('Senate Joint Resolutions', 'https://www.govinfo.gov/rss/billstatus-sjres.xml', 'senate_bills', 'senate', INTERVAL '4 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'sjres')),

-- Executive Actions
('Federal Register Executive Orders', 
 'https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=executive_order',
 'executive_orders', 'executive', INTERVAL '3 hours',
 jsonb_build_object('format', 'json', 'parser', 'federal_register', 'document_type', 'executive_order')),

('Federal Register Presidential Memoranda',
 'https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=presidential_memorandum',
 'presidential_memoranda', 'executive', INTERVAL '3 hours',
 jsonb_build_object('format', 'json', 'parser', 'federal_register', 'document_type', 'presidential_memorandum')),

('White House Presidential Actions',
 'https://www.whitehouse.gov/briefing-room/presidential-actions/feed/',
 'white_house_actions', 'executive', INTERVAL '1 hour',
 jsonb_build_object('format', 'rss', 'parser', 'white_house', 'content_type', 'presidential_actions'));

-- =====================================================================
-- RSS PROCESSING FUNCTIONS
-- =====================================================================

-- Function to get next RSS feed to poll
CREATE OR REPLACE FUNCTION get_next_feed_to_poll()
RETURNS TABLE (
  feed_id INTEGER,
  feed_name TEXT,
  feed_url TEXT,
  feed_type TEXT,
  last_polled_at TIMESTAMP WITH TIME ZONE,
  polling_frequency INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rfs.id as feed_id,
    rfs.name as feed_name,
    rfs.url as feed_url,
    rfs.feed_type,
    rfs.last_polled_at,
    rfs.polling_frequency
  FROM rss_feed_sources rfs
  WHERE 
    rfs.enabled = true
    AND rfs.error_count < rfs.max_error_count
    AND (
      rfs.last_polled_at IS NULL 
      OR rfs.last_polled_at + rfs.polling_frequency <= NOW()
    )
  ORDER BY 
    COALESCE(rfs.last_polled_at, '1970-01-01'::TIMESTAMP WITH TIME ZONE) ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to mark feed as polled
CREATE OR REPLACE FUNCTION mark_feed_polled(
  p_feed_id INTEGER,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_items_processed INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  IF p_success THEN
    UPDATE rss_feed_sources 
    SET 
      last_polled_at = NOW(),
      last_successful_poll = NOW(),
      error_count = 0,
      updated_at = NOW()
    WHERE id = p_feed_id;
  ELSE
    UPDATE rss_feed_sources 
    SET 
      last_polled_at = NOW(),
      error_count = error_count + 1,
      updated_at = NOW()
    WHERE id = p_feed_id;
  END IF;
  
  -- Log the polling operation
  INSERT INTO processing_logs (
    operation_type, source_id, status, completed_at, error_message, processing_stats
  ) VALUES (
    'rss_poll',
    p_feed_id,
    CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    NOW(),
    p_error_message,
    jsonb_build_object('items_processed', p_items_processed)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check for duplicate content
CREATE OR REPLACE FUNCTION is_duplicate_content(
  p_source_id INTEGER,
  p_external_id TEXT,
  p_guid TEXT,
  p_content_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM feed_item_tracking
  WHERE 
    source_id = p_source_id 
    AND (
      external_id = p_external_id
      OR guid = p_guid
      OR content_hash = p_content_hash
    );
    
  RETURN existing_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to track feed item
CREATE OR REPLACE FUNCTION track_feed_item(
  p_source_id INTEGER,
  p_external_id TEXT,
  p_guid TEXT,
  p_url TEXT,
  p_title TEXT,
  p_published_date TIMESTAMP WITH TIME ZONE,
  p_content_hash TEXT,
  p_bill_id BIGINT DEFAULT NULL,
  p_executive_action_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  tracking_id BIGINT;
BEGIN
  INSERT INTO feed_item_tracking (
    source_id, external_id, guid, url, title, published_date, content_hash,
    bill_id, executive_action_id, processing_status
  ) VALUES (
    p_source_id, p_external_id, p_guid, p_url, p_title, p_published_date, p_content_hash,
    p_bill_id, p_executive_action_id, 'processed'
  )
  RETURNING id INTO tracking_id;
  
  RETURN tracking_id;
END;
$$ LANGUAGE plpgsql;

-- Function to queue embedding generation
CREATE OR REPLACE FUNCTION queue_embedding_generation(
  p_content_type TEXT,
  p_content_id TEXT,
  p_embedding_type TEXT,
  p_text_content TEXT,
  p_priority INTEGER DEFAULT 5
)
RETURNS BIGINT AS $$
DECLARE
  queue_id BIGINT;
BEGIN
  INSERT INTO embedding_queue (
    content_type, content_id, embedding_type, text_content, priority
  ) VALUES (
    p_content_type, p_content_id, p_embedding_type, p_text_content, p_priority
  )
  ON CONFLICT (content_type, content_id, embedding_type) 
  DO UPDATE SET
    text_content = EXCLUDED.text_content,
    priority = LEAST(embedding_queue.priority, EXCLUDED.priority),
    status = 'pending',
    attempts = 0,
    error_message = NULL,
    created_at = NOW()
  RETURNING id INTO queue_id;
  
  RETURN queue_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get next embedding task
CREATE OR REPLACE FUNCTION get_next_embedding_task()
RETURNS TABLE (
  queue_id BIGINT,
  content_type TEXT,
  content_id TEXT,
  embedding_type TEXT,
  text_content TEXT
) AS $$
BEGIN
  RETURN QUERY
  UPDATE embedding_queue 
  SET 
    status = 'processing',
    started_at = NOW(),
    attempts = attempts + 1
  WHERE id = (
    SELECT eq.id
    FROM embedding_queue eq
    WHERE 
      eq.status = 'pending' 
      AND eq.attempts < eq.max_attempts
    ORDER BY eq.priority ASC, eq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    embedding_queue.id as queue_id,
    embedding_queue.content_type,
    embedding_queue.content_id,
    embedding_queue.embedding_type,
    embedding_queue.text_content;
END;
$$ LANGUAGE plpgsql;

-- Function to complete embedding task
CREATE OR REPLACE FUNCTION complete_embedding_task(
  p_queue_id BIGINT,
  p_success BOOLEAN,
  p_embedding VECTOR(1024) DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  task_record RECORD;
BEGIN
  -- Get task details
  SELECT content_type, content_id, embedding_type 
  INTO task_record
  FROM embedding_queue 
  WHERE id = p_queue_id;
  
  IF p_success AND p_embedding IS NOT NULL THEN
    -- Update the embedding queue
    UPDATE embedding_queue 
    SET 
      status = 'completed',
      completed_at = NOW(),
      embedding_result = p_embedding,
      error_message = NULL
    WHERE id = p_queue_id;
    
    -- Update the actual content table
    IF task_record.content_type = 'bill' THEN
      IF task_record.embedding_type = 'title' THEN
        UPDATE bills SET title_embedding = p_embedding WHERE id = task_record.content_id::BIGINT;
      ELSIF task_record.embedding_type = 'summary' THEN
        UPDATE bills SET summary_embedding = p_embedding WHERE id = task_record.content_id::BIGINT;
      ELSIF task_record.embedding_type = 'content' THEN
        UPDATE bills SET content_embedding = p_embedding WHERE id = task_record.content_id::BIGINT;
      END IF;
    ELSIF task_record.content_type = 'executive_action' THEN
      IF task_record.embedding_type = 'title' THEN
        UPDATE executive_actions SET title_embedding = p_embedding WHERE id = task_record.content_id::UUID;
      ELSIF task_record.embedding_type = 'summary' THEN
        UPDATE executive_actions SET summary_embedding = p_embedding WHERE id = task_record.content_id::UUID;
      ELSIF task_record.embedding_type = 'content' THEN
        UPDATE executive_actions SET content_embedding = p_embedding WHERE id = task_record.content_id::UUID;
      END IF;
    END IF;
  ELSE
    -- Mark as failed
    UPDATE embedding_queue 
    SET 
      status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      error_message = p_error_message
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get RSS processing statistics
CREATE OR REPLACE FUNCTION get_rss_processing_stats()
RETURNS TABLE (
  feed_name TEXT,
  feed_type TEXT,
  enabled BOOLEAN,
  last_successful_poll TIMESTAMP WITH TIME ZONE,
  error_count INTEGER,
  items_tracked BIGINT,
  items_processed BIGINT,
  pending_embeddings BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rfs.name as feed_name,
    rfs.feed_type,
    rfs.enabled,
    rfs.last_successful_poll,
    rfs.error_count,
    COALESCE(fit_counts.tracked_count, 0) as items_tracked,
    COALESCE(fit_counts.processed_count, 0) as items_processed,
    COALESCE(eq_counts.pending_count, 0) as pending_embeddings
  FROM rss_feed_sources rfs
  LEFT JOIN (
    SELECT 
      source_id,
      COUNT(*) as tracked_count,
      COUNT(*) FILTER (WHERE processing_status = 'processed') as processed_count
    FROM feed_item_tracking
    GROUP BY source_id
  ) fit_counts ON rfs.id = fit_counts.source_id
  LEFT JOIN (
    SELECT 
      source_id,
      COUNT(*) as pending_count
    FROM embedding_queue eq
    JOIN processing_logs pl ON eq.content_id::TEXT = pl.bill_id::TEXT OR eq.content_id::TEXT = pl.executive_action_id::TEXT
    WHERE eq.status IN ('pending', 'processing')
    GROUP BY source_id
  ) eq_counts ON rfs.id = eq_counts.source_id
  ORDER BY rfs.name;
END;
$$ LANGUAGE plpgsql;

COMMIT;