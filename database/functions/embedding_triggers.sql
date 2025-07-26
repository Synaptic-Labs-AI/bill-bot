-- =====================================================================
-- Embedding Trigger Functions
-- Description: Functions and triggers for automatic embedding generation
-- Dependencies: Requires all migrations and RSS feed tables
-- =====================================================================

-- =====================================================================
-- EMBEDDING GENERATION HELPER FUNCTIONS
-- =====================================================================

-- Function to prepare text for embedding generation
CREATE OR REPLACE FUNCTION prepare_embedding_text(
  content_type TEXT,
  content_id TEXT,
  embedding_type TEXT
)
RETURNS TEXT AS $$
DECLARE
  result_text TEXT;
  bill_record RECORD;
  action_record RECORD;
BEGIN
  IF content_type = 'bill' THEN
    SELECT title, summary, full_text, sponsor, committee
    INTO bill_record
    FROM bills
    WHERE id = content_id::BIGINT;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    CASE embedding_type
      WHEN 'title' THEN
        result_text := bill_record.title;
      WHEN 'summary' THEN
        result_text := COALESCE(bill_record.summary, bill_record.title);
      WHEN 'content' THEN
        result_text := CONCAT_WS(' | ',
          bill_record.title,
          COALESCE(bill_record.summary, ''),
          COALESCE(bill_record.sponsor, ''),
          COALESCE(bill_record.committee, ''),
          COALESCE(LEFT(bill_record.full_text, 2000), '')
        );
      ELSE
        result_text := bill_record.title;
    END CASE;
    
  ELSIF content_type = 'executive_action' THEN
    SELECT title, summary, full_text, president_name, administration, action_type
    INTO action_record
    FROM executive_actions
    WHERE id = content_id::UUID;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    CASE embedding_type
      WHEN 'title' THEN
        result_text := action_record.title;
      WHEN 'summary' THEN
        result_text := COALESCE(action_record.summary, action_record.title);
      WHEN 'content' THEN
        result_text := CONCAT_WS(' | ',
          action_record.title,
          COALESCE(action_record.summary, ''),
          action_record.president_name,
          action_record.administration,
          action_record.action_type::TEXT,
          COALESCE(LEFT(action_record.full_text, 2000), '')
        );
      ELSE
        result_text := action_record.title;
    END CASE;
    
  ELSE
    RETURN NULL;
  END IF;
  
  -- Clean and prepare text
  result_text := TRIM(result_text);
  result_text := REGEXP_REPLACE(result_text, '\s+', ' ', 'g'); -- Normalize whitespace
  result_text := REGEXP_REPLACE(result_text, '[^\w\s\-\.\,\;\:\!\?\(\)]', '', 'g'); -- Remove special chars
  
  RETURN CASE WHEN LENGTH(result_text) > 0 THEN result_text ELSE NULL END;
END;
$$ LANGUAGE plpgsql;

-- Function to queue embedding generation with intelligent prioritization
CREATE OR REPLACE FUNCTION smart_queue_embedding(
  p_content_type TEXT,
  p_content_id TEXT,
  p_embedding_type TEXT,
  p_priority INTEGER DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  text_content TEXT;
  calculated_priority INTEGER;
  queue_id BIGINT;
BEGIN
  -- Prepare text content
  text_content := prepare_embedding_text(p_content_type, p_content_id, p_embedding_type);
  
  IF text_content IS NULL OR LENGTH(text_content) < 10 THEN
    RETURN NULL; -- Skip embedding for insufficient content
  END IF;
  
  -- Calculate priority if not provided
  IF p_priority IS NULL THEN
    calculated_priority := CASE 
      WHEN p_embedding_type = 'title' THEN 2 -- High priority for title embeddings
      WHEN p_embedding_type = 'summary' THEN 3 -- Medium-high priority for summaries
      WHEN p_embedding_type = 'content' THEN 5 -- Medium priority for full content
      ELSE 7 -- Lower priority for other types
    END;
    
    -- Boost priority for recent content
    IF p_content_type = 'bill' THEN
      calculated_priority := calculated_priority - 
        CASE 
          WHEN (SELECT introduced_date FROM bills WHERE id = p_content_id::BIGINT) >= CURRENT_DATE - INTERVAL '30 days' THEN 1
          WHEN (SELECT introduced_date FROM bills WHERE id = p_content_id::BIGINT) >= CURRENT_DATE - INTERVAL '90 days' THEN 0
          ELSE 1
        END;
    ELSIF p_content_type = 'executive_action' THEN
      calculated_priority := calculated_priority - 
        CASE 
          WHEN (SELECT signed_date FROM executive_actions WHERE id = p_content_id::UUID) >= CURRENT_DATE - INTERVAL '30 days' THEN 1
          WHEN (SELECT signed_date FROM executive_actions WHERE id = p_content_id::UUID) >= CURRENT_DATE - INTERVAL '90 days' THEN 0
          ELSE 1
        END;
    END IF;
  ELSE
    calculated_priority := p_priority;
  END IF;
  
  -- Queue the embedding generation
  queue_id := queue_embedding_generation(
    p_content_type,
    p_content_id,
    p_embedding_type,
    text_content,
    calculated_priority
  );
  
  RETURN queue_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC EMBEDDING GENERATION
-- =====================================================================

-- Trigger function for bills
CREATE OR REPLACE FUNCTION trigger_bill_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  should_generate_title BOOLEAN := false;
  should_generate_summary BOOLEAN := false;
  should_generate_content BOOLEAN := false;
BEGIN
  -- Determine what embeddings need to be generated
  IF TG_OP = 'INSERT' THEN
    should_generate_title := NEW.title IS NOT NULL;
    should_generate_summary := NEW.summary IS NOT NULL;
    should_generate_content := NEW.full_text IS NOT NULL OR NEW.summary IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    should_generate_title := OLD.title IS DISTINCT FROM NEW.title AND NEW.title IS NOT NULL;
    should_generate_summary := OLD.summary IS DISTINCT FROM NEW.summary AND NEW.summary IS NOT NULL;
    should_generate_content := (
      OLD.title IS DISTINCT FROM NEW.title OR
      OLD.summary IS DISTINCT FROM NEW.summary OR
      OLD.full_text IS DISTINCT FROM NEW.full_text
    ) AND (NEW.full_text IS NOT NULL OR NEW.summary IS NOT NULL);
  END IF;
  
  -- Queue embedding generation tasks
  IF should_generate_title THEN
    PERFORM smart_queue_embedding('bill', NEW.id::TEXT, 'title', 2);
  END IF;
  
  IF should_generate_summary THEN
    PERFORM smart_queue_embedding('bill', NEW.id::TEXT, 'summary', 3);
  END IF;
  
  IF should_generate_content THEN
    PERFORM smart_queue_embedding('bill', NEW.id::TEXT, 'content', 5);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for executive actions
CREATE OR REPLACE FUNCTION trigger_executive_action_embedding_generation()
RETURNS TRIGGER AS $$
DECLARE
  should_generate_title BOOLEAN := false;
  should_generate_summary BOOLEAN := false;
  should_generate_content BOOLEAN := false;
BEGIN
  -- Determine what embeddings need to be generated
  IF TG_OP = 'INSERT' THEN
    should_generate_title := NEW.title IS NOT NULL;
    should_generate_summary := NEW.summary IS NOT NULL;
    should_generate_content := NEW.full_text IS NOT NULL OR NEW.summary IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    should_generate_title := OLD.title IS DISTINCT FROM NEW.title AND NEW.title IS NOT NULL;
    should_generate_summary := OLD.summary IS DISTINCT FROM NEW.summary AND NEW.summary IS NOT NULL;
    should_generate_content := (
      OLD.title IS DISTINCT FROM NEW.title OR
      OLD.summary IS DISTINCT FROM NEW.summary OR
      OLD.full_text IS DISTINCT FROM NEW.full_text
    ) AND (NEW.full_text IS NOT NULL OR NEW.summary IS NOT NULL);
  END IF;
  
  -- Queue embedding generation tasks
  IF should_generate_title THEN
    PERFORM smart_queue_embedding('executive_action', NEW.id::TEXT, 'title', 2);
  END IF;
  
  IF should_generate_summary THEN
    PERFORM smart_queue_embedding('executive_action', NEW.id::TEXT, 'summary', 3);
  END IF;
  
  IF should_generate_content THEN
    PERFORM smart_queue_embedding('executive_action', NEW.id::TEXT, 'content', 5);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CREATE TRIGGERS
-- =====================================================================

-- Create triggers for automatic embedding generation
DROP TRIGGER IF EXISTS trigger_bill_embeddings ON bills;
CREATE TRIGGER trigger_bill_embeddings
  AFTER INSERT OR UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION trigger_bill_embedding_generation();

DROP TRIGGER IF EXISTS trigger_executive_action_embeddings ON executive_actions;
CREATE TRIGGER trigger_executive_action_embeddings
  AFTER INSERT OR UPDATE ON executive_actions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_executive_action_embedding_generation();

-- =====================================================================
-- BATCH EMBEDDING GENERATION FUNCTIONS
-- =====================================================================

-- Function to generate embeddings for existing content in batches
CREATE OR REPLACE FUNCTION batch_generate_missing_embeddings(
  p_content_type TEXT DEFAULT 'both', -- 'bills', 'executive_actions', 'both'
  p_embedding_type TEXT DEFAULT 'all', -- 'title', 'summary', 'content', 'all'
  p_batch_size INTEGER DEFAULT 100,
  p_limit INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  bills_queued INTEGER := 0;
  actions_queued INTEGER := 0;
  total_queued INTEGER := 0;
  start_time TIMESTAMP := NOW();
BEGIN
  -- Process bills if requested
  IF p_content_type IN ('bills', 'both') THEN
    -- Queue title embeddings
    IF p_embedding_type IN ('title', 'all') THEN
      INSERT INTO embedding_queue (content_type, content_id, embedding_type, text_content, priority)
      SELECT 
        'bill',
        b.id::TEXT,
        'title',
        b.title,
        2
      FROM bills b
      WHERE 
        b.title IS NOT NULL
        AND b.title_embedding IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM embedding_queue eq 
          WHERE eq.content_type = 'bill' 
            AND eq.content_id = b.id::TEXT 
            AND eq.embedding_type = 'title'
            AND eq.status IN ('pending', 'processing')
        )
      ORDER BY b.introduced_date DESC NULLS LAST
      LIMIT CASE WHEN p_limit IS NOT NULL THEN LEAST(p_limit, p_batch_size) ELSE p_batch_size END;
      
      GET DIAGNOSTICS bills_queued = ROW_COUNT;
    END IF;
    
    -- Queue summary embeddings
    IF p_embedding_type IN ('summary', 'all') AND (p_limit IS NULL OR bills_queued < p_limit) THEN
      INSERT INTO embedding_queue (content_type, content_id, embedding_type, text_content, priority)
      SELECT 
        'bill',
        b.id::TEXT,
        'summary',
        COALESCE(b.summary, b.title),
        3
      FROM bills b
      WHERE 
        (b.summary IS NOT NULL OR b.title IS NOT NULL)
        AND b.summary_embedding IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM embedding_queue eq 
          WHERE eq.content_type = 'bill' 
            AND eq.content_id = b.id::TEXT 
            AND eq.embedding_type = 'summary'
            AND eq.status IN ('pending', 'processing')
        )
      ORDER BY b.introduced_date DESC NULLS LAST
      LIMIT CASE WHEN p_limit IS NOT NULL THEN LEAST(p_limit - bills_queued, p_batch_size) ELSE p_batch_size END;
      
      GET DIAGNOSTICS bills_queued = bills_queued + ROW_COUNT;
    END IF;
    
    -- Queue content embeddings
    IF p_embedding_type IN ('content', 'all') AND (p_limit IS NULL OR bills_queued < p_limit) THEN
      INSERT INTO embedding_queue (content_type, content_id, embedding_type, text_content, priority)
      SELECT 
        'bill',
        b.id::TEXT,
        'content',
        prepare_embedding_text('bill', b.id::TEXT, 'content'),
        5
      FROM bills b
      WHERE 
        (b.full_text IS NOT NULL OR b.summary IS NOT NULL)
        AND b.content_embedding IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM embedding_queue eq 
          WHERE eq.content_type = 'bill' 
            AND eq.content_id = b.id::TEXT 
            AND eq.embedding_type = 'content'
            AND eq.status IN ('pending', 'processing')
        )
        AND prepare_embedding_text('bill', b.id::TEXT, 'content') IS NOT NULL
      ORDER BY b.introduced_date DESC NULLS LAST
      LIMIT CASE WHEN p_limit IS NOT NULL THEN LEAST(p_limit - bills_queued, p_batch_size) ELSE p_batch_size END;
      
      GET DIAGNOSTICS bills_queued = bills_queued + ROW_COUNT;
    END IF;
  END IF;
  
  -- Process executive actions if requested
  IF p_content_type IN ('executive_actions', 'both') THEN
    -- Similar logic for executive actions
    IF p_embedding_type IN ('title', 'all') THEN
      INSERT INTO embedding_queue (content_type, content_id, embedding_type, text_content, priority)
      SELECT 
        'executive_action',
        ea.id::TEXT,
        'title',
        ea.title,
        2
      FROM executive_actions ea
      WHERE 
        ea.title IS NOT NULL
        AND ea.title_embedding IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM embedding_queue eq 
          WHERE eq.content_type = 'executive_action' 
            AND eq.content_id = ea.id::TEXT 
            AND eq.embedding_type = 'title'
            AND eq.status IN ('pending', 'processing')
        )
      ORDER BY ea.signed_date DESC NULLS LAST
      LIMIT p_batch_size;
      
      GET DIAGNOSTICS actions_queued = ROW_COUNT;
    END IF;
  END IF;
  
  total_queued := bills_queued + actions_queued;
  
  -- Log the batch operation
  INSERT INTO processing_logs (
    operation_type, status, completed_at, processing_stats
  ) VALUES (
    'batch_embedding_queue',
    'completed',
    NOW(),
    jsonb_build_object(
      'content_type', p_content_type,
      'embedding_type', p_embedding_type,
      'batch_size', p_batch_size,
      'bills_queued', bills_queued,
      'actions_queued', actions_queued,
      'total_queued', total_queued,
      'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'bills_queued', bills_queued,
    'actions_queued', actions_queued,
    'total_queued', total_queued,
    'batch_size', p_batch_size,
    'processing_time_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- EMBEDDING QUEUE MANAGEMENT
-- =====================================================================

-- Function to get embedding queue statistics
CREATE OR REPLACE FUNCTION get_embedding_queue_stats()
RETURNS TABLE (
  content_type TEXT,
  embedding_type TEXT,
  status TEXT,
  count BIGINT,
  avg_attempts DECIMAL(3,1),
  oldest_pending TIMESTAMP WITH TIME ZONE,
  newest_pending TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    eq.content_type,
    eq.embedding_type,
    eq.status,
    COUNT(*) as count,
    AVG(eq.attempts) as avg_attempts,
    MIN(eq.created_at) as oldest_pending,
    MAX(eq.created_at) as newest_pending
  FROM embedding_queue eq
  GROUP BY eq.content_type, eq.embedding_type, eq.status
  ORDER BY eq.content_type, eq.embedding_type, eq.status;
END;
$$ LANGUAGE plpgsql;

-- Function to retry failed embedding tasks
CREATE OR REPLACE FUNCTION retry_failed_embeddings(
  p_max_retries INTEGER DEFAULT 3,
  p_reset_attempts BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
  retry_count INTEGER;
BEGIN
  -- Reset attempts if requested
  IF p_reset_attempts THEN
    UPDATE embedding_queue 
    SET 
      status = 'pending',
      attempts = 0,
      error_message = NULL,
      started_at = NULL
    WHERE status = 'failed' AND attempts < p_max_retries;
  ELSE
    UPDATE embedding_queue 
    SET 
      status = 'pending',
      error_message = NULL,
      started_at = NULL
    WHERE status = 'failed' AND attempts < p_max_retries;
  END IF;
  
  GET DIAGNOSTICS retry_count = ROW_COUNT;
  
  -- Log the retry operation
  INSERT INTO processing_logs (
    operation_type, status, processing_stats
  ) VALUES (
    'retry_failed_embeddings',
    'completed',
    jsonb_build_object(
      'retried_count', retry_count,
      'max_retries', p_max_retries,
      'reset_attempts', p_reset_attempts
    )
  );
  
  RETURN retry_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old completed embedding tasks
CREATE OR REPLACE FUNCTION cleanup_embedding_queue(
  p_keep_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM embedding_queue
  WHERE 
    status = 'completed'
    AND completed_at < NOW() - (p_keep_days || ' days')::INTERVAL;
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Also clean up old failed tasks that exceeded max attempts
  DELETE FROM embedding_queue
  WHERE 
    status = 'failed'
    AND attempts >= max_attempts
    AND created_at < NOW() - (p_keep_days * 2 || ' days')::INTERVAL;
    
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;