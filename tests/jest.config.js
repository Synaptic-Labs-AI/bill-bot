export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: 'tsconfig.json'
    }
  },
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@backend/(.*)$': '<rootDir>/../backend/src/$1',
    '^@database/(.*)$': '<rootDir>/../database/$1',
    '^@frontend/(.*)$': '<rootDir>/../frontend/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/setup/jest-setup.ts'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts'
  ],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/fixtures/**',
    '!**/setup/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 60000, // 60 seconds for integration tests
  maxWorkers: 2, // Limit concurrency for real API calls
  verbose: true,
  // Specific test patterns
  projects: [
    {
      displayName: 'Database Tests',
      testMatch: ['<rootDir>/database/**/*.test.ts'],
      testTimeout: 30000
    },
    {
      displayName: 'Backend Tests', 
      testMatch: ['<rootDir>/backend/**/*.test.ts'],
      testTimeout: 45000
    },
    {
      displayName: 'Frontend Tests',
      testMatch: ['<rootDir>/frontend/**/*.test.ts'],
      testTimeout: 30000
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/e2e/**/*.test.ts'],
      testTimeout: 120000 // 2 minutes for full E2E
    }
  ]
};