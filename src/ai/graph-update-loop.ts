import axios from 'axios';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GraphRAGBridge } from './graphrag-bridge';

export interface UpdateLoopOptions {
  intervalMs?: number; // default 6h
  jitterMs?: number;   // default 10m
  n8nUrl?: string;
  apiKey?: string;
}

export class GraphUpdateLoop {
  private timer: NodeJS.Timeout | null = null;
  private opts: Required<UpdateLoopOptions>;

  constructor(opts: UpdateLoopOptions = {}) {
    const intervalMs = opts.intervalMs ?? 6 * 60 * 60 * 1000;
    const jitterMs = opts.jitterMs ?? 10 * 60 * 1000;
    this.opts = {
      intervalMs,
      jitterMs,
      n8nUrl: opts.n8nUrl || process.env.N8N_API_URL || 'http://localhost:5678',
      apiKey: opts.apiKey || process.env.N8N_API_KEY || '',
    } as Required<UpdateLoopOptions>;
  }

  start(): void {
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    const jitter = Math.floor(Math.random() * this.opts.jitterMs);
    this.timer = setTimeout(() => this.tick().finally(() => this.scheduleNext()), this.opts.intervalMs + jitter);
  }

  private async tick(): Promise<void> {
    try {
      // Fetch node types as a simple hashable snapshot
      const url = new URL('/rest/node-types', this.opts.n8nUrl).toString();
      const res = await axios.get(url, { headers: { 'X-N8N-API-KEY': this.opts.apiKey } });
      const nodes = Array.isArray(res.data) ? res.data : [];

      // Compute current hash
      const normalized = stableStringify(nodes.map(n => normalizeNode(n)));
      const currentHash = sha256(normalized);

      const graphDir = getGraphDir();
      const statePath = path.join(graphDir, 'update_state.json');
      let previous: { hash: string; nodes: any[] } = { hash: '', nodes: [] };
      if (fs.existsSync(statePath)) {
        try {
          previous = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        } catch {}
      }

      if (previous.hash === currentHash) {
        if (process.env.DEBUG_MCP === 'true') {
          console.error('[graph-update-loop] no changes detected');
        }
        return;
      }

      const prevById = new Map<string, any>(previous.nodes.map(n => [nodeId(n), n]));
      const currById = new Map<string, any>(nodes.map(n => [nodeId(n), n]));

      const added: any[] = [];
      const modified: any[] = [];
      const removed: any[] = [];

      for (const [id, n] of currById.entries()) {
        if (!prevById.has(id)) {
          added.push(n);
        } else {
          const prev = prevById.get(id);
          if (stableStringify(normalizeNode(prev)) !== stableStringify(normalizeNode(n))) {
            modified.push(n);
          }
        }
      }
      for (const [id, n] of prevById.entries()) {
        if (!currById.has(id)) removed.push(n);
      }

      // Apply incremental update through the bridge
      const bridge = GraphRAGBridge.get();
      await bridge.applyUpdate({ added, modified, removed });

      // Save new state
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({ hash: currentHash, nodes }, null, 2), 'utf-8');

      if (process.env.DEBUG_MCP === 'true') {
        console.error(`[graph-update-loop] applied update: +${added.length} ~${modified.length} -${removed.length}`);
      }
    } catch (e: any) {
      if (process.env.DEBUG_MCP === 'true') {
        console.error('[graph-update-loop] update failed:', e?.message || e);
      }
    }
  }
}

function getGraphDir(): string {
  const env = process.env.GRAPH_DIR;
  if (env && env.trim()) return env;
  return path.join(os.homedir(), '.cache', 'n8n-mcp', 'graph');
}

function nodeId(n: any): string {
  return n?.name || n?.type || n?.id || JSON.stringify(n).slice(0, 64);
}

function normalizeNode(n: any): any {
  // Keep only stable fields relevant for diff (name/type/displayName/version)
  const id = n?.name || n?.type || n?.id;
  const displayName = n?.displayName;
  const version = n?.version || n?.defaultVersion;
  return { id, displayName, version };
}

function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
