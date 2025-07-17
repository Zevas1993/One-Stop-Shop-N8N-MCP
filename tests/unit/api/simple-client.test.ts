/**
 * Simple HTTP client tests without complex dependencies
 */

import { describe, it, expect } from '@jest/globals';

// Create a simple HTTP client class to test
class SimpleHttpClient {
  constructor(private baseUrl: string, private apiKey: string) {}
  
  getBaseUrl(): string {
    return this.baseUrl;
  }
  
  getApiKey(): string {
    return this.apiKey;
  }
  
  buildAuthHeader(): Record<string, string> {
    return {
      'X-N8N-API-KEY': this.apiKey
    };
  }
  
  formatUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }
}

describe('SimpleHttpClient', () => {
  it('should store baseUrl and apiKey properly', () => {
    const baseUrl = 'https://n8n.example.com/api/v1';
    const apiKey = 'test-api-key';
    const client = new SimpleHttpClient(baseUrl, apiKey);
    
    expect(client.getBaseUrl()).toBe(baseUrl);
    expect(client.getApiKey()).toBe(apiKey);
  });
  
  it('should create proper auth headers', () => {
    const client = new SimpleHttpClient('https://n8n.example.com/api/v1', 'test-api-key');
    const headers = client.buildAuthHeader();
    
    expect(headers).toEqual({ 'X-N8N-API-KEY': 'test-api-key' });
  });
  
  it('should format URLs correctly', () => {
    const baseUrl = 'https://n8n.example.com/api/v1';
    const client = new SimpleHttpClient(baseUrl, 'test-api-key');
    
    expect(client.formatUrl('workflows')).toBe(`${baseUrl}/workflows`);
    expect(client.formatUrl('/workflows')).toBe(`${baseUrl}/workflows`);
  });
});
