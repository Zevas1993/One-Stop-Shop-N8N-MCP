import { spawn, ChildProcessWithoutNullStreams } from "child_process";

export interface QueryGraphParams {
  text: string;
  top_k?: number;
  embedding?: number[];
}

export interface QueryGraphResult {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    description?: string;
    score?: number;
    confidence?: number;
    metadata?: any;
  }>;
  edges: Array<{ source: string; target: string; type: string }>;
  summary: string;
}

type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timer?: NodeJS.Timeout;
};

export class GraphRAGBridge {
  private static instance: GraphRAGBridge | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private cache = new Map<string, { ts: number; value: any }>();
  private ttlMs = 60_000; // 60s cache TTL
  private metrics = {
    count: 0,
    durations: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
    lastReport: Date.now(),
  };
  private reportEvery = 20; // emit summary every N queries when enabled
  private maxCacheEntries = Math.max(
    10,
    parseInt(process.env.BRIDGE_CACHE_MAX || "100")
  );

  static get(): GraphRAGBridge {
    if (!this.instance) this.instance = new GraphRAGBridge();
    return this.instance;
  }

  private ensureProcess(): void {
    if (this.proc) return;
    const pythonExe =
      process.env.GRAPH_PYTHON || process.env.PYTHON || "python";
    let serverPath =
      process.env.GRAPH_BACKEND || "python/backend/graph/lightrag_service.py";

    // Resolve to absolute path if relative (handles being called from different directories)
    if (!serverPath.startsWith("/") && !serverPath.match(/^[a-z]:/i)) {
      const { resolve } = require("path");
      serverPath = resolve(serverPath);
    }

    const env = { ...process.env };
    // Pass GRAPH_DIR if provided
    this.proc = spawn(pythonExe, [serverPath], { env });
    this.proc.stdout.setEncoding("utf-8");
    this.proc.stdout.on("data", (chunk: string) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          const id = msg.id;
          const pending = this.pending.get(id);
          if (!pending) continue;
          this.pending.delete(id);
          if (pending.timer) clearTimeout(pending.timer);
          if (msg.error) {
            pending.reject(
              new Error(msg.error.message || "Graph backend error")
            );
          } else {
            pending.resolve(msg.result);
          }
        } catch (e) {
          // ignore parse errors from partial lines
        }
      }
    });
    this.proc.stderr.setEncoding("utf-8");
    this.proc.stderr.on("data", (d: string) => {
      if (process.env.DEBUG_MCP === "true") {
        // forward debug logs
        console.error("[graphrag-bridge]", d.trim());
      }
    });
    this.proc.on("exit", (code) => {
      this.proc = null;
      // reject all pending
      for (const [id, p] of this.pending.entries()) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(new Error(`Graph backend exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  private rpc(method: string, params?: any, timeoutMs = 5_000): Promise<any> {
    this.ensureProcess();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Graph backend timeout for ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload =
        JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n";
      this.proc!.stdin.write(payload, "utf-8");
    });
  }

  async queryGraph(params: QueryGraphParams): Promise<QueryGraphResult> {
    const cacheKey = JSON.stringify({ m: "query_graph", p: params });
    const now = Date.now();
    const hit = this.cache.get(cacheKey);
    const metricsOn =
      process.env.DEBUG_MCP === "true" ||
      process.env.METRICS_GRAPHRAG === "true";

    if (hit && now - hit.ts < this.ttlMs) {
      this.metrics.cacheHits++;
      // FIXED: Record cache hit latency (should be <1ms but still track it)
      if (metricsOn) {
        const dur = Date.now() - now;
        console.error(
          `[graphrag-bridge] query_graph latency=${dur}ms (cache hit) text="${(
            params.text || ""
          ).slice(0, 64)}"`
        );
        this.metrics.count++;
        this.metrics.durations.push(Math.max(0, dur)); // cache hits are ~0ms but still count
        if (this.metrics.durations.length > 200) this.metrics.durations.shift();
        if (this.metrics.count % this.reportEvery === 0) {
          const p50 = percentile(this.metrics.durations, 0.5);
          const p95 = percentile(this.metrics.durations, 0.95);
          const total = this.metrics.cacheHits + this.metrics.cacheMisses;
          const hitRate =
            total > 0 ? Math.round((this.metrics.cacheHits / total) * 100) : 0;
          console.error(
            `[graphrag-bridge] summary p50=${p50}ms p95=${p95}ms samples=${this.metrics.durations.length} cacheHitRate=${hitRate}%`
          );
        }
      }
      return hit.value as QueryGraphResult;
    }

    this.metrics.cacheMisses++;
    const t0 = Date.now();
    const res = await this.rpc(
      "query_graph",
      {
        text: params.text,
        top_k: params.top_k ?? 5,
        embedding: params.embedding,
      },
      3_000
    );
    const dur = Date.now() - t0;

    if (metricsOn) {
      console.error(
        `[graphrag-bridge] query_graph latency=${dur}ms (cache miss) text="${(
          params.text || ""
        ).slice(0, 64)}"`
      );
      this.metrics.count++;
      this.metrics.durations.push(dur);
      if (this.metrics.durations.length > 200) this.metrics.durations.shift();
      if (this.metrics.count % this.reportEvery === 0) {
        const p50 = percentile(this.metrics.durations, 0.5);
        const p95 = percentile(this.metrics.durations, 0.95);
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        const hitRate =
          total > 0 ? Math.round((this.metrics.cacheHits / total) * 100) : 0;
        console.error(
          `[graphrag-bridge] summary p50=${p50}ms p95=${p95}ms samples=${this.metrics.durations.length} cacheHitRate=${hitRate}%`
        );
      }
    }
    this.cache.set(cacheKey, { ts: now, value: res });
    // Enforce simple size bound (evict oldest)
    if (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    return res as QueryGraphResult;
  }

  async applyUpdate(diff: {
    added: any[];
    modified: any[];
    removed: any[];
  }): Promise<{ ok: boolean }> {
    await this.rpc("apply_update", diff, 10_000);
    // Clear cache to reflect latest graph content
    this.cache.clear();
    return { ok: true };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getMetricsSnapshot(): {
    p50: number;
    p95: number;
    samples: number;
    cacheHitRate: number;
    count: number;
  } {
    const p50 = percentile(this.metrics.durations, 0.5);
    const p95 = percentile(this.metrics.durations, 0.95);
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate =
      total > 0 ? Math.round((this.metrics.cacheHits / total) * 100) : 0;
    return {
      p50,
      p95,
      samples: this.metrics.durations.length,
      cacheHitRate: hitRate,
      count: this.metrics.count,
    };
  }
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[idx];
}
