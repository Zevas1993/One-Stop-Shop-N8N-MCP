/**
 * Configuration Dashboard Server
 *
 * Web-based UI for managing and monitoring the n8n MCP Server
 */

import express from 'express';
import path from 'path';
import { logger } from '../utils/logger.js';
import { HealthCheckService } from '../services/health-check.js';
import { metrics, metricsMiddleware } from '../services/metrics-service.js';
import { cacheManager } from '../services/cache-service.js';

export interface DashboardOptions {
  port?: number;
  host?: string;
  healthCheckService?: HealthCheckService;
  pluginLoader?: any;
}

export class DashboardServer {
  private app: express.Application;
  private server: any;
  private options: Required<Omit<DashboardOptions, 'healthCheckService' | 'pluginLoader'>> & Pick<DashboardOptions, 'healthCheckService' | 'pluginLoader'>;

  constructor(options: DashboardOptions = {}) {
    this.options = {
      port: options.port || 3001,
      host: options.host || '0.0.0.0',
      healthCheckService: options.healthCheckService,
      pluginLoader: options.pluginLoader,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`Dashboard: ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', async (req, res) => {
      if (!this.options.healthCheckService) {
        return res.json({ status: 'unknown', message: 'Health check service not available' });
      }

      const profile = (req.query.profile as any) || 'readiness';
      const result = await this.options.healthCheckService.check(profile);
      res.json(result);
    });

    // Metrics endpoint
    this.app.get('/api/metrics', metricsMiddleware);

    // Cache statistics
    this.app.get('/api/cache/stats', (req, res) => {
      const stats = cacheManager.getAllStats();
      res.json(stats);
    });

    // Clear cache
    this.app.post('/api/cache/clear', (req, res) => {
      const { cacheName } = req.body;

      if (cacheName) {
        const cleared = cacheManager.clearCache(cacheName);
        res.json({ success: cleared, cache: cacheName });
      } else {
        cacheManager.clearAll();
        res.json({ success: true, cache: 'all' });
      }
    });

    // Plugin management
    this.app.get('/api/plugins', (req, res) => {
      if (!this.options.pluginLoader) {
        return res.json({ plugins: [], message: 'Plugin system not enabled' });
      }

      const plugins = this.options.pluginLoader.getPlugins().map((p: any) => ({
        name: p.plugin.metadata.name,
        version: p.plugin.metadata.version,
        description: p.plugin.metadata.description,
        enabled: p.enabled,
        loadedAt: p.loadedAt,
      }));

      res.json({ plugins });
    });

    // System info
    this.app.get('/api/system', (req, res) => {
      const mem = process.memoryUsage();
      const uptime = process.uptime();

      res.json({
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime,
        memory: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          heapUsagePercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(2),
          external: mem.external,
        },
        env: {
          nodeEnv: process.env.NODE_ENV || 'development',
          mcpMode: process.env.MCP_MODE || 'stdio',
          pluginsEnabled: process.env.PLUGINS_ENABLED === 'true',
        },
      });
    });

    // Configuration
    this.app.get('/api/config', (req, res) => {
      res.json({
        server: {
          mode: process.env.MCP_MODE || 'stdio',
          port: process.env.PORT || 3000,
          logLevel: process.env.LOG_LEVEL || 'info',
        },
        database: {
          path: process.env.NODE_DB_PATH || './data/nodes.db',
        },
        n8n: {
          apiUrl: process.env.N8N_API_URL || null,
          apiConfigured: !!process.env.N8N_API_KEY,
        },
        plugins: {
          enabled: process.env.PLUGINS_ENABLED === 'true',
          dir: process.env.PLUGIN_DIR || './plugins',
          watch: process.env.PLUGIN_WATCH === 'true',
        },
        cache: {
          enabled: true,
        },
      });
    });

    // Serve dashboard HTML
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        logger.info(`🎛️  Dashboard running at http://${this.options.host}:${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Dashboard server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Generate dashboard HTML
   */
  private getDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n MCP Server Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }

    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }

    .subtitle {
      font-size: 1.2em;
      opacity: 0.9;
    }

    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 20px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 40px rgba(0,0,0,0.3);
    }

    .card h2 {
      color: #667eea;
      margin-bottom: 16px;
      font-size: 1.5em;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .status.healthy { background: #10b981; color: white; }
    .status.degraded { background: #f59e0b; color: white; }
    .status.unhealthy { background: #ef4444; color: white; }

    .metric {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .metric:last-child { border-bottom: none; }

    .metric-label {
      color: #6b7280;
      font-weight: 500;
    }

    .metric-value {
      color: #1f2937;
      font-weight: 600;
    }

    .button {
      background: #667eea;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
      margin-top: 16px;
    }

    .button:hover {
      background: #5a67d8;
    }

    .button.danger {
      background: #ef4444;
    }

    .button.danger:hover {
      background: #dc2626;
    }

    .loading {
      text-align: center;
      color: #6b7280;
      font-style: italic;
    }

    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 12px;
      border-radius: 6px;
      margin-top: 16px;
    }

    .plugin-item {
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .plugin-name {
      font-weight: 600;
      color: #1f2937;
    }

    .plugin-version {
      color: #6b7280;
      font-size: 0.9em;
    }

    footer {
      text-align: center;
      color: white;
      margin-top: 40px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎛️ n8n MCP Server Dashboard</h1>
      <p class="subtitle">Monitor and manage your MCP server</p>
    </header>

    <div class="dashboard">
      <!-- Health Status -->
      <div class="card">
        <h2>🏥 Health Status</h2>
        <div id="health-content" class="loading">Loading...</div>
      </div>

      <!-- System Info -->
      <div class="card">
        <h2>💻 System Information</h2>
        <div id="system-content" class="loading">Loading...</div>
      </div>

      <!-- Cache Statistics -->
      <div class="card">
        <h2>⚡ Cache Performance</h2>
        <div id="cache-content" class="loading">Loading...</div>
        <button class="button danger" onclick="clearCache()">Clear All Caches</button>
      </div>

      <!-- Metrics -->
      <div class="card">
        <h2>📊 Metrics</h2>
        <div id="metrics-content" class="loading">Loading...</div>
        <button class="button" onclick="window.open('/api/metrics?format=json', '_blank')">View Full Metrics</button>
      </div>

      <!-- Configuration -->
      <div class="card">
        <h2>⚙️ Configuration</h2>
        <div id="config-content" class="loading">Loading...</div>
      </div>

      <!-- Plugins -->
      <div class="card">
        <h2>🔌 Plugins</h2>
        <div id="plugins-content" class="loading">Loading...</div>
      </div>
    </div>

    <footer>
      <p>n8n MCP Server Dashboard v2.7.1</p>
    </footer>
  </div>

  <script>
    // Fetch and display data
    async function fetchData() {
      try {
        await Promise.all([
          fetchHealth(),
          fetchSystem(),
          fetchCache(),
          fetchMetrics(),
          fetchConfig(),
          fetchPlugins()
        ]);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }

    async function fetchHealth() {
      const response = await fetch('/api/health?profile=full');
      const data = await response.json();

      const statusClass = data.status === 'healthy' ? 'healthy' :
                         data.status === 'degraded' ? 'degraded' : 'unhealthy';

      let html = \`
        <div class="metric">
          <span class="metric-label">Overall Status</span>
          <span class="status \${statusClass}">\${data.status.toUpperCase()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Uptime</span>
          <span class="metric-value">\${formatUptime(data.uptime)}</span>
        </div>
      \`;

      for (const [check, result] of Object.entries(data.checks)) {
        html += \`
          <div class="metric">
            <span class="metric-label">\${check}</span>
            <span class="status \${result.status === 'pass' ? 'healthy' : result.status === 'warn' ? 'degraded' : 'unhealthy'}">
              \${result.status}
            </span>
          </div>
        \`;
      }

      document.getElementById('health-content').innerHTML = html;
    }

    async function fetchSystem() {
      const response = await fetch('/api/system');
      const data = await response.json();

      document.getElementById('system-content').innerHTML = \`
        <div class="metric">
          <span class="metric-label">Node.js</span>
          <span class="metric-value">\${data.node}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Platform</span>
          <span class="metric-value">\${data.platform} (\${data.arch})</span>
        </div>
        <div class="metric">
          <span class="metric-label">Uptime</span>
          <span class="metric-value">\${formatUptime(data.uptime * 1000)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory Usage</span>
          <span class="metric-value">\${formatBytes(data.memory.heapUsed)} / \${formatBytes(data.memory.heapTotal)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Heap Usage</span>
          <span class="metric-value">\${data.memory.heapUsagePercent}%</span>
        </div>
      \`;
    }

    async function fetchCache() {
      const response = await fetch('/api/cache/stats');
      const data = await response.json();

      let html = '';
      for (const [name, stats] of Object.entries(data)) {
        html += \`
          <div class="metric">
            <span class="metric-label">\${name}</span>
            <span class="metric-value">\${stats.size} items (HR: \${(stats.hitRate * 100).toFixed(1)}%)</span>
          </div>
        \`;
      }

      document.getElementById('cache-content').innerHTML = html || '<p class="loading">No caches active</p>';
    }

    async function fetchMetrics() {
      const response = await fetch('/api/metrics?format=json');
      const data = await response.json();

      let html = \`
        <div class="metric">
          <span class="metric-label">Total Metrics</span>
          <span class="metric-value">\${Object.keys(data).length}</span>
        </div>
      \`;

      document.getElementById('metrics-content').innerHTML = html;
    }

    async function fetchConfig() {
      const response = await fetch('/api/config');
      const data = await response.json();

      document.getElementById('config-content').innerHTML = \`
        <div class="metric">
          <span class="metric-label">Server Mode</span>
          <span class="metric-value">\${data.server.mode}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Log Level</span>
          <span class="metric-value">\${data.server.logLevel}</span>
        </div>
        <div class="metric">
          <span class="metric-label">n8n API</span>
          <span class="metric-value">\${data.n8n.apiConfigured ? '✅ Configured' : '❌ Not configured'}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Plugins</span>
          <span class="metric-value">\${data.plugins.enabled ? '✅ Enabled' : '❌ Disabled'}</span>
        </div>
      \`;
    }

    async function fetchPlugins() {
      const response = await fetch('/api/plugins');
      const data = await response.json();

      if (data.plugins.length === 0) {
        document.getElementById('plugins-content').innerHTML = '<p class="loading">No plugins loaded</p>';
        return;
      }

      let html = '';
      for (const plugin of data.plugins) {
        html += \`
          <div class="plugin-item">
            <div class="plugin-name">\${plugin.name}</div>
            <div class="plugin-version">v\${plugin.version} - \${plugin.description}</div>
          </div>
        \`;
      }

      document.getElementById('plugins-content').innerHTML = html;
    }

    async function clearCache() {
      if (!confirm('Are you sure you want to clear all caches?')) return;

      await fetch('/api/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      await fetchCache();
    }

    function formatBytes(bytes) {
      const sizes = ['B', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 B';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    function formatUptime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return \`\${days}d \${hours % 24}h\`;
      if (hours > 0) return \`\${hours}h \${minutes % 60}m\`;
      if (minutes > 0) return \`\${minutes}m \${seconds % 60}s\`;
      return \`\${seconds}s\`;
    }

    // Initial load and auto-refresh
    fetchData();
    setInterval(fetchData, 5000);
  </script>
</body>
</html>
    `;
  }
}
