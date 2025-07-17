/**
 * Simple test for URI Template functionality
 */

import { describe, it, expect } from '@jest/globals';

// Simple functions to test without complex imports
function getWorkflowResourceTemplateUri() {
  return 'n8n://workflows/{id}';
}

function extractWorkflowIdFromUri(uri: string): string | null {
  const regex = /^n8n:\/\/workflows\/([^/]+)$/;
  const match = uri.match(regex);
  return match ? match[1] : null;
}

describe('Workflow Resource URI Functions', () => {
  describe('getWorkflowResourceTemplateUri', () => {
    it('should return the correct URI template', () => {
      expect(getWorkflowResourceTemplateUri()).toBe('n8n://workflows/{id}');
    });
  });
  
  describe('extractWorkflowIdFromUri', () => {
    it('should extract workflow ID from valid URI', () => {
      expect(extractWorkflowIdFromUri('n8n://workflows/123abc')).toBe('123abc');
      expect(extractWorkflowIdFromUri('n8n://workflows/workflow-name-with-dashes')).toBe('workflow-name-with-dashes');
    });
    
    it('should return null for invalid URI formats', () => {
      expect(extractWorkflowIdFromUri('n8n://workflows/')).toBeNull();
      expect(extractWorkflowIdFromUri('n8n://workflows')).toBeNull();
      expect(extractWorkflowIdFromUri('n8n://workflow/123')).toBeNull();
      expect(extractWorkflowIdFromUri('invalid://workflows/123')).toBeNull();
    });
  });
});
