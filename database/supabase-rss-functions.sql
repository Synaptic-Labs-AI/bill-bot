-- =====================================================================
-- RSS PROCESSING AND QUEUE MANAGEMENT FUNCTIONS
-- =====================================================================
-- Functions for RSS feed processing, deduplication, and content tracking
-- =====================================================================

BEGIN;

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

-- =====================================================================
-- FEED MANAGEMENT FUNCTIONS
-- =====================================================================

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

-- Function to enable/disable RSS feeds
CREATE OR REPLACE FUNCTION toggle_rss_feed(
  p_feed_id INTEGER,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE rss_feed_sources 
  SET 
    enabled = p_enabled,
    updated_at = NOW(),
    error_count = CASE WHEN p_enabled THEN 0 ELSE error_count END
  WHERE id = p_feed_id;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Log the change
  INSERT INTO processing_logs (
    operation_type, source_id, status, processing_stats
  ) VALUES (
    'feed_toggle',
    p_feed_id,
    'completed',
    jsonb_build_object('enabled', p_enabled, 'updated_count', updated_count)
  );
  
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to reset feed error count
CREATE OR REPLACE FUNCTION reset_feed_errors(
  p_feed_id INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  IF p_feed_id IS NOT NULL THEN
    UPDATE rss_feed_sources 
    SET 
      error_count = 0,
      updated_at = NOW()
    WHERE id = p_feed_id;
  ELSE
    UPDATE rss_feed_sources 
    SET 
      error_count = 0,
      updated_at = NOW()
    WHERE error_count > 0;
  END IF;
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  -- Log the reset
  INSERT INTO processing_logs (
    operation_type, source_id, status, processing_stats
  ) VALUES (
    'feed_error_reset',
    p_feed_id,
    'completed',
    jsonb_build_object('feeds_reset', reset_count)
  );
  
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CONTENT DEDUPLICATION FUNCTIONS
-- =====================================================================

-- Function to find potential duplicate bills
CREATE OR REPLACE FUNCTION find_duplicate_bills(
  p_title TEXT,
  p_bill_number TEXT DEFAULT NULL,
  p_similarity_threshold FLOAT DEFAULT 0.85
)
RETURNS TABLE (
  id BIGINT,
  bill_number TEXT,
  title TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.bill_number,
    b.title,
    similarity(b.title, p_title) as similarity_score
  FROM bills b
  WHERE 
    (p_bill_number IS NULL OR b.bill_number != p_bill_number)
    AND (
      similarity(b.title, p_title) >= p_similarity_threshold
      OR b.bill_number = p_bill_number
    )
  ORDER BY similarity_score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to find potential duplicate executive actions
CREATE OR REPLACE FUNCTION find_duplicate_executive_actions(
  p_title TEXT,
  p_executive_order_number INTEGER DEFAULT NULL,
  p_similarity_threshold FLOAT DEFAULT 0.85
)
RETURNS TABLE (
  id UUID,
  executive_order_number INTEGER,
  title TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ea.id,
    ea.executive_order_number,
    ea.title,
    similarity(ea.title, p_title) as similarity_score
  FROM executive_actions ea
  WHERE 
    (p_executive_order_number IS NULL OR ea.executive_order_number != p_executive_order_number)
    AND (
      similarity(ea.title, p_title) >= p_similarity_threshold
      OR ea.executive_order_number = p_executive_order_number
    )
  ORDER BY similarity_score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- PROCESSING ANALYTICS FUNCTIONS
-- =====================================================================

-- Function to get processing performance metrics
CREATE OR REPLACE FUNCTION get_processing_performance()
RETURNS TABLE (
  operation_type TEXT,
  total_operations BIGINT,
  successful_operations BIGINT,
  failed_operations BIGINT,
  success_rate DECIMAL(5,2),
  avg_duration_seconds DECIMAL(8,2),
  latest_operation TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pl.operation_type,
    COUNT(*) as total_operations,
    COUNT(*) FILTER (WHERE pl.status = 'completed') as successful_operations,
    COUNT(*) FILTER (WHERE pl.status = 'failed') as failed_operations,
    ROUND(
      (COUNT(*) FILTER (WHERE pl.status = 'completed')::DECIMAL / COUNT(*)) * 100, 
      2
    ) as success_rate,
    AVG(
      EXTRACT(EPOCH FROM (pl.completed_at - pl.started_at))
    ) as avg_duration_seconds,
    MAX(pl.started_at) as latest_operation
  FROM processing_logs pl
  WHERE pl.started_at >= NOW() - INTERVAL '7 days'
  GROUP BY pl.operation_type
  ORDER BY total_operations DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get feed health status
CREATE OR REPLACE FUNCTION get_feed_health_status()
RETURNS TABLE (
  feed_name TEXT,
  feed_type TEXT,
  health_status TEXT,
  last_successful_poll TIMESTAMP WITH TIME ZONE,
  hours_since_success DECIMAL(6,2),
  error_count INTEGER,
  items_processed_24h BIGINT,
  recommendations TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rfs.name as feed_name,
    rfs.feed_type,
    CASE 
      WHEN NOT rfs.enabled THEN 'disabled'
      WHEN rfs.error_count >= rfs.max_error_count THEN 'critical'
      WHEN rfs.last_successful_poll IS NULL THEN 'never_polled'
      WHEN rfs.last_successful_poll < NOW() - rfs.polling_frequency * 3 THEN 'stale'
      WHEN rfs.error_count > 0 THEN 'warning'
      ELSE 'healthy'
    END as health_status,
    rfs.last_successful_poll,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(rfs.last_successful_poll, NOW()))) / 3600 as hours_since_success,
    rfs.error_count,
    COALESCE(recent_items.count_24h, 0) as items_processed_24h,
    CASE 
      WHEN NOT rfs.enabled THEN ARRAY['Enable feed to resume processing']
      WHEN rfs.error_count >= rfs.max_error_count THEN ARRAY['Check feed URL and configuration', 'Reset error count if issues are resolved']
      WHEN rfs.last_successful_poll IS NULL THEN ARRAY['Investigate why feed has never been successfully polled']
      WHEN rfs.last_successful_poll < NOW() - rfs.polling_frequency * 3 THEN ARRAY['Check feed polling service', 'Verify feed URL is accessible']
      WHEN rfs.error_count > 0 THEN ARRAY['Monitor for recurring errors', 'Consider adjusting polling frequency']
      ELSE ARRAY['Feed is operating normally']
    END as recommendations
  FROM rss_feed_sources rfs
  LEFT JOIN (
    SELECT 
      fit.source_id,
      COUNT(*) as count_24h
    FROM feed_item_tracking fit
    WHERE fit.created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY fit.source_id
  ) recent_items ON rfs.id = recent_items.source_id
  ORDER BY 
    CASE 
      WHEN NOT rfs.enabled THEN 1
      WHEN rfs.error_count >= rfs.max_error_count THEN 2
      WHEN rfs.last_successful_poll IS NULL THEN 3
      WHEN rfs.last_successful_poll < NOW() - rfs.polling_frequency * 3 THEN 4
      WHEN rfs.error_count > 0 THEN 5
      ELSE 6
    END,
    rfs.name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CLEANUP AND MAINTENANCE FUNCTIONS
-- =====================================================================

-- Function to clean up old processing logs
CREATE OR REPLACE FUNCTION cleanup_processing_logs(
  p_keep_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processing_logs
  WHERE 
    started_at < NOW() - (p_keep_days || ' days')::INTERVAL
    AND operation_type NOT IN ('system_startup', 'critical_error');
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO processing_logs (
    operation_type, status, processing_stats
  ) VALUES (
    'log_cleanup',
    'completed',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'retention_days', p_keep_days
    )
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old feed item tracking
CREATE OR REPLACE FUNCTION cleanup_feed_tracking(
  p_keep_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM feed_item_tracking
  WHERE 
    created_at < NOW() - (p_keep_days || ' days')::INTERVAL
    AND processing_status = 'processed';
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO processing_logs (
    operation_type, status, processing_stats
  ) VALUES (
    'feed_tracking_cleanup',
    'completed',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'retention_days', p_keep_days
    )
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- BATCH PROCESSING FUNCTIONS
-- =====================================================================

-- Function to process a batch of feed items
CREATE OR REPLACE FUNCTION process_feed_batch(
  p_source_id INTEGER,
  p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
  item JSONB;
  processed_count INTEGER := 0;
  duplicate_count INTEGER := 0;
  error_count INTEGER := 0;
  processing_errors TEXT[] := '{}';
  tracking_id BIGINT;
  content_hash TEXT;
BEGIN
  -- Process each item in the batch
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      -- Generate content hash
      content_hash := md5(COALESCE(item->>'title', '') || COALESCE(item->>'content', ''));
      
      -- Check for duplicates
      IF is_duplicate_content(
        p_source_id,
        item->>'external_id',
        item->>'guid',
        content_hash
      ) THEN
        duplicate_count := duplicate_count + 1;
        CONTINUE;
      END IF;
      
      -- Track the item
      tracking_id := track_feed_item(
        p_source_id,
        item->>'external_id',
        item->>'guid',
        item->>'url',
        item->>'title',
        (item->>'published_date')::TIMESTAMP WITH TIME ZONE,
        content_hash,
        CASE WHEN item ? 'bill_id' THEN (item->>'bill_id')::BIGINT ELSE NULL END,
        CASE WHEN item ? 'executive_action_id' THEN (item->>'executive_action_id')::UUID ELSE NULL END
      );
      
      processed_count := processed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      processing_errors := processing_errors || SQLERRM;
    END;
  END LOOP;
  
  -- Log the batch processing
  INSERT INTO processing_logs (
    operation_type, source_id, status, processing_stats
  ) VALUES (
    'feed_batch_process',
    p_source_id,
    CASE WHEN error_count = 0 THEN 'completed' ELSE 'completed_with_errors' END,
    jsonb_build_object(
      'total_items', jsonb_array_length(p_items),
      'processed_count', processed_count,
      'duplicate_count', duplicate_count,
      'error_count', error_count,
      'errors', processing_errors
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', processed_count,
    'duplicate_count', duplicate_count,
    'error_count', error_count,
    'total_items', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql;

COMMIT;