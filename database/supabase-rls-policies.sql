-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR BILL BOT
-- =====================================================================
-- Set up comprehensive security policies for the Bill Bot database
-- These policies control access to data based on user roles and context
-- =====================================================================

BEGIN;

-- =====================================================================
-- ENABLE RLS ON TABLES
-- =====================================================================

-- Enable RLS on all main tables
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_topic_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_action_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_action_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_action_bill_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE rss_feed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_item_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- PUBLIC READ ACCESS POLICIES
-- =====================================================================
-- Allow public read access to most content since this is a public information system

-- Bills - Public read access
CREATE POLICY "bills_public_read" ON bills
  FOR SELECT USING (true);

-- Bill topics - Public read access
CREATE POLICY "bill_topics_public_read" ON bill_topics
  FOR SELECT USING (true);

-- Bill topic assignments - Public read access
CREATE POLICY "bill_topic_assignments_public_read" ON bill_topic_assignments
  FOR SELECT USING (true);

-- Executive actions - Public read access
CREATE POLICY "executive_actions_public_read" ON executive_actions
  FOR SELECT USING (true);

-- Executive action topics - Public read access
CREATE POLICY "executive_action_topics_public_read" ON executive_action_topics
  FOR SELECT USING (true);

-- Executive action agencies - Public read access
CREATE POLICY "executive_action_agencies_public_read" ON executive_action_agencies
  FOR SELECT USING (true);

-- Executive action bill references - Public read access
CREATE POLICY "executive_action_bill_references_public_read" ON executive_action_bill_references
  FOR SELECT USING (true);

-- =====================================================================
-- ADMIN-ONLY WRITE POLICIES
-- =====================================================================
-- Only authenticated admin users can modify data

-- Bills - Admin write access
CREATE POLICY "bills_admin_write" ON bills
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Bill topics - Admin write access
CREATE POLICY "bill_topics_admin_write" ON bill_topics
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Bill topic assignments - Admin write access
CREATE POLICY "bill_topic_assignments_admin_write" ON bill_topic_assignments
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Executive actions - Admin write access
CREATE POLICY "executive_actions_admin_write" ON executive_actions
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Executive action topics - Admin write access
CREATE POLICY "executive_action_topics_admin_write" ON executive_action_topics
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Executive action agencies - Admin write access
CREATE POLICY "executive_action_agencies_admin_write" ON executive_action_agencies
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Executive action bill references - Admin write access
CREATE POLICY "executive_action_bill_references_admin_write" ON executive_action_bill_references
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- =====================================================================
-- SYSTEM/SERVICE POLICIES
-- =====================================================================
-- Policies for system operations like RSS processing and embedding generation

-- RSS feed sources - Admin and system read access
CREATE POLICY "rss_feed_sources_system_read" ON rss_feed_sources
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
    OR auth.jwt() ->> 'role' = 'rss_processor'
  );

-- RSS feed sources - Admin write access
CREATE POLICY "rss_feed_sources_admin_write" ON rss_feed_sources
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- Processing logs - System and admin access
CREATE POLICY "processing_logs_system_access" ON processing_logs
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
    OR auth.jwt() ->> 'role' = 'rss_processor'
    OR auth.jwt() ->> 'role' = 'embedding_processor'
  );

-- Feed item tracking - System and admin access
CREATE POLICY "feed_item_tracking_system_access" ON feed_item_tracking
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
    OR auth.jwt() ->> 'role' = 'rss_processor'
  );

-- Embedding queue - System and admin access
CREATE POLICY "embedding_queue_system_access" ON embedding_queue
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
    OR auth.jwt() ->> 'role' = 'embedding_processor'
  );

-- =====================================================================
-- MATERIALIZED VIEW POLICIES
-- =====================================================================
-- Public read access to materialized views for performance

-- Sponsor stats - Public read access
ALTER TABLE mv_sponsor_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_sponsor_stats_public_read" ON mv_sponsor_stats
  FOR SELECT USING (true);

-- Topic stats - Public read access  
ALTER TABLE mv_topic_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_topic_stats_public_read" ON mv_topic_stats
  FOR SELECT USING (true);

-- Status stats - Public read access
ALTER TABLE mv_status_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_status_stats_public_read" ON mv_status_stats
  FOR SELECT USING (true);

-- Committee stats - Public read access
ALTER TABLE mv_committee_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_committee_stats_public_read" ON mv_committee_stats
  FOR SELECT USING (true);

-- Administration stats - Public read access
ALTER TABLE mv_administration_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_administration_stats_public_read" ON mv_administration_stats
  FOR SELECT USING (true);

-- Agency stats - Public read access
ALTER TABLE mv_agency_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_agency_stats_public_read" ON mv_agency_stats
  FOR SELECT USING (true);

-- =====================================================================
-- FUNCTION SECURITY
-- =====================================================================
-- Grant appropriate permissions to functions

-- Grant EXECUTE on search functions to public
GRANT EXECUTE ON FUNCTION search_bills_semantic TO public;
GRANT EXECUTE ON FUNCTION search_executive_actions_semantic TO public;
GRANT EXECUTE ON FUNCTION search_bills_hybrid TO public;
GRANT EXECUTE ON FUNCTION search_content_hybrid TO public;
GRANT EXECUTE ON FUNCTION search_all_content TO public;
GRANT EXECUTE ON FUNCTION search_with_citations TO public;

-- Grant EXECUTE on context discovery functions to public
GRANT EXECUTE ON FUNCTION get_available_sponsors TO public;
GRANT EXECUTE ON FUNCTION discover_topic_categories TO public;
GRANT EXECUTE ON FUNCTION get_available_administrations_detailed TO public;
GRANT EXECUTE ON FUNCTION analyze_agency_involvement TO public;
GRANT EXECUTE ON FUNCTION get_temporal_context TO public;
GRANT EXECUTE ON FUNCTION get_comprehensive_context TO public;

-- Grant EXECUTE on citation functions to public
GRANT EXECUTE ON FUNCTION generate_bill_citation TO public;
GRANT EXECUTE ON FUNCTION generate_executive_action_citation TO public;
GRANT EXECUTE ON FUNCTION generate_batch_citations TO public;
GRANT EXECUTE ON FUNCTION validate_citation TO public;

-- Grant EXECUTE on RSS functions to service roles only
GRANT EXECUTE ON FUNCTION get_next_feed_to_poll TO service_role;
GRANT EXECUTE ON FUNCTION mark_feed_polled TO service_role;
GRANT EXECUTE ON FUNCTION is_duplicate_content TO service_role;
GRANT EXECUTE ON FUNCTION track_feed_item TO service_role;
GRANT EXECUTE ON FUNCTION process_feed_batch TO service_role;

-- Grant EXECUTE on embedding functions to service roles only
GRANT EXECUTE ON FUNCTION get_next_embedding_task TO service_role;
GRANT EXECUTE ON FUNCTION complete_embedding_task TO service_role;
GRANT EXECUTE ON FUNCTION smart_queue_embedding TO service_role;
GRANT EXECUTE ON FUNCTION batch_generate_missing_embeddings TO service_role;

-- Grant EXECUTE on admin functions to admin roles only
GRANT EXECUTE ON FUNCTION refresh_context_cache TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_processing_logs TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_embedding_queue TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_feed_tracking TO service_role;

-- Grant EXECUTE on stats functions to public (read-only)
GRANT EXECUTE ON FUNCTION get_rss_processing_stats TO public;
GRANT EXECUTE ON FUNCTION get_embedding_queue_stats TO public;
GRANT EXECUTE ON FUNCTION get_processing_performance TO public;
GRANT EXECUTE ON FUNCTION get_feed_health_status TO public;
GRANT EXECUTE ON FUNCTION get_citation_analytics TO public;

-- =====================================================================
-- API KEY BASED ACCESS (FOR MCP SERVER)
-- =====================================================================
-- Create policies that allow access via API keys for the MCP server

-- Create a function to check if the current request is from an authorized API key
CREATE OR REPLACE FUNCTION is_authorized_api_request()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the request has a valid API key in the headers
  -- This will be validated by Supabase's built-in API key authentication
  RETURN auth.role() = 'anon' OR auth.role() = 'authenticated' OR auth.role() = 'service_role';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the authorization function
GRANT EXECUTE ON FUNCTION is_authorized_api_request() TO public;

-- =====================================================================
-- RATE LIMITING CONSIDERATIONS
-- =====================================================================
-- Note: Actual rate limiting should be implemented at the application/proxy level
-- These comments serve as documentation for implementation

/*
RATE LIMITING RECOMMENDATIONS:

1. Search Functions:
   - Limit to 100 requests per minute per IP/API key
   - Implement exponential backoff for burst requests

2. Context Discovery:
   - Limit to 50 requests per minute per IP/API key
   - Cache results for 5 minutes to reduce load

3. Citation Generation:
   - Limit to 200 requests per minute per IP/API key
   - Allow burst for batch operations

4. RSS Processing:
   - No rate limiting (internal service only)
   - Monitor for unusual patterns

5. Embedding Processing:
   - No rate limiting (internal service only)
   - Queue-based processing prevents overload
*/

-- =====================================================================
-- AUDIT LOGGING
-- =====================================================================
-- Enable audit logging for sensitive operations

-- Create audit log table for tracking data changes
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  user_role TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'supabase_admin'
  );

-- System can insert audit logs
CREATE POLICY "audit_logs_system_insert" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, operation, old_values, user_role)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), auth.jwt() ->> 'role');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, operation, old_values, new_values, user_role)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.jwt() ->> 'role');
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, operation, new_values, user_role)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(NEW), auth.jwt() ->> 'role');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for sensitive tables (uncomment if needed)
/*
CREATE TRIGGER bills_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER executive_actions_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON executive_actions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER rss_feed_sources_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON rss_feed_sources
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
*/

COMMIT;