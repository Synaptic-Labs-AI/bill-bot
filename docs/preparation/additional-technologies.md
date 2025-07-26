# Additional Technologies Guide

## Executive Summary

This document covers supplementary technologies essential for Bill Bot including RSS feed parsing for legislative data ingestion, YAML configuration management, WebSocket/SSE streaming for real-time responses, and citation management patterns. These technologies complement the core stack to provide comprehensive functionality for data acquisition, configuration management, and user experience optimization.

## RSS Feed Parsing for Legislative Data

### Technology Overview

RSS feed parsing enables automatic ingestion of legislative bills from government sources. The `rss-parser` library provides robust, TypeScript-friendly parsing with support for custom fields and error handling.

### RSS Parser Setup

```typescript
// src/services/rssParser.ts
import Parser from 'rss-parser';

interface CustomFeed {
  title: string;
  description: string;
  link: string;
  lastBuildDate: string;
  generator?: string;
}

interface CustomItem {
  title: string;
  link: string;
  pubDate: string;
  'dc:creator'?: string;
  guid: string;
  description: string;
  content?: string;
  categories?: string[];
  
  // Custom legislative fields
  billNumber?: string;
  sponsor?: string;
  chamber?: string;
  status?: string;
  committee?: string;
}

class LegislativeRSSParser {
  private parser: Parser<CustomFeed, CustomItem>;

  constructor() {
    this.parser = new Parser<CustomFeed, CustomItem>({
      customFields: {
        feed: ['generator', 'lastBuildDate'],
        item: [
          'billNumber',
          'sponsor', 
          'chamber',
          'status',
          'committee',
          'dc:creator',
          ['content:encoded', 'content'],
        ],
      },
      defaultRSS: 2.0,
      xml2js: {
        normalize: true,
        normalizeTags: true,
        explicitArray: false,
      },
    });
  }

  async parseFeed(url: string): Promise<{
    feed: CustomFeed;
    items: CustomItem[];
  }> {
    try {
      const feed = await this.parser.parseURL(url);
      
      return {
        feed: {
          title: feed.title || '',
          description: feed.description || '',
          link: feed.link || '',
          lastBuildDate: feed.lastBuildDate || '',
          generator: feed.generator,
        },
        items: feed.items || [],
      };
    } catch (error) {
      console.error(`Failed to parse RSS feed ${url}:`, error);
      throw new Error(`RSS parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async parseString(xmlString: string): Promise<{
    feed: CustomFeed;
    items: CustomItem[];
  }> {
    try {
      const feed = await this.parser.parseString(xmlString);
      
      return {
        feed: {
          title: feed.title || '',
          description: feed.description || '',
          link: feed.link || '',
          lastBuildDate: feed.lastBuildDate || '',
          generator: feed.generator,
        },
        items: feed.items || [],
      };
    } catch (error) {
      console.error('Failed to parse RSS string:', error);
      throw new Error(`RSS parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export { LegislativeRSSParser, type CustomItem, type CustomFeed };
```

### Legislative Feed Sources Configuration

```typescript
// src/config/rssFeeds.ts
interface FeedSource {
  id: string;
  name: string;
  url: string;
  type: 'house' | 'senate' | 'library_of_congress';
  chamber: 'house' | 'senate' | 'both';
  updateFrequency: 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  parser: 'standard' | 'custom';
  fieldMappings?: Record<string, string>;
}

export const RSS_FEED_SOURCES: FeedSource[] = [
  {
    id: 'house_clerk_bills',
    name: 'House Clerk - New Bills',
    url: 'https://clerk.house.gov/legislative/legisinfo/rss/BillsIntroduced.xml',
    type: 'house',
    chamber: 'house',
    updateFrequency: 'daily',
    enabled: true,
    parser: 'custom',
    fieldMappings: {
      'bill:number': 'billNumber',
      'bill:sponsor': 'sponsor',
      'bill:status': 'status',
    },
  },
  {
    id: 'senate_bills',
    name: 'Senate Bills Feed',
    url: 'https://www.senate.gov/legislative/LIS/rss/senate_bills.xml',
    type: 'senate',
    chamber: 'senate',
    updateFrequency: 'daily',
    enabled: true,
    parser: 'custom',
    fieldMappings: {
      'senate:billNumber': 'billNumber',
      'senate:sponsor': 'sponsor',
    },
  },
  {
    id: 'congress_gov_search',
    name: 'Congress.gov Recent Bills',
    url: 'https://www.congress.gov/rss/bills-114th-congress',
    type: 'library_of_congress',
    chamber: 'both',
    updateFrequency: 'hourly',
    enabled: true,
    parser: 'standard',
  },
];

export const FEED_POLLING_INTERVALS = {
  hourly: 60 * 60 * 1000,     // 1 hour
  daily: 24 * 60 * 60 * 1000, // 24 hours
  weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;
```

### Feed Processing Service

```typescript
// src/services/feedProcessor.ts
import { LegislativeRSSParser, CustomItem } from './rssParser';
import { RSS_FEED_SOURCES, FEED_POLLING_INTERVALS } from '../config/rssFeeds';
import { SupabaseVectorClient } from './supabase';
import { CohereEmbeddingService } from './cohere';

interface ProcessedBill {
  billNumber: string;
  title: string;
  summary: string;
  sponsor?: string;
  chamber: 'house' | 'senate';
  status?: string;
  introducedDate: Date;
  sourceUrl: string;
  sourceFeed: string;
  rawData: any;
}

class FeedProcessingService {
  private parser: LegislativeRSSParser;
  private supabase: SupabaseVectorClient;
  private embeddings: CohereEmbeddingService;
  private processingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.parser = new LegislativeRSSParser();
    this.supabase = new SupabaseVectorClient();
    this.embeddings = new CohereEmbeddingService();
  }

  async startPolling(): Promise<void> {
    for (const feedSource of RSS_FEED_SOURCES) {
      if (!feedSource.enabled) continue;

      const interval = FEED_POLLING_INTERVALS[feedSource.updateFrequency];
      
      // Process immediately, then set up interval
      await this.processFeed(feedSource);
      
      const timeoutId = setInterval(async () => {
        try {
          await this.processFeed(feedSource);
        } catch (error) {
          console.error(`Error processing feed ${feedSource.id}:`, error);
        }
      }, interval);

      this.processingIntervals.set(feedSource.id, timeoutId);
      
      console.log(`Started polling for feed: ${feedSource.name} (${feedSource.updateFrequency})`);
    }
  }

  async stopPolling(): Promise<void> {
    for (const [feedId, timeoutId] of this.processingIntervals) {
      clearInterval(timeoutId);
      this.processingIntervals.delete(feedId);
      console.log(`Stopped polling for feed: ${feedId}`);
    }
  }

  private async processFeed(feedSource: any): Promise<void> {
    try {
      console.log(`Processing feed: ${feedSource.name}`);
      
      const { feed, items } = await this.parser.parseFeed(feedSource.url);
      
      const processedBills = await this.extractBillsFromItems(
        items,
        feedSource
      );

      const newBills = await this.filterNewBills(processedBills);
      
      if (newBills.length > 0) {
        await this.storeBills(newBills);
        console.log(`Processed ${newBills.length} new bills from ${feedSource.name}`);
      } else {
        console.log(`No new bills found in ${feedSource.name}`);
      }
      
    } catch (error) {
      console.error(`Failed to process feed ${feedSource.name}:`, error);
      throw error;
    }
  }

  private async extractBillsFromItems(
    items: CustomItem[],
    feedSource: any
  ): Promise<ProcessedBill[]> {
    const bills: ProcessedBill[] = [];

    for (const item of items) {
      try {
        const bill = await this.parseItemToBill(item, feedSource);
        if (bill) {
          bills.push(bill);
        }
      } catch (error) {
        console.error(`Failed to parse item to bill:`, error);
        // Continue processing other items
      }
    }

    return bills;
  }

  private async parseItemToBill(
    item: CustomItem,
    feedSource: any
  ): Promise<ProcessedBill | null> {
    // Extract bill number from title or custom fields
    const billNumber = this.extractBillNumber(item, feedSource);
    if (!billNumber) {
      console.warn('Could not extract bill number from item:', item.title);
      return null;
    }

    // Clean and process the data
    const title = this.cleanTitle(item.title || '');
    const summary = this.extractSummary(item);
    const sponsor = item.sponsor || item['dc:creator'];
    const status = item.status || 'introduced';
    const introducedDate = new Date(item.pubDate || Date.now());

    return {
      billNumber,
      title,
      summary,
      sponsor,
      chamber: feedSource.chamber === 'both' ? this.determineChamber(billNumber) : feedSource.chamber,
      status,
      introducedDate,
      sourceUrl: item.link || '',
      sourceFeed: feedSource.id,
      rawData: item,
    };
  }

  private extractBillNumber(item: CustomItem, feedSource: any): string | null {
    // Try custom field mapping first
    if (feedSource.fieldMappings?.billNumber && item[feedSource.fieldMappings.billNumber]) {
      return item[feedSource.fieldMappings.billNumber];
    }

    // Try standard bill number field
    if (item.billNumber) {
      return item.billNumber;
    }

    // Extract from title using regex
    const billRegex = /(?:H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*(\d+)/i;
    const match = item.title?.match(billRegex);
    
    if (match) {
      return match[0];
    }

    return null;
  }

  private cleanTitle(title: string): string {
    // Remove bill numbers and common prefixes
    return title
      .replace(/^(?:H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.)\s*\d+\s*[-–—]\s*/i, '')
      .replace(/^(?:To\s+)/i, '')
      .trim();
  }

  private extractSummary(item: CustomItem): string {
    // Try content field first, then description
    let summary = item.content || item.description || '';
    
    // Clean HTML tags
    summary = summary.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    summary = summary
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // Truncate if too long
    if (summary.length > 1000) {
      summary = summary.substring(0, 997) + '...';
    }
    
    return summary.trim();
  }

  private determineChamber(billNumber: string): 'house' | 'senate' {
    return billNumber.toUpperCase().startsWith('H') ? 'house' : 'senate';
  }

  private async filterNewBills(bills: ProcessedBill[]): Promise<ProcessedBill[]> {
    // Check which bills already exist in database
    const existingBillNumbers = new Set();
    
    for (const bill of bills) {
      const existing = await this.supabase.client
        .from('bills')
        .select('bill_number')
        .eq('bill_number', bill.billNumber)
        .single();
      
      if (existing.data) {
        existingBillNumbers.add(bill.billNumber);
      }
    }

    return bills.filter(bill => !existingBillNumbers.has(bill.billNumber));
  }

  private async storeBills(bills: ProcessedBill[]): Promise<void> {
    // Generate embeddings for all bills
    const billTexts = bills.map(bill => `${bill.title} ${bill.summary}`);
    const embeddings = await this.embeddings.generateEmbeddings(
      billTexts,
      { inputType: 'search_document' }
    );

    // Prepare bills for insertion
    const billsToInsert = bills.map((bill, index) => ({
      bill_number: bill.billNumber,
      title: bill.title,
      summary: bill.summary,
      sponsor: bill.sponsor,
      introduced_date: bill.introducedDate.toISOString().split('T')[0],
      status: bill.status,
      chamber: bill.chamber,
      title_embedding: embeddings.embeddings[index],
      summary_embedding: embeddings.embeddings[index], // Use same embedding for both
      metadata: {
        sourceUrl: bill.sourceUrl,
        sourceFeed: bill.sourceFeed,
        rawData: bill.rawData,
      },
    }));

    // Insert into database
    const { error } = await this.supabase.client
      .from('bills')
      .insert(billsToInsert);

    if (error) {
      throw new Error(`Failed to store bills: ${error.message}`);
    }
  }

  // Manual feed processing for testing
  async processFeedManually(feedId: string): Promise<void> {
    const feedSource = RSS_FEED_SOURCES.find(feed => feed.id === feedId);
    if (!feedSource) {
      throw new Error(`Feed source not found: ${feedId}`);
    }

    await this.processFeed(feedSource);
  }
}

export { FeedProcessingService, type ProcessedBill };
```

## YAML Configuration Management

### Configuration Schema

```typescript
// src/config/types.ts
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  system: string;
  user: string;
  variables: string[];
  examples?: Array<{
    input: Record<string, string>;
    output: string;
  }>;
}

interface ModelConfiguration {
  name: string;
  provider: 'openrouter' | 'openai' | 'anthropic';
  modelId: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  stopSequences?: string[];
  contextWindow: number;
}

interface ApplicationConfig {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  
  api: {
    port: number;
    cors: {
      origin: string[];
      credentials: boolean;
    };
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };
  
  models: ModelConfiguration[];
  
  prompts: PromptTemplate[];
  
  features: {
    rssPolling: boolean;
    reranking: boolean;
    streaming: boolean;
    citations: boolean;
  };
  
  feeds: {
    enabled: boolean;
    pollingInterval: number;
    sources: string[];
  };
  
  search: {
    defaultLimit: number;
    maxLimit: number;
    rerankThreshold: number;
    embeddingModel: string;
  };
}
```

### YAML Configuration File

```yaml
# config/production.yml
app:
  name: "Bill Bot"
  version: "1.0.0"
  environment: "production"
  logLevel: "info"

api:
  port: 3001
  cors:
    origin:
      - "https://billbot.yourdomain.com"
      - "https://billbot-staging.yourdomain.com"
    credentials: true
  rateLimit:
    windowMs: 900000  # 15 minutes
    maxRequests: 100

models:
  - name: "primary"
    provider: "openrouter"
    modelId: "openai/gpt-4o"
    maxTokens: 4000
    temperature: 0.7
    topP: 0.9
    contextWindow: 128000
  
  - name: "fallback"
    provider: "openrouter"
    modelId: "anthropic/claude-3-sonnet"
    maxTokens: 4000
    temperature: 0.7
    topP: 0.9
    contextWindow: 200000

prompts:
  - id: "bill_search_system"
    name: "Bill Search System Prompt"
    description: "System prompt for bill search and analysis"
    system: |
      You are Bill Bot, an AI assistant specialized in helping users explore and understand legislative bills.
      
      Your capabilities include:
      - Searching for bills by keyword, sponsor, topic, or status
      - Providing detailed analysis of bill content
      - Explaining legislative processes and procedures
      - Offering insights into bill implications and context
      
      Always provide accurate, factual information based on the search results provided.
      Include citations for all information you reference.
      Be clear about limitations and uncertainties.
    user: |
      User query: {query}
      
      Search results:
      {search_results}
      
      Please provide a comprehensive response based on the search results.
    variables: ["query", "search_results"]
    examples:
      - input:
          query: "climate change bills"
          search_results: "[Bill results would be here]"
        output: "Based on the search results, here are the key climate change bills currently in Congress..."

  - id: "bill_summary"
    name: "Bill Summary Template"
    description: "Template for summarizing individual bills"
    system: |
      You are an expert at summarizing legislative bills.
      Provide clear, concise summaries that highlight:
      - The bill's main purpose and goals
      - Key provisions and changes proposed
      - Potential impact and implications
      - Current status in the legislative process
    user: |
      Please summarize this bill:
      
      Title: {title}
      Bill Number: {bill_number}
      Sponsor: {sponsor}
      Summary: {summary}
      Status: {status}
    variables: ["title", "bill_number", "sponsor", "summary", "status"]

features:
  rssPolling: true
  reranking: true
  streaming: true
  citations: true

feeds:
  enabled: true
  pollingInterval: 3600000  # 1 hour
  sources:
    - "house_clerk_bills"
    - "senate_bills"
    - "congress_gov_search"

search:
  defaultLimit: 10
  maxLimit: 50
  rerankThreshold: 0.7
  embeddingModel: "embed-english-v3.0"
```

### Configuration Loader

```typescript
// src/config/loader.ts
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import Joi from 'joi';
import { ApplicationConfig } from './types';

class ConfigurationLoader {
  private static instance: ConfigurationLoader;
  private config: ApplicationConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigurationLoader {
    if (!ConfigurationLoader.instance) {
      ConfigurationLoader.instance = new ConfigurationLoader();
    }
    return ConfigurationLoader.instance;
  }

  async loadConfig(environment: string = 'production'): Promise<ApplicationConfig> {
    if (this.config) {
      return this.config;
    }

    const configPath = path.join(process.cwd(), 'config', `${environment}.yml`);
    
    try {
      const configFile = await fs.readFile(configPath, 'utf8');
      const rawConfig = yaml.load(configFile) as any;
      
      // Validate configuration
      const validatedConfig = await this.validateConfig(rawConfig);
      
      // Process environment variable substitutions
      this.config = this.processEnvironmentVariables(validatedConfig);
      
      console.log(`Configuration loaded from ${configPath}`);
      return this.config;
    } catch (error) {
      console.error(`Failed to load configuration from ${configPath}:`, error);
      throw new Error(`Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateConfig(config: any): Promise<ApplicationConfig> {
    const schema = Joi.object({
      app: Joi.object({
        name: Joi.string().required(),
        version: Joi.string().required(),
        environment: Joi.string().valid('development', 'staging', 'production').required(),
        logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').required(),
      }).required(),
      
      api: Joi.object({
        port: Joi.number().integer().min(1).max(65535).required(),
        cors: Joi.object({
          origin: Joi.array().items(Joi.string()).required(),
          credentials: Joi.boolean().required(),
        }).required(),
        rateLimit: Joi.object({
          windowMs: Joi.number().integer().min(1000).required(),
          maxRequests: Joi.number().integer().min(1).required(),
        }).required(),
      }).required(),
      
      models: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          provider: Joi.string().valid('openrouter', 'openai', 'anthropic').required(),
          modelId: Joi.string().required(),
          maxTokens: Joi.number().integer().min(1).required(),
          temperature: Joi.number().min(0).max(2).required(),
          topP: Joi.number().min(0).max(1).required(),
          stopSequences: Joi.array().items(Joi.string()).optional(),
          contextWindow: Joi.number().integer().min(1).required(),
        })
      ).required(),
      
      prompts: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          name: Joi.string().required(),
          description: Joi.string().required(),
          system: Joi.string().required(),
          user: Joi.string().required(),
          variables: Joi.array().items(Joi.string()).required(),
          examples: Joi.array().items(
            Joi.object({
              input: Joi.object().required(),
              output: Joi.string().required(),
            })
          ).optional(),
        })
      ).required(),
      
      features: Joi.object({
        rssPolling: Joi.boolean().required(),
        reranking: Joi.boolean().required(),
        streaming: Joi.boolean().required(),
        citations: Joi.boolean().required(),
      }).required(),
      
      feeds: Joi.object({
        enabled: Joi.boolean().required(),
        pollingInterval: Joi.number().integer().min(60000).required(), // Minimum 1 minute
        sources: Joi.array().items(Joi.string()).required(),
      }).required(),
      
      search: Joi.object({
        defaultLimit: Joi.number().integer().min(1).max(100).required(),
        maxLimit: Joi.number().integer().min(1).max(100).required(),
        rerankThreshold: Joi.number().min(0).max(1).required(),
        embeddingModel: Joi.string().required(),
      }).required(),
    });

    const { error, value } = schema.validate(config);
    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }

    return value as ApplicationConfig;
  }

  private processEnvironmentVariables(config: ApplicationConfig): ApplicationConfig {
    // Deep clone to avoid mutating the original
    const processedConfig = JSON.parse(JSON.stringify(config));
    
    // Process environment variable substitutions
    this.substituteEnvVars(processedConfig);
    
    return processedConfig;
  }

  private substituteEnvVars(obj: any): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Replace ${ENV_VAR} patterns
        obj[key] = obj[key].replace(/\$\{([^}]+)\}/g, (match: string, envVar: string) => {
          const envValue = process.env[envVar];
          if (envValue === undefined) {
            console.warn(`Environment variable ${envVar} not found, keeping placeholder`);
            return match;
          }
          return envValue;
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.substituteEnvVars(obj[key]);
      }
    }
  }

  getPromptTemplate(id: string): PromptTemplate | null {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    
    return this.config.prompts.find(prompt => prompt.id === id) || null;
  }

  getModelConfig(name: string): ModelConfiguration | null {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    
    return this.config.models.find(model => model.name === name) || null;
  }

  get(): ApplicationConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }
}

export { ConfigurationLoader, type ApplicationConfig };
```

## WebSocket and SSE Streaming

### Server-Sent Events Implementation

```typescript
// src/services/streamingService.ts
import { Response } from 'express';

interface StreamingMessage {
  type: 'start' | 'content' | 'citation' | 'error' | 'end';
  data: any;
  timestamp: number;
}

class SSEStreamingService {
  private connections = new Map<string, Response>();

  createConnection(connectionId: string, res: Response): void {
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial connection message
    this.sendMessage(res, {
      type: 'start',
      data: { connectionId, status: 'connected' },
      timestamp: Date.now(),
    });

    // Store connection
    this.connections.set(connectionId, res);

    // Handle client disconnect
    res.on('close', () => {
      this.connections.delete(connectionId);
      console.log(`SSE connection ${connectionId} closed`);
    });

    // Send keepalive pings
    const keepAlive = setInterval(() => {
      if (this.connections.has(connectionId)) {
        res.write(': keepalive\n\n');
      } else {
        clearInterval(keepAlive);
      }
    }, 30000); // 30 seconds
  }

  private sendMessage(res: Response, message: StreamingMessage): void {
    const data = JSON.stringify(message);
    res.write(`data: ${data}\n\n`);
  }

  streamToConnection(connectionId: string, message: StreamingMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    this.sendMessage(connection, message);
    return true;
  }

  streamContent(connectionId: string, content: string): boolean {
    return this.streamToConnection(connectionId, {
      type: 'content',
      data: { content },
      timestamp: Date.now(),
    });
  }

  streamCitation(connectionId: string, citation: any): boolean {
    return this.streamToConnection(connectionId, {
      type: 'citation',
      data: citation,
      timestamp: Date.now(),
    });
  }

  streamError(connectionId: string, error: string): boolean {
    return this.streamToConnection(connectionId, {
      type: 'error',
      data: { error },
      timestamp: Date.now(),
    });
  }

  endStream(connectionId: string): boolean {
    const success = this.streamToConnection(connectionId, {
      type: 'end',
      data: { status: 'completed' },
      timestamp: Date.now(),
    });

    // Close connection
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.end();
      this.connections.delete(connectionId);
    }

    return success;
  }

  closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.end();
      this.connections.delete(connectionId);
    }
  }

  getActiveConnections(): number {
    return this.connections.size;
  }
}

export { SSEStreamingService, type StreamingMessage };
```

### Frontend SSE Client

```typescript
// src/services/sseClient.ts
interface SSEMessage {
  type: 'start' | 'content' | 'citation' | 'error' | 'end';
  data: any;
  timestamp: number;
}

interface SSEOptions {
  onMessage?: (message: SSEMessage) => void;
  onContent?: (content: string) => void;
  onCitation?: (citation: any) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onConnectionOpen?: () => void;
  onConnectionClose?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

class SSEClient {
  private eventSource: EventSource | null = null;
  private url: string;
  private options: SSEOptions;
  private reconnectAttempts = 0;
  private isConnected = false;
  private connectionId: string;

  constructor(url: string, options: SSEOptions = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...options,
    };
    this.connectionId = this.generateConnectionId();
  }

  connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    const urlWithId = `${this.url}?connectionId=${this.connectionId}`;
    this.eventSource = new EventSource(urlWithId);

    this.eventSource.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('SSE connection opened');
      this.options.onConnectionOpen?.();
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      
      if (this.isConnected) {
        this.isConnected = false;
        this.options.onConnectionClose?.();
      }

      // Attempt reconnection
      if (this.reconnectAttempts < this.options.maxReconnectAttempts!) {
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        
        setTimeout(() => {
          this.connect();
        }, this.options.reconnectInterval!);
      } else {
        console.error('Max reconnection attempts reached');
        this.options.onError?.('Connection failed after maximum retry attempts');
      }
    };
  }

  private handleMessage(message: SSEMessage): void {
    this.options.onMessage?.(message);

    switch (message.type) {
      case 'start':
        console.log('Stream started:', message.data);
        break;
      
      case 'content':
        this.options.onContent?.(message.data.content);
        break;
      
      case 'citation':
        this.options.onCitation?.(message.data);
        break;
      
      case 'error':
        this.options.onError?.(message.data.error);
        break;
      
      case 'end':
        console.log('Stream ended:', message.data);
        this.options.onEnd?.();
        break;
      
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.options.onConnectionClose?.();
    }
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.eventSource?.readyState === EventSource.OPEN;
  }

  private generateConnectionId(): string {
    return `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectionId(): string {
    return this.connectionId;
  }
}

export { SSEClient, type SSEMessage, type SSEOptions };
```

## Citation Management

### Citation Data Structure

```typescript
// src/types/citations.ts
interface Citation {
  id: string;
  type: 'bill' | 'amendment' | 'vote' | 'committee_report' | 'hearing' | 'press_release';
  title: string;
  url: string;
  relevanceScore: number;
  excerpt: string;
  
  // Bill-specific metadata
  billNumber?: string;
  sponsor?: string;
  chamber?: 'house' | 'senate';
  status?: string;
  introducedDate?: string;
  
  // Source metadata
  source: {
    name: string;
    type: 'official' | 'news' | 'analysis' | 'database';
    publishedDate?: string;
    author?: string;
  };
  
  // Search context
  searchContext: {
    query: string;
    searchMethod: 'vector' | 'keyword' | 'hybrid';
    rank: number;
    searchTimestamp: string;
  };
}

interface CitationCollection {
  query: string;
  citations: Citation[];
  metadata: {
    totalFound: number;
    searchMethod: string;
    processingTime: number;
    timestamp: string;
  };
}
```

### Citation Generator Service

```typescript
// src/services/citationService.ts
import { Citation, CitationCollection } from '../types/citations';

class CitationGenerator {
  generateCitations(
    searchResults: any[],
    query: string,
    searchMethod: 'vector' | 'keyword' | 'hybrid',
    processingTime: number
  ): CitationCollection {
    const citations: Citation[] = searchResults.map((result, index) => {
      return this.createCitation(result, query, searchMethod, index + 1);
    });

    return {
      query,
      citations,
      metadata: {
        totalFound: searchResults.length,
        searchMethod,
        processingTime,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private createCitation(
    result: any,
    query: string,
    searchMethod: string,
    rank: number
  ): Citation {
    const citationId = this.generateCitationId(result);
    
    return {
      id: citationId,
      type: this.determineCitationType(result),
      title: result.title || 'Untitled Document',
      url: this.generateOfficialUrl(result),
      relevanceScore: result.relevanceScore || result.similarity || 0,
      excerpt: this.generateExcerpt(result, query),
      
      // Bill-specific data
      billNumber: result.bill_number,
      sponsor: result.sponsor,
      chamber: result.chamber,
      status: result.status,
      introducedDate: result.introduced_date,
      
      // Source information
      source: {
        name: this.getSourceName(result),
        type: 'official' as const,
        publishedDate: result.introduced_date || result.created_at,
        author: result.sponsor,
      },
      
      // Search context
      searchContext: {
        query,
        searchMethod,
        rank,
        searchTimestamp: new Date().toISOString(),
      },
    };
  }

  private generateCitationId(result: any): string {
    const base = result.id || result.bill_number || 'unknown';
    const timestamp = Date.now();
    return `cite_${base}_${timestamp}`;
  }

  private determineCitationType(result: any): Citation['type'] {
    if (result.bill_number) return 'bill';
    if (result.type === 'amendment') return 'amendment';
    if (result.type === 'vote') return 'vote';
    return 'bill'; // Default
  }

  private generateOfficialUrl(result: any): string {
    if (result.bill_number) {
      // Generate Congress.gov URL
      const billNumber = result.bill_number.toLowerCase();
      const congress = this.getCurrentCongress();
      return `https://www.congress.gov/bill/${congress}th-congress/${billNumber}`;
    }
    
    return result.url || result.source_url || '#';
  }

  private generateExcerpt(result: any, query: string): string {
    const text = result.summary || result.title || '';
    const maxLength = 200;
    
    // Try to find excerpt around query terms
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    
    let bestStart = 0;
    let maxMatches = 0;
    
    // Find the position with the most query term matches
    for (let i = 0; i <= text.length - maxLength; i += 50) {
      const segment = textLower.slice(i, i + maxLength);
      const matches = queryTerms.filter(term => segment.includes(term)).length;
      
      if (matches > maxMatches) {
        maxMatches = matches;
        bestStart = i;
      }
    }
    
    let excerpt = text.slice(bestStart, bestStart + maxLength);
    
    // Clean up excerpt
    if (bestStart > 0) excerpt = '...' + excerpt;
    if (bestStart + maxLength < text.length) excerpt += '...';
    
    return excerpt.trim();
  }

  private getSourceName(result: any): string {
    if (result.chamber === 'house') return 'U.S. House of Representatives';
    if (result.chamber === 'senate') return 'U.S. Senate';
    return 'U.S. Congress';
  }

  private getCurrentCongress(): number {
    // Calculate current Congress number
    const currentYear = new Date().getFullYear();
    return Math.floor((currentYear - 1789) / 2) + 1;
  }

  // Format citations for different output formats
  formatCitationsForDisplay(citations: Citation[]): string {
    return citations
      .map((citation, index) => {
        const num = index + 1;
        return `[${num}] ${citation.title}. ${citation.source.name}. ${citation.url}`;
      })
      .join('\n');
  }

  formatCitationsForAPA(citations: Citation[]): string {
    return citations
      .map(citation => {
        const author = citation.sponsor || citation.source.author || 'Unknown';
        const year = citation.introducedDate ? new Date(citation.introducedDate).getFullYear() : 'n.d.';
        const title = citation.title;
        const source = citation.source.name;
        const url = citation.url;
        
        return `${author} (${year}). ${title}. ${source}. Retrieved from ${url}`;
      })
      .join('\n\n');
  }

  // Deduplicate citations
  deduplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    return citations.filter(citation => {
      const key = citation.billNumber || citation.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export { CitationGenerator, type Citation, type CitationCollection };
```

## Best Practices

### 1. RSS Feed Management

```typescript
const rssBestPractices = {
  errorHandling: {
    retries: 3,
    exponentialBackoff: true,
    gracefulDegradation: true,
    logging: 'comprehensive',
  },
  
  performance: {
    parallelProcessing: true,
    batchSize: 10,
    rateLimiting: true,
    caching: '1hour',
  },
  
  dataQuality: {
    validation: 'strict',
    deduplication: true,
    normalization: true,
    enrichment: true,
  },
};
```

### 2. Configuration Management

```typescript
const configBestPractices = {
  security: {
    environmentVariables: 'sensitive_data_only',
    validation: 'joi_schema',
    encryption: 'secrets_at_rest',
  },
  
  deployment: {
    environmentSpecific: true,
    versionControl: true,
    hotReload: 'development_only',
  },
  
  maintenance: {
    documentation: 'inline_comments',
    validation: 'startup_check',
    monitoring: 'config_changes',
  },
};
```

### 3. Streaming Performance

```typescript
const streamingBestPractices = {
  connectionManagement: {
    maxConnections: 1000,
    cleanup: 'automatic',
    heartbeat: '30_seconds',
  },
  
  security: {
    rateLimiting: true,
    authentication: 'per_connection',
    cors: 'strict',
  },
  
  reliability: {
    reconnection: 'automatic',
    buffering: 'minimal',
    errorRecovery: 'graceful',
  },
};
```

## Common Pitfalls to Avoid

1. **RSS Feed Issues**: Don't assume feed structure consistency
2. **Configuration Security**: Never commit sensitive data to version control
3. **Streaming Memory Leaks**: Always clean up connections properly
4. **Citation Accuracy**: Verify all URLs and metadata before serving
5. **YAML Parsing Errors**: Always validate configuration schemas
6. **Rate Limiting**: Respect RSS feed provider rate limits
7. **Error Handling**: Implement comprehensive error recovery strategies

## Resource Links

- [rss-parser Documentation](https://github.com/rbren/rss-parser)
- [js-yaml Documentation](https://github.com/nodeca/js-yaml)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Congress.gov API Documentation](https://api.congress.gov/)
- [Joi Validation Library](https://joi.dev/)