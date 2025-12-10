/**
 * Performance Profiling & Optimization Tests
 * Measures and validates performance characteristics of the multi-agent system
 */

import { createOrchestrator } from '../../src/../src/ai/graphrag-orchestrator';
import { PatternAgent } from '../../src/../src/ai/agents/pattern-agent';
import { WorkflowAgent } from '../../src/../src/ai/agents/workflow-agent';
import { ValidatorAgent } from '../../src/../src/ai/agents/validator-agent';
import { getSharedMemory } from '../../src/../src/ai/shared-memory';

describe('Performance Profiling', () => {
  const PERF_TARGETS = {
    patternDiscovery: 500, // ms
    workflowGeneration: 1000, // ms
    validation: 500, // ms
    endToEnd: 2000, // ms
  };

  describe('Pattern Agent Performance', () => {
    it('should complete pattern discovery within target time', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const startTime = performance.now();
      const result = await agent.execute({
        goal: 'Send Slack notification when workflow completes',
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERF_TARGETS.patternDiscovery);

      console.log(`✅ Pattern discovery: ${duration.toFixed(2)}ms (target: ${PERF_TARGETS.patternDiscovery}ms)`);
    });

    it('should maintain consistent performance across multiple calls', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new PatternAgent(sharedMemory);
      await agent.initialize();

      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await agent.execute({
          goal: `Test goal ${i}: Send Slack notification`,
        });
        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      expect(maxTime).toBeLessThan(PERF_TARGETS.patternDiscovery);

      console.log(`✅ Pattern discovery consistency:`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms`);
      console.log(`   Min: ${minTime.toFixed(2)}ms`);
      console.log(`   Max: ${maxTime.toFixed(2)}ms`);
    });
  });

  describe('Workflow Agent Performance', () => {
    it('should complete workflow generation within target time', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      // Setup pattern
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'slack-notification',
          patternName: 'Slack Notification',
          description: 'Send to Slack',
          confidence: 0.95,
          matchedKeywords: ['slack'],
          suggestedNodes: ['slack'],
        },
        'perf-test',
        600000
      );

      const startTime = performance.now();
      const result = await agent.execute({
        goal: 'Generate workflow',
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERF_TARGETS.workflowGeneration);

      console.log(`✅ Workflow generation: ${duration.toFixed(2)}ms (target: ${PERF_TARGETS.workflowGeneration}ms)`);
    });

    it('should handle workflow generation with varying complexity', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new WorkflowAgent(sharedMemory);
      await agent.initialize();

      const patterns = [
        { id: 'slack-notification', name: 'Slack' },
        { id: 'email-workflow', name: 'Email' },
        { id: 'database-crud', name: 'Database' },
      ];

      const times: number[] = [];

      for (const pattern of patterns) {
        await sharedMemory.set('selected-pattern', { patternId: pattern.id, ...pattern }, 'perf-test', 600000);

        const startTime = performance.now();
        await agent.execute({ goal: `Generate ${pattern.name} workflow` });
        const duration = performance.now() - startTime;

        times.push(duration);
        expect(duration).toBeLessThan(PERF_TARGETS.workflowGeneration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`✅ Workflow generation average across ${patterns.length} patterns: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Validator Agent Performance', () => {
    it('should complete validation within target time', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      // Setup workflow
      await sharedMemory.set(
        'generated-workflow',
        {
          workflow: {
            name: 'Test Workflow',
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
        },
        'perf-test',
        600000
      );

      const startTime = performance.now();
      const result = await agent.execute({
        goal: 'Validate workflow',
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERF_TARGETS.validation);

      console.log(`✅ Validation: ${duration.toFixed(2)}ms (target: ${PERF_TARGETS.validation}ms)`);
    });

    it('should validate workflows of varying complexity', async () => {
      const sharedMemory = await getSharedMemory();
      const agent = new ValidatorAgent(sharedMemory);
      await agent.initialize();

      // Simple workflow
      const simpleWorkflow = {
        name: 'Simple',
        nodes: [
          { name: 'Trigger', type: 'n8n-nodes-base.manualTrigger', position: [0, 0] },
          { name: 'Slack', type: 'n8n-nodes-base.slack', position: [200, 0] },
        ],
        connections: {
          Trigger: { main: [[{ node: 'Slack', type: 'main', index: 0 }]] },
        },
      };

      // Complex workflow
      const complexWorkflow = {
        name: 'Complex',
        nodes: [
          { name: 'Trigger', type: 'n8n-nodes-base.manualTrigger', position: [0, 0] },
          { name: 'HTTP', type: 'n8n-nodes-base.httpRequest', position: [200, 0] },
          { name: 'Set', type: 'n8n-nodes-base.set', position: [400, 0] },
          { name: 'Slack', type: 'n8n-nodes-base.slack', position: [600, 0] },
          { name: 'Database', type: 'n8n-nodes-base.postgres', position: [800, 0] },
        ],
        connections: {
          Trigger: { main: [[{ node: 'HTTP', type: 'main', index: 0 }]] },
          HTTP: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
          Set: { main: [[{ node: 'Slack', type: 'main', index: 0 }]] },
          Slack: { main: [[{ node: 'Database', type: 'main', index: 0 }]] },
        },
      };

      const workflows = [
        { name: 'Simple', workflow: simpleWorkflow },
        { name: 'Complex', workflow: complexWorkflow },
      ];

      const times: number[] = [];

      for (const { name, workflow } of workflows) {
        await sharedMemory.set('generated-workflow', { workflow }, 'perf-test', 600000);

        const startTime = performance.now();
        await agent.execute({ goal: `Validate ${name}` });
        const duration = performance.now() - startTime;

        times.push(duration);
        expect(duration).toBeLessThan(PERF_TARGETS.validation);
      }

      console.log(`✅ Validation complexity test:`);
      console.log(`   Simple (2 nodes): ${times[0].toFixed(2)}ms`);
      console.log(`   Complex (5 nodes): ${times[1].toFixed(2)}ms`);
    });
  });

  describe('End-to-End Orchestration Performance', () => {
    it('should complete full pipeline within target time', async () => {
      const orchestrator = await createOrchestrator();

      const startTime = performance.now();
      const result = await orchestrator.orchestrate({
        goal: 'Send Slack notification',
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(PERF_TARGETS.endToEnd);

      console.log(`✅ End-to-end orchestration: ${duration.toFixed(2)}ms (target: ${PERF_TARGETS.endToEnd}ms)`);
      console.log(`   Execution time: ${result.executionTime}ms`);
      console.log(`   Tokens used: ${result.tokensUsed}`);

      await orchestrator.shutdown();
    });

    it('should maintain consistent pipeline performance', async () => {
      const orchestrator = await createOrchestrator();

      const times: number[] = [];

      for (let i = 0; i < 3; i++) {
        const startTime = performance.now();
        await orchestrator.orchestrate({
          goal: `Test orchestration ${i}`,
        });
        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(maxTime).toBeLessThan(PERF_TARGETS.endToEnd);

      console.log(`✅ Pipeline consistency:`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms`);
      console.log(`   Max: ${maxTime.toFixed(2)}ms`);

      await orchestrator.shutdown();
    });

    it('should break down stage performance correctly', async () => {
      const orchestrator = await createOrchestrator();

      const result = await orchestrator.orchestrate({
        goal: 'Test stage breakdown',
      });

      expect(result.stages.length).toBeGreaterThan(0);

      let totalStageTime = 0;
      result.stages.forEach((stage: any) => {
        // Stage execution time may be 0 in fast Jest environment, but should not be negative
        expect(stage.executionTime).toBeGreaterThanOrEqual(0);
        // Allow some slack for fast operations
        expect(stage.executionTime).toBeLessThan(PERF_TARGETS[stage.stage as keyof typeof PERF_TARGETS] || PERF_TARGETS.endToEnd);
        totalStageTime += stage.executionTime;
      });

      console.log(`✅ Stage performance breakdown:`);
      result.stages.forEach((stage: any) => {
        console.log(`   ${stage.stage}: ${stage.executionTime}ms`);
      });
      console.log(`   Total stages time: ${totalStageTime}ms`);
      console.log(`   Overall execution: ${result.executionTime}ms`);

      await orchestrator.shutdown();
    });
  });

  describe('Performance Regression Detection', () => {
    it('should not degrade with repeated usage', async () => {
      const orchestrator = await createOrchestrator();

      const times: number[] = [];

      // Warm-up
      await orchestrator.orchestrate({ goal: 'Warmup' });

      // Actual measurements
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await orchestrator.orchestrate({
          goal: `Regression test ${i}`,
        });
        const duration = performance.now() - startTime;
        times.push(duration);
      }

      // Check for progressive slowdown
      const firstHalf = times.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const secondHalf = times.slice(3, 5).reduce((a, b) => a + b, 0) / 2;

      // Second half should not be significantly slower (allow 50% variance)
      expect(secondHalf).toBeLessThan(firstHalf * 1.5);

      console.log(`✅ No regression detected:`);
      console.log(`   First 2 runs average: ${firstHalf.toFixed(2)}ms`);
      console.log(`   Last 2 runs average: ${secondHalf.toFixed(2)}ms`);

      await orchestrator.shutdown();
    });
  });

  describe('Token Usage Efficiency', () => {
    it('should use tokens efficiently', async () => {
      const orchestrator = await createOrchestrator();

      const results = [];

      for (let i = 0; i < 3; i++) {
        const result = await orchestrator.orchestrate({
          goal: `Token efficiency test ${i}`,
        });
        results.push(result.tokensUsed);
      }

      const avgTokens = results.reduce((a, b) => a + b, 0) / results.length;

      // Tokens should be reasonable (within context budgets)
      results.forEach((tokens) => {
        expect(tokens).toBeLessThan(40000); // Reasonable upper bound
      });

      console.log(`✅ Token usage efficiency:`);
      console.log(`   Average tokens per orchestration: ${avgTokens.toFixed(0)}`);
      console.log(`   Total for 3 runs: ${results.reduce((a, b) => a + b, 0)}`);

      await orchestrator.shutdown();
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with repeated operations', async () => {
      const memOrchestrator = await createOrchestrator();

      // Get initial memory
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      // Run multiple operations
      for (let i = 0; i < 10; i++) {
        await memOrchestrator.orchestrate({
          goal: `Memory test ${i}`,
        });
      }

      // Get final memory
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      // Allow some growth but not excessive
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase

      console.log(`✅ Memory usage:`);
      console.log(`   Initial: ${initialMemory.toFixed(2)}MB`);
      console.log(`   Final: ${finalMemory.toFixed(2)}MB`);
      console.log(`   Increase: ${memoryIncrease.toFixed(2)}MB`);

      await memOrchestrator.shutdown();
    });
  });
});
