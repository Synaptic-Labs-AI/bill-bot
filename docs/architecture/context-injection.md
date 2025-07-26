# Context Injection Strategy

## Executive Summary

Context injection is crucial for preventing LLM hallucination and ensuring accurate search results. This system provides available filter options, sponsor lists, and metadata to guide tool calls with valid parameters, eliminating guesswork and improving search precision.

## Core Problem Statement

### Hallucination Prevention
Without proper context, LLMs often:
- **Invent sponsor names** that don't exist in the database
- **Guess status values** that aren't valid filter options
- **Create invalid date ranges** or committee names
- **Assume topic categories** that don't match the taxonomy

### Solution Approach
**Direct Schema Injection**: Inject available options directly into MCP tool descriptions and JSON schemas. When the LLM receives the tool list, it sees current available sponsors, statuses, topics, etc. embedded in the tool descriptions, eliminating the need for separate discovery calls.

## MCP Tool Schema Injection

### Dynamic Tool Description Generation

The MCP server dynamically generates tool descriptions with current available options embedded directly in the JSON schema descriptions. This ensures the LLM always sees up-to-date context without requiring additional API calls.

```typescript
// Dynamic MCP Tool with Context Injection
interface DynamicSearchBillsTool {
  name: "search_bills";
  description: string; // Generated with current context
  inputSchema: {
    type: "object";
    properties: {
      query: {
        type: "string";
        description: "Search query for bills";
      };
      sponsors?: {
        type: "array";
        items: { type: "string" };
        description: string; // Injected with current sponsor list
      };
      status?: {
        type: "string";
        enum: string[]; // Dynamic enum with current statuses
        description: string; // Injected with status descriptions
      };
      topics?: {
        type: "array";
        items: { type: "string" };
        description: string; // Injected with current topic categories
      };
      date_range?: {
        type: "object";
        properties: {
          start: { type: "string"; format: "date" };
          end: { type: "string"; format: "date" };
        };
        description: string; // Injected with available date ranges
      };
    };
  };
}
```

### Implementation: Dynamic Tool Generation

```typescript
// MCP Server with Dynamic Context Injection
export class ContextAwareMCPServer {
  private contextCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getToolDefinitions(): Promise<MCPTool[]> {
    // Get current context data
    const context = await this.getCurrentContext();
    
    return [
      this.generateSearchBillsTool(context),
      this.generateSearchExecutiveActionsTool(context),
      this.generateGetBillDetailsTool(context)
    ];
  }

  private async getCurrentContext(): Promise<ContextData> {
    // Check cache first
    const cached = this.contextCache.get('current_context');
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    // Fetch fresh context data
    const [sponsors, statuses, topics, administrations, agencies, dateRanges] = await Promise.all([
      this.getTopSponsors(20),
      this.getAvailableStatuses(),
      this.getTopTopics(15),
      this.getAdministrations(),
      this.getTopAgencies(25),
      this.getAvailableDateRanges()
    ]);

    const context = {
      sponsors,
      statuses,
      topics,
      administrations,
      agencies,
      dateRanges,
      lastUpdated: new Date().toISOString()
    };

    // Cache the result
    this.contextCache.set('current_context', {
      data: context,
      timestamp: Date.now()
    });

    return context;
  }

  private generateSearchBillsTool(context: ContextData): MCPTool {
    // Generate sponsor list for description
    const sponsorList = context.sponsors
      .map(s => `"${s.name}" (${s.party}-${s.state})`)
      .join(', ');

    // Generate status enum and descriptions
    const statusEnum = context.statuses.map(s => s.status);
    const statusDescriptions = context.statuses
      .map(s => `"${s.status}": ${s.description}`)
      .join(', ');

    // Generate topic categories
    const topicList = context.topics
      .map(t => `"${t.category}"`)
      .join(', ');

    // Generate date range guidance
    const dateRangeInfo = context.dateRanges
      .map(d => `${d.session}: ${d.start_date} to ${d.end_date}`)
      .join(', ');

    return {
      name: "search_bills",
      description: `Search Congressional bills with semantic and keyword matching. Use exact sponsor names and valid status values from the available options.`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query for bills (e.g., 'healthcare legislation', 'infrastructure spending')"
          },
          sponsors: {
            type: "array",
            items: { type: "string" },
            description: `Bill sponsors. Use exact names from: ${sponsorList}. Only include sponsors you want to filter by.`
          },
          status: {
            type: "string",
            enum: statusEnum,
            description: `Bill status. Available options: ${statusDescriptions}`
          },
          topics: {
            type: "array", 
            items: { type: "string" },
            description: `Topic categories. Available topics: ${topicList}`
          },
          chamber: {
            type: "string",
            enum: ["house", "senate", "both"],
            description: "Congressional chamber: 'house' for House bills, 'senate' for Senate bills, 'both' for all"
          },
          date_range: {
            type: "object",
            properties: {
              start: { type: "string", format: "date" },
              end: { type: "string", format: "date" }
            },
            description: `Date range for bill introduction. Available sessions: ${dateRangeInfo}. Use YYYY-MM-DD format.`
          },
          limit: {
            type: "number",
            default: 10,
            minimum: 1,
            maximum: 50,
            description: "Maximum number of results to return (1-50)"
          }
        },
        required: ["query"]
      }
    };
  }

  private generateSearchExecutiveActionsTool(context: ContextData): MCPTool {
    // Generate administration list
    const administrationList = context.administrations
      .map(a => `"${a.administration}" (${a.president_name})`)
      .join(', ');

    // Generate agency list
    const agencyList = context.agencies
      .map(a => `"${a.agency_name}"${a.agency_code ? ` (${a.agency_code})` : ''}`)
      .join(', ');

    return {
      name: "search_executive_actions",
      description: `Search presidential executive actions including executive orders, memoranda, and proclamations.`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for executive actions"
          },
          action_type: {
            type: "string",
            enum: ["executive_order", "presidential_memorandum", "proclamation", "presidential_directive"],
            description: "Type of executive action to search"
          },
          administration: {
            type: "string",
            description: `Presidential administration. Available: ${administrationList}`
          },
          agencies: {
            type: "array",
            items: { type: "string" },
            description: `Federal agencies affected. Available agencies: ${agencyList}`
          },
          status: {
            type: "string",
            enum: ["active", "revoked", "superseded", "expired", "amended"],
            description: "Current status of the executive action"
          },
          date_range: {
            type: "object",
            properties: {
              start: { type: "string", format: "date" },
              end: { type: "string", format: "date" }
            },
            description: "Date range for when the action was signed"
          }
        },
        required: ["query"]
      }
    };
  }
}
```

### Context Data Retrieval

```typescript
// Fast context data retrieval methods
export class ContextDataService {
  async getTopSponsors(limit: number = 20): Promise<SponsorInfo[]> {
    const result = await this.db.query(`
      SELECT 
        s.full_name as name,
        s.party,
        s.state,
        s.chamber,
        COUNT(bs.bill_id) as bill_count
      FROM sponsors s
      LEFT JOIN bill_sponsors bs ON s.id = bs.sponsor_id
      LEFT JOIN bills b ON bs.bill_id = b.id
      WHERE b.introduced_date >= NOW() - INTERVAL '2 years'
      GROUP BY s.id, s.full_name, s.party, s.state, s.chamber
      HAVING COUNT(bs.bill_id) >= 3
      ORDER BY bill_count DESC, s.full_name
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  async getAvailableStatuses(): Promise<StatusInfo[]> {
    const result = await this.db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        CASE status
          WHEN 'introduced' THEN 'Bill has been introduced in Congress'
          WHEN 'passed_house' THEN 'Passed by the House of Representatives'
          WHEN 'passed_senate' THEN 'Passed by the Senate'
          WHEN 'enacted' THEN 'Signed into law by the President'
          WHEN 'vetoed' THEN 'Vetoed by the President'
          ELSE 'Other legislative status'
        END as description
      FROM bills
      WHERE introduced_date >= NOW() - INTERVAL '5 years'
      GROUP BY status
      ORDER BY count DESC
    `);

    return result.rows;
  }

  async getTopTopics(limit: number = 15): Promise<TopicInfo[]> {
    const result = await this.db.query(`
      SELECT 
        bt.primary_topic as category,
        COUNT(DISTINCT bt.bill_id) as bill_count
      FROM bill_topics bt
      JOIN bills b ON bt.bill_id = b.id
      WHERE b.introduced_date >= NOW() - INTERVAL '2 years'
        AND bt.primary_topic IS NOT NULL
      GROUP BY bt.primary_topic
      ORDER BY bill_count DESC, bt.primary_topic
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  async getAdministrations(): Promise<AdministrationInfo[]> {
    const result = await this.db.query(`
      SELECT DISTINCT
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

  async getTopAgencies(limit: number = 25): Promise<AgencyInfo[]> {
    const result = await this.db.query(`
      SELECT 
        eaa.agency_name,
        eaa.agency_code,
        COUNT(DISTINCT eaa.executive_action_id) as action_count
      FROM executive_action_agencies eaa
      JOIN executive_actions ea ON eaa.executive_action_id = ea.id
      WHERE ea.status = 'active'
      GROUP BY eaa.agency_name, eaa.agency_code
      ORDER BY action_count DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  async getAvailableDateRanges(): Promise<DateRangeInfo[]> {
    const result = await this.db.query(`
      SELECT 
        CONCAT(congress_number, 'th Congress') as session,
        MIN(introduced_date)::text as start_date,
        MAX(introduced_date)::text as end_date,
        COUNT(*) as bill_count
      FROM bills
      GROUP BY congress_number
      ORDER BY congress_number DESC
      LIMIT 5
    `);

    return result.rows;
  }
}
```

### Performance Optimization

```typescript
// Cached context with smart invalidation
export class CachedContextService {
  private cache = new Map<string, CacheEntry>();
  
  constructor(private contextService: ContextDataService) {
    // Refresh cache every 5 minutes
    setInterval(() => this.refreshCache(), 5 * 60 * 1000);
  }

  async getContext(): Promise<ContextData> {
    const cached = this.cache.get('main_context');
    
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }

    return await this.refreshCache();
  }

  private async refreshCache(): Promise<ContextData> {
    console.log('Refreshing context cache...');
    
    const context = await this.buildContextData();
    
    this.cache.set('main_context', {
      data: context,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000 // 5 minutes
    });

    return context;
  }

  private async buildContextData(): Promise<ContextData> {
    // Parallel context fetching for performance
    const startTime = Date.now();
    
    const [sponsors, statuses, topics, administrations, agencies, dateRanges] = 
      await Promise.all([
        this.contextService.getTopSponsors(20),
        this.contextService.getAvailableStatuses(),
        this.contextService.getTopTopics(15),
        this.contextService.getAdministrations(),
        this.contextService.getTopAgencies(25),
        this.contextService.getAvailableDateRanges()
      ]);

    const context = {
      sponsors,
      statuses,
      topics,
      administrations,
      agencies,
      dateRanges,
      lastUpdated: new Date().toISOString(),
      buildTime: Date.now() - startTime
    };

    console.log(`Context built in ${context.buildTime}ms`);
    return context;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
}
```

### Database Lookup Patterns

#### Sponsor Discovery Query

```sql
-- Fast sponsor lookup with aggregation
CREATE OR REPLACE FUNCTION get_available_sponsors(
  p_chamber text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_min_bill_count integer DEFAULT 1
)
RETURNS TABLE (
  name text,
  party text,
  state text,
  chamber text,
  bill_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.full_name as name,
    s.party,
    s.state,
    s.chamber,
    COUNT(bs.bill_id) as bill_count
  FROM sponsors s
  LEFT JOIN bill_sponsors bs ON s.id = bs.sponsor_id
  WHERE 
    (p_chamber IS NULL OR s.chamber = p_chamber OR p_chamber = 'both')
  GROUP BY s.id, s.full_name, s.party, s.state, s.chamber
  HAVING COUNT(bs.bill_id) >= p_min_bill_count
  ORDER BY bill_count DESC, s.full_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Index for performance
CREATE INDEX idx_sponsors_chamber_bills ON sponsors(chamber) 
INCLUDE (full_name, party, state);
```

#### Status Discovery Query

```sql
-- Bill status enumeration with counts
CREATE OR REPLACE FUNCTION get_available_statuses()
RETURNS TABLE (
  status text,
  description text,
  count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.status,
    CASE b.status
      WHEN 'introduced' THEN 'Bill has been introduced'
      WHEN 'passed_house' THEN 'Passed by House of Representatives'
      WHEN 'passed_senate' THEN 'Passed by Senate'
      WHEN 'enacted' THEN 'Signed into law'
      WHEN 'vetoed' THEN 'Vetoed by President'
      ELSE 'Other status'
    END as description,
    COUNT(*) as count
  FROM bills b
  GROUP BY b.status
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;
```

#### Topic Category Discovery

```sql
-- Topic taxonomy with hierarchical structure
CREATE OR REPLACE FUNCTION get_topic_categories(
  p_parent_category text DEFAULT NULL
)
RETURNS TABLE (
  category text,
  subcategories text[],
  bill_count bigint
) AS $$
BEGIN
  IF p_parent_category IS NULL THEN
    -- Return top-level categories
    RETURN QUERY
    SELECT 
      bt.primary_topic as category,
      ARRAY_AGG(DISTINCT bt.secondary_topic) as subcategories,
      COUNT(DISTINCT bt.bill_id) as bill_count
    FROM bill_topics bt
    WHERE bt.primary_topic IS NOT NULL
    GROUP BY bt.primary_topic
    ORDER BY bill_count DESC;
  ELSE
    -- Return subcategories for a specific parent
    RETURN QUERY
    SELECT 
      bt.secondary_topic as category,
      ARRAY[]::text[] as subcategories,
      COUNT(bt.bill_id) as bill_count
    FROM bill_topics bt
    WHERE bt.primary_topic = p_parent_category
      AND bt.secondary_topic IS NOT NULL
    GROUP BY bt.secondary_topic
    ORDER BY bill_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

## Context-Aware Search Workflow

### Pre-Search Context Discovery

```typescript
// MCP Server Implementation for Context-Aware Search
export class ContextAwareSearchService {
  async performContextualSearch(query: string, iteration: number): Promise<SearchResult> {
    // Step 1: Discover available context if first iteration
    let availableContext: ContextMetadata = {};
    
    if (iteration === 0) {
      availableContext = await this.discoverContext(query);
    }

    // Step 2: Parse query intent and extract search parameters
    const searchIntent = this.parseSearchIntent(query, availableContext);

    // Step 3: Validate parameters against available options
    const validatedParams = await this.validateSearchParameters(searchIntent);

    // Step 4: Execute search with validated parameters
    const searchResults = await this.executeValidatedSearch(validatedParams);

    return {
      results: searchResults,
      context: availableContext,
      searchMetadata: {
        intent: searchIntent,
        validatedParams,
        needsRefinement: this.assessResultQuality(searchResults, query)
      }
    };
  }

  private async discoverContext(query: string): Promise<ContextMetadata> {
    const context: ContextMetadata = {};

    // Discover sponsors if query mentions people/names
    if (this.queryMentionsSponsors(query)) {
      context.availableSponsors = await this.callTool('get_available_sponsors', {
        limit: 50
      });
    }

    // Discover topics if query mentions policy areas
    if (this.queryMentionsTopics(query)) {
      context.availableTopics = await this.callTool('get_topic_categories', {});
    }

    // Always include statuses and date ranges
    context.availableStatuses = await this.callTool('get_available_statuses', {});
    context.availableDateRanges = await this.callTool('get_date_ranges', {});

    return context;
  }

  private async validateSearchParameters(intent: SearchIntent): Promise<ValidatedSearchParams> {
    const validated: ValidatedSearchParams = { ...intent };

    // Validate sponsor names
    if (intent.sponsors?.length > 0) {
      validated.sponsors = await this.validateSponsors(intent.sponsors);
    }

    // Validate status values
    if (intent.status) {
      validated.status = await this.validateStatus(intent.status);
    }

    // Validate topic categories
    if (intent.topics?.length > 0) {
      validated.topics = await this.validateTopics(intent.topics);
    }

    return validated;
  }
}
```

### Intelligent Parameter Matching

```typescript
// Smart matching for approximate sponsor names
export class ParameterValidator {
  async validateSponsors(requestedSponsors: string[]): Promise<ValidatedSponsor[]> {
    const availableSponsors = await this.getAvailableSponsors();
    const validated: ValidatedSponsor[] = [];

    for (const requested of requestedSponsors) {
      // Exact match first
      let match = availableSponsors.find(s => 
        s.name.toLowerCase() === requested.toLowerCase()
      );

      if (!match) {
        // Fuzzy matching for common variations
        match = this.findBestSponsorMatch(requested, availableSponsors);
      }

      if (match) {
        validated.push({
          requested: requested,
          matched: match,
          confidence: this.calculateMatchConfidence(requested, match.name)
        });
      } else {
        // Log unmatched sponsor for future improvement
        console.warn(`No sponsor match found for: ${requested}`);
      }
    }

    return validated;
  }

  private findBestSponsorMatch(
    requested: string, 
    available: Sponsor[]
  ): Sponsor | null {
    const normalizedRequest = this.normalizeName(requested);
    
    // Try last name matching
    for (const sponsor of available) {
      const lastName = sponsor.name.split(' ').pop()?.toLowerCase();
      if (lastName && normalizedRequest.includes(lastName)) {
        return sponsor;
      }
    }

    // Try fuzzy string matching
    let bestMatch: Sponsor | null = null;
    let bestScore = 0;

    for (const sponsor of available) {
      const score = this.calculateSimilarity(normalizedRequest, sponsor.name.toLowerCase());
      if (score > 0.7 && score > bestScore) {
        bestMatch = sponsor;
        bestScore = score;
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Implement Levenshtein distance or similar algorithm
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
}
```

## Metadata Injection Patterns

### Dynamic Context Injection

```typescript
// System message enhancement with available options
export class ContextInjectionService {
  async generateSystemMessage(
    basePrompt: string, 
    query: string
  ): Promise<string> {
    const relevantContext = await this.extractRelevantContext(query);
    
    let enhancedPrompt = basePrompt;

    // Inject sponsor context if relevant
    if (relevantContext.sponsors) {
      enhancedPrompt += `\n\nAVAILABLE SPONSORS (use exact names):`;
      enhancedPrompt += relevantContext.sponsors
        .slice(0, 20) // Limit to avoid token overflow
        .map(s => `- ${s.name} (${s.party}-${s.state}, ${s.chamber})`)
        .join('\n');
    }

    // Inject status context
    if (relevantContext.statuses) {
      enhancedPrompt += `\n\nVALID STATUS VALUES:`;
      enhancedPrompt += relevantContext.statuses
        .map(s => `- "${s.status}": ${s.description}`)
        .join('\n');
    }

    // Inject topic context
    if (relevantContext.topics) {
      enhancedPrompt += `\n\nAVAILABLE TOPIC CATEGORIES:`;
      enhancedPrompt += relevantContext.topics
        .slice(0, 15)
        .map(t => `- ${t.category} (${t.bill_count} bills)`)
        .join('\n');
    }

    enhancedPrompt += `\n\nIMPORTANT: Always use exact names and values from the lists above. Never guess or invent parameter values.`;

    return enhancedPrompt;
  }

  private async extractRelevantContext(query: string): Promise<RelevantContext> {
    const context: RelevantContext = {};

    // Use simple keyword detection to determine what context to include
    const queryLower = query.toLowerCase();

    // Check for sponsor-related keywords
    if (this.containsSponsorKeywords(queryLower)) {
      context.sponsors = await this.getRelevantSponsors(query);
    }

    // Check for status-related keywords
    if (this.containsStatusKeywords(queryLower)) {
      context.statuses = await this.getAllStatuses();
    }

    // Check for topic-related keywords
    if (this.containsTopicKeywords(queryLower)) {
      context.topics = await this.getRelevantTopics(query);
    }

    return context;
  }

  private containsSponsorKeywords(query: string): boolean {
    const sponsorKeywords = [
      'sponsored by', 'authored by', 'introduced by',
      'representative', 'senator', 'congressman', 'congresswoman',
      'sponsor', 'author', 'introduced'
    ];
    return sponsorKeywords.some(keyword => query.includes(keyword));
  }

  private containsTopicKeywords(query: string): boolean {
    const topicKeywords = [
      'about', 'regarding', 'related to', 'concerning',
      'healthcare', 'education', 'defense', 'environment',
      'economy', 'immigration', 'tax', 'budget'
    ];
    return topicKeywords.some(keyword => query.includes(keyword));
  }
}
```

### Dropdown Population Strategy

```typescript
// Frontend context fetching for form controls
export class FrontendContextService {
  // Cache context data to avoid repeated API calls
  private contextCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getSponsorsForDropdown(chamber?: string): Promise<DropdownOption[]> {
    const cacheKey = `sponsors_${chamber || 'all'}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) return cached;

    const response = await fetch('/api/chat/context/sponsors', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const { sponsors } = await response.json();
    
    const options = sponsors.map((sponsor: any) => ({
      value: sponsor.name,
      label: `${sponsor.name} (${sponsor.party}-${sponsor.state})`,
      metadata: {
        party: sponsor.party,
        state: sponsor.state,
        chamber: sponsor.chamber,
        billCount: sponsor.bill_count
      }
    }));

    this.setCachedData(cacheKey, options);
    return options;
  }

  async getTopicsForDropdown(): Promise<DropdownOption[]> {
    const cacheKey = 'topics';
    const cached = this.getCachedData(cacheKey);
    
    if (cached) return cached;

    const response = await fetch('/api/chat/context/topics');
    const { topics } = await response.json();

    const options = topics.map((topic: any) => ({
      value: topic.category,
      label: `${topic.category} (${topic.bill_count} bills)`,
      metadata: {
        subcategories: topic.subcategories,
        billCount: topic.bill_count
      }
    }));

    this.setCachedData(cacheKey, options);
    return options;
  }

  private getCachedData(key: string): any | null {
    const cached = this.contextCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.contextCache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCachedData(key: string, data: any): void {
    this.contextCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

## Search Parameter Validation

### Real-time Validation

```typescript
// Backend validation middleware for search parameters
export class SearchParameterValidator {
  async validateSearchRequest(params: SearchParams): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate sponsors exist
    if (params.sponsors?.length > 0) {
      const sponsorValidation = await this.validateSponsors(params.sponsors);
      errors.push(...sponsorValidation.errors);
      warnings.push(...sponsorValidation.warnings);
    }

    // Validate status values
    if (params.status) {
      const statusValidation = await this.validateStatus(params.status);
      if (!statusValidation.isValid) {
        errors.push({
          field: 'status',
          message: `Invalid status: ${params.status}`,
          validOptions: statusValidation.availableOptions
        });
      }
    }

    // Validate date ranges
    if (params.dateRange) {
      const dateValidation = this.validateDateRange(params.dateRange);
      if (!dateValidation.isValid) {
        errors.push({
          field: 'dateRange',
          message: dateValidation.error,
          suggestion: dateValidation.suggestion
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: this.generateSuggestions(params, errors)
    };
  }

  private async validateSponsors(sponsors: string[]): Promise<SponsorValidationResult> {
    const availableSponsors = await this.getAvailableSponsors();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const sponsor of sponsors) {
      const exactMatch = availableSponsors.find(s => 
        s.name.toLowerCase() === sponsor.toLowerCase()
      );

      if (!exactMatch) {
        const fuzzyMatch = this.findClosestSponsor(sponsor, availableSponsors);
        
        if (fuzzyMatch && fuzzyMatch.similarity > 0.8) {
          warnings.push({
            field: 'sponsors',
            message: `Did you mean "${fuzzyMatch.sponsor.name}"?`,
            originalValue: sponsor,
            suggestedValue: fuzzyMatch.sponsor.name
          });
        } else {
          errors.push({
            field: 'sponsors',
            message: `Sponsor not found: ${sponsor}`,
            suggestions: this.getSimilarSponsors(sponsor, availableSponsors)
          });
        }
      }
    }

    return { errors, warnings };
  }
}
```

## Performance Optimization

### Context Caching Strategy

```sql
-- Materialized views for fast context lookup
CREATE MATERIALIZED VIEW mv_sponsor_stats AS
SELECT 
  s.id,
  s.full_name,
  s.party,
  s.state,
  s.chamber,
  COUNT(bs.bill_id) as bill_count,
  MAX(b.introduced_date) as latest_bill_date
FROM sponsors s
LEFT JOIN bill_sponsors bs ON s.id = bs.sponsor_id
LEFT JOIN bills b ON bs.bill_id = b.id
GROUP BY s.id, s.full_name, s.party, s.state, s.chamber;

-- Refresh schedule (run via cron job)
CREATE OR REPLACE FUNCTION refresh_context_cache()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sponsor_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_topic_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_status_stats;
END;
$$ LANGUAGE plpgsql;

-- Index for fast lookups
CREATE UNIQUE INDEX idx_mv_sponsor_stats_id ON mv_sponsor_stats(id);
CREATE INDEX idx_mv_sponsor_stats_chamber ON mv_sponsor_stats(chamber);
CREATE INDEX idx_mv_sponsor_stats_bill_count ON mv_sponsor_stats(bill_count DESC);
```

### API Response Optimization

```typescript
// Optimized context API endpoints
export class OptimizedContextController {
  // Stream large context responses
  async getSponsorsStream(req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    res.write('[');

    const sponsors = await this.streamSponsors(req.query);
    let first = true;

    for await (const sponsor of sponsors) {
      if (!first) res.write(',');
      res.write(JSON.stringify(sponsor));
      first = false;
    }

    res.write(']');
    res.end();
  }

  // Paginated context for large datasets
  async getTopicsPaginated(req: Request, res: Response): Promise<void> {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await this.getTopicsPage(Number(limit), offset);
    
    res.json({
      data: result.topics,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: result.total,
        pages: Math.ceil(result.total / Number(limit))
      }
    });
  }
}
```

This context injection strategy ensures that the LLM always has access to valid, up-to-date options for search parameters, significantly reducing hallucination and improving search accuracy. The system provides both proactive context discovery and reactive validation to maintain data integrity.