-- =====================================================================
-- INITIAL DATA FOR BILL BOT DATABASE
-- =====================================================================
-- Insert initial topic categories and RSS feed sources
-- This data provides the foundation for content categorization and processing
-- =====================================================================

BEGIN;

-- =====================================================================
-- BILL TOPICS - INITIAL CATEGORIES
-- =====================================================================

INSERT INTO bill_topics (name, category, description) VALUES
-- Core Policy Areas
('Healthcare', 'health', 'Bills related to healthcare policy, medical services, and public health'),
('Environment', 'environment', 'Environmental protection, climate change, and conservation legislation'),
('Education', 'education', 'Educational policy, funding, and reform bills'),
('Defense', 'defense', 'Military, national security, and defense-related legislation'),
('Economy', 'economy', 'Economic policy, financial regulation, and monetary policy'),
('Immigration', 'immigration', 'Immigration policy, border security, and naturalization'),
('Infrastructure', 'infrastructure', 'Transportation, utilities, and infrastructure development'),
('Technology', 'technology', 'Technology policy, digital rights, and cybersecurity legislation'),

-- Additional Policy Areas
('Agriculture', 'agriculture', 'Agricultural policy, food security, and rural development'),
('Energy', 'energy', 'Energy production, renewable resources, and energy policy'),
('Labor', 'labor', 'Employment, workers rights, and labor relations legislation'),
('Justice', 'justice', 'Criminal justice, legal system reforms, and law enforcement'),
('Housing', 'housing', 'Housing policy, urban development, and real estate'),
('Transportation', 'transportation', 'Transportation systems, regulations, and funding'),
('Veterans', 'veterans', 'Veterans affairs, military personnel, and veteran benefits'),
('Social Services', 'social_services', 'Social welfare, public assistance, and community services'),

-- Specific Areas
('Taxation', 'taxation', 'Tax policy, revenue legislation, and fiscal policy'),
('Trade', 'trade', 'International trade, commerce, and trade agreements'),
('Civil Rights', 'civil_rights', 'Civil rights, equality, and anti-discrimination legislation'),
('Government Reform', 'government_reform', 'Government operations, transparency, and administrative reform'),
('Foreign Policy', 'foreign_policy', 'International relations, diplomacy, and foreign affairs'),
('Financial Services', 'financial_services', 'Banking, securities, insurance, and financial regulation'),

-- Emerging Areas
('Climate Change', 'environment', 'Climate change mitigation, adaptation, and environmental justice'),
('Artificial Intelligence', 'technology', 'AI regulation, ethics, and technological governance'),
('Data Privacy', 'technology', 'Personal data protection, privacy rights, and information security'),
('Renewable Energy', 'energy', 'Solar, wind, and other renewable energy sources and policies'),
('Mental Health', 'health', 'Mental health services, treatment, and policy reform'),
('Drug Policy', 'health', 'Drug regulation, substance abuse, and pharmaceutical policy'),

-- Social Issues
('LGBTQ Rights', 'civil_rights', 'LGBTQ+ equality, anti-discrimination, and social justice'),
('Racial Justice', 'civil_rights', 'Racial equality, criminal justice reform, and civil rights'),
('Gender Equality', 'civil_rights', 'Gender equality, womens rights, and workplace equality'),
('Disability Rights', 'civil_rights', 'Disability accommodations, accessibility, and rights protection'),
('Voting Rights', 'civil_rights', 'Voting access, election security, and democratic participation'),
('Gun Control', 'justice', 'Firearms regulation, gun safety, and Second Amendment issues'),

-- Economic Sectors
('Small Business', 'economy', 'Small business support, entrepreneurship, and economic development'),
('Manufacturing', 'economy', 'Manufacturing policy, industrial development, and trade'),
('Tourism', 'economy', 'Tourism promotion, travel industry, and cultural heritage'),
('Telecommunications', 'technology', 'Communications infrastructure, broadband, and digital divide'),
('Space Policy', 'defense', 'Space exploration, commercial space, and aerospace policy'),
('Ocean Policy', 'environment', 'Marine conservation, fishing regulations, and coastal management');

-- =====================================================================
-- RSS FEED SOURCES - INITIAL CONFIGURATION
-- =====================================================================

INSERT INTO rss_feed_sources (name, url, feed_type, chamber, polling_frequency, configuration) VALUES

-- Congressional Bills from GovInfo
('House Bills RSS', 'https://www.govinfo.gov/rss/billstatus-hr.xml', 'house_bills', 'house', INTERVAL '2 hours', 
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'hr')),

('Senate Bills RSS', 'https://www.govinfo.gov/rss/billstatus-s.xml', 'senate_bills', 'senate', INTERVAL '2 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 's')),

('House Joint Resolutions', 'https://www.govinfo.gov/rss/billstatus-hjres.xml', 'house_bills', 'house', INTERVAL '4 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'hjres')),

('Senate Joint Resolutions', 'https://www.govinfo.gov/rss/billstatus-sjres.xml', 'senate_bills', 'senate', INTERVAL '4 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'sjres')),

('House Concurrent Resolutions', 'https://www.govinfo.gov/rss/billstatus-hconres.xml', 'house_bills', 'house', INTERVAL '6 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'hconres')),

('Senate Concurrent Resolutions', 'https://www.govinfo.gov/rss/billstatus-sconres.xml', 'senate_bills', 'senate', INTERVAL '6 hours',
 jsonb_build_object('format', 'rss', 'parser', 'govinfo', 'bill_type', 'sconres')),

-- Executive Actions from Federal Register
('Federal Register Executive Orders', 
 'https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=executive_order',
 'executive_orders', 'executive', INTERVAL '3 hours',
 jsonb_build_object('format', 'json', 'parser', 'federal_register', 'document_type', 'executive_order')),

('Federal Register Presidential Memoranda',
 'https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=presidential_memorandum',
 'presidential_memoranda', 'executive', INTERVAL '3 hours',
 jsonb_build_object('format', 'json', 'parser', 'federal_register', 'document_type', 'presidential_memorandum')),

('Federal Register Proclamations',
 'https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=proclamation',
 'proclamations', 'executive', INTERVAL '6 hours',
 jsonb_build_object('format', 'json', 'parser', 'federal_register', 'document_type', 'proclamation')),

-- White House Sources
('White House Presidential Actions',
 'https://www.whitehouse.gov/briefing-room/presidential-actions/feed/',
 'white_house_actions', 'executive', INTERVAL '1 hour',
 jsonb_build_object('format', 'rss', 'parser', 'white_house', 'content_type', 'presidential_actions')),

-- Congress.gov Sources (Alternative)
('Congress.gov House Bills',
 'https://www.congress.gov/rss/bill/118/house/',
 'house_bills', 'house', INTERVAL '3 hours',
 jsonb_build_object('format', 'rss', 'parser', 'congress_gov', 'bill_type', 'house', 'congress', 118)),

('Congress.gov Senate Bills',
 'https://www.congress.gov/rss/bill/118/senate/',
 'senate_bills', 'senate', INTERVAL '3 hours',
 jsonb_build_object('format', 'rss', 'parser', 'congress_gov', 'bill_type', 'senate', 'congress', 118));

-- =====================================================================
-- SAMPLE BILLS FOR TESTING (OPTIONAL)
-- =====================================================================
-- Uncomment this section if you want to insert some sample bills for testing

/*
INSERT INTO bills (
  bill_number, congress_number, bill_type, title, summary, sponsor, 
  introduced_date, status, chamber, committee
) VALUES
('HR1', 118, 'hr', 'For the People Act of 2023', 
 'A comprehensive bill to expand voting rights, change campaign finance laws, limit partisan gerrymandering, and create new ethics rules for federal officeholders.',
 'Rep. Terri Sewell [D-AL-7]', '2023-01-09', 'referred', 'house', 'House Administration'),

('S1', 118, 's', 'For the People Act of 2023',
 'A companion bill to HR1 in the Senate, addressing voting rights and election security.',
 'Sen. Jeff Merkley [D-OR]', '2023-01-24', 'referred', 'senate', 'Senate Rules and Administration'),

('HR2', 118, 'hr', 'SECURE IT Act',
 'A bill to strengthen cybersecurity standards for critical infrastructure.',
 'Rep. Bennie Thompson [D-MS-2]', '2023-01-10', 'referred', 'house', 'House Homeland Security'),

('S2', 118, 's', 'Climate Action Now Act',
 'Legislation to address climate change through renewable energy investment.',
 'Sen. Bernie Sanders [I-VT]', '2023-01-25', 'referred', 'senate', 'Senate Environment and Public Works');
*/

-- =====================================================================
-- SAMPLE EXECUTIVE ACTIONS FOR TESTING (OPTIONAL)
-- =====================================================================
-- Uncomment this section if you want to insert some sample executive actions

/*
INSERT INTO executive_actions (
  executive_order_number, action_type, title, summary, signed_date,
  administration, president_name, citation, status, agencies_affected, policy_areas
) VALUES
(14081, 'executive_order', 'Advancing Biotechnology and Biomanufacturing Innovation',
 'Coordinates federal biotechnology research and development to advance U.S. economic competitiveness.',
 '2022-09-12', 'Biden', 'Joseph R. Biden Jr.', 'Executive Order 14081', 'active',
 ARRAY['Department of Commerce', 'National Science Foundation', 'Department of Energy'],
 ARRAY['Biotechnology', 'Manufacturing', 'Innovation']),

(14082, 'executive_order', 'Implementation of the Energy Act of 2020',
 'Implements provisions of the Energy Act relating to nuclear energy innovation.',
 '2022-09-13', 'Biden', 'Joseph R. Biden Jr.', 'Executive Order 14082', 'active',
 ARRAY['Department of Energy', 'Nuclear Regulatory Commission'],
 ARRAY['Energy', 'Nuclear Power', 'Innovation']);
*/

-- =====================================================================
-- REFRESH MATERIALIZED VIEWS
-- =====================================================================
-- Initialize the materialized views with empty data
-- These will be populated as real data is inserted

REFRESH MATERIALIZED VIEW mv_sponsor_stats;
REFRESH MATERIALIZED VIEW mv_topic_stats;  
REFRESH MATERIALIZED VIEW mv_status_stats;
REFRESH MATERIALIZED VIEW mv_committee_stats;
REFRESH MATERIALIZED VIEW mv_administration_stats;
REFRESH MATERIALIZED VIEW mv_agency_stats;

-- =====================================================================
-- LOG INITIAL SETUP
-- =====================================================================

INSERT INTO processing_logs (
  operation_type, status, processing_stats
) VALUES (
  'initial_setup',
  'completed',
  jsonb_build_object(
    'topics_inserted', (SELECT COUNT(*) FROM bill_topics),
    'rss_feeds_configured', (SELECT COUNT(*) FROM rss_feed_sources),
    'materialized_views_refreshed', 6,
    'setup_timestamp', NOW()
  )
);

COMMIT;

-- =====================================================================
-- POST-SETUP VERIFICATION QUERIES
-- =====================================================================
-- These queries can be run after setup to verify the installation

/*
-- Verify topic categories
SELECT category, COUNT(*) as topic_count 
FROM bill_topics 
GROUP BY category 
ORDER BY topic_count DESC;

-- Verify RSS feed sources
SELECT chamber, feed_type, COUNT(*) as feed_count, 
       BOOL_AND(enabled) as all_enabled
FROM rss_feed_sources 
GROUP BY chamber, feed_type;

-- Check materialized views
SELECT 'mv_sponsor_stats' as view_name, COUNT(*) as row_count FROM mv_sponsor_stats
UNION ALL
SELECT 'mv_topic_stats', COUNT(*) FROM mv_topic_stats
UNION ALL  
SELECT 'mv_status_stats', COUNT(*) FROM mv_status_stats
UNION ALL
SELECT 'mv_committee_stats', COUNT(*) FROM mv_committee_stats
UNION ALL
SELECT 'mv_administration_stats', COUNT(*) FROM mv_administration_stats
UNION ALL
SELECT 'mv_agency_stats', COUNT(*) FROM mv_agency_stats;

-- Verify database functions exist
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%search%' 
  OR routine_name LIKE '%embedding%'
  OR routine_name LIKE '%rss%'
ORDER BY routine_name;

-- Check indexes on key tables
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE '%embedding%' OR indexname LIKE '%search%')
ORDER BY tablename, indexname;
*/