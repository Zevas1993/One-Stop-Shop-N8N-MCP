export type Cleaner = () => void;

export interface MemoryGuardOptions {
  thresholdMb?: number; // heapUsed threshold to trigger cleaning
  intervalMs?: number;  // check interval
}

export class MemoryGuard {
  private cleaners: Cleaner[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly thresholdMb: number;
  private readonly intervalMs: number;

  constructor(opts: MemoryGuardOptions = {}) {
    const envThreshold = parseInt(process.env.MEM_GUARD_THRESHOLD_MB || '');
    this.thresholdMb = Number.isFinite(envThreshold) && envThreshold > 0
      ? envThreshold
      : (opts.thresholdMb ?? 512); // default 512MB
    this.intervalMs = opts.intervalMs ?? 10000; // 10s
  }

  addCleaner(fn: Cleaner): void {
    this.cleaners.push(fn);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const used = process.memoryUsage().heapUsed / (1024 * 1024); // MB
    if (used >= this.thresholdMb) {
      // Execute cleaners best‑effort
      for (const clean of this.cleaners) {
        try { clean(); } catch { /* ignore */ }
      }
      if (process.env.DEBUG_MCP === 'true') {
        console.error(`[memory-guard] cleaned at heapUsed=${used.toFixed(1)}MB (threshold=${this.thresholdMb}MB)`);
      }
      // Hint GC if available (requires --expose-gc)
      const g: any = globalThis as any;
      if (typeof g.gc === 'function') {
        try { g.gc(); } catch { /* ignore */ }
      }
    }
  }
}

