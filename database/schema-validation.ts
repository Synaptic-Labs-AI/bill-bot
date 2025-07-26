/**
 * Schema Validation
 * 
 * Runtime validation utilities for database schema compliance and data integrity.
 * Provides validation functions for Bill Bot database operations.
 */

import { z } from 'zod';
import type {
  Bill,
  BillInsert,
  BillUpdate,
  ExecutiveAction,
  ExecutiveActionInsert,
  ExecutiveActionUpdate,
  BillTopic,
  ProcessingLog,
  RSSFeedSource,
  EmbeddingQueue,
} from './types/database.types';

// =====================================================================
// ENUM VALIDATIONS
// =====================================================================

const ChamberSchema = z.enum(['house', 'senate']);

const BillTypeSchema = z.enum([
  'hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'
]);

const BillStatusSchema = z.enum([
  'introduced', 'referred', 'reported', 'passed_house', 'passed_senate',
  'enrolled', 'presented', 'signed', 'vetoed', 'withdrawn', 'failed'
]);

const ExecutiveActionTypeSchema = z.enum([
  'executive_order', 'presidential_memorandum', 'proclamation',
  'presidential_directive', 'national_security_directive'
]);

const ExecutiveActionStatusSchema = z.enum([
  'active', 'revoked', 'superseded', 'expired', 'amended'
]);

const FeedTypeSchema = z.enum([
  'house_bills', 'senate_bills', 'all_bills',
  'executive_orders', 'presidential_memoranda', 'proclamations',
  'federal_register', 'white_house_actions'
]);

const FeedChamberSchema = z.enum(['house', 'senate', 'both', 'executive']);

const ProcessingStatusSchema = z.enum(['started', 'completed', 'failed', 'retrying', 'skipped']);

const EmbeddingStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'skipped']);

// =====================================================================
// BASIC DATA TYPE SCHEMAS
// =====================================================================

const DateStringSchema = z.string().refine(
  (date) => !isNaN(Date.parse(date)),
  { message: 'Invalid date format' }
);

const TimestampSchema = z.string().refine(
  (timestamp) => !isNaN(Date.parse(timestamp)),
  { message: 'Invalid timestamp format' }
);

const JSONBSchema = z.record(z.any()).optional();

const VectorSchema = z.array(z.number()).optional();

const BillNumberSchema = z.string().min(1).max(50).refine(
  (billNum) => /^[a-z]+\d+$/i.test(billNum),
  { message: 'Bill number must be in format like "hr123" or "s456"' }
);

const URLSchema = z.string().url().optional();

const EmailSchema = z.string().email().optional();

// =====================================================================
// BILL VALIDATION SCHEMAS
// =====================================================================

export const BillInsertSchema = z.object({
  bill_number: BillNumberSchema,
  congress_number: z.number().int().min(1).max(200).default(118),
  bill_type: BillTypeSchema,
  title: z.string().min(1).max(2000),
  summary: z.string().max(10000).optional(),
  full_text: z.string().optional(),
  sponsor: z.string().max(255).optional(),
  cosponsors: JSONBSchema,
  introduced_date: DateStringSchema.optional(),
  last_action_date: DateStringSchema.optional(),
  status: BillStatusSchema.default('introduced'),
  chamber: ChamberSchema,
  committee: z.string().max(255).optional(),
  actions: JSONBSchema,
  votes: JSONBSchema,
  amendments: JSONBSchema,
  source_url: URLSchema,
  source_feed: z.string().max(100).optional(),
  processing_metadata: JSONBSchema,
  title_embedding: VectorSchema,
  summary_embedding: VectorSchema,
  content_embedding: VectorSchema,
}).strict();

export const BillUpdateSchema = BillInsertSchema.partial();

export const BillRowSchema = BillInsertSchema.extend({
  id: z.number().int().positive(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  search_vector: z.string().optional(),
  is_active: z.boolean().optional(),
  bill_year: z.number().int().optional(),
});

// =====================================================================
// EXECUTIVE ACTION VALIDATION SCHEMAS
// =====================================================================

export const ExecutiveActionInsertSchema = z.object({
  id: z.string().uuid().optional(),
  executive_order_number: z.number().int().positive().optional(),
  action_type: ExecutiveActionTypeSchema,
  title: z.string().min(1).max(2000),
  summary: z.string().max(10000).optional(),
  full_text: z.string().optional(),
  signed_date: DateStringSchema,
  effective_date: DateStringSchema.optional(),
  administration: z.string().min(1).max(100),
  president_name: z.string().min(1).max(255),
  citation: z.string().min(1).max(500),
  status: ExecutiveActionStatusSchema.default('active'),
  content_url: URLSchema,
  pdf_url: URLSchema,
  html_content: z.string().optional(),
  agencies_affected: z.array(z.string()).optional(),
  policy_areas: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  related_legislation: z.array(z.string()).optional(),
  supersedes: z.array(z.string().uuid()).optional(),
  superseded_by: z.string().uuid().optional(),
  title_embedding: VectorSchema,
  summary_embedding: VectorSchema,
  content_embedding: VectorSchema,
}).strict();

export const ExecutiveActionUpdateSchema = ExecutiveActionInsertSchema.partial();

export const ExecutiveActionRowSchema = ExecutiveActionInsertSchema.extend({
  id: z.string().uuid(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  indexed_at: TimestampSchema.optional(),
  search_vector: z.string().optional(),
  action_year: z.number().int().optional(),
  is_current: z.boolean().optional(),
});

// =====================================================================
// SUPPORTING TABLE SCHEMAS
// =====================================================================

export const BillTopicSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
  created_at: TimestampSchema.optional(),
}).strict();

export const RSSFeedSourceSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  feed_type: FeedTypeSchema,
  chamber: FeedChamberSchema,
  enabled: z.boolean().default(true),
  polling_frequency: z.string().default('1 hour'),
  last_polled_at: TimestampSchema.optional(),
  last_successful_poll: TimestampSchema.optional(),
  error_count: z.number().int().min(0).default(0),
  max_error_count: z.number().int().min(1).default(5),
  configuration: JSONBSchema,
  created_at: TimestampSchema.optional(),
  updated_at: TimestampSchema.optional(),
}).strict();

export const ProcessingLogSchema = z.object({
  id: z.number().int().positive().optional(),
  operation_type: z.string().min(1).max(50),
  source_id: z.number().int().positive().optional(),
  bill_id: z.number().int().positive().optional(),
  executive_action_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  status: ProcessingStatusSchema.default('started'),
  started_at: TimestampSchema.optional(),
  completed_at: TimestampSchema.optional(),
  error_message: z.string().optional(),
  error_details: JSONBSchema,
  processing_stats: JSONBSchema,
}).strict();

export const EmbeddingQueueSchema = z.object({
  id: z.number().int().positive().optional(),
  content_type: z.enum(['bill', 'executive_action']),
  content_id: z.string().min(1),
  embedding_type: z.enum(['title', 'summary', 'content']),
  text_content: z.string().min(10),
  priority: z.number().int().min(1).max(10).default(5),
  status: EmbeddingStatusSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),
  max_attempts: z.number().int().min(1).default(3),
  created_at: TimestampSchema.optional(),
  started_at: TimestampSchema.optional(),
  completed_at: TimestampSchema.optional(),
  error_message: z.string().optional(),
  embedding_result: VectorSchema,
}).strict();

// =====================================================================
// SEARCH PARAMETER VALIDATION
// =====================================================================

export const BillSearchFiltersSchema = z.object({
  chamber: ChamberSchema.optional(),
  status: z.array(BillStatusSchema).optional(),
  congress: z.number().int().min(1).max(200).optional(),
  dateFrom: DateStringSchema.optional(),
  dateTo: DateStringSchema.optional(),
  activeOnly: z.boolean().default(true),
  sponsor: z.string().max(255).optional(),
  committee: z.string().max(255).optional(),
  topics: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
}).strict();

export const ExecutiveActionSearchFiltersSchema = z.object({
  actionType: ExecutiveActionTypeSchema.optional(),
  administration: z.string().max(100).optional(),
  status: ExecutiveActionStatusSchema.optional(),
  dateFrom: DateStringSchema.optional(),
  dateTo: DateStringSchema.optional(),
  currentOnly: z.boolean().default(false),
  agencies: z.array(z.string()).optional(),
  policyAreas: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
}).strict();

export const SearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  semanticWeight: z.number().min(0).max(1).default(0.7),
  keywordWeight: z.number().min(0).max(1).default(0.3),
  freshnessWeight: z.number().min(0).max(1).default(0.1),
  authorityWeight: z.number().min(0).max(1).default(0.1),
  includeBills: z.boolean().default(true),
  includeExecutiveActions: z.boolean().default(true),
}).strict().refine(
  (data) => Math.abs((data.semanticWeight + data.keywordWeight + data.freshnessWeight + data.authorityWeight) - 1) < 0.01,
  { message: 'Search weights must sum to 1.0' }
);

// =====================================================================
// CITATION VALIDATION
// =====================================================================

export const CitationFormatSchema = z.enum(['standard', 'apa', 'mla', 'chicago', 'url']);

export const CitationRequestSchema = z.object({
  contentType: z.enum(['bill', 'executive_action']),
  contentId: z.string().min(1),
  format: CitationFormatSchema.default('standard'),
}).strict();

// =====================================================================
// VALIDATION FUNCTIONS
// =====================================================================

/**
 * Validate bill insert data
 */
export function validateBillInsert(data: unknown): BillInsert {
  const result = BillInsertSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid bill insert data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate bill update data
 */
export function validateBillUpdate(data: unknown): Partial<BillInsert> {
  const result = BillUpdateSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid bill update data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate executive action insert data
 */
export function validateExecutiveActionInsert(data: unknown): ExecutiveActionInsert {
  const result = ExecutiveActionInsertSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid executive action insert data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate executive action update data
 */
export function validateExecutiveActionUpdate(data: unknown): Partial<ExecutiveActionInsert> {
  const result = ExecutiveActionUpdateSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid executive action update data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate search filters
 */
export function validateBillSearchFilters(data: unknown) {
  const result = BillSearchFiltersSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid bill search filters', result.error.errors);
  }
  return result.data;
}

/**
 * Validate executive action search filters
 */
export function validateExecutiveActionSearchFilters(data: unknown) {
  const result = ExecutiveActionSearchFiltersSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid executive action search filters', result.error.errors);
  }
  return result.data;
}

/**
 * Validate search options
 */
export function validateSearchOptions(data: unknown) {
  const result = SearchOptionsSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid search options', result.error.errors);
  }
  return result.data;
}

/**
 * Validate RSS feed source data
 */
export function validateRSSFeedSource(data: unknown) {
  const result = RSSFeedSourceSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid RSS feed source data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate embedding queue data
 */
export function validateEmbeddingQueue(data: unknown) {
  const result = EmbeddingQueueSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid embedding queue data', result.error.errors);
  }
  return result.data;
}

/**
 * Validate citation request
 */
export function validateCitationRequest(data: unknown) {
  const result = CitationRequestSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid citation request', result.error.errors);
  }
  return result.data;
}

// =====================================================================
// CUSTOM VALIDATION FUNCTIONS
// =====================================================================

/**
 * Validate vector embedding dimensions
 */
export function validateEmbeddingDimensions(embedding: number[], expectedDimensions: number = 1024): boolean {
  if (!Array.isArray(embedding)) {
    return false;
  }
  
  if (embedding.length !== expectedDimensions) {
    return false;
  }
  
  return embedding.every(value => typeof value === 'number' && !isNaN(value));
}

/**
 * Validate bill number format
 */
export function validateBillNumberFormat(billNumber: string): boolean {
  const billNumberPattern = /^(hr|s|hjres|sjres|hconres|sconres|hres|sres)\d+$/i;
  return billNumberPattern.test(billNumber);
}

/**
 * Validate date range consistency
 */
export function validateDateRange(startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate) {
    return true; // Optional dates are valid
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false; // Invalid dates
  }
  
  return start <= end; // Start date must be before or equal to end date
}

/**
 * Validate congress number for given date
 */
export function validateCongressForDate(congressNumber: number, date: string): boolean {
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  
  // Each congress lasts 2 years, starting in odd years
  // 118th Congress: 2023-2024
  // 117th Congress: 2021-2022
  const expectedCongress = Math.floor((year - 1789) / 2) + 1;
  
  // Allow some flexibility for transition periods
  return Math.abs(congressNumber - expectedCongress) <= 1;
}

/**
 * Sanitize and validate text content
 */
export function sanitizeTextContent(text: string, maxLength: number = 10000): string {
  if (typeof text !== 'string') {
    throw new ValidationError('Text content must be a string');
  }
  
  // Remove potentially harmful content
  let sanitized = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
  
  // Enforce length limit
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

/**
 * Validate JSON structure for metadata fields
 */
export function validateMetadataStructure(metadata: any): boolean {
  if (metadata === null || metadata === undefined) {
    return true; // Null/undefined is valid
  }
  
  if (typeof metadata !== 'object') {
    return false;
  }
  
  try {
    // Try to serialize and parse to ensure it's valid JSON
    JSON.parse(JSON.stringify(metadata));
    return true;
  } catch {
    return false;
  }
}

// =====================================================================
// ERROR HANDLING
// =====================================================================

export class ValidationError extends Error {
  public readonly errors: any[];
  
  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
  
  public getFormattedErrors(): string {
    if (this.errors.length === 0) {
      return this.message;
    }
    
    return this.errors
      .map(error => `${error.path?.join('.') || 'root'}: ${error.message}`)
      .join('; ');
  }
}

// =====================================================================
// BATCH VALIDATION UTILITIES
// =====================================================================

/**
 * Validate multiple bills
 */
export function validateBillsBatch(bills: unknown[]): { valid: BillInsert[]; invalid: Array<{ index: number; error: ValidationError }> } {
  const valid: BillInsert[] = [];
  const invalid: Array<{ index: number; error: ValidationError }> = [];
  
  bills.forEach((bill, index) => {
    try {
      valid.push(validateBillInsert(bill));
    } catch (error) {
      invalid.push({
        index,
        error: error instanceof ValidationError ? error : new ValidationError('Unknown validation error')
      });
    }
  });
  
  return { valid, invalid };
}

/**
 * Validate multiple executive actions
 */
export function validateExecutiveActionsBatch(actions: unknown[]): { valid: ExecutiveActionInsert[]; invalid: Array<{ index: number; error: ValidationError }> } {
  const valid: ExecutiveActionInsert[] = [];
  const invalid: Array<{ index: number; error: ValidationError }> = [];
  
  actions.forEach((action, index) => {
    try {
      valid.push(validateExecutiveActionInsert(action));
    } catch (error) {
      invalid.push({
        index,
        error: error instanceof ValidationError ? error : new ValidationError('Unknown validation error')
      });
    }
  });
  
  return { valid, invalid };
}

// Export types for use in other modules
export type {
  BillInsert,
  BillUpdate,
  ExecutiveActionInsert,
  ExecutiveActionUpdate,
} from './types/database.types';