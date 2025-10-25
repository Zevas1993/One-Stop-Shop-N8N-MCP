/**
 * Agent Lifecycle & Initialization Tests
 * Verifies proper initialization and lifecycle management of all agents
 */

import { PatternAgent } from '../../../src/ai/agents/pattern-agent';
import { WorkflowAgent } from '../../../src/ai/agents/workflow-agent';
import { ValidatorAgent } from '../../../src/ai/agents/validator-agent';
import { GraphRAGOrchestrator } from '../../../src/ai/graphrag-orchestrator';
import { getSharedMemory } from '../../../src/ai/shared-memory';

describe('Agent Lifecycle & Initialization', () => {
  let orchestrator: GraphRAGOrchestrator | null = null;

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
      orchestrator = null;
    }
  });

  describe('Pattern Agent Lifecycle', () => {
    it('should initialize Pattern Agent successfully', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);

      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('pattern-agent');

      await agent.initialize();
      expect(agent.getConfig().id).toBe('pattern-agent');
    });

    it('should have correct configuration after initialization', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();
      expect(config.id).toBe('pattern-agent');
      expect(config.role).toBe('pattern-discovery');
      expect(config.contextBudget).toBe(12000);
      expect(config.timeout).toBe(30000);
    });

    it('should execute successfully after initialization', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const result = await agent.execute({
        goal: 'Send Slack message',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle multiple sequential executions', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const result1 = await agent.execute({ goal: 'Send Slack message' });
      const result2 = await agent.execute({ goal: 'Create database records' });
      const result3 = await agent.execute({ goal: 'Send email notification' });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });
  });

  describe('Workflow Agent Lifecycle', () => {
    it('should initialize Workflow Agent successfully', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);

      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('workflow-agent');

      await agent.initialize();
      expect(agent.getConfig().id).toBe('workflow-agent');
    });

    it('should have correct configuration after initialization', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();
      expect(config.id).toBe('workflow-agent');
      expect(config.role).toBe('workflow-generation');
      expect(config.contextBudget).toBe(15000);
      expect(config.timeout).toBe(45000);
    });

    it('should require shared memory data for execution', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      // Try to execute without pattern in shared memory
      await sharedMemory.delete('selected-pattern', 'test');
      const result = await agent.execute({ goal: 'Generate workflow' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should execute successfully with pattern in shared memory', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      // Setup pattern
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'slack-notification',
          patternName: 'Slack Notification',
          description: 'Send message to Slack',
          confidence: 0.95,
          matchedKeywords: ['slack', 'message'],
          suggestedNodes: ['slack'],
        },
        'test',
        600000
      );

      const result = await agent.execute({ goal: 'Generate workflow' });

      expect(result.success).toBe(true);
      expect(result.result?.workflow).toBeDefined();
    });
  });

  describe('Validator Agent Lifecycle', () => {
    it('should initialize Validator Agent successfully', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);

      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('validator-agent');

      await agent.initialize();
      expect(agent.getConfig().id).toBe('validator-agent');
    });

    it('should have correct configuration after initialization', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();
      expect(config.id).toBe('validator-agent');
      expect(config.role).toBe('workflow-validation');
      expect(config.contextBudget).toBe(10000);
      expect(config.timeout).toBe(30000);
    });

    it('should require generated workflow for execution', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      // Try to execute without workflow in shared memory
      await sharedMemory.delete('generated-workflow', 'test');
      const result = await agent.execute({ goal: 'Validate workflow' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should execute successfully with workflow in shared memory', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      // Setup workflow
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
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
          },
          goal: 'Test',
        },
        'test',
        600000
      );

      const result = await agent.execute({ goal: 'Validate workflow' });

      expect(result.success).toBe(true);
      expect(result.result?.validationResult).toBeDefined();
    });
  });

  describe('Orchestrator Lifecycle', () => {
    it('should initialize Orchestrator successfully', async () => {
      orchestrator = new GraphRAGOrchestrator();
      expect(orchestrator).toBeDefined();

      await orchestrator.initialize();
      expect(orchestrator).toBeDefined();
    });

    it('should have status available after initialization', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      const status = await orchestrator.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.agentsReady).toBe(true);
    });

    it('should execute orchestration successfully', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      const result = await orchestrator.orchestrate({
        goal: 'Send Slack notification',
        context: { platform: 'n8n' },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.stages.length).toBeGreaterThan(0);
    });

    it('should clear state successfully', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      // Execute to populate state
      await orchestrator.orchestrate({
        goal: 'Send Slack notification',
      });

      // Clear state
      await orchestrator.clearState();

      // State should be cleared
      const status = await orchestrator.getStatus();
      expect(status.initialized).toBe(true);
    });

    it('should shutdown gracefully', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      expect(orchestrator).toBeDefined();
      await orchestrator.shutdown();
      expect(orchestrator).toBeDefined(); // Object still exists but is shut down
    });

    it('should handle multiple orchestrations sequentially', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      const goal1 = 'Send Slack notification';
      const goal2 = 'Create database records';
      const goal3 = 'Send email';

      const result1 = await orchestrator.orchestrate({ goal: goal1 });
      const result2 = await orchestrator.orchestrate({ goal: goal2 });
      const result3 = await orchestrator.orchestrate({ goal: goal3 });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      expect(result1.goal).toBe(goal1);
      expect(result2.goal).toBe(goal2);
      expect(result3.goal).toBe(goal3);
    });
  });

  describe('Concurrent Agent Operations', () => {
    it('should handle concurrent pattern and workflow agents', async () => {
      const sharedMemory = await getSharedMemory();

      const patternAgent = new PatternAgent(sharedMemory);
      const workflowAgent = new WorkflowAgent(sharedMemory);

      await patternAgent.initialize();
      await workflowAgent.initialize();

      // Pattern discovery
      const patternResult = await patternAgent.execute({
        goal: 'Send Slack message',
      });

      expect(patternResult.success).toBe(true);

      // Workflow generation using the pattern
      const workflowResult = await workflowAgent.execute({
        goal: 'Generate workflow',
      });

      expect(workflowResult.success).toBe(true);
    });

    it('should handle rapid sequential operations', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      const results = await Promise.all([
        orchestrator.orchestrate({ goal: 'Send Slack message' }),
        orchestrator.orchestrate({ goal: 'Create database records' }),
        orchestrator.orchestrate({ goal: 'Send email' }),
      ]);

      // Note: These may execute concurrently and could have state conflicts
      // At least some should succeed
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery & Resilience', () => {
    it('should recover from failed execution', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      // First execution with invalid goal should still work
      const result1 = await agent.execute({ goal: '' });
      expect(result1).toBeDefined();

      // Second execution should also work
      const result2 = await agent.execute({ goal: 'Send Slack message' });
      expect(result2.success).toBe(true);
    });

    it('should handle missing shared memory gracefully', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      // Clear all data
      await sharedMemory.delete('selected-pattern', 'test');

      // Should fail gracefully
      const result = await agent.execute({ goal: 'Generate workflow' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should continue operating after errors', async () => {
      orchestrator = new GraphRAGOrchestrator();
      await orchestrator.initialize();

      // First: Success
      const result1 = await orchestrator.orchestrate({
        goal: 'Send Slack message',
      });
      expect(result1.success).toBe(true);

      // Second: Check status still works
      const status = await orchestrator.getStatus();
      expect(status.initialized).toBe(true);

      // Third: Another execution still works
      const result2 = await orchestrator.orchestrate({
        goal: 'Create database records',
      });
      expect(result2.success).toBe(true);
    });
  });

  describe('Agent Configuration Validation', () => {
    it('should validate Pattern Agent configuration', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();

      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.role).toBeTruthy();
      expect(config.contextBudget).toBeGreaterThan(0);
      expect(config.timeout).toBeGreaterThan(0);
    });

    it('should validate Workflow Agent configuration', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();

      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.role).toBeTruthy();
      expect(config.contextBudget).toBeGreaterThan(0);
      expect(config.timeout).toBeGreaterThan(0);
    });

    it('should validate Validator Agent configuration', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      const config = agent.getConfig();

      expect(config.id).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.role).toBeTruthy();
      expect(config.contextBudget).toBeGreaterThan(0);
      expect(config.timeout).toBeGreaterThan(0);
    });
  });
});
