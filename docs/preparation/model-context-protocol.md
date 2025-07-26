# Model Context Protocol (MCP) Documentation

## Executive Summary

Model Context Protocol (MCP) is an open standard introduced by Anthropic that enables secure, standardized connections between AI applications and data sources. Think of it as "USB for AI integrations" - it solves the M×N integration problem by providing a unified protocol for connecting any AI application to any data source through standardized servers.

## Technology Overview

MCP uses a client-server architecture where:
- **MCP Hosts**: AI applications (like Claude Desktop, IDEs) that want to access data
- **MCP Clients**: Protocol clients that maintain 1:1 connections with servers  
- **MCP Servers**: Lightweight programs exposing specific capabilities
- **Data Sources**: Local or remote systems accessible through servers

The protocol is built on JSON-RPC 2.0 and supports multiple transport methods (stdio, HTTP/SSE, HTTP streaming).

## Core Architecture

### Components

```typescript
interface MCPArchitecture {
  host: {
    role: 'AI application requesting data access';
    examples: ['Claude Desktop', 'IDEs', 'Custom AI tools'];
  };
  client: {
    role: 'Protocol client managing server connections';
    responsibility: '1:1 connection management with servers';
  };
  server: {
    role: 'Expose capabilities through standardized protocol';
    examples: ['Database connectors', 'API wrappers', 'File systems'];
  };
  transport: {
    types: ['stdio', 'HTTP/SSE', 'HTTP streaming'];
    selection: 'Based on deployment context';
  };
}
```

### 2025 Protocol Updates

- **Streamable HTTP transport**: Replacing HTTP+SSE for better performance
- **Remote MCP servers**: Internet-accessible servers with authorization flows
- **Stateful sessions**: Support for persistent state using Durable Objects
- **Enhanced security**: Improved authorization and access control

## Creating MCP Servers

### Basic Server Structure (TypeScript)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

class BillBotMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'billbot-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_bills',
            description: 'Search legislative bills by keyword, date, or status',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for bills',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 10,
                },
                date_range: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', format: 'date' },
                    end: { type: 'string', format: 'date' },
                  },
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_bill_details',
            description: 'Get detailed information about a specific bill',
            inputSchema: {
              type: 'object',
              properties: {
                bill_id: {
                  type: 'string',
                  description: 'Unique identifier for the bill',
                },
              },
              required: ['bill_id'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_bills':
          return await this.searchBills(args);
        case 'get_bill_details':
          return await this.getBillDetails(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async searchBills(args: any) {
    // Implementation for searching bills
    const { query, limit = 10, date_range } = args;
    
    // Database query logic here
    const results = await this.queryDatabase(query, limit, date_range);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  private async getBillDetails(args: any) {
    const { bill_id } = args;
    
    // Fetch detailed bill information
    const billDetails = await this.fetchBillById(bill_id);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(billDetails, null, 2),
        },
      ],
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new BillBotMCPServer();
server.start().catch(console.error);
```

### Server Configuration (package.json)

```json
{
  "name": "billbot-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Client-Server Communication

### Transport Methods

#### 1. stdio Transport (Local Development)

```typescript
// Server side
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.connect(transport);
```

```typescript
// Client side
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['path/to/server.js'],
});
```

#### 2. HTTP/SSE Transport (Remote)

```typescript
// Server configuration for HTTP transport
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
const transport = new SSEServerTransport('/mcp', app);
await server.connect(transport);

app.listen(3000, () => {
  console.log('MCP server running on http://localhost:3000');
});
```

#### 3. HTTP Streaming (2025 Update)

```typescript
// Modern streaming transport
import { HttpStreamingTransport } from '@modelcontextprotocol/sdk/server/streaming.js';

const transport = new HttpStreamingTransport({
  port: 3000,
  path: '/mcp/stream',
});
```

### Protocol Communication Flow

```typescript
interface MCPCommunication {
  // 1. Initialize connection
  initialize: {
    request: {
      method: 'initialize';
      params: {
        protocolVersion: string;
        capabilities: object;
        clientInfo: {
          name: string;
          version: string;
        };
      };
    };
    response: {
      protocolVersion: string;
      capabilities: object;
      serverInfo: {
        name: string;
        version: string;
      };
    };
  };

  // 2. List available tools
  listTools: {
    request: {
      method: 'tools/list';
    };
    response: {
      tools: Tool[];
    };
  };

  // 3. Call tool
  callTool: {
    request: {
      method: 'tools/call';
      params: {
        name: string;
        arguments: object;
      };
    };
    response: {
      content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
      }>;
    };
  };
}
```

## Tool Definitions and Schemas

### Complex Tool Schema Example

```typescript
const advancedBillSearchTool: Tool = {
  name: 'advanced_bill_search',
  description: 'Perform advanced search across legislative bills with multiple filters',
  inputSchema: {
    type: 'object',
    properties: {
      // Text search
      query: {
        type: 'string',
        description: 'Keywords to search for in bill title, summary, or content',
      },
      
      // Filters
      filters: {
        type: 'object',
        properties: {
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['introduced', 'committee', 'passed_house', 'passed_senate', 'enacted', 'vetoed'],
            },
            description: 'Bill status filters',
          },
          chamber: {
            type: 'string',
            enum: ['house', 'senate', 'both'],
            description: 'Originating chamber',
          },
          sponsor_party: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['democrat', 'republican', 'independent'],
            },
          },
          committees: {
            type: 'array',
            items: { type: 'string' },
            description: 'Committee names to filter by',
          },
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Policy topic tags',
          },
        },
      },
      
      // Pagination and sorting
      pagination: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
          offset: {
            type: 'number',
            minimum: 0,
            default: 0,
          },
        },
      },
      
      sort: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['relevance', 'date_introduced', 'last_action', 'title'],
            default: 'relevance',
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
          },
        },
      },
    },
    required: ['query'],
  },
};
```

### Iterative Search Implementation

```typescript
class IterativeBillSearch {
  private searchHistory: Array<{
    query: string;
    results: any[];
    timestamp: Date;
  }> = [];

  async performIterativeSearch(
    initialQuery: string,
    maxIterations: number = 3
  ): Promise<any[]> {
    let currentQuery = initialQuery;
    let allResults: any[] = [];
    let iteration = 0;

    while (iteration < maxIterations) {
      // Perform search
      const results = await this.searchBills({
        query: currentQuery,
        limit: 20,
      });

      // Store in history
      this.searchHistory.push({
        query: currentQuery,
        results,
        timestamp: new Date(),
      });

      allResults = [...allResults, ...results];

      // If we have enough results or no more results, break
      if (results.length === 0 || allResults.length >= 50) {
        break;
      }

      // Generate refined query based on results
      currentQuery = await this.refineQuery(currentQuery, results);
      iteration++;
    }

    return this.deduplicateResults(allResults);
  }

  private async refineQuery(originalQuery: string, results: any[]): Promise<string> {
    // Extract common terms from successful results
    const terms = results
      .map(bill => bill.title + ' ' + bill.summary)
      .join(' ')
      .split(/\s+/)
      .filter(term => term.length > 3)
      .slice(0, 5);

    return `${originalQuery} OR ${terms.join(' OR ')}`;
  }

  private deduplicateResults(results: any[]): any[] {
    const seen = new Set();
    return results.filter(bill => {
      if (seen.has(bill.id)) return false;
      seen.add(bill.id);
      return true;
    });
  }
}
```

## Resource Management

### Exposing Resources

```typescript
// Add resource capabilities to server
this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'bill://recent',
        name: 'Recent Bills',
        description: 'Most recently introduced bills',
        mimeType: 'application/json',
      },
      {
        uri: 'bill://trending',
        name: 'Trending Bills',
        description: 'Bills with recent activity',
        mimeType: 'application/json',
      },
    ],
  };
});

this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  switch (uri) {
    case 'bill://recent':
      const recentBills = await this.getRecentBills();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(recentBills, null, 2),
          },
        ],
      };
    
    case 'bill://trending':
      const trendingBills = await this.getTrendingBills();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(trendingBills, null, 2),
          },
        ],
      };
    
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});
```

## Best Practices for MCP Implementation

### 1. Error Handling

```typescript
class MCPErrorHandler {
  static handleToolError(error: Error, toolName: string) {
    console.error(`Tool ${toolName} failed:`, error);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Tool execution failed',
            tool: toolName,
            message: error.message,
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  static validateToolInput(input: any, schema: object): boolean {
    // Implement JSON schema validation
    // Return true if valid, false otherwise
    return true; // Simplified
  }
}
```

### 2. Performance Optimization

```typescript
class MCPPerformanceOptimizer {
  private cache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();

  async cachedToolCall(
    toolName: string,
    args: any,
    ttlMs: number = 60000
  ): Promise<any> {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    const now = Date.now();

    // Check cache
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.cache.get(cacheKey);
      }
    }

    // Execute tool and cache result
    const result = await this.executeTool(toolName, args);
    this.cache.set(cacheKey, result);
    this.cacheExpiry.set(cacheKey, now + ttlMs);

    return result;
  }

  private async executeTool(toolName: string, args: any): Promise<any> {
    // Tool execution logic
    return {};
  }
}
```

### 3. Security Considerations

```typescript
class MCPSecurityManager {
  private allowedOrigins = new Set(['localhost:3000', 'your-app.com']);
  private rateLimits = new Map<string, number[]>();

  validateRequest(origin: string, clientId: string): boolean {
    // Origin validation
    if (!this.allowedOrigins.has(origin)) {
      return false;
    }

    // Rate limiting
    const now = Date.now();
    const window = 60000; // 1 minute
    const limit = 100; // requests per minute

    if (!this.rateLimits.has(clientId)) {
      this.rateLimits.set(clientId, []);
    }

    const requests = this.rateLimits.get(clientId)!;
    const recentRequests = requests.filter(time => now - time < window);
    
    if (recentRequests.length >= limit) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimits.set(clientId, recentRequests);
    
    return true;
  }

  sanitizeInput(input: any): any {
    // Implement input sanitization
    return input;
  }
}
```

## Deployment Patterns

### Local Development

```json
// Claude Desktop config for local MCP server
{
  "mcpServers": {
    "billbot": {
      "command": "node",
      "args": ["path/to/billbot-mcp-server/dist/index.js"]
    }
  }
}
```

### Remote Deployment (Railway/Cloudflare)

```typescript
// Railway deployment configuration
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for MCP clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// MCP server setup
const transport = new SSEServerTransport('/mcp', app);
await server.connect(transport);

app.listen(port, () => {
  console.log(`MCP server running on port ${port}`);
});
```

## Integration with Bill Bot

### Database Integration

```typescript
import { createClient } from '@supabase/supabase-js';

class BillBotMCPDatabase {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async vectorSearch(query: string, limit: number = 10) {
    // Use Supabase vector search for semantic bill search
    const embedding = await this.generateEmbedding(query);
    
    const { data, error } = await this.supabase
      .rpc('match_bills', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
      });

    if (error) throw error;
    return data;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Integration with Cohere or other embedding service
    // Return embedding vector
    return [];
  }
}
```

### Citation Management

```typescript
interface Citation {
  id: string;
  type: 'bill' | 'amendment' | 'vote' | 'committee_report';
  title: string;
  url: string;
  relevance_score: number;
  excerpt: string;
}

class CitationManager {
  generateCitation(bill: any, query: string): Citation {
    return {
      id: bill.id,
      type: 'bill',
      title: bill.title,
      url: bill.official_url,
      relevance_score: this.calculateRelevance(bill, query),
      excerpt: this.extractRelevantExcerpt(bill.summary, query),
    };
  }

  private calculateRelevance(bill: any, query: string): number {
    // Implement relevance scoring logic
    return 0.85;
  }

  private extractRelevantExcerpt(text: string, query: string): string {
    // Extract relevant portion of text
    return text.substring(0, 200) + '...';
  }
}
```

## Common Pitfalls to Avoid

1. **Missing Error Handling**: Always wrap tool calls in try-catch blocks
2. **Poor Input Validation**: Validate all inputs against schemas
3. **Memory Leaks**: Clear caches and close connections properly
4. **Security Oversights**: Don't expose sensitive data in tool responses
5. **Performance Issues**: Implement caching and rate limiting
6. **Transport Mismatches**: Ensure client and server use compatible transports

## Resource Links

- [MCP Official Documentation](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)
- [Claude Desktop MCP Setup](https://docs.anthropic.com/claude/docs/mcp)