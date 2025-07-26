-- =====================================================================
-- COMPREHENSIVE INDEXING STRATEGY FOR BILL BOT DATABASE
-- =====================================================================
-- This script creates all indexes for optimal performance including:
-- - Vector indexes for semantic search
-- - Full-text search indexes  
-- - B-tree indexes for filtering and sorting
-- - JSONB indexes for metadata queries
-- =====================================================================

BEGIN;

-- =====================================================================
-- VECTOR INDEXES FOR SEMANTIC SEARCH
-- =====================================================================

-- Primary vector similarity indexes using IVFFlat
-- Optimized for Cohere embed-english-v3.0 embeddings (1024 dimensions)

-- BILLS VECTOR INDEXES
-- Title embeddings index (most frequently used)
CREATE INDEX bills_title_embedding_idx ON bills 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Summary embeddings index
CREATE INDEX bills_summary_embedding_idx ON bills 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Content embeddings index (larger vectors, fewer lists)
CREATE INDEX bills_content_embedding_idx ON bills 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 50);

-- EXECUTIVE ACTIONS VECTOR INDEXES
CREATE INDEX executive_actions_title_embedding_idx ON executive_actions 
USING ivfflat (title_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_summary_embedding_idx ON executive_actions 
USING ivfflat (summary_embedding vector_cosine_ops) 
WITH (lists = 50);

CREATE INDEX executive_actions_content_embedding_idx ON executive_actions 
USING ivfflat (content_embedding vector_cosine_ops) 
WITH (lists = 25);

-- =====================================================================
-- FULL-TEXT SEARCH INDEXES (GIN)
-- =====================================================================

-- Bills full-text search indexes
CREATE INDEX bills_search_vector_idx ON bills USING GIN(search_vector);
CREATE INDEX bills_title_text_idx ON bills USING GIN(to_tsvector('english', title));
CREATE INDEX bills_summary_text_idx ON bills USING GIN(to_tsvector('english', summary));

-- Executive Actions full-text search indexes
CREATE INDEX executive_actions_search_vector_idx ON executive_actions USING GIN(search_vector);
CREATE INDEX executive_actions_title_text_idx ON executive_actions USING GIN(to_tsvector('english', title));
CREATE INDEX executive_actions_summary_text_idx ON executive_actions USING GIN(to_tsvector('english', summary));

-- =====================================================================
-- B-TREE INDEXES FOR FILTERING AND SORTING
-- =====================================================================

-- BILLS INDEXES
-- Single column indexes
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

-- EXECUTIVE ACTIONS INDEXES
CREATE INDEX executive_actions_number_idx ON executive_actions (executive_order_number);
CREATE INDEX executive_actions_type_idx ON executive_actions (action_type);
CREATE INDEX executive_actions_administration_idx ON executive_actions (administration);
CREATE INDEX executive_actions_signed_date_idx ON executive_actions (signed_date DESC);
CREATE INDEX executive_actions_status_idx ON executive_actions (status);
CREATE INDEX executive_actions_president_idx ON executive_actions (president_name);

-- Executive Actions composite indexes
CREATE INDEX executive_actions_admin_type_idx ON executive_actions (administration, action_type);
CREATE INDEX executive_actions_date_status_idx ON executive_actions (signed_date DESC, status);
CREATE INDEX executive_actions_current_idx ON executive_actions (is_current, signed_date DESC) 
WHERE is_current = true;

-- Executive Action related table indexes
CREATE INDEX executive_action_topics_primary_idx ON executive_action_topics (primary_topic);
CREATE INDEX executive_action_agencies_name_idx ON executive_action_agencies (agency_name);
CREATE INDEX executive_action_agencies_code_idx ON executive_action_agencies (agency_code);

-- =====================================================================
-- JSONB INDEXES FOR METADATA QUERIES
-- =====================================================================

-- JSONB indexes for metadata queries
CREATE INDEX bills_actions_gin_idx ON bills USING GIN(actions);
CREATE INDEX bills_cosponsors_gin_idx ON bills USING GIN(cosponsors);
CREATE INDEX bills_processing_metadata_gin_idx ON bills USING GIN(processing_metadata);

-- Specific JSONB path indexes for common queries
CREATE INDEX bills_action_dates_idx ON bills USING GIN((actions -> 'date'));
CREATE INDEX bills_sponsor_party_idx ON bills USING GIN((processing_metadata -> 'sponsor_party'));

-- Array indexes for executive actions metadata
CREATE INDEX executive_actions_agencies_gin_idx ON executive_actions USING GIN(agencies_affected);
CREATE INDEX executive_actions_policy_areas_gin_idx ON executive_actions USING GIN(policy_areas);
CREATE INDEX executive_actions_keywords_gin_idx ON executive_actions USING GIN(keywords);

-- =====================================================================
-- RSS FEED AND PROCESSING INDEXES
-- =====================================================================

-- RSS feed sources indexes
CREATE INDEX rss_feed_sources_enabled_idx ON rss_feed_sources(enabled) WHERE enabled = true;
CREATE INDEX rss_feed_sources_type_idx ON rss_feed_sources(feed_type);
CREATE INDEX rss_feed_sources_chamber_idx ON rss_feed_sources(chamber);
CREATE INDEX rss_feed_sources_last_poll_idx ON rss_feed_sources(last_polled_at);

-- Processing logs indexes
CREATE INDEX processing_logs_operation_idx ON processing_logs(operation_type);
CREATE INDEX processing_logs_status_idx ON processing_logs(status);
CREATE INDEX processing_logs_started_at_idx ON processing_logs(started_at DESC);
CREATE INDEX processing_logs_source_idx ON processing_logs(source_id);
CREATE INDEX processing_logs_batch_idx ON processing_logs(batch_id);

-- Feed item tracking indexes
CREATE INDEX feed_item_tracking_source_idx ON feed_item_tracking(source_id);
CREATE INDEX feed_item_tracking_status_idx ON feed_item_tracking(processing_status);
CREATE INDEX feed_item_tracking_hash_idx ON feed_item_tracking(content_hash);
CREATE INDEX feed_item_tracking_published_idx ON feed_item_tracking(published_date DESC);

-- Embedding queue indexes
CREATE INDEX embedding_queue_status_idx ON embedding_queue(status);
CREATE INDEX embedding_queue_priority_idx ON embedding_queue(priority, created_at);
CREATE INDEX embedding_queue_content_idx ON embedding_queue(content_type, content_id);
CREATE INDEX embedding_queue_attempts_idx ON embedding_queue(attempts) WHERE status = 'failed';

-- =====================================================================
-- SIMILARITY SEARCH INDEXES (for fuzzy matching)
-- =====================================================================

-- Create trigram indexes for similarity search
CREATE INDEX bills_sponsor_trgm_idx ON bills USING GIN(sponsor gin_trgm_ops);
CREATE INDEX bill_topics_name_trgm_idx ON bill_topics USING GIN(name gin_trgm_ops);
CREATE INDEX executive_actions_president_trgm_idx ON executive_actions USING GIN(president_name gin_trgm_ops);
CREATE INDEX executive_action_agencies_name_trgm_idx ON executive_action_agencies USING GIN(agency_name gin_trgm_ops);

COMMIT;