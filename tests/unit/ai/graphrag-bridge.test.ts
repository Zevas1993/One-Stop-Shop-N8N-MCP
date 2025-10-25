import { GraphRAGBridge } from '../../../src/ai/graphrag-bridge';

describe('GraphRAGBridge (MVP smoke)', () => {
  it('should return a subgraph for a simple query (or skip if backend unavailable)', async () => {
    const bridge = GraphRAGBridge.get();
    try {
      const res = await bridge.queryGraph({ text: 'airtable slack notification', top_k: 3 });
      expect(res).toHaveProperty('nodes');
      expect(Array.isArray(res.nodes)).toBe(true);
      expect(res).toHaveProperty('edges');
      expect(res).toHaveProperty('summary');
    } catch (e: any) {
      // If Python or backend path is missing, skip without failing the suite
      if (process.env.CI) {
        // In CI, surface the error to catch regressions
        throw e;
      } else {
        console.warn('Skipping test (backend unavailable):', e?.message || e);
      }
    }
  }, 10000);
});

