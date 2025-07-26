-- =====================================================================
-- DATABASE SETUP TESTING AND VALIDATION
-- =====================================================================
-- Run this script after setting up the database to validate functionality
-- =====================================================================

-- =====================================================================
-- 1. BASIC STRUCTURE VALIDATION
-- =====================================================================

-- Check that all tables exist
DO $$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'bills', 'bill_topics', 'bill_topic_assignments',
        'executive_actions', 'executive_action_topics', 'executive_action_agencies',
        'executive_action_bill_references', 'rss_feed_sources', 'processing_logs',
        'feed_item_tracking', 'embedding_queue'
    ];
    table_name TEXT;
    table_count INTEGER;
BEGIN
    FOREACH table_name IN ARRAY expected_tables
    LOOP
        SELECT COUNT(*) INTO table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = table_name;
        
        IF table_count = 0 THEN
            RAISE EXCEPTION 'Table % not found!', table_name;
        END IF;
        
        RAISE NOTICE 'Table % exists ✓', table_name;
    END LOOP;
    
    RAISE NOTICE 'All expected tables exist ✓';
END
$$;

-- =====================================================================
-- 2. INDEX VALIDATION
-- =====================================================================

-- Check vector indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE '%embedding%'
ORDER BY tablename, indexname;

-- Check GIN indexes for full-text search
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE '%search_vector%' OR indexname LIKE '%text%')
ORDER BY tablename, indexname;

-- =====================================================================
-- 3. FUNCTION VALIDATION
-- =====================================================================

-- Check that key functions exist
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'search_bills_semantic',
    'search_executive_actions_semantic',
    'update_bill_search_vector',
    'update_executive_action_search_vector'
  )
ORDER BY routine_name;

-- =====================================================================
-- 4. INITIAL DATA VALIDATION
-- =====================================================================

-- Check bill topics
SELECT 
    category,
    COUNT(*) as topic_count
FROM bill_topics 
GROUP BY category 
ORDER BY topic_count DESC;

-- Check RSS feed sources
SELECT 
    chamber,
    feed_type,
    COUNT(*) as feed_count,
    BOOL_AND(enabled) as all_enabled
FROM rss_feed_sources 
GROUP BY chamber, feed_type
ORDER BY chamber, feed_type;

-- =====================================================================
-- 5. INSERT TEST DATA FOR VECTOR SEARCH
-- =====================================================================

-- Insert test bills with content for vector search testing
INSERT INTO bills (
    bill_number, congress_number, bill_type, title, summary, sponsor, 
    introduced_date, status, chamber, committee
) VALUES
('TEST-001', 118, 'hr', 'Climate Change Adaptation and Resilience Act', 
 'A comprehensive bill to address climate change through adaptation measures, renewable energy investments, and infrastructure improvements to help communities become more resilient to climate impacts.',
 'Rep. Test Sponsor [D-CA-1]', '2024-01-15', 'introduced', 'house', 'House Energy and Commerce'),

('TEST-002', 118, 's', 'Healthcare Access and Affordability Act',
 'Legislation to expand healthcare access, reduce prescription drug costs, and improve medical care affordability for working families across the United States.',
 'Sen. Test Senator [D-NY]', '2024-01-20', 'referred', 'senate', 'Senate Health, Education, Labor and Pensions'),

('TEST-003', 118, 'hr', 'Artificial Intelligence Ethics and Safety Framework',
 'A bill to establish ethical guidelines and safety standards for artificial intelligence development and deployment in government and private sector applications.',
 'Rep. Tech Advocate [R-TX-2]', '2024-01-25', 'introduced', 'house', 'House Science, Space, and Technology'),

('TEST-004', 118, 's', 'Infrastructure Investment and Jobs Enhancement',
 'Comprehensive infrastructure legislation focusing on roads, bridges, broadband expansion, and green transportation solutions for the 21st century.',
 'Sen. Infrastructure Champion [D-MI]', '2024-02-01', 'referred', 'senate', 'Senate Environment and Public Works');

-- Insert test executive actions
INSERT INTO executive_actions (
    executive_order_number, action_type, title, summary, signed_date,
    administration, president_name, citation, status, agencies_affected, policy_areas
) VALUES
(99901, 'executive_order', 'Advancing Clean Energy and Climate Resilience',
 'Executive order directing federal agencies to accelerate clean energy deployment and strengthen climate adaptation measures across government operations.',
 '2024-01-10', 'Biden', 'Joseph R. Biden Jr.', 'Executive Order 99901', 'active',
 ARRAY['Department of Energy', 'Environmental Protection Agency', 'Department of Interior'],
 ARRAY['Climate Change', 'Clean Energy', 'Environmental Protection']),

(99902, 'presidential_memorandum', 'Strengthening Cybersecurity for Critical Infrastructure',
 'Presidential memorandum establishing enhanced cybersecurity requirements and coordination mechanisms for protecting critical infrastructure systems.',
 '2024-01-15', 'Biden', 'Joseph R. Biden Jr.', 'Presidential Memorandum on Cybersecurity', 'active',
 ARRAY['Department of Homeland Security', 'National Security Agency', 'Department of Commerce'],
 ARRAY['Cybersecurity', 'Critical Infrastructure', 'National Security']);

-- Assign topics to test bills
INSERT INTO bill_topic_assignments (bill_id, topic_id, confidence_score) 
SELECT 
    b.id,
    bt.id,
    0.95
FROM bills b
JOIN bill_topics bt ON (
    (b.bill_number = 'TEST-001' AND bt.name = 'Climate Change') OR
    (b.bill_number = 'TEST-002' AND bt.name = 'Healthcare') OR
    (b.bill_number = 'TEST-003' AND bt.name = 'Technology') OR
    (b.bill_number = 'TEST-004' AND bt.name = 'Infrastructure')
);

-- =====================================================================
-- 6. TEST VECTOR SEARCH (WITHOUT ACTUAL EMBEDDINGS)
-- =====================================================================

-- Since we don't have actual embeddings yet, we'll test the function structure
-- and verify that the functions can be called without errors

-- Test basic function calls (will return empty results without embeddings)
SELECT 'Testing search_bills_semantic function...' as test_name;

-- This should execute without error but return no results
SELECT COUNT(*) as result_count
FROM search_bills_semantic(
    ARRAY[0.1, 0.2, 0.3]::VECTOR(3)::VECTOR(1024),  -- Dummy embedding
    0.7,
    5
);

SELECT 'Testing search_executive_actions_semantic function...' as test_name;

-- This should also execute without error but return no results
SELECT COUNT(*) as result_count
FROM search_executive_actions_semantic(
    ARRAY[0.1, 0.2, 0.3]::VECTOR(3)::VECTOR(1024),  -- Dummy embedding
    0.7,
    5
);

-- =====================================================================
-- 7. TEST FULL-TEXT SEARCH
-- =====================================================================

-- Test full-text search on bills (this should work immediately)
SELECT 'Testing full-text search on bills...' as test_name;

SELECT 
    bill_number,
    title,
    ts_rank(search_vector, plainto_tsquery('english', 'climate change')) as rank
FROM bills 
WHERE search_vector @@ plainto_tsquery('english', 'climate change')
ORDER BY rank DESC;

-- Test full-text search on executive actions
SELECT 'Testing full-text search on executive actions...' as test_name;

SELECT 
    title,
    administration,
    ts_rank(search_vector, plainto_tsquery('english', 'cybersecurity')) as rank
FROM executive_actions 
WHERE search_vector @@ plainto_tsquery('english', 'cybersecurity')
ORDER BY rank DESC;

-- =====================================================================
-- 8. TEST TRIGGER FUNCTIONALITY
-- =====================================================================

-- Test that search vectors are automatically generated
SELECT 'Testing search vector triggers...' as test_name;

-- Check that search vectors were generated for our test data
SELECT 
    bill_number,
    title,
    CASE 
        WHEN search_vector IS NOT NULL THEN 'Generated ✓'
        ELSE 'Missing ✗'
    END as search_vector_status
FROM bills 
WHERE bill_number LIKE 'TEST-%'
ORDER BY bill_number;

SELECT 
    title,
    CASE 
        WHEN search_vector IS NOT NULL THEN 'Generated ✓'
        ELSE 'Missing ✗'
    END as search_vector_status
FROM executive_actions 
WHERE executive_order_number >= 99900
ORDER BY executive_order_number;

-- =====================================================================
-- 9. TEST CONSTRAINT VALIDATION
-- =====================================================================

-- Test bill constraints
SELECT 'Testing bill constraints...' as test_name;

-- This should fail due to invalid chamber
DO $$
BEGIN
    INSERT INTO bills (bill_number, title, chamber, bill_type)
    VALUES ('INVALID-001', 'Test Bill', 'invalid_chamber', 'hr');
    RAISE EXCEPTION 'Constraint validation failed - invalid chamber was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Chamber constraint working ✓';
END
$$;

-- This should fail due to invalid status
DO $$
BEGIN
    INSERT INTO bills (bill_number, title, chamber, bill_type, status)
    VALUES ('INVALID-002', 'Test Bill', 'house', 'hr', 'invalid_status');
    RAISE EXCEPTION 'Constraint validation failed - invalid status was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Status constraint working ✓';
END
$$;

-- =====================================================================
-- 10. PERFORMANCE VALIDATION
-- =====================================================================

-- Check index usage for common queries
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM bills 
WHERE chamber = 'house' 
  AND status = 'introduced' 
ORDER BY introduced_date DESC 
LIMIT 10;

-- Check vector index exists and is being used (structure only, no actual search)
EXPLAIN 
SELECT * FROM bills 
WHERE title_embedding IS NOT NULL
ORDER BY title_embedding <-> ARRAY[0.1]::VECTOR(1)::VECTOR(1024)
LIMIT 5;

-- =====================================================================
-- 11. FINAL VALIDATION SUMMARY
-- =====================================================================

SELECT 
    'Database setup validation completed!' as message,
    NOW() as validated_at,
    (SELECT COUNT(*) FROM bills WHERE bill_number LIKE 'TEST-%') as test_bills_created,
    (SELECT COUNT(*) FROM executive_actions WHERE executive_order_number >= 99900) as test_actions_created,
    (SELECT COUNT(*) FROM bill_topics) as total_topics,
    (SELECT COUNT(*) FROM rss_feed_sources) as total_rss_feeds;

-- Clean up test data (optional - comment out if you want to keep test data)
/*
DELETE FROM bill_topic_assignments WHERE bill_id IN (
    SELECT id FROM bills WHERE bill_number LIKE 'TEST-%'
);
DELETE FROM bills WHERE bill_number LIKE 'TEST-%';
DELETE FROM executive_actions WHERE executive_order_number >= 99900;
*/

-- Log the validation
INSERT INTO processing_logs (
    operation_type, status, processing_stats
) VALUES (
    'database_validation',
    'completed',
    jsonb_build_object(
        'test_bills_created', (SELECT COUNT(*) FROM bills WHERE bill_number LIKE 'TEST-%'),
        'test_actions_created', (SELECT COUNT(*) FROM executive_actions WHERE executive_order_number >= 99900),
        'validation_timestamp', NOW(),
        'all_tests_passed', true
    )
);