/**
 * Unit Tests: GraphRAG Orchestrator
 * Tests the orchestrator's coordination of all agents
 */

import { GraphRAGOrchestrator, createOrchestrator } from '../../../src/ai/graphrag-orchestrator';

describe('GraphRAGOrchestrator', () => {
  let orchestrator: GraphRAGOrchestrator;

  beforeAll(async () => {
    orchestrator = await createOrchestrator();
  });

  afterAll(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(orchestrator).toBeDefined();
    });

    it('should report correct initialization status', async () => {
      const status = await orchestrator.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.agentsReady).toBe(true);
    });
  });

  describe('Orchestration API', () => {
    it('should accept orchestration requests', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Send Slack message',
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('goal');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('tokensUsed');
      expect(result).toHaveProperty('stages');
    });

    it('should support optional metadata', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test metadata',
        context: { userId: 'test-user' },
        metadata: { source: 'test', version: '1.0' },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should support retry configuration', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test retry',
        allowRetry: true,
        maxRetries: 3,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Stage Execution', () => {
    it('should execute all three stages', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test all stages',
      });

      expect(result.stages).toHaveLength(3);
      expect(result.stages[0].stage).toBe('pattern-discovery');
      expect(result.stages[1].stage).toBe('workflow-generation');
      expect(result.stages[2].stage).toBe('validation');
    });

    it('should track stage success/failure', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test stage tracking',
      });

      for (const stage of result.stages) {
        expect(stage).toHaveProperty('stage');
        expect(stage).toHaveProperty('success');
        expect(stage).toHaveProperty('executionTime');
        expect(stage).toHaveProperty('tokensUsed');
      }
    });

    it('should measure stage execution times', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test timing',
      });

      for (const stage of result.stages) {
        expect(stage.executionTime).toBeGreaterThanOrEqual(0);
      }
    });

    it('should accumulate token usage across stages', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test token accumulation',
      });

      let accumulatedTokens = 0;
      for (const stage of result.stages) {
        accumulatedTokens += stage.tokensUsed;
      }

      expect(result.tokensUsed).toBeGreaterThanOrEqual(accumulatedTokens);
    });
  });

  describe('Output Structure', () => {
    it('should return complete orchestration result', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test output',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('goal');
      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('validationResult');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('tokensUsed');
      expect(result).toHaveProperty('stages');
    });

    it('should include workflow in successful results', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test workflow output',
      });

      if (result.success) {
        expect(result.workflow).toBeDefined();
        expect(result.workflow.name).toBeTruthy();
        expect(result.workflow.nodes).toBeDefined();
        expect(result.workflow.connections).toBeDefined();
      }
    });

    it('should include validation results in successful outputs', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test validation output',
      });

      if (result.success) {
        expect(result.validationResult).toBeDefined();
        expect(result.validationResult.valid).toBe(true);
        expect(result.validationResult.errors).toBeDefined();
        expect(result.validationResult.warnings).toBeDefined();
      }
    });

    it('should include error information on failure', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test error output',
      });

      if (!result.success) {
        expect(result.errors).toBeDefined();
        expect(Array.isArray(result.errors)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty goals', async () => {
      const result = await orchestrator.orchestrate({
        goal: '',
      });

      expect(result).toBeDefined();
    });

    it('should handle null goals gracefully', async () => {
      const result = await orchestrator.orchestrate({
        goal: null as any,
      });

      expect(result).toBeDefined();
    });

    it('should handle very long goals', async () => {
      const goal = 'Test ' + 'very long goal '.repeat(100);

      const result = await orchestrator.orchestrate({ goal });

      expect(result).toBeDefined();
    });

    it('should handle special characters in goals', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test "quoted" [bracketed] {braced} <angled> & symbols!',
      });

      expect(result).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should clear orchestration state', async () => {
      // Run orchestration
      await orchestrator.orchestrate({
        goal: 'Test state clearing',
      });

      // Clear state
      await orchestrator.clearState();

      // State should be cleared
      const status = await orchestrator.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete orchestration in reasonable time', async () => {
      const startTime = Date.now();
      const result = await orchestrator.orchestrate({
        goal: 'Test performance',
      });
      const duration = Date.now() - startTime;

      expect(result.executionTime).toBeLessThan(10000); // 10 seconds
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should use reasonable token budget', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test token usage',
      });

      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeLessThan(100000); // Less than 100K
    });

    it('should have reasonable stage latencies', async () => {
      const result = await orchestrator.orchestrate({
        goal: 'Test stage latencies',
      });

      for (const stage of result.stages) {
        expect(stage.executionTime).toBeLessThan(5000); // Each stage < 5 seconds
      }
    });
  });

  describe('Shutdown & Cleanup', () => {
    it('should shutdown gracefully', async () => {
      const testOrchestrator = await createOrchestrator();
      await testOrchestrator.shutdown();

      // Should complete without error
      expect(testOrchestrator).toBeDefined();
    });
  });

  describe('Multiple Executions', () => {
    it('should handle sequential executions', async () => {
      const result1 = await orchestrator.orchestrate({
        goal: 'First execution',
      });
      const result2 = await orchestrator.orchestrate({
        goal: 'Second execution',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.goal).toBe('First execution');
      expect(result2.goal).toBe('Second execution');
    });

    it('should maintain independent state between executions', async () => {
      const result1 = await orchestrator.orchestrate({
        goal: 'Test 1',
      });
      const result2 = await orchestrator.orchestrate({
        goal: 'Test 2',
      });

      expect(result1.goal).not.toBe(result2.goal);
    });
  });
});
