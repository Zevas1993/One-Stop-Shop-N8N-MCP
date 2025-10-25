import fs from 'fs';
import path from 'path';

export class GraphWatcher {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 5000;

  constructor(private graphDir: string) {}

  start(onChange: () => void): void {
    if (this.watcher) return;
    const dir = path.resolve(this.graphDir);
    try {
      this.watcher = fs.watch(dir, { recursive: true }, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          onChange();
        }, this.debounceMs);
      });
    } catch (e) {
      if (process.env.DEBUG_MCP === 'true') {
        console.error('[graph-watcher] failed to start:', e);
      }
    }
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.watcher) this.watcher.close();
    this.debounceTimer = null;
    this.watcher = null;
  }
}

