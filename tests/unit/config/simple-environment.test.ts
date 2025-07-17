/**
 * Simple environment configuration tests
 */

import { describe, it, expect } from '@jest/globals';

// Simple environment validation function to test
function validateEnvironment(env: Record<string, string | undefined>): { 
  n8nApiUrl: string;
  n8nApiKey: string;
  debug: boolean;
} {
  // Check required variables
  if (!env.N8N_API_URL) {
    throw new Error('Missing required environment variable: N8N_API_URL');
  }
  
  if (!env.N8N_API_KEY) {
    throw new Error('Missing required environment variable: N8N_API_KEY');
  }
  
  // Validate URL format
  try {
    new URL(env.N8N_API_URL);
  } catch (error) {
    throw new Error(`Invalid URL format for N8N_API_URL: ${env.N8N_API_URL}`);
  }
  
  // Return parsed config
  return {
    n8nApiUrl: env.N8N_API_URL,
    n8nApiKey: env.N8N_API_KEY,
    debug: env.DEBUG?.toLowerCase() === 'true'
  };
}

describe('Environment Configuration', () => {
  describe('validateEnvironment', () => {
    it('should return a valid config when all required variables are present', () => {
      const env = {
        N8N_API_URL: 'https://n8n.example.com/api/v1',
        N8N_API_KEY: 'test-api-key'
      };
      
      const config = validateEnvironment(env);
      
      expect(config).toEqual({
        n8nApiUrl: 'https://n8n.example.com/api/v1',
        n8nApiKey: 'test-api-key',
        debug: false
      });
    });
    
    it('should set debug to true when DEBUG=true', () => {
      const env = {
        N8N_API_URL: 'https://n8n.example.com/api/v1',
        N8N_API_KEY: 'test-api-key',
        DEBUG: 'true'
      };
      
      const config = validateEnvironment(env);
      
      expect(config.debug).toBe(true);
    });
    
    it('should throw an error when N8N_API_URL is missing', () => {
      const env = {
        N8N_API_KEY: 'test-api-key'
      };
      
      expect(() => validateEnvironment(env)).toThrow(
        'Missing required environment variable: N8N_API_URL'
      );
    });
    
    it('should throw an error when N8N_API_KEY is missing', () => {
      const env = {
        N8N_API_URL: 'https://n8n.example.com/api/v1'
      };
      
      expect(() => validateEnvironment(env)).toThrow(
        'Missing required environment variable: N8N_API_KEY'
      );
    });
    
    it('should throw an error when N8N_API_URL is not a valid URL', () => {
      const env = {
        N8N_API_URL: 'invalid-url',
        N8N_API_KEY: 'test-api-key'
      };
      
      expect(() => validateEnvironment(env)).toThrow(
        'Invalid URL format for N8N_API_URL: invalid-url'
      );
    });
  });
});
