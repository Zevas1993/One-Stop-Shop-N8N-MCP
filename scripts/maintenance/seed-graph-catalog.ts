#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createDatabaseAdapter } from '../../src/database/database-adapter';
import { NodeRepository } from '../../src/database/node-repository';

function getGraphDir(): string {
  const env = process.env.GRAPH_DIR;
  if (env && env.trim()) return env;

  // Platform-specific defaults: Windows → %APPDATA%\n8n-mcp\graph; else ~/.cache/n8n-mcp/graph
  // This must match python/backend/graph/lightrag_service.py exactly!
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'n8n-mcp', 'graph');
  }
  return path.join(os.homedir(), '.cache', 'n8n-mcp', 'graph');
}

function getDbPath(): string {
  const env = process.env.NODE_DB_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.join(process.cwd(), 'data', 'nodes.db'),
    path.join(__dirname, '../../data', 'nodes.db'),
    './data/nodes.db',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('nodes.db not found. Set NODE_DB_PATH or run npm run rebuild');
}

function keywordsFrom(id: string, label: string): string[] {
  const set = new Set<string>();
  for (const token of (id || '').toLowerCase().replace(/\./g, ' ').split(/\s+/)) if (token) set.add(token);
  for (const token of (label || '').toLowerCase().split(/\s+/)) if (token) set.add(token);
  return Array.from(set).sort();
}

async function main() {
  const dbPath = getDbPath();
  const adapter = await createDatabaseAdapter(dbPath);
  const repo = new NodeRepository(adapter);
  const nodes = repo.listNodes({});

  const catalog = nodes.map((n: any) => {
    const id = n.node_type || n.type || n.name;
    const label = n.display_name || n.description || id;
    return { id, label, keywords: keywordsFrom(id, label) };
  });

  // Optional pattern seeds from Appendix A to improve coverage in query_graph tests
  const patternSeeds = [
    { id: 'pattern.supervisor', label: 'Supervisor Pattern (error handling)', keywords: ['supervisor', 'error', 'retry', 'monitor'] },
    { id: 'pattern.webhook_response', label: 'Webhook-Response Pattern (API integrations)', keywords: ['webhook', 'response', 'api', 'http'] },
    { id: 'pattern.fanout_fanin', label: 'Fan-Out/Fan-In Pattern (complex traversal)', keywords: ['fan-out', 'fan-in', 'parallel', 'merge'] },
  ];
  for (const p of patternSeeds) {
    if (!catalog.find((c: any) => c.id === p.id)) catalog.push(p);
  }

  const graphDir = getGraphDir();
  fs.mkdirSync(graphDir, { recursive: true });
  const outPath = path.join(graphDir, 'catalog.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`Wrote ${catalog.length} entries to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
