/**
 * Global test setup for n8n MCP Server tests
 */
import { beforeEach, afterEach, jest } from '@jest/globals';

// Reset environment variables before each test
beforeEach(() => {
  process.env = { 
    ...process.env,
    NODE_ENV: 'test' 
  };
});

// Clean up after each test
afterEach(() => {
  jest.resetAllMocks();
  jest.clearAllMocks();
});

export const mockEnv = (envVars: Record<string, string>) => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { 
      ...originalEnv,
      ...envVars 
    };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
};
