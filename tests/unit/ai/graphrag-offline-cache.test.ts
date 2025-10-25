import fs from 'fs';
import os from 'os';
import path from 'path';
import { GraphRAGBridge } from '../../../src/ai/graphrag-bridge';

describe('GraphRAG offline cache (catalog only)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphrag-cache-'));

  beforeAll(() => {
    // Seed a tiny catalog.json
    const catalog = [
      { id: 'nodes-base.slack', label: 'Slack', keywords: ['slack', 'message', 'channel'] },
      { id: 'nodes-base.airtable', label: 'Airtable', keywords: ['airtable', 'record', 'database'] },
    ];
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'catalog.json'), JSON.stringify(catalog, null, 2), 'utf-8');
    process.env.GRAPH_DIR = tmpDir;
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.GRAPH_DIR;
  });

  it('returns nodes/edges/summary without live n8n', async () => {
    const bridge = GraphRAGBridge.get();
    const res = await bridge.queryGraph({ text: 'airtable to slack', top_k: 3 });
    expect(Array.isArray(res.nodes)).toBe(true);
    expect(res.nodes.length).toBeGreaterThan(0);
    expect(res).toHaveProperty('edges');
    expect(res).toHaveProperty('summary');
  }, 10000);
});

