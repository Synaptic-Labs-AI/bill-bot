# Executive Actions Integration

## Executive Summary

Executive actions (executive orders, presidential memoranda, proclamations) require specialized handling alongside bills. This document defines database extensions, search integration, and citation formats to support presidential executive actions within the Bill Bot system.

## Executive Actions Overview

### Types of Executive Actions
- **Executive Orders**: Presidential directives with legal force
- **Presidential Memoranda**: Instructions to federal agencies
- **Proclamations**: Presidential announcements and ceremonial declarations
- **Presidential Directives**: National security and policy guidance

### Key Differences from Bills
- **No Congressional Process**: Direct presidential authority
- **Different Numbering**: Sequential numbering per administration
- **Unique Lifecycle**: Signed, amended, revoked, or superseded
- **Different Metadata**: Administration, agencies affected, policy areas

## Database Schema Extensions

### Executive Actions Table

```sql
-- Core executive actions table
CREATE TABLE executive_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_order_number INTEGER, -- E.g., 14081
  action_type executive_action_type NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  signed_date DATE NOT NULL,
  effective_date DATE,
  administration TEXT NOT NULL, -- e.g., "Biden", "Trump", "Obama"
  president_name TEXT NOT NULL,
  citation TEXT NOT NULL, -- e.g., "Executive Order 14081"
  status executive_action_status DEFAULT 'active',
  
  -- Content and search
  content_url TEXT,
  pdf_url TEXT,
  html_content TEXT,
  search_vector tsvector,
  embedding vector(1536), -- For semantic search
  
  -- Metadata
  agencies_affected TEXT[], -- List of federal agencies
  policy_areas TEXT[], -- Healthcare, Environment, etc.
  keywords TEXT[],
  related_legislation TEXT[], -- Related bill citations
  supersedes UUID[], -- References to previous executive actions
  superseded_by UUID, -- Reference to superseding action
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  indexed_at TIMESTAMP WITH TIME ZONE
);

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
```

### Related Tables

```sql
-- Executive action topics/categories
CREATE TABLE executive_action_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_action_id UUID NOT NULL REFERENCES executive_actions(id) ON DELETE CASCADE,
  primary_topic TEXT NOT NULL,
  secondary_topic TEXT,
  relevance_score DECIMAL(3,2) DEFAULT 1.0,
  
  UNIQUE(executive_action_id, primary_topic, secondary_topic)
);

-- Agencies affected
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
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- "implements", "modifies", "relates_to"
  description TEXT,
  
  UNIQUE(executive_action_id, bill_id, relationship_type)
);

-- Amendment and supersession tracking
CREATE TABLE executive_action_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_action_id UUID NOT NULL REFERENCES executive_actions(id),
  revising_action_id UUID NOT NULL REFERENCES executive_actions(id),
  revision_type TEXT NOT NULL, -- "amendment", "supersession", "revocation"
  sections_affected TEXT[], -- Which sections were changed
  effective_date DATE NOT NULL,
  
  UNIQUE(original_action_id, revising_action_id)
);
```

### Indexes and Performance

```sql
-- Core search indexes
CREATE INDEX idx_executive_actions_number ON executive_actions(executive_order_number);
CREATE INDEX idx_executive_actions_type ON executive_actions(action_type);
CREATE INDEX idx_executive_actions_administration ON executive_actions(administration);
CREATE INDEX idx_executive_actions_signed_date ON executive_actions(signed_date DESC);
CREATE INDEX idx_executive_actions_status ON executive_actions(status);

-- Full-text search index
CREATE INDEX idx_executive_actions_search ON executive_actions USING gin(search_vector);

-- Vector similarity search index
CREATE INDEX idx_executive_actions_embedding ON executive_actions 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Composite indexes for common queries
CREATE INDEX idx_executive_actions_admin_type ON executive_actions(administration, action_type);
CREATE INDEX idx_executive_actions_date_status ON executive_actions(signed_date DESC, status);

-- Topic and agency indexes
CREATE INDEX idx_executive_action_topics_primary ON executive_action_topics(primary_topic);
CREATE INDEX idx_executive_action_agencies_name ON executive_action_agencies(agency_name);
```

## Search Integration

### MCP Tool Extensions

```typescript
// Extended search tools for executive actions
interface ExecutiveActionSearchTools {
  search_executive_actions: {
    description: "Search presidential executive actions with filters";
    parameters: {
      query: string;
      action_type?: "executive_order" | "presidential_memorandum" | "proclamation";
      administration?: string; // "Biden", "Trump", etc.
      date_range?: {
        start: string;
        end: string;
      };
      status?: "active" | "revoked" | "superseded";
      agencies?: string[];
      policy_areas?: string[];
      order_number?: number;
      limit?: number;
      offset?: number;
    };
    returns: {
      actions: ExecutiveAction[];
      total_count: number;
      search_metadata: SearchMetadata;
    };
  };

  get_executive_action_details: {
    description: "Get detailed information about a specific executive action";
    parameters: {
      id?: string;
      citation?: string; // "Executive Order 14081"
      order_number?: number;
    };
    returns: ExecutiveAction;
  };

  search_related_content: {
    description: "Find bills and executive actions related to a topic";
    parameters: {
      query: string;
      content_types: ("bills" | "executive_actions")[];
      limit?: number;
    };
    returns: {
      bills: Bill[];
      executive_actions: ExecutiveAction[];
      related_content: RelatedContent[];
    };
  };
}
```

### Unified Search Implementation

```typescript
// Combined search service for bills and executive actions
export class UnifiedSearchService {
  async searchAllContent(
    query: string,
    filters: UnifiedSearchFilters
  ): Promise<UnifiedSearchResults> {
    const results: UnifiedSearchResults = {
      bills: [],
      executive_actions: [],
      total_count: 0,
      search_metadata: {}
    };

    // Parallel search across both content types
    const [billResults, actionResults] = await Promise.all([
      this.searchBills(query, filters.bills),
      this.searchExecutiveActions(query, filters.executive_actions)
    ]);

    // Merge and rank results by relevance
    const mergedResults = this.mergeAndRankResults(
      billResults,
      actionResults,
      query
    );

    return {
      ...mergedResults,
      cross_references: await this.findCrossReferences(mergedResults)
    };
  }

  private async searchExecutiveActions(
    query: string,
    filters: ExecutiveActionFilters
  ): Promise<ExecutiveAction[]> {
    const embedding = await this.generateEmbedding(query);
    
    let sql = `
      SELECT 
        ea.*,
        (1 - (ea.embedding <=> $1)) as semantic_score,
        ts_rank(ea.search_vector, plainto_tsquery($2)) as text_score
      FROM executive_actions ea
      WHERE 1=1
    `;

    const params: any[] = [embedding, query];
    let paramIndex = 2;

    // Apply filters
    if (filters.action_type) {
      sql += ` AND ea.action_type = $${++paramIndex}`;
      params.push(filters.action_type);
    }

    if (filters.administration) {
      sql += ` AND ea.administration = $${++paramIndex}`;
      params.push(filters.administration);
    }

    if (filters.date_range) {
      sql += ` AND ea.signed_date BETWEEN $${++paramIndex} AND $${++paramIndex}`;
      params.push(filters.date_range.start, filters.date_range.end);
    }

    if (filters.status) {
      sql += ` AND ea.status = $${++paramIndex}`;
      params.push(filters.status);
    }

    if (filters.agencies?.length > 0) {
      sql += ` AND EXISTS (
        SELECT 1 FROM executive_action_agencies eaa 
        WHERE eaa.executive_action_id = ea.id 
        AND eaa.agency_name = ANY($${++paramIndex})
      )`;
      params.push(filters.agencies);
    }

    // Combine semantic and text search scores
    sql += `
      ORDER BY (semantic_score * 0.6 + text_score * 0.4) DESC
      LIMIT $${++paramIndex}
      OFFSET $${++paramIndex}
    `;
    params.push(filters.limit || 20, filters.offset || 0);

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  private mergeAndRankResults(
    bills: Bill[],
    actions: ExecutiveAction[],
    query: string
  ): MergedResults {
    // Create unified result objects
    const unifiedResults: UnifiedResult[] = [
      ...bills.map(bill => ({
        type: 'bill' as const,
        content: bill,
        relevance_score: bill.semantic_score || 0
      })),
      ...actions.map(action => ({
        type: 'executive_action' as const,
        content: action,
        relevance_score: action.semantic_score || 0
      }))
    ];

    // Sort by relevance score
    unifiedResults.sort((a, b) => b.relevance_score - a.relevance_score);

    return {
      bills: unifiedResults.filter(r => r.type === 'bill').map(r => r.content as Bill),
      executive_actions: unifiedResults.filter(r => r.type === 'executive_action').map(r => r.content as ExecutiveAction),
      unified_ranking: unifiedResults
    };
  }
}
```

### Context Discovery for Executive Actions

```typescript
// Extended context discovery for executive actions
export class ExecutiveActionContextService {
  async getAvailableAdministrations(): Promise<AdministrationInfo[]> {
    const result = await this.db.query(`
      SELECT 
        administration,
        president_name,
        COUNT(*) as action_count,
        MIN(signed_date) as first_action,
        MAX(signed_date) as last_action
      FROM executive_actions
      GROUP BY administration, president_name
      ORDER BY MAX(signed_date) DESC
    `);

    return result.rows;
  }

  async getAvailableActionTypes(): Promise<ActionTypeInfo[]> {
    const result = await this.db.query(`
      SELECT 
        action_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'active') as active_count
      FROM executive_actions
      GROUP BY action_type
      ORDER BY count DESC
    `);

    return result.rows;
  }

  async getAffectedAgencies(): Promise<AgencyInfo[]> {
    const result = await this.db.query(`
      SELECT 
        eaa.agency_name,
        eaa.agency_code,
        COUNT(DISTINCT eaa.executive_action_id) as action_count,
        ARRAY_AGG(DISTINCT eaa.implementation_role) as roles
      FROM executive_action_agencies eaa
      JOIN executive_actions ea ON eaa.executive_action_id = ea.id
      WHERE ea.status = 'active'
      GROUP BY eaa.agency_name, eaa.agency_code
      ORDER BY action_count DESC
      LIMIT 50
    `);

    return result.rows;
  }
}
```

## Citation Formats

### Executive Action Citation Patterns

```typescript
// Citation generation for executive actions
export class ExecutiveActionCitationService {
  generateCitation(action: ExecutiveAction): Citation {
    const baseFormat = this.getBaseCitationFormat(action.action_type);
    
    return {
      id: action.id,
      type: 'executive_action',
      citation: this.formatCitation(action, baseFormat),
      url: action.content_url,
      title: action.title,
      date: action.signed_date,
      metadata: {
        action_type: action.action_type,
        administration: action.administration,
        status: action.status
      }
    };
  }

  private getBaseCitationFormat(actionType: string): string {
    const formats = {
      'executive_order': 'Executive Order {number}',
      'presidential_memorandum': 'Presidential Memorandum of {date}',
      'proclamation': 'Proclamation {number}',
      'presidential_directive': 'Presidential Directive {number}',
      'national_security_directive': 'National Security Directive {number}'
    };

    return formats[actionType] || 'Presidential Action {number}';
  }

  private formatCitation(action: ExecutiveAction, format: string): string {
    return format
      .replace('{number}', action.executive_order_number?.toString() || '')
      .replace('{date}', this.formatDate(action.signed_date))
      .replace('{title}', action.title);
  }

  generateAPA(action: ExecutiveAction): string {
    // American Psychological Association format
    const president = action.president_name;
    const year = new Date(action.signed_date).getFullYear();
    const actionType = this.getActionTypeForCitation(action.action_type);
    
    return `${president}. (${year}, ${this.formatDate(action.signed_date)}). ${action.title} [${actionType}]. The White House.`;
  }

  generateMLA(action: ExecutiveAction): string {
    // Modern Language Association format
    const president = action.president_name;
    const actionType = this.getActionTypeForCitation(action.action_type);
    
    return `${president}. "${action.title}." ${actionType}, ${this.formatDate(action.signed_date)}, The White House.`;
  }

  generateChicago(action: ExecutiveAction): string {
    // Chicago Manual of Style format
    const president = action.president_name;
    const actionType = this.getActionTypeForCitation(action.action_type);
    
    return `${president}. "${action.title}." ${actionType}. The White House, ${this.formatDate(action.signed_date)}.`;
  }
}
```

### Cross-Reference Citations

```typescript
// Citations that link bills and executive actions
export class CrossReferenceCitationService {
  generateRelatedContentCitations(
    primaryContent: Bill | ExecutiveAction,
    relatedContent: (Bill | ExecutiveAction)[]
  ): CrossReferenceCitation[] {
    return relatedContent.map(content => {
      const relationship = this.determineRelationship(primaryContent, content);
      
      return {
        primary_id: primaryContent.id,
        related_id: content.id,
        relationship,
        citation: this.generateBasicCitation(content),
        context: this.generateRelationshipContext(relationship)
      };
    });
  }

  private determineRelationship(
    primary: Bill | ExecutiveAction,
    related: Bill | ExecutiveAction
  ): RelationshipType {
    // Logic to determine relationship based on content analysis
    if (this.isBill(primary) && this.isExecutiveAction(related)) {
      return this.determineBillToActionRelationship(primary, related);
    }
    
    if (this.isExecutiveAction(primary) && this.isBill(related)) {
      return this.determineActionToBillRelationship(primary, related);
    }
    
    return 'related_to';
  }

  private generateRelationshipContext(relationship: RelationshipType): string {
    const contexts = {
      'implements': 'This executive action implements provisions of the related legislation.',
      'modifies': 'This action modifies or affects the implementation of the related content.',
      'supersedes': 'This action supersedes or replaces the related directive.',
      'relates_to': 'This content addresses similar policy areas or topics.',
      'references': 'This content specifically references or cites the related item.'
    };

    return contexts[relationship] || 'Related content addressing similar topics.';
  }
}
```

## RSS Feed Integration

### Executive Action RSS Sources

```yaml
# Extended RSS configuration for executive actions
rss_feeds:
  bills:
    - url: "https://www.govinfo.gov/rss/bills.xml"
      type: "bills"
      chamber: "both"
      
  executive_actions:
    - url: "https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=executive_order"
      type: "executive_orders"
      format: "json"
      
    - url: "https://www.federalregister.gov/api/v1/articles.json?fields%5B%5D=abstract&fields%5B%5D=body_html_url&fields%5B%5D=citation&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=pdf_url&fields%5B%5D=publication_date&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=agencies&per_page=100&order=newest&conditions%5Bpresidential_document_type%5D%5B%5D=presidential_memorandum"
      type: "presidential_memoranda"
      format: "json"
      
    - url: "https://www.whitehouse.gov/briefing-room/presidential-actions/feed/"
      type: "presidential_actions"
      format: "rss"
```

### RSS Processing for Executive Actions

```typescript
// RSS processor for executive actions
export class ExecutiveActionRSSProcessor {
  async processExecutiveActionsFeed(feedConfig: FeedConfig): Promise<void> {
    const feedData = await this.fetchFeed(feedConfig.url, feedConfig.format);
    
    if (feedConfig.format === 'json') {
      await this.processFederalRegisterJSON(feedData, feedConfig.type);
    } else {
      await this.processWhiteHouseRSS(feedData);
    }
  }

  private async processFederalRegisterJSON(
    data: any,
    actionType: string
  ): Promise<void> {
    for (const item of data.results) {
      const existingAction = await this.findExistingAction(item.document_number);
      
      if (!existingAction) {
        const action = await this.parseExecutiveAction(item, actionType);
        await this.saveExecutiveAction(action);
        await this.generateEmbedding(action.id);
      }
    }
  }

  private async parseExecutiveAction(item: any, actionType: string): Promise<ExecutiveAction> {
    // Extract executive order number from citation
    const orderNumber = this.extractOrderNumber(item.citation);
    
    return {
      executive_order_number: orderNumber,
      action_type: this.mapActionType(actionType),
      title: item.title,
      summary: item.abstract,
      signed_date: item.publication_date,
      administration: this.getCurrentAdministration(),
      president_name: this.getCurrentPresident(),
      citation: item.citation,
      content_url: item.html_url,
      pdf_url: item.pdf_url,
      agencies_affected: item.agencies?.map(a => a.name) || [],
      status: 'active'
    };
  }

  private extractOrderNumber(citation: string): number | null {
    // Parse various citation formats
    const patterns = [
      /Executive Order (\d+)/i,
      /E\.O\. (\d+)/i,
      /EO (\d+)/i
    ];

    for (const pattern of patterns) {
      const match = citation.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  }
}
```

This executive actions integration provides comprehensive support for presidential directives alongside congressional bills, enabling users to search across all types of federal governmental actions and understand the relationships between legislative and executive branches.