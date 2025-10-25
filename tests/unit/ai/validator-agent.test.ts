/**
 * Unit Tests: Validator Agent
 * Tests workflow validation
 */

import { ValidatorAgent } from '../../../src/ai/agents/validator-agent';
import { getSharedMemory } from '../../../src/ai/shared-memory';

describe('ValidatorAgent', () => {
  let agent: ValidatorAgent;

  beforeAll(async () => {
    const sharedMemory = await getSharedMemory();
    agent = new ValidatorAgent(sharedMemory);
    await agent.initialize();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('validator-agent');
      expect(agent.getConfig().role).toBe('workflow-validation');
    });

    it('should have correct context budget', () => {
      expect(agent.getConfig().contextBudget).toBe(10000);
    });

    it('should have reasonable timeout', () => {
      expect(agent.getConfig().timeout).toBe(30000); // 30 seconds
    });
  });

  describe('Validation - Basic Structure', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      // Store a valid workflow
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Test Workflow',
            description: 'A test workflow',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );
    });

    it('should require workflow in shared memory', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.delete('generated-workflow', 'test');

      const result = await agent.execute({
        goal: 'Test validation',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/workflow|shared memory/i);
    });

    it('should validate valid workflow successfully', async () => {
      const result = await agent.execute({
        goal: 'Validate workflow',
      });

      expect(result.success).toBe(true);
      expect(result.result?.isValid).toBe(true);
    });
  });

  describe('Validation Results Structure', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Test Workflow',
            description: 'A test workflow',
            nodes: [
              {
                name: 'Manual Trigger',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'HTTP Request',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              'Manual Trigger': {
                main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );
    });

    it('should return validation result with required fields', async () => {
      const result = await agent.execute({
        goal: 'Validate',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('nodeCount');
      expect(validation).toHaveProperty('connectionCount');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      expect(validation).toHaveProperty('stats');
    });

    it('should report correct node and connection counts', async () => {
      const result = await agent.execute({
        goal: 'Validate',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;

      expect(validation.nodeCount).toBe(2);
      expect(validation.connectionCount).toBeGreaterThan(0);
    });

    it('should have proper validation statistics', async () => {
      const result = await agent.execute({
        goal: 'Validate',
      });

      expect(result.success).toBe(true);
      const stats = result.result?.validationResult?.stats;

      expect(stats.totalNodes).toBe(2);
      expect(stats.totalConnections).toBeGreaterThan(0);
      expect(stats.triggerNodes).toBeGreaterThan(0);
      expect(stats.actionNodes).toBeGreaterThan(0);
      expect(stats.connectedNodes).toBeGreaterThan(0);
      expect(['simple', 'medium', 'complex']).toContain(stats.complexity);
    });
  });

  describe('Trigger Node Validation', () => {
    it('should require at least one trigger node', async () => {
      const sharedMemory = await getSharedMemory();
      // Workflow without trigger
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'No Trigger',
            description: 'Workflow without trigger',
            nodes: [
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [100, 100],
              },
            ],
            connections: {},
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate no trigger',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: any) => e.type === 'MISSING_TRIGGER')).toBe(true);
    });

    it('should warn about multiple trigger nodes', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Multiple Triggers',
            description: 'Workflow with multiple triggers',
            nodes: [
              {
                name: 'Manual Trigger 1',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Manual Trigger 2',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 200],
              },
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 150],
              },
            ],
            connections: {
              'Manual Trigger 1': {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
              'Manual Trigger 2': {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate multiple triggers',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.warnings.some((w: any) => w.type === 'MULTIPLE_TRIGGERS')).toBe(true);
    });
  });

  describe('Connection Validation', () => {
    it('should validate connections reference existing nodes', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Invalid Connection',
            description: 'Workflow with invalid connection',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'NonExistent', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate invalid connection',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: any) => e.type === 'INVALID_CONNECTION_TARGET')).toBe(true);
    });

    it('should detect orphaned nodes', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Orphaned Node',
            description: 'Workflow with orphaned node',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Orphaned',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'Start', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate orphaned nodes',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.warnings.some((w: any) => w.type === 'ORPHANED_NODE')).toBe(true);
      expect(validation.stats.orphanedNodes).toBeGreaterThan(0);
    });
  });

  describe('Error Severity Levels', () => {
    it('should classify critical errors', async () => {
      const sharedMemory = await getSharedMemory();
      // Workflow with no nodes
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Empty Workflow',
            description: 'Workflow with no nodes',
            nodes: [],
            connections: {},
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate empty',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      const criticalErrors = validation.errors.filter((e: any) => e.severity === 'critical');
      expect(criticalErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Complexity Classification', () => {
    it('should classify simple workflow', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Simple',
            description: 'Simple workflow',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate simple',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.stats.complexity).toBe('simple');
    });

    it('should classify complex workflow', async () => {
      const sharedMemory = await getSharedMemory();
      const nodes = [
        { name: 'Start', type: 'n8n-nodes-base.manualTrigger', position: [100, 100] },
      ];
      for (let i = 1; i <= 15; i++) {
        nodes.push({
          name: `Node ${i}`,
          type: 'n8n-nodes-base.httpRequest',
          position: [100 + i * 100, 100],
        });
      }

      const connections: any = {};
      for (let i = 0; i < nodes.length - 1; i++) {
        connections[nodes[i].name] = {
          main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]],
        };
      }

      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Complex',
            description: 'Complex workflow',
            nodes,
            connections,
          },
          goal: 'test',
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Validate complex',
      });

      expect(result.success).toBe(true);
      const validation = result.result?.validationResult;
      expect(validation.stats.complexity).toBe('complex');
    });
  });

  describe('Shared Memory Integration', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Test',
            description: 'Test',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );
    });

    it('should store validation result in shared memory', async () => {
      const sharedMemory = await getSharedMemory();

      await agent.execute({
        goal: 'Store validation',
      });

      const validationData = await sharedMemory.get('workflow-validation-result');
      expect(validationData).toBeDefined();
      expect(validationData.validationResult).toBeDefined();
    });
  });

  describe('Execution Metrics', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Test',
            description: 'Test',
            nodes: [
              {
                name: 'Start',
                type: 'n8n-nodes-base.manualTrigger',
                position: [100, 100],
              },
              {
                name: 'Action',
                type: 'n8n-nodes-base.httpRequest',
                position: [300, 100],
              },
            ],
            connections: {
              Start: {
                main: [[{ node: 'Action', type: 'main', index: 0 }]],
              },
            },
          },
          goal: 'test',
        },
        'test',
        600000
      );
    });

    it('should measure execution time', async () => {
      const result = await agent.execute({
        goal: 'Validate',
      });

      if (result.success) {
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.executionTime).toBeLessThan(5000); // Should be quick
      }
    });
  });
});
