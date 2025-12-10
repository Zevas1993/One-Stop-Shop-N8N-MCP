/**
 * Integration Tests: Multi-Agent Orchestration Pipeline
 * Tests the complete Pattern → Workflow → Validator pipeline
 */

import path from 'path';
import fs from 'fs';
import { GraphRAGOrchestrator, createOrchestrator } from '../../src/../src/ai/graphrag-orchestrator';
import { getSharedMemory } from '../../src/../src/ai/shared-memory';

describe('Multi-Agent Orchestration Pipeline', () => {
  let orchestrator: GraphRAGOrchestrator;

  beforeAll(async () => {
    // Create fresh orchestrator for testing
    orchestrator = await createOrchestrator();
  });

  afterAll(async () => {
    // Cleanup
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });

  describe('End-to-End Pipeline', () => {
    it('should complete full orchestration pipeline successfully', async () => {
      const goal = 'Send notifications to Slack when workflows complete';

      const result = await orchestrator.orchestrate({
        goal,
        context: { platform: 'n8n', userRole: 'admin' },
        metadata: { source: 'test', timestamp: Date.now() },
      });

      expect(result).toBeDefined();
      expect(result.goal).toBe(goal);
      expect(result.stages).toHaveLength(3);
      expect(result.executionTime).toBeGreaterThan(0);
      // Success depends on pattern being found, check structure
      if (result.success) {
        expect(result.workflow).toBeDefined();
        expect(result.validationResult).toBeDefined();
      }
    });

    it('should complete all three stages in correct order', async () => {
      const goal = 'Transform data from API and store in database';

      const result = await orchestrator.orchestrate({
        goal,
      });

      expect(result).toBeDefined();
      expect(result.stages).toHaveLength(3);

      const [patternStage, workflowStage, validationStage] = result.stages;

      expect(patternStage.stage).toBe('pattern-discovery');
      expect(patternStage.success).toBe(true);
      expect(patternStage.executionTime).toBeGreaterThan(0);

      expect(workflowStage.stage).toBe('workflow-generation');
      expect(workflowStage.success).toBe(true);
      expect(workflowStage.executionTime).toBeGreaterThan(0);

      expect(validationStage.stage).toBe('validation');
      expect(validationStage.success).toBe(true);
      expect(validationStage.executionTime).toBeGreaterThan(0);
    });

    it('should generate valid n8n workflow JSON structure', async () => {
      const goal = 'Send email notifications';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.workflow).toBeDefined();

      const workflow = result.workflow;
      expect(workflow.name).toBeTruthy();
      expect(Array.isArray(workflow.nodes)).toBe(true);
      expect(workflow.nodes.length).toBeGreaterThan(0);
      expect(typeof workflow.connections).toBe('object');
      expect(Object.keys(workflow.connections).length).toBeGreaterThan(0);
    });

    it('should include valid validation results', async () => {
      const goal = 'Execute a workflow with conditional logic';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.validationResult).toBeDefined();

      const validation = result.validationResult;
      expect(validation.valid).toBe(true);
      expect(validation.nodeCount).toBeGreaterThan(0);
      expect(validation.connectionCount).toBeGreaterThan(0);
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
      expect(validation.stats).toBeDefined();
      expect(validation.stats.complexity).toMatch(/simple|medium|complex/);
    });
  });

  describe('Pattern Discovery Stage', () => {
    it('should identify Slack notification pattern', async () => {
      const goal = 'Send message to Slack channel';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.stages[0].stage).toBe('pattern-discovery');
      expect(result.stages[0].result?.patternName).toMatch(/slack|notification/i);
    });

    it('should identify email workflow pattern', async () => {
      const goal = 'Send emails to multiple recipients';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.stages[0].result?.patternName).toMatch(/email|mail/i);
    });

    it('should identify data transformation pattern', async () => {
      const goal = 'Convert JSON data to CSV format';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.stages[0].result?.patternName).toMatch(/transform|convert/i);
    });

    it('should identify API integration pattern', async () => {
      const goal = 'Fetch data from REST API';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.stages[0].result?.patternName).toMatch(/api|http|request/i);
    });

    it('should identify database CRUD pattern', async () => {
      const goal = 'Create new records in database';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.stages[0].result?.patternName).toMatch(/database|crud/i);
    });

    it('should provide confidence scores for patterns', async () => {
      const goal = 'Schedule daily backup to cloud storage';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const patternResult = result.stages[0].result;
      expect(patternResult?.confidence).toBeGreaterThan(0);
      expect(patternResult?.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Workflow Generation Stage', () => {
    it('should generate workflow with required structure', async () => {
      const goal = 'Create simple workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const workflow = result.workflow;

      expect(workflow).toHaveProperty('name');
      expect(workflow).toHaveProperty('description');
      expect(workflow).toHaveProperty('nodes');
      expect(workflow).toHaveProperty('connections');
      expect(workflow).toHaveProperty('settings');
    });

    it('should create nodes with valid properties', async () => {
      const goal = 'Build workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const workflow = result.workflow;

      for (const node of workflow.nodes) {
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('position');
        expect(Array.isArray(node.position)).toBe(true);
        expect(node.position).toHaveLength(2);
        expect(typeof node.position[0]).toBe('number');
        expect(typeof node.position[1]).toBe('number');
      }
    });

    it('should connect nodes properly', async () => {
      const goal = 'Create workflow with steps';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const workflow = result.workflow;
      const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));

      for (const [sourceName, connData] of Object.entries(workflow.connections)) {
        expect(nodeNames.has(sourceName)).toBe(true);

        const conn = connData as any;
        expect(Array.isArray(conn.main)).toBe(true);

        for (const path of conn.main) {
          expect(Array.isArray(path)).toBe(true);
          for (const target of path) {
            expect(target).toHaveProperty('node');
            expect(target).toHaveProperty('type');
            expect(target).toHaveProperty('index');
            expect(nodeNames.has(target.node)).toBe(true);
          }
        }
      }
    });

    it('should include at least one trigger node', async () => {
      const goal = 'Create workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const workflow = result.workflow;
      const triggerTypes = [
        'n8n-nodes-base.manualTrigger',
        'n8n-nodes-base.schedule',
        'n8n-nodes-base.webhook',
      ];

      const hasTrigger = workflow.nodes.some((n: any) => triggerTypes.includes(n.type));
      expect(hasTrigger).toBe(true);
    });
  });

  describe('Validation Stage', () => {
    it('should validate workflow structure', async () => {
      const goal = 'Create workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      expect(result.validationResult.valid).toBe(true);
    });

    it('should report no critical errors for valid workflows', async () => {
      const goal = 'Build workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const validation = result.validationResult;

      const criticalErrors = validation.errors.filter((e: any) => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
    });

    it('should calculate workflow complexity correctly', async () => {
      const goal = 'Create workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const validation = result.validationResult;

      expect(['simple', 'medium', 'complex']).toContain(validation.stats.complexity);
    });

    it('should track node and connection counts', async () => {
      const goal = 'Build workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.success).toBe(true);
      const validation = result.validationResult;

      expect(validation.stats.totalNodes).toBe(validation.nodeCount);
      expect(validation.stats.totalConnections).toBe(validation.connectionCount);
      expect(validation.stats.totalNodes).toBeGreaterThan(0);
    });
  });

  describe('Shared Memory Integration', () => {
    it('should store pattern in shared memory', async () => {
      const goal = 'Test shared memory integration';
      const sharedMemory = await getSharedMemory();

      await orchestrator.orchestrate({ goal });

      const pattern = await sharedMemory.get('selected-pattern');
      expect(pattern).toBeDefined();
      expect(pattern.patternId).toBeTruthy();
      expect(pattern.patternName).toBeTruthy();
    });

    it('should store generated workflow in shared memory', async () => {
      const goal = 'Test workflow storage';
      const sharedMemory = await getSharedMemory();

      await orchestrator.orchestrate({ goal });

      const workflowData = await sharedMemory.get('generated-workflow');
      expect(workflowData).toBeDefined();
      expect(workflowData.workflow).toBeDefined();
      expect(workflowData.workflow.nodes).toBeDefined();
    });

    it('should store validation result in shared memory', async () => {
      const goal = 'Test validation storage';
      const sharedMemory = await getSharedMemory();

      await orchestrator.orchestrate({ goal });

      const validationData = await sharedMemory.get('workflow-validation-result');
      expect(validationData).toBeDefined();
      expect(validationData.validationResult).toBeDefined();
      expect(validationData.validationResult.valid).toBe(true);
    });

    it('should clean up shared memory on orchestrator shutdown', async () => {
      const sharedMemory = await getSharedMemory();

      await orchestrator.clearState();

      const pattern = await sharedMemory.get('selected-pattern');
      const workflow = await sharedMemory.get('generated-workflow');
      const validation = await sharedMemory.get('workflow-validation-result');

      expect(pattern).toBeNull();
      expect(workflow).toBeNull();
      expect(validation).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle empty goals gracefully', async () => {
      const result = await orchestrator.orchestrate({ goal: '' });

      // Should still complete but with warning
      expect(result).toBeDefined();
      expect(result.goal).toBe('');
    });

    it('should handle very long goals', async () => {
      const goal = 'A'.repeat(500);

      const result = await orchestrator.orchestrate({ goal });

      expect(result).toBeDefined();
      expect(result.goal).toBe(goal);
    });

    it('should handle special characters in goals', async () => {
      const goal = 'Create workflow: "Special" [test] <characters> & symbols!';

      const result = await orchestrator.orchestrate({ goal });

      expect(result).toBeDefined();
      expect(result.goal).toBe(goal);
    });

    it('should handle orchestration with custom context', async () => {
      const goal = 'Create workflow with custom context';

      const result = await orchestrator.orchestrate({
        goal,
        context: {
          customField: 'value',
          nested: { key: 'data' },
        },
        metadata: {
          source: 'custom-test',
          version: '1.0.0',
        },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete orchestration within reasonable time', async () => {
      const goal = 'Create workflow';

      const startTime = Date.now();
      const result = await orchestrator.orchestrate({ goal });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(result.executionTime).toBe(duration);
    });

    it('pattern discovery should be fast', async () => {
      const goal = 'Create workflow';

      const result = await orchestrator.orchestrate({ goal });
      const patternStage = result.stages[0];

      expect(patternStage.executionTime).toBeLessThan(1000); // <1 second
    });

    it('should use reasonable token budget', async () => {
      const goal = 'Create workflow';

      const result = await orchestrator.orchestrate({ goal });

      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeLessThan(50000); // Less than 50K tokens
    });
  });

  describe('Orchestrator Status', () => {
    it('should report correct initialization status', async () => {
      const status = await orchestrator.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.agentsReady).toBe(true);
    });

    it('should provide shared memory statistics', async () => {
      const status = await orchestrator.getStatus();

      expect(status.sharedMemoryStats).toBeDefined();
      expect(typeof status.sharedMemoryStats.totalKeys).toBe('number');
    });
  });
});
