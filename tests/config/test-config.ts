import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

export interface TestConfig {
  database: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    cleanupAfterTests: boolean;
  };
  backend: {
    url: string;
    apiKey?: string;
    timeout: number;
  };
  frontend: {
    url: string;
    timeout: number;
  };
  openrouter: {
    apiKey: string;
    models: string[];
    timeout: number;
  };
  mcp: {
    serverPath: string;
    timeout: number;
  };
  performance: {
    concurrentUsers: number;
    durationSeconds: number;
    rampUpSeconds: number;
  };
  test: {
    verbose: boolean;
    sampleSize: number;
    maxRetries: number;
    timeoutMultiplier: number;
  };
}

export const testConfig: TestConfig = {
  database: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    cleanupAfterTests: process.env.TEST_DATABASE_CLEANUP === 'true'
  },
  backend: {
    url: process.env.TEST_BACKEND_URL || 'http://localhost:3001',
    timeout: 30000
  },
  frontend: {
    url: process.env.TEST_FRONTEND_URL || 'http://localhost:3000',
    timeout: 30000
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY!,
    models: [
      'anthropic/claude-3.5-sonnet:beta',
      'openai/gpt-4o',
      'meta-llama/llama-3.1-8b-instruct:free'
    ],
    timeout: 60000
  },
  mcp: {
    serverPath: process.env.MCP_SERVER_PATH || '../mcp-server/dist/index.js',
    timeout: parseInt(process.env.MCP_TIMEOUT || '30000')
  },
  performance: {
    concurrentUsers: parseInt(process.env.PERFORMANCE_TEST_CONCURRENT_USERS || '10'),
    durationSeconds: parseInt(process.env.PERFORMANCE_TEST_DURATION_SECONDS || '60'),
    rampUpSeconds: parseInt(process.env.PERFORMANCE_TEST_RAMP_UP_SECONDS || '10')
  },
  test: {
    verbose: process.env.TEST_VERBOSE_LOGGING === 'true',
    sampleSize: parseInt(process.env.TEST_BILL_SAMPLE_SIZE || '100'),
    maxRetries: 3,
    timeoutMultiplier: parseFloat(process.env.TEST_TIMEOUT_MULTIPLIER || '1.0')
  }
};

// Validation
function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENROUTER_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (testConfig.test.verbose) {
    console.log('✅ Test configuration validated');
  }
}

// Auto-validate on import
validateConfig();

export { validateConfig };