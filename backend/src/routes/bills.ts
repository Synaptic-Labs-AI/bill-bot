import { Router } from 'express';
import { MCPClient } from '../services/mcpClient.js';
import { logger } from '../utils/logger.js';
import { APIErrorFactory, MCPServiceError } from '../utils/errors.js';
import { 
  validateBillSearch, 
  validateBillId, 
  asyncHandler 
} from '../middleware/validation.js';
import { searchRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Initialize MCP client for direct bill operations
let mcpClient: MCPClient | null = null;
const initializeMCPClient = async (): Promise<MCPClient> => {
  if (!mcpClient) {
    mcpClient = new MCPClient();
    await mcpClient.initialize();
  } else if (!mcpClient.isConnected()) {
    await mcpClient.initialize();
  }
  return mcpClient;
};

// Direct bill search endpoint (bypassing chat interface)
router.get('/search', 
  searchRateLimiter,
  validateBillSearch,
  asyncHandler(async (req, res) => {
    const {
      q: query,
      type = 'hybrid',
      chamber,
      status,
      congress,
      sponsor,
      dateFrom,
      dateTo,
      limit = 10,
      offset = 0,
      includeEmbeddings = false,
      includeCitations = true
    } = req.query as any;

    logger.info('Direct bill search request', {
      query,
      type,
      filters: { chamber, status, congress, sponsor, dateFrom, dateTo },
      pagination: { limit, offset }
    });

    try {
      const client = await initializeMCPClient();
      
      const searchArgs = {
        query,
        searchType: type,
        limit: parseInt(limit),
        offset: parseInt(offset),
        filters: {
          ...(chamber && { chamber }),
          ...(status && { status: Array.isArray(status) ? status : [status] }),
          ...(congress && { congress: parseInt(congress) }),
          ...(sponsor && { sponsor }),
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo })
        }
      };

      const startTime = Date.now();
      const result = await client.callTool('search_bills', searchArgs);
      const searchTime = Date.now() - startTime;

      // Process the result
      const bills = result.results || result || [];
      const totalResults = result.totalResults || bills.length;
      
      // Generate citations if requested
      let citations = [];
      if (includeCitations && bills.length > 0) {
        citations = bills.map((bill: any, index: number) => ({
          id: bill.id || `bill_${index}`,
          type: 'bill',
          title: bill.title || 'Untitled Bill',
          url: bill.officialUrl || `https://congress.gov/bill/${bill.billNumber?.toLowerCase()}`,
          relevanceScore: bill.relevanceScore || bill.similarity || 0,
          excerpt: bill.summary?.substring(0, 200) + '...' || '',
          billNumber: bill.billNumber,
          sponsor: bill.sponsor,
          chamber: bill.chamber,
          status: bill.status,
          introducedDate: bill.introducedDate,
          source: {
            name: 'U.S. Congress',
            type: 'official',
            publishedDate: bill.introducedDate,
            author: bill.sponsor
          },
          searchContext: {
            query,
            searchMethod: type,
            rank: index + 1,
            searchTimestamp: new Date().toISOString()
          }
        }));
      }

      const response = {
        data: {
          bills: includeEmbeddings ? bills : bills.map((bill: any) => {
            const { embedding, ...billWithoutEmbedding } = bill;
            return billWithoutEmbedding;
          }),
          ...(includeCitations && { citations }),
          metadata: {
            totalResults,
            searchTime,
            searchType: type,
            filters: searchArgs.filters,
            pagination: {
              limit: parseInt(limit),
              offset: parseInt(offset),
              hasMore: totalResults > (parseInt(offset) + parseInt(limit))
            }
          }
        },
        success: true
      };

      res.json(response);

    } catch (error) {
      logger.error('Bill search failed', {
        query,
        filters: { chamber, status, congress, sponsor },
        error: error.message
      });

      if (error instanceof MCPServiceError) {
        res.status(503).json(
          APIErrorFactory.serviceUnavailable('Database service')
        );
      } else {
        res.status(500).json(
          APIErrorFactory.internalError('Search operation failed')
        );
      }
    }
  })
);

// Get bill details by ID
router.get('/:billId', 
  validateBillId,
  asyncHandler(async (req, res) => {
    const { billId } = req.params;
    const {
      includeActions = true,
      includeVotes = true,
      includeAmendments = false,
      includeRelated = false
    } = req.query as any;

    logger.info('Bill details request', {
      billId,
      options: { includeActions, includeVotes, includeAmendments, includeRelated }
    });

    try {
      const client = await initializeMCPClient();
      
      const result = await client.callTool('get_bill_details', {
        billId,
        includeActions: includeActions === 'true',
        includeVotes: includeVotes === 'true',
        includeAmendments: includeAmendments === 'true',
        includeRelated: includeRelated === 'true'
      });

      if (!result || (!result.bill && !result.id)) {
        return res.status(404).json(
          APIErrorFactory.badRequest('Bill not found', { billId })
        );
      }

      // Generate citation for this bill
      const bill = result.bill || result;
      const citation = {
        id: bill.id,
        type: 'bill',
        title: bill.title || 'Untitled Bill',
        url: bill.officialUrl || `https://congress.gov/bill/${bill.billNumber?.toLowerCase()}`,
        relevanceScore: 1.0, // Perfect match for direct lookup
        excerpt: bill.summary?.substring(0, 200) + '...' || '',
        billNumber: bill.billNumber,
        sponsor: bill.sponsor,
        chamber: bill.chamber,
        status: bill.status,
        introducedDate: bill.introducedDate,
        source: {
          name: 'U.S. Congress',
          type: 'official',
          publishedDate: bill.introducedDate,
          author: bill.sponsor
        },
        searchContext: {
          query: billId,
          searchMethod: 'direct_lookup',
          rank: 1,
          searchTimestamp: new Date().toISOString()
        }
      };

      const response = {
        data: {
          bill,
          ...(result.actions && { actions: result.actions }),
          ...(result.votes && { votes: result.votes }),
          ...(result.amendments && { amendments: result.amendments }),
          ...(result.relatedBills && { relatedBills: result.relatedBills }),
          citations: [citation]
        },
        success: true
      };

      res.json(response);

    } catch (error) {
      logger.error('Bill details lookup failed', {
        billId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        res.status(404).json(
          APIErrorFactory.badRequest('Bill not found', { billId })
        );
      } else if (error instanceof MCPServiceError) {
        res.status(503).json(
          APIErrorFactory.serviceUnavailable('Database service')
        );
      } else {
        res.status(500).json(
          APIErrorFactory.internalError('Failed to fetch bill details')
        );
      }
    }
  })
);

// Get available filter options for search
router.get('/filters/options', 
  asyncHandler(async (req, res) => {
    try {
      const client = await initializeMCPClient();
      
      // Get available options from MCP server
      const [sponsors, statuses, topics, chambers, congresses] = await Promise.allSettled([
        client.callTool('get_available_sponsors', {}),
        client.callTool('get_available_statuses', {}),
        client.callTool('get_available_topics', {}),
        Promise.resolve(['house', 'senate']),
        client.callTool('get_available_congresses', {})
      ]);

      const response = {
        data: {
          sponsors: sponsors.status === 'fulfilled' ? sponsors.value : [],
          statuses: statuses.status === 'fulfilled' ? statuses.value : [
            'introduced', 'referred', 'reported', 'passed_house', 'passed_senate', 'enrolled', 'signed'
          ],
          topics: topics.status === 'fulfilled' ? topics.value : [],
          chambers: ['house', 'senate'],
          congresses: congresses.status === 'fulfilled' ? congresses.value : []
        },
        success: true,
        timestamp: new Date().toISOString()
      };

      res.json(response);

    } catch (error) {
      logger.error('Failed to get filter options', { error: error.message });
      
      // Return basic options if MCP call fails
      res.json({
        data: {
          sponsors: [],
          statuses: ['introduced', 'referred', 'reported', 'passed_house', 'passed_senate', 'enrolled', 'signed'],
          topics: [],
          chambers: ['house', 'senate'],
          congresses: []
        },
        success: true,
        note: 'Basic options returned due to service unavailability',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// Get recent bills
router.get('/recent/:chamber?', 
  asyncHandler(async (req, res) => {
    const { chamber } = req.params;
    const { limit = 20, congress } = req.query as any;

    logger.info('Recent bills request', { chamber, limit, congress });

    try {
      const client = await initializeMCPClient();
      
      const result = await client.callTool('get_recent_bills', {
        chamber: chamber || null,
        limit: parseInt(limit),
        congress: congress ? parseInt(congress) : null
      });

      const bills = result.results || result || [];
      
      const response = {
        data: {
          bills,
          metadata: {
            chamber: chamber || 'all',
            limit: parseInt(limit),
            congress: congress ? parseInt(congress) : null,
            count: bills.length,
            lastUpdated: new Date().toISOString()
          }
        },
        success: true
      };

      res.json(response);

    } catch (error) {
      logger.error('Recent bills lookup failed', {
        chamber,
        limit,
        error: error.message
      });

      if (error instanceof MCPServiceError) {
        res.status(503).json(
          APIErrorFactory.serviceUnavailable('Database service')
        );
      } else {
        res.status(500).json(
          APIErrorFactory.internalError('Failed to fetch recent bills')
        );
      }
    }
  })
);

export default router;