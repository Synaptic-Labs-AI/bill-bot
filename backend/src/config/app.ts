import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  cors: {
    origins: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  chatRateLimit: {
    windowMs: number;
    max: number;
  };
  mcp: {
    serverPath: string;
    restartDelay: number;
    healthCheckInterval: number;
    timeout: number;
  };
  openRouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
    fallbackModel: string;
    temperature: number;
  };
  search: {
    maxIterations: number;
    timeout: number;
    citationLimit: number;
  };
  security: {
    requestTimeout: number;
    bodyLimit: string;
  };
  logging: {
    level: string;
    format: string;
  };
}

export const loadConfig = (): AppConfig => {
  const requiredEnvVars = [
    'OPENROUTER_API_KEY'
  ];

  // Check for required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    cors: {
      origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
    },
    chatRateLimit: {
      windowMs: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
      max: parseInt(process.env.CHAT_RATE_LIMIT_MAX || '10', 10)
    },
    mcp: {
      serverPath: process.env.MCP_SERVER_PATH || '../mcp-server/dist/index.js',
      restartDelay: parseInt(process.env.MCP_RESTART_DELAY || '1000', 10),
      healthCheckInterval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000', 10),
      timeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10)
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
      fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL || 'anthropic/claude-3-sonnet',
      temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.7')
    },
    search: {
      maxIterations: parseInt(process.env.MAX_SEARCH_ITERATIONS || '20', 10),
      timeout: parseInt(process.env.SEARCH_TIMEOUT || '60000', 10),
      citationLimit: parseInt(process.env.CITATION_LIMIT || '50', 10)
    },
    security: {
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
      bodyLimit: process.env.BODY_LIMIT || '10mb'
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'combined'
    }
  };
};

// Export singleton config instance
export const config = loadConfig();

// Validate configuration on load
export const validateConfig = (config: AppConfig): void => {
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  if (config.search.maxIterations < 1 || config.search.maxIterations > 50) {
    throw new Error('Max iterations must be between 1 and 50');
  }

  if (config.openRouter.temperature < 0 || config.openRouter.temperature > 2) {
    throw new Error('Temperature must be between 0 and 2');
  }

  // Validate required paths exist (in production)
  if (config.environment === 'production') {
    // Add any production-specific validations here
  }
};

// Validate on load
validateConfig(config);