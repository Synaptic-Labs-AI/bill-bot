-- =====================================================================
-- CITATION GENERATION FUNCTIONS FOR BILL BOT
-- =====================================================================
-- Functions for generating proper citations for bills and executive actions
-- in various academic and professional formats
-- =====================================================================

BEGIN;

-- =====================================================================
-- CITATION FORMATTING FUNCTIONS
-- =====================================================================

-- Generate standardized citation for bills
CREATE OR REPLACE FUNCTION generate_bill_citation(
  p_bill_id BIGINT,
  p_format TEXT DEFAULT 'standard' -- 'standard', 'apa', 'mla', 'chicago', 'url'
)
RETURNS JSONB AS $$
DECLARE
  bill_record RECORD;
  citation_text TEXT;
  citation_url TEXT;
BEGIN
  -- Get bill information
  SELECT 
    bill_number,
    title,
    sponsor,
    introduced_date,
    status,
    chamber,
    congress_number
  INTO bill_record
  FROM bills 
  WHERE id = p_bill_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Bill not found');
  END IF;
  
  -- Generate URL
  citation_url := CASE 
    WHEN bill_record.bill_number LIKE 'hr%' THEN 
      'https://www.congress.gov/bill/' || bill_record.congress_number || 'th-congress/house-bill/' || 
      SUBSTRING(bill_record.bill_number FROM 3)
    WHEN bill_record.bill_number LIKE 's%' THEN 
      'https://www.congress.gov/bill/' || bill_record.congress_number || 'th-congress/senate-bill/' || 
      SUBSTRING(bill_record.bill_number FROM 2)
    ELSE 
      'https://www.congress.gov/search?q=' || bill_record.bill_number
  END;
  
  -- Generate citation based on format
  CASE p_format
    WHEN 'standard' THEN
      citation_text := bill_record.bill_number || ' - ' || bill_record.title || 
                      CASE WHEN bill_record.sponsor IS NOT NULL 
                           THEN ' (Sponsor: ' || bill_record.sponsor || ')' 
                           ELSE '' END ||
                      CASE WHEN bill_record.introduced_date IS NOT NULL 
                           THEN '. Introduced ' || bill_record.introduced_date::TEXT 
                           ELSE '' END ||
                      '. ' || bill_record.congress_number || 'th Congress.';
    
    WHEN 'apa' THEN
      citation_text := COALESCE(bill_record.sponsor, 'Unknown') || 
                      ' (' || EXTRACT(YEAR FROM bill_record.introduced_date) || '). ' ||
                      bill_record.title || ' [' || UPPER(bill_record.bill_number) || ']. ' ||
                      'U.S. Congress.';
    
    WHEN 'mla' THEN
      citation_text := 'U.S. Congress. "' || bill_record.title || '." ' ||
                      UPPER(bill_record.bill_number) || ', ' ||
                      bill_record.congress_number || 'th Congress, ' ||
                      EXTRACT(YEAR FROM bill_record.introduced_date) || '.';
    
    WHEN 'chicago' THEN
      citation_text := 'U.S. Congress. ' || bill_record.title || '. ' ||
                      UPPER(bill_record.bill_number) || '. ' ||
                      bill_record.congress_number || 'th Congress. ' ||
                      CASE WHEN bill_record.introduced_date IS NOT NULL 
                           THEN 'Introduced ' || bill_record.introduced_date::TEXT 
                           ELSE '' END || '.';
    
    WHEN 'url' THEN
      citation_text := citation_url;
    
    ELSE
      citation_text := 'Unknown citation format';
  END CASE;
  
  RETURN jsonb_build_object(
    'citation', citation_text,
    'url', citation_url,
    'format', p_format,
    'bill_number', bill_record.bill_number,
    'title', bill_record.title,
    'sponsor', bill_record.sponsor,
    'date', bill_record.introduced_date,
    'status', bill_record.status,
    'chamber', bill_record.chamber,
    'congress', bill_record.congress_number,
    'content_type', 'bill'
  );
END;
$$ LANGUAGE plpgsql;

-- Generate standardized citation for executive actions
CREATE OR REPLACE FUNCTION generate_executive_action_citation(
  p_action_id UUID,
  p_format TEXT DEFAULT 'standard' -- 'standard', 'apa', 'mla', 'chicago', 'url'
)
RETURNS JSONB AS $$
DECLARE
  action_record RECORD;
  citation_text TEXT;
  citation_url TEXT;
  formatted_date TEXT;
BEGIN
  -- Get executive action information
  SELECT 
    executive_order_number,
    action_type,
    title,
    signed_date,
    administration,
    president_name,
    citation,
    status,
    content_url
  INTO action_record
  FROM executive_actions 
  WHERE id = p_action_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Executive action not found');
  END IF;
  
  -- Format date for citations
  formatted_date := TO_CHAR(action_record.signed_date, 'Month DD, YYYY');
  
  -- Generate URL (use content_url if available, otherwise construct)
  citation_url := COALESCE(
    action_record.content_url,
    CASE 
      WHEN action_record.action_type = 'executive_order' AND action_record.executive_order_number IS NOT NULL THEN
        'https://www.federalregister.gov/executive-order/' || action_record.executive_order_number
      ELSE
        'https://www.whitehouse.gov/presidential-actions/'
    END
  );
  
  -- Generate citation based on format
  CASE p_format
    WHEN 'standard' THEN
      citation_text := COALESCE(action_record.citation, 
                                CASE action_record.action_type
                                  WHEN 'executive_order' THEN 'Executive Order ' || action_record.executive_order_number
                                  WHEN 'presidential_memorandum' THEN 'Presidential Memorandum'
                                  WHEN 'proclamation' THEN 'Proclamation'
                                  ELSE INITCAP(REPLACE(action_record.action_type::TEXT, '_', ' '))
                                END) ||
                      ' - ' || action_record.title ||
                      '. Signed by President ' || action_record.president_name ||
                      ' on ' || formatted_date || '.';
    
    WHEN 'apa' THEN
      citation_text := action_record.president_name || 
                      ' (' || EXTRACT(YEAR FROM action_record.signed_date) || ', ' ||
                      TO_CHAR(action_record.signed_date, 'Month DD') || '). ' ||
                      action_record.title || ' [' ||
                      CASE action_record.action_type
                        WHEN 'executive_order' THEN 'Executive Order ' || action_record.executive_order_number
                        ELSE INITCAP(REPLACE(action_record.action_type::TEXT, '_', ' '))
                      END || ']. The White House.';
    
    WHEN 'mla' THEN
      citation_text := action_record.president_name || '. "' || action_record.title || '." ' ||
                      CASE action_record.action_type
                        WHEN 'executive_order' THEN 'Executive Order ' || action_record.executive_order_number
                        ELSE INITCAP(REPLACE(action_record.action_type::TEXT, '_', ' '))
                      END || ', ' || formatted_date || ', The White House.';
    
    WHEN 'chicago' THEN
      citation_text := action_record.president_name || '. "' || action_record.title || '." ' ||
                      CASE action_record.action_type
                        WHEN 'executive_order' THEN 'Executive Order ' || action_record.executive_order_number
                        ELSE INITCAP(REPLACE(action_record.action_type::TEXT, '_', ' '))
                      END || '. The White House, ' || formatted_date || '.';
    
    WHEN 'url' THEN
      citation_text := citation_url;
    
    ELSE
      citation_text := 'Unknown citation format';
  END CASE;
  
  RETURN jsonb_build_object(
    'citation', citation_text,
    'url', citation_url,
    'format', p_format,
    'executive_order_number', action_record.executive_order_number,
    'action_type', action_record.action_type,
    'title', action_record.title,
    'president_name', action_record.president_name,
    'administration', action_record.administration,
    'date', action_record.signed_date,
    'status', action_record.status,
    'original_citation', action_record.citation,
    'content_type', 'executive_action'
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- BATCH CITATION GENERATION
-- =====================================================================

-- Generate citations for multiple content items
CREATE OR REPLACE FUNCTION generate_batch_citations(
  content_items JSONB, -- Array of {type: 'bill'|'executive_action', id: 'id'}
  p_format TEXT DEFAULT 'standard'
)
RETURNS JSONB AS $$
DECLARE
  item JSONB;
  citations JSONB := '[]';
  citation_result JSONB;
BEGIN
  -- Process each content item
  FOR item IN SELECT * FROM jsonb_array_elements(content_items)
  LOOP
    IF item->>'type' = 'bill' THEN
      citation_result := generate_bill_citation((item->>'id')::BIGINT, p_format);
    ELSIF item->>'type' = 'executive_action' THEN
      citation_result := generate_executive_action_citation((item->>'id')::UUID, p_format);
    ELSE
      citation_result := jsonb_build_object('error', 'Invalid content type: ' || (item->>'type'));
    END IF;
    
    citations := citations || jsonb_build_array(citation_result);
  END LOOP;
  
  RETURN jsonb_build_object(
    'citations', citations,
    'format', p_format,
    'generated_at', NOW(),
    'total_count', jsonb_array_length(citations)
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- SEARCH RESULT CITATION INTEGRATION
-- =====================================================================

-- Enhanced search function that includes citations
CREATE OR REPLACE FUNCTION search_with_citations(
  query_text TEXT,
  query_embedding VECTOR(1024),
  search_options JSONB DEFAULT '{}',
  citation_format TEXT DEFAULT 'standard'
)
RETURNS TABLE (
  content_type TEXT,
  content_id TEXT,
  title TEXT,
  summary TEXT,
  relevance_score FLOAT,
  citation JSONB,
  search_rank INTEGER
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  search_result RECORD;
  citation_data JSONB;
BEGIN
  -- Get search results
  FOR search_result IN 
    SELECT * FROM search_content_hybrid(query_text, query_embedding, search_options)
  LOOP
    -- Generate citation for each result
    IF search_result.content_type = 'bill' THEN
      citation_data := generate_bill_citation(search_result.content_id::BIGINT, citation_format);
    ELSE
      citation_data := generate_executive_action_citation(search_result.content_id::UUID, citation_format);
    END IF;
    
    RETURN NEXT (
      search_result.content_type,
      search_result.content_id,
      search_result.title,
      search_result.summary,
      search_result.relevance_score,
      citation_data,
      search_result.final_rank
    );
  END LOOP;
END;
$$;

-- =====================================================================
-- CITATION VALIDATION AND ENHANCEMENT
-- =====================================================================

-- Validate and enhance citation data
CREATE OR REPLACE FUNCTION validate_citation(
  p_content_type TEXT,
  p_content_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  validation_result JSONB := '{}';
  bill_data RECORD;
  action_data RECORD;
BEGIN
  IF p_content_type = 'bill' THEN
    SELECT 
      bill_number,
      title,
      sponsor,
      introduced_date,
      status,
      congress_number,
      source_url
    INTO bill_data
    FROM bills 
    WHERE id = p_content_id::BIGINT;
    
    IF FOUND THEN
      validation_result := jsonb_build_object(
        'valid', true,
        'content_type', 'bill',
        'data_quality', jsonb_build_object(
          'has_bill_number', bill_data.bill_number IS NOT NULL,
          'has_title', bill_data.title IS NOT NULL AND length(bill_data.title) > 0,
          'has_sponsor', bill_data.sponsor IS NOT NULL,
          'has_date', bill_data.introduced_date IS NOT NULL,
          'has_status', bill_data.status IS NOT NULL,
          'has_source_url', bill_data.source_url IS NOT NULL
        ),
        'metadata', jsonb_build_object(
          'bill_number', bill_data.bill_number,
          'congress', bill_data.congress_number,
          'status', bill_data.status
        )
      );
    ELSE
      validation_result := jsonb_build_object('valid', false, 'error', 'Bill not found');
    END IF;
    
  ELSIF p_content_type = 'executive_action' THEN
    SELECT 
      executive_order_number,
      action_type,
      title,
      signed_date,
      president_name,
      administration,
      citation,
      content_url
    INTO action_data
    FROM executive_actions 
    WHERE id = p_content_id::UUID;
    
    IF FOUND THEN
      validation_result := jsonb_build_object(
        'valid', true,
        'content_type', 'executive_action',
        'data_quality', jsonb_build_object(
          'has_order_number', action_data.executive_order_number IS NOT NULL,
          'has_title', action_data.title IS NOT NULL AND length(action_data.title) > 0,
          'has_president', action_data.president_name IS NOT NULL,
          'has_date', action_data.signed_date IS NOT NULL,
          'has_citation', action_data.citation IS NOT NULL,
          'has_content_url', action_data.content_url IS NOT NULL
        ),
        'metadata', jsonb_build_object(
          'action_type', action_data.action_type,
          'administration', action_data.administration,
          'order_number', action_data.executive_order_number
        )
      );
    ELSE
      validation_result := jsonb_build_object('valid', false, 'error', 'Executive action not found');
    END IF;
    
  ELSE
    validation_result := jsonb_build_object('valid', false, 'error', 'Invalid content type');
  END IF;
  
  RETURN validation_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CITATION EXPORT FUNCTIONS
-- =====================================================================

-- Export citations in various bibliography formats
CREATE OR REPLACE FUNCTION export_citations_bibliography(
  content_items JSONB,
  p_format TEXT DEFAULT 'apa',
  p_sort_by TEXT DEFAULT 'date' -- 'date', 'title', 'author'
)
RETURNS TEXT AS $$
DECLARE
  bibliography TEXT := '';
  item JSONB;
  citation_data JSONB;
  citations_array JSONB[] := '{}';
  sorted_citations JSONB;
BEGIN
  -- Generate all citations
  FOR item IN SELECT * FROM jsonb_array_elements(content_items)
  LOOP
    IF item->>'type' = 'bill' THEN
      citation_data := generate_bill_citation((item->>'id')::BIGINT, p_format);
    ELSIF item->>'type' = 'executive_action' THEN
      citation_data := generate_executive_action_citation((item->>'id')::UUID, p_format);
    END IF;
    
    IF citation_data ? 'citation' THEN
      citations_array := citations_array || citation_data;
    END IF;
  END LOOP;
  
  -- Sort citations based on criteria
  -- Note: This is a simplified sorting; could be enhanced with more sophisticated ordering
  FOR citation_data IN 
    SELECT * FROM unnest(citations_array) AS c
    ORDER BY 
      CASE p_sort_by
        WHEN 'date' THEN COALESCE(c->>'date', '1900-01-01')
        WHEN 'title' THEN c->>'title'
        WHEN 'author' THEN COALESCE(c->>'sponsor', c->>'president_name', '')
        ELSE c->>'title'
      END
  LOOP
    bibliography := bibliography || (citation_data->>'citation') || E'\n\n';
  END LOOP;
  
  RETURN TRIM(bibliography);
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- CITATION ANALYTICS
-- =====================================================================

-- Get citation usage statistics
CREATE OR REPLACE FUNCTION get_citation_analytics()
RETURNS TABLE (
  content_type TEXT,
  total_items BIGINT,
  items_with_complete_citation_data BIGINT,
  completeness_percentage DECIMAL(5,2),
  common_issues JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH bill_analysis AS (
    SELECT 
      'bill'::TEXT as content_type,
      COUNT(*) as total_items,
      COUNT(*) FILTER (WHERE 
        bill_number IS NOT NULL AND 
        title IS NOT NULL AND 
        sponsor IS NOT NULL AND 
        introduced_date IS NOT NULL
      ) as complete_items,
      jsonb_agg(
        CASE 
          WHEN bill_number IS NULL THEN 'missing_bill_number'
          WHEN title IS NULL OR length(title) = 0 THEN 'missing_title'
          WHEN sponsor IS NULL THEN 'missing_sponsor'
          WHEN introduced_date IS NULL THEN 'missing_date'
          ELSE NULL
        END
      ) FILTER (WHERE 
        bill_number IS NULL OR 
        title IS NULL OR 
        sponsor IS NULL OR 
        introduced_date IS NULL
      ) as issues
    FROM bills
  ),
  action_analysis AS (
    SELECT 
      'executive_action'::TEXT as content_type,
      COUNT(*) as total_items,
      COUNT(*) FILTER (WHERE 
        title IS NOT NULL AND 
        president_name IS NOT NULL AND 
        signed_date IS NOT NULL AND
        action_type IS NOT NULL
      ) as complete_items,
      jsonb_agg(
        CASE 
          WHEN title IS NULL OR length(title) = 0 THEN 'missing_title'
          WHEN president_name IS NULL THEN 'missing_president'
          WHEN signed_date IS NULL THEN 'missing_date'
          WHEN action_type IS NULL THEN 'missing_action_type'
          ELSE NULL
        END
      ) FILTER (WHERE 
        title IS NULL OR 
        president_name IS NULL OR 
        signed_date IS NULL OR
        action_type IS NULL
      ) as issues
    FROM executive_actions
  )
  SELECT 
    analysis.content_type,
    analysis.total_items,
    analysis.complete_items as items_with_complete_citation_data,
    CASE 
      WHEN analysis.total_items = 0 THEN 0
      ELSE ROUND((analysis.complete_items::DECIMAL / analysis.total_items) * 100, 2)
    END as completeness_percentage,
    COALESCE(analysis.issues, '[]'::JSONB) as common_issues
  FROM (
    SELECT * FROM bill_analysis
    UNION ALL
    SELECT * FROM action_analysis
  ) analysis;
END;
$$ LANGUAGE plpgsql;

COMMIT;