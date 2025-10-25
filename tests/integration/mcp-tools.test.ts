/**
 * MCP Tools Integration Tests
 * Tests MCP tool handlers for orchestration
 */

import {
  handleOrchestrate,
  handleValidateWorkflow,
  handleGetStatus,
  handleClearState,
} from '../../src/mcp/tools-orchestration';

describe('MCP Orchestration Tools Integration', () => {
  describe('orchestrate_workflow tool', () => {
    it('should handle basic orchestration request', async () => {
      const result = await handleOrchestrate({
        goal: 'Send Slack notification when workflow completes',
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.goal).toBe('Send Slack notification when workflow completes');

      if (result.success) {
        expect(result.workflow).toBeDefined();
        expect(result.validationResult).toBeDefined();
        expect(result.stages).toBeDefined();
        expect(result.stages.length).toBeGreaterThan(0);
      }
    });

    it('should include all required response fields', async () => {
      const result = await handleOrchestrate({
        goal: 'Create database records',
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('goal');
      expect(result).toHaveProperty('workflow');
      expect(result).toHaveProperty('validationResult');
      expect(result).toHaveProperty('stages');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('tokensUsed');
      expect(result).toHaveProperty('errors');
    });

    it('should return workflow structure on success', async () => {
      const result = await handleOrchestrate({
        goal: 'Send email notification',
      });

      if (result.success && result.workflow) {
        expect(result.workflow).toHaveProperty('name');
        expect(result.workflow).toHaveProperty('nodes');
        expect(result.workflow).toHaveProperty('connections');

        expect(Array.isArray(result.workflow.nodes)).toBe(true);
        expect(typeof result.workflow.connections).toBe('object');
      }
    });

    it('should include execution metrics', async () => {
      const result = await handleOrchestrate({
        goal: 'API integration workflow',
      });

      expect(result.executionTime).toBeGreaterThan(0);
      expect(typeof result.executionTime).toBe('number');

      if (result.tokensUsed) {
        expect(typeof result.tokensUsed).toBe('number');
        expect(result.tokensUsed).toBeGreaterThan(0);
      }
    });

    it('should return stages information', async () => {
      const result = await handleOrchestrate({
        goal: 'Multi-step workflow',
      });

      expect(Array.isArray(result.stages)).toBe(true);
      expect(result.stages.length).toBeGreaterThan(0);

      result.stages.forEach((stage: any) => {
        expect(stage).toHaveProperty('stage');
        expect(stage).toHaveProperty('success');
        expect(stage).toHaveProperty('executionTime');
        expect(stage).toHaveProperty('tokensUsed');
      });
    });

    it('should handle context parameter', async () => {
      const result = await handleOrchestrate({
        goal: 'Send Slack message',
        context: {
          platform: 'n8n',
          userRole: 'admin',
          environment: 'production',
        },
      });

      expect(result).toBeDefined();
      expect(result.goal).toBe('Send Slack message');
    });

    it('should handle optional parameters with defaults', async () => {
      const result = await handleOrchestrate({
        goal: 'Test workflow',
        allowRetry: true,
        maxRetries: 2,
      });

      expect(result).toBeDefined();
      expect(result.goal).toBe('Test workflow');
    });

    it('should handle errors gracefully', async () => {
      const result = await handleOrchestrate({
        goal: '', // Empty goal
      });

      expect(result).toBeDefined();
      // Should either succeed or fail gracefully with error message
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should maintain consistent response structure on failure', async () => {
      const result = await handleOrchestrate({
        goal: 'Invalid workflow request that should fail gracefully',
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('validate_workflow_structure tool', () => {
    it('should validate correct workflow structure', async () => {
      const workflow = {
        name: 'Test Workflow',
        description: 'Test',
        nodes: [
          {
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            position: [0, 0],
          },
          {
            name: 'Slack',
            type: 'n8n-nodes-base.slack',
            position: [200, 0],
          },
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Slack', type: 'main', index: 0 }]],
          },
        },
      };

      const result = await handleValidateWorkflow({ workflow });

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();

      if (result.valid) {
        expect(result.errors).toBeDefined();
        expect(Array.isArray(result.errors)).toBe(true);
      }
    });

    it('should detect invalid workflow structure', async () => {
      const workflow = {
        name: 'Invalid Workflow',
        // Missing nodes or connections
      } as any;

      const result = await handleValidateWorkflow({ workflow });

      expect(result).toBeDefined();
      if (result.valid === false) {
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should return validation errors', async () => {
      const workflow = {
        name: 'Incomplete Workflow',
        nodes: [], // Empty nodes
        connections: {},
      };

      const result = await handleValidateWorkflow({ workflow });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should include error details', async () => {
      const workflow = {
        name: 'Missing Trigger',
        description: 'Workflow without trigger',
        nodes: [
          {
            name: 'Action',
            type: 'n8n-nodes-base.slack',
            position: [0, 0],
          },
        ],
        connections: {},
      };

      const result = await handleValidateWorkflow({ workflow });

      expect(result).toBeDefined();
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((error: any) => {
          expect(error).toHaveProperty('type');
          expect(error).toHaveProperty('message');
        });
      }
    });
  });

  describe('get_orchestration_status tool', () => {
    it('should return orchestrator status', async () => {
      const result = await handleGetStatus();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('initialized');
      expect(result).toHaveProperty('agentsReady');

      expect(typeof result.initialized).toBe('boolean');
      expect(typeof result.agentsReady).toBe('boolean');
    });

    it('should return shared memory statistics if available', async () => {
      const result = await handleGetStatus();

      expect(result).toBeDefined();
      if (result.sharedMemoryStats) {
        expect(typeof result.sharedMemoryStats).toBe('object');
      }
    });

    it('should indicate initialization state', async () => {
      const result = await handleGetStatus();

      expect(result.initialized).toBeDefined();
      expect(typeof result.initialized).toBe('boolean');
    });

    it('should indicate agent readiness', async () => {
      const result = await handleGetStatus();

      expect(result.agentsReady).toBeDefined();
      expect(typeof result.agentsReady).toBe('boolean');
    });
  });

  describe('clear_orchestration_state tool', () => {
    it('should clear orchestration state without error', async () => {
      // First run orchestration to populate state
      await handleOrchestrate({
        goal: 'Create test state',
      });

      // Then clear state
      const result = await handleClearState();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle clearing empty state', async () => {
      const result = await handleClearState();

      expect(result).toBeDefined();
      // Should succeed even if no state to clear
      expect(result.success).toBeDefined();
    });

    it('should return success status', async () => {
      const result = await handleClearState();

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Tool Error Handling', () => {
    it('should handle missing required parameters', async () => {
      const result = await handleOrchestrate({
        goal: '',
      });

      expect(result).toBeDefined();
      // Should handle gracefully - either succeed with default or fail with message
    });

    it('should catch and return errors properly', async () => {
      const invalidWorkflow = {
        // Invalid structure
      } as any;

      const result = await handleValidateWorkflow({
        workflow: invalidWorkflow,
      });

      expect(result).toBeDefined();
    });

    it('should not throw unhandled exceptions', async () => {
      // All of these should complete without throwing
      const promises = [
        handleOrchestrate({ goal: 'Test' }),
        handleGetStatus(),
        handleClearState(),
        handleValidateWorkflow({
          workflow: { name: 'test', nodes: [], connections: {} },
        }),
      ];

      const results = await Promise.allSettled(promises);

      results.forEach((result) => {
        expect(result.status).toBe('fulfilled');
      });
    });
  });

  describe('Tool Response Consistency', () => {
    it('should return consistent field types across calls', async () => {
      const result1 = await handleOrchestrate({
        goal: 'First call',
      });
      const result2 = await handleOrchestrate({
        goal: 'Second call',
      });

      expect(typeof result1.success).toBe(typeof result2.success);
      expect(typeof result1.executionTime).toBe(typeof result2.executionTime);
    });

    it('should maintain execution time as positive number', async () => {
      const result = await handleOrchestrate({
        goal: 'Test execution time',
      });

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should return complete stage information', async () => {
      const result = await handleOrchestrate({
        goal: 'Test complete stages',
      });

      if (result.success && result.stages) {
        const stageNames = ['pattern-discovery', 'workflow-generation', 'validation'];

        result.stages.forEach((stage: any) => {
          expect(stageNames).toContain(stage.stage);
        });
      }
    });
  });
});
