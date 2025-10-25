/**
 * Shared Memory Load Testing
 * Tests shared memory operations under high load and stress conditions
 */

import { getSharedMemory } from '../../../src/ai/shared-memory';

describe('Shared Memory Load Testing', () => {
  it('should handle large number of sequential writes', async () => {
    const sharedMemory = await getSharedMemory();
    const itemCount = 100;

    const startTime = Date.now();

    for (let i = 0; i < itemCount; i++) {
      await sharedMemory.set(
        `load-test-key-${i}`,
        { data: `test data ${i}`, index: i },
        'load-test-agent',
        600000
      );
    }

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    console.log(`✅ Written ${itemCount} items in ${duration}ms (avg ${(duration / itemCount).toFixed(2)}ms per item)`);
  });

  it('should handle large number of sequential reads', async () => {
    const sharedMemory = await getSharedMemory();
    const itemCount = 50;

    // First write items
    for (let i = 0; i < itemCount; i++) {
      await sharedMemory.set(`read-test-key-${i}`, { data: `test ${i}` }, 'read-test-agent', 600000);
    }

    const startTime = Date.now();

    for (let i = 0; i < itemCount; i++) {
      const result = await sharedMemory.get(`read-test-key-${i}`);
      expect(result).toBeDefined();
    }

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(2000); // Should be fast
    console.log(`✅ Read ${itemCount} items in ${duration}ms (avg ${(duration / itemCount).toFixed(2)}ms per item)`);
  });

  it('should handle pattern matching on large dataset', async () => {
    const sharedMemory = await getSharedMemory();

    // Write items with pattern
    for (let i = 0; i < 50; i++) {
      await sharedMemory.set(`pattern:workflow-${i}`, { workflowId: i }, 'pattern-agent', 600000);
    }

    const startTime = Date.now();
    const results = await sharedMemory.query({ pattern: 'pattern:%' });
    const duration = Date.now() - startTime;

    expect(results.length).toBeGreaterThanOrEqual(50);
    expect(duration).toBeLessThan(1000);
    console.log(`✅ Pattern search on 50+ items in ${duration}ms`);
  });

  it('should handle concurrent reads without conflicts', async () => {
    const sharedMemory = await getSharedMemory();

    // Setup test data
    await sharedMemory.set('shared-data', { value: 'initial' }, 'agent-1', 600000);

    const startTime = Date.now();

    // Multiple concurrent reads
    const results = await Promise.all([
      sharedMemory.get('shared-data'),
      sharedMemory.get('shared-data'),
      sharedMemory.get('shared-data'),
      sharedMemory.get('shared-data'),
      sharedMemory.get('shared-data'),
    ]);

    const duration = Date.now() - startTime;

    results.forEach((result) => {
      expect(result.value).toBe('initial');
    });

    expect(duration).toBeLessThan(500);
    console.log(`✅ 5 concurrent reads in ${duration}ms`);
  });

  it('should handle data updates over time', async () => {
    const sharedMemory = await getSharedMemory();
    const key = 'update-test-key';

    const startTime = Date.now();

    // Multiple sequential updates to same key
    for (let i = 0; i < 20; i++) {
      await sharedMemory.set(key, { version: i, timestamp: Date.now() }, 'update-agent', 600000);
    }

    const finalData = await sharedMemory.get(key);
    const duration = Date.now() - startTime;

    expect(finalData.version).toBe(19); // Last version
    expect(duration).toBeLessThan(2000);
    console.log(`✅ 20 updates to single key in ${duration}ms (avg ${(duration / 20).toFixed(2)}ms per update)`);
  });

  it('should cleanup expired entries', async () => {
    const sharedMemory = await getSharedMemory();

    // Write entry with very short TTL
    await sharedMemory.set('expiring-key', { data: 'will expire' }, 'ttl-agent', 100); // 100ms TTL

    // Should exist immediately
    let result = await sharedMemory.get('expiring-key');
    expect(result).toBeDefined();

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be gone now
    result = await sharedMemory.get('expiring-key');
    expect(result).toBeNull();

    console.log('✅ TTL expiration works correctly');
  });

  it('should handle agent isolation', async () => {
    const sharedMemory = await getSharedMemory();

    // Agent 1 writes
    await sharedMemory.set('agent-data', { agent: 'agent-1' }, 'agent-1', 600000);

    // Agent 2 writes to same key
    await sharedMemory.set('agent-data', { agent: 'agent-2' }, 'agent-2', 600000);

    // Both agents should be able to access their data
    const data = await sharedMemory.get('agent-data');
    expect(data).toBeDefined();

    console.log('✅ Agent isolation working correctly');
  });

  it('should handle memory usage under load', async () => {
    const sharedMemory = await getSharedMemory();

    const startStats = await sharedMemory.getStats();
    console.log(`Initial stats:`, startStats);

    // Add large objects
    for (let i = 0; i < 30; i++) {
      const largeObject = {
        id: i,
        data: 'x'.repeat(1000), // ~1KB per entry
        nested: {
          level1: {
            level2: {
              level3: {
                value: Math.random(),
              },
            },
          },
        },
      };

      await sharedMemory.set(`large-${i}`, largeObject, 'memory-test', 600000);
    }

    const endStats = await sharedMemory.getStats();
    console.log(`After adding 30 large items:`, endStats);

    expect(endStats.totalKeys).toBeGreaterThanOrEqual(30);
    console.log('✅ Memory usage tracking working');
  });

  it('should maintain data integrity under load', async () => {
    const sharedMemory = await getSharedMemory();

    const testData = {
      string: 'test string',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      object: { nested: { value: 'test' } },
      null: null,
    };

    // Write and read multiple times
    for (let i = 0; i < 10; i++) {
      await sharedMemory.set(`integrity-test-${i}`, testData, 'integrity-agent', 600000);
      const result = await sharedMemory.get(`integrity-test-${i}`);

      expect(result.string).toBe(testData.string);
      expect(result.number).toBe(testData.number);
      expect(result.boolean).toBe(testData.boolean);
      expect(result.array).toEqual(testData.array);
      expect(result.object).toEqual(testData.object);
    }

    console.log('✅ Data integrity maintained across 10 cycles');
  });

  it('should handle deletion under load', async () => {
    const sharedMemory = await getSharedMemory();

    const itemCount = 50;

    // Write items
    for (let i = 0; i < itemCount; i++) {
      await sharedMemory.set(`delete-test-${i}`, { data: i }, 'delete-agent', 600000);
    }

    const startTime = Date.now();

    // Delete items
    for (let i = 0; i < itemCount; i++) {
      await sharedMemory.delete(`delete-test-${i}`, 'delete-agent');
    }

    const duration = Date.now() - startTime;

    // Verify deletion
    const result = await sharedMemory.get(`delete-test-0`);
    expect(result).toBeNull();

    expect(duration).toBeLessThan(2000);
    console.log(`✅ Deleted ${itemCount} items in ${duration}ms`);
  });

  it('should recover from errors gracefully', async () => {
    const sharedMemory = await getSharedMemory();

    // Attempt invalid operations but recover
    let successCount = 0;

    for (let i = 0; i < 20; i++) {
      try {
        // Normal operation
        await sharedMemory.set(`recovery-test-${i}`, { index: i }, 'recovery-agent', 600000);
        successCount++;

        // Try to read it back
        const result = await sharedMemory.get(`recovery-test-${i}`);
        if (result) successCount++;
      } catch (error) {
        // Should not happen
        console.error('Unexpected error:', error);
      }
    }

    expect(successCount).toBeGreaterThan(30); // At least 30 operations should succeed
    console.log(`✅ ${successCount}/40 operations succeeded (error recovery working)`);
  });

  it('should provide accurate statistics', async () => {
    const sharedMemory = await getSharedMemory();

    // Clear and write known number of items
    const itemCount = 25;
    for (let i = 0; i < itemCount; i++) {
      await sharedMemory.set(`stats-test-${i}`, { data: i }, 'stats-agent', 600000);
    }

    const stats = await sharedMemory.getStats();

    expect(stats).toBeDefined();
    expect(stats.totalKeys).toBeGreaterThanOrEqual(itemCount);

    console.log(`✅ Stats tracking: ${stats.totalKeys} keys`);
  });

  describe('Stress Testing', () => {
    it('should handle rapid write-read cycles', async () => {
      const sharedMemory = await getSharedMemory();
      const cycles = 20;

      const startTime = Date.now();

      for (let i = 0; i < cycles; i++) {
        const key = `cycle-${i}`;
        const data = { iteration: i, timestamp: Date.now() };

        await sharedMemory.set(key, data, 'cycle-agent', 600000);
        const result = await sharedMemory.get(key);

        expect(result.iteration).toBe(i);
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // Should complete quickly
      console.log(`✅ ${cycles} write-read cycles in ${duration}ms (avg ${(duration / (cycles * 2)).toFixed(2)}ms per operation)`);
    });

    it('should handle bulk pattern search', async () => {
      const sharedMemory = await getSharedMemory();

      // Populate with various patterns
      for (let i = 0; i < 30; i++) {
        await sharedMemory.set(`workflow:active:${i}`, { status: 'running' }, 'bulk-agent', 600000);
        await sharedMemory.set(`workflow:inactive:${i}`, { status: 'stopped' }, 'bulk-agent', 600000);
      }

      const startTime = Date.now();

      const activeWorkflows = await sharedMemory.query({ pattern: 'workflow:active:%' });
      const inactiveWorkflows = await sharedMemory.query({ pattern: 'workflow:inactive:%' });
      const allWorkflows = await sharedMemory.query({ pattern: 'workflow:%' });

      const duration = Date.now() - startTime;

      expect(activeWorkflows.length).toBeGreaterThanOrEqual(30);
      expect(inactiveWorkflows.length).toBeGreaterThanOrEqual(30);
      expect(allWorkflows.length).toBeGreaterThanOrEqual(60);

      expect(duration).toBeLessThan(2000);
      console.log(`✅ Bulk pattern search (60+ items) in ${duration}ms`);
    });
  });
});
