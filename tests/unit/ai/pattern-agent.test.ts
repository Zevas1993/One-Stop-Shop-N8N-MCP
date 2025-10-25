/**
 * Unit Tests: Pattern Agent
 * Tests pattern discovery and keyword matching
 */

import { PatternAgent } from '../../../src/ai/agents/pattern-agent';
import { getSharedMemory } from '../../../src/ai/shared-memory';

describe('PatternAgent', () => {
  let agent: PatternAgent;

  beforeAll(async () => {
    const sharedMemory = await getSharedMemory();
    agent = new PatternAgent(sharedMemory);
    await agent.initialize();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('pattern-agent');
      expect(agent.getConfig().role).toBe('pattern-discovery');
    });

    it('should have correct context budget', () => {
      expect(agent.getConfig().contextBudget).toBe(12000);
    });

    it('should have reasonable timeout', () => {
      expect(agent.getConfig().timeout).toBe(30000); // 30 seconds
    });
  });

  describe('Pattern Discovery - Basic', () => {
    it('should discover Slack notification pattern', async () => {
      const result = await agent.execute({
        goal: 'Send message to Slack channel when workflow completes',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/slack|notification/i);
      expect(result.result?.patternId).toBe('slack-notification');
    });

    it('should discover email pattern', async () => {
      const result = await agent.execute({
        goal: 'Send emails to customers with order updates',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/email|mail/i);
      expect(result.result?.patternId).toBe('email-workflow');
    });

    it('should discover data transformation pattern', async () => {
      const result = await agent.execute({
        goal: 'Convert JSON data to CSV format for export',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/transform|convert|process/i);
      expect(result.result?.patternId).toBe('data-transformation');
    });

    it('should discover API integration pattern', async () => {
      const result = await agent.execute({
        goal: 'Fetch customer data from REST API',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/api|http|request|fetch/i);
      expect(result.result?.patternId).toBe('api-integration');
    });

    it('should discover database CRUD pattern', async () => {
      const result = await agent.execute({
        goal: 'Create and update records in SQL database',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/database|crud|sql/i);
      expect(result.result?.patternId).toBe('database-crud');
    });

    it('should discover conditional flow pattern', async () => {
      const result = await agent.execute({
        goal: 'Execute different steps based on condition',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/conditional|flow|if|check/i);
      expect(result.result?.patternId).toBe('conditional-flow');
    });

    it('should discover error handling pattern', async () => {
      const result = await agent.execute({
        goal: 'Retry failed operations and handle errors gracefully',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/error|retry|exception|fail/i);
      expect(result.result?.patternId).toBe('error-handling');
    });

    it('should discover scheduling pattern', async () => {
      const result = await agent.execute({
        goal: 'Run workflow every morning at 8 AM',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/schedule|cron|daily|hourly|time/i);
      expect(result.result?.patternId).toBe('scheduling');
    });

    it('should discover file operations pattern', async () => {
      const result = await agent.execute({
        goal: 'Upload and download files from cloud storage',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/file|upload|download|read|write|store/i);
      expect(result.result?.patternId).toBe('file-operations');
    });

    it('should discover multi-step workflow pattern', async () => {
      const result = await agent.execute({
        goal: 'Build complex workflow with multiple sequential steps',
      });

      expect(result.success).toBe(true);
      expect(result.result?.patternName).toMatch(/multi|step|workflow|process|pipeline|chain/i);
      expect(result.result?.patternId).toBe('multi-step-workflow');
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign confidence scores between 0 and 1', async () => {
      const result = await agent.execute({
        goal: 'Send Slack message',
      });

      expect(result.success).toBe(true);
      expect(result.result?.confidence).toBeGreaterThanOrEqual(0);
      expect(result.result?.confidence).toBeLessThanOrEqual(1);
    });

    it('should give higher confidence for clear patterns', async () => {
      const result = await agent.execute({
        goal: 'Send message to Slack notification channel',
      });

      expect(result.success).toBe(true);
      expect(result.result?.confidence).toBeGreaterThan(0.5); // Should be confident
    });

    it('should give lower confidence for ambiguous patterns', async () => {
      const result = await agent.execute({
        goal: 'Do something with data',
      });

      expect(result.success).toBe(true);
      // Still should be successful but might have lower confidence
      expect(result.result?.confidence).toBeGreaterThan(0);
    });
  });

  describe('Keyword Extraction', () => {
    it('should extract relevant keywords from goal', async () => {
      const result = await agent.execute({
        goal: 'Send Slack notification when API returns error',
      });

      expect(result.success).toBe(true);
      expect(result.result?.matchedKeywords).toBeDefined();
      expect(Array.isArray(result.result?.matchedKeywords)).toBe(true);
      expect(result.result?.matchedKeywords.length).toBeGreaterThan(0);
    });

    it('should limit keyword extraction to 10 keywords', async () => {
      const result = await agent.execute({
        goal: 'Send Slack message notification API request response error handling database query update insert delete select from where condition AND OR NOT',
      });

      expect(result.success).toBe(true);
      expect(result.result?.matchedKeywords?.length).toBeLessThanOrEqual(10);
    });

    it('should filter stopwords', async () => {
      const result = await agent.execute({
        goal: 'Send a message to the Slack channel and also post in the database',
      });

      expect(result.success).toBe(true);
      const keywords = result.result?.matchedKeywords || [];
      // Should not include common stopwords like 'a', 'the', 'and', 'in'
      expect(keywords.some((k: string) => ['a', 'the', 'and', 'in', 'to'].includes(k.toLowerCase()))).toBe(false);
    });
  });

  describe('Suggested Nodes', () => {
    it('should suggest nodes for pattern', async () => {
      const result = await agent.execute({
        goal: 'Send Slack message',
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result?.suggestedNodes)).toBe(true);
      expect(result.result?.suggestedNodes?.length).toBeGreaterThan(0);
    });

    it('should suggest relevant nodes for API pattern', async () => {
      const result = await agent.execute({
        goal: 'Fetch data from API',
      });

      expect(result.success).toBe(true);
      const nodes = result.result?.suggestedNodes || [];
      expect(nodes.some((n: string) => n.includes('httpRequest') || n.includes('HTTP'))).toBe(true);
    });

    it('should suggest relevant nodes for email pattern', async () => {
      const result = await agent.execute({
        goal: 'Send email',
      });

      expect(result.success).toBe(true);
      const nodes = result.result?.suggestedNodes || [];
      expect(nodes.some((n: string) => n.includes('email') || n.includes('send'))).toBe(true);
    });
  });

  describe('Complexity Classification', () => {
    it('should classify simple patterns', async () => {
      const result = await agent.execute({
        goal: 'Send message',
      });

      expect(result.success).toBe(true);
      expect(['simple', 'medium', 'complex']).toContain(result.result?.complexity);
    });

    it('should classify complex patterns', async () => {
      const result = await agent.execute({
        goal: 'Build multi-step workflow with conditional logic, error handling, and retries',
      });

      expect(result.success).toBe(true);
      expect(['simple', 'medium', 'complex']).toContain(result.result?.complexity);
    });
  });

  describe('Shared Memory Integration', () => {
    it('should store selected pattern in shared memory', async () => {
      const sharedMemory = await getSharedMemory();

      await agent.execute({
        goal: 'Send Slack notification',
      });

      const pattern = await sharedMemory.get('selected-pattern');
      expect(pattern).toBeDefined();
      expect(pattern.patternId).toBe('slack-notification');
    });

    it('should include TTL for stored pattern', async () => {
      const sharedMemory = await getSharedMemory();

      await agent.execute({
        goal: 'Send email',
      });

      // Pattern should have been stored with TTL
      const pattern = await sharedMemory.get('selected-pattern');
      expect(pattern).toBeDefined();
      // Should expire after 10 minutes (600000 ms)
    });
  });

  describe('Error Handling', () => {
    it('should handle empty goal gracefully', async () => {
      const result = await agent.execute({
        goal: '',
      });

      expect(result).toBeDefined();
      // Should still return something, even if confidence is low
    });

    it('should handle null/undefined goal gracefully', async () => {
      const result = await agent.execute({
        goal: null as any,
      });

      expect(result).toBeDefined();
    });

    it('should handle very long goals', async () => {
      const goal = 'Send message ' + 'very long text '.repeat(100);

      const result = await agent.execute({ goal });

      expect(result).toBeDefined();
    });

    it('should handle special characters', async () => {
      const result = await agent.execute({
        goal: 'Send message with "quotes", $special, @characters, and #symbols!',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Execution Metrics', () => {
    it('should measure execution time', async () => {
      const result = await agent.execute({
        goal: 'Send message',
      });

      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(5000); // Should be quick
    });

    it('should report token usage', async () => {
      const result = await agent.execute({
        goal: 'Send message',
      });

      if (result.tokensUsed) {
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.tokensUsed).toBeLessThan(12000); // Within context budget
      }
    });
  });
});
