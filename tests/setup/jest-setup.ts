import { config } from 'dotenv';
import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Load test environment
config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Increase timeout for integration tests
  jest.setTimeout(60000);
  
  console.log('🧪 Starting Bill Bot Integration Tests');
  console.log('📊 Test Environment:', {
    backend: process.env.TEST_BACKEND_URL,
    frontend: process.env.TEST_FRONTEND_URL,
    database: process.env.SUPABASE_URL?.replace(/\/\//g, '//***'),
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY
  });
});

afterAll(async () => {
  console.log('✅ Integration Tests Complete');
});

// Global error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Global test utilities
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    generateTestId: () => string;
    cleanupTestData: () => Promise<void>;
  };
}

global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  cleanupTestData: async () => {
    // Cleanup will be implemented per test suite
    console.log('🧹 Cleaning up test data...');
  }
};

export {};