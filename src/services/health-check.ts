/**
 * Health Check Service
 *
 * Kubernetes-style health checks for monitoring and load balancing
 */

import * as fs from 'fs';
import { logger } from '../utils/logger.js';
import { NodeDocumentationService } from './node-documentation-service.js';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    [key: string]: CheckResult;
  };
  details?: {
    memory?: MemoryStats;
    database?: DatabaseStats;
    plugins?: PluginStats;
  };
}

export interface CheckResult {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  duration?: number;
  details?: any;
}

export interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  heapUsagePercent: number;
  external: number;
}

export interface DatabaseStats {
  connected: boolean;
  nodes: number;
  size: number;
}

export interface PluginStats {
  loaded: number;
  enabled: number;
}

/**
 * Health check profiles
 */
export type HealthCheckProfile = 'liveness' | 'readiness' | 'full';

const STARTUP_TIME = Date.now();

export class HealthCheckService {
  private nodeService?: NodeDocumentationService;
  private pluginLoader?: any;

  constructor(nodeService?: NodeDocumentationService, pluginLoader?: any) {
    this.nodeService = nodeService;
    this.pluginLoader = pluginLoader;
  }

  /**
   * Perform health check
   */
  async check(profile: HealthCheckProfile = 'full'): Promise<HealthCheckResult> {
    const checks: { [key: string]: CheckResult } = {};
    const startTime = Date.now();

    // Liveness checks (is the service alive?)
    if (profile === 'liveness' || profile === 'full') {
      checks.process = await this.checkProcess();
      checks.memory = await this.checkMemory();
    }

    // Readiness checks (can the service handle requests?)
    if (profile === 'readiness' || profile === 'full') {
      checks.database = await this.checkDatabase();

      if (this.pluginLoader) {
        checks.plugins = await this.checkPlugins();
      }
    }

    // Full checks (detailed diagnostics)
    if (profile === 'full') {
      checks.filesystem = await this.checkFilesystem();
      checks.dependencies = await this.checkDependencies();
    }

    // Determine overall status
    const status = this.determineOverallStatus(checks);

    const result: HealthCheckResult = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - STARTUP_TIME,
      checks,
    };

    // Add detailed stats for full checks
    if (profile === 'full') {
      result.details = {
        memory: this.getMemoryStats(),
        database: await this.getDatabaseStats(),
        plugins: this.getPluginStats(),
      };
    }

    const duration = Date.now() - startTime;
    logger.debug(`Health check completed in ${duration}ms:`, status);

    return result;
  }

  /**
   * Check process health
   */
  private async checkProcess(): Promise<CheckResult> {
    try {
      const uptime = Date.now() - STARTUP_TIME;

      // Process is unhealthy if it just started (< 5 seconds)
      if (uptime < 5000) {
        return {
          status: 'warn',
          message: 'Service starting up',
          details: { uptime },
        };
      }

      return {
        status: 'pass',
        message: 'Process running normally',
        details: { uptime, pid: process.pid },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Process check failed',
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<CheckResult> {
    try {
      const mem = process.memoryUsage();
      const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;

      // Memory warning thresholds
      if (heapUsagePercent > 90) {
        return {
          status: 'fail',
          message: 'Critical memory usage',
          details: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            heapUsagePercent: heapUsagePercent.toFixed(2),
          },
        };
      }

      if (heapUsagePercent > 75) {
        return {
          status: 'warn',
          message: 'High memory usage',
          details: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapUsagePercent: heapUsagePercent.toFixed(2),
          },
        };
      }

      return {
        status: 'pass',
        message: 'Memory usage normal',
        details: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapUsagePercent: heapUsagePercent.toFixed(2),
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Memory check failed',
      };
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();

    try {
      if (!this.nodeService) {
        return {
          status: 'warn',
          message: 'Node service not initialized',
        };
      }

      // Try a simple database query
      const stats = await this.nodeService.getDatabaseStatistics();
      const duration = Date.now() - start;

      if (stats.totalNodes === 0) {
        return {
          status: 'warn',
          message: 'Database empty',
          duration,
        };
      }

      // Warn if query is slow
      if (duration > 1000) {
        return {
          status: 'warn',
          message: 'Database query slow',
          duration,
          details: { nodes: stats.totalNodes },
        };
      }

      return {
        status: 'pass',
        message: 'Database accessible',
        duration,
        details: { nodes: stats.totalNodes },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Database check failed',
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Check plugin system
   */
  private async checkPlugins(): Promise<CheckResult> {
    try {
      if (!this.pluginLoader) {
        return {
          status: 'pass',
          message: 'Plugins not enabled',
        };
      }

      const plugins = this.pluginLoader.getPlugins();
      const enabled = plugins.filter((p: any) => p.enabled).length;

      return {
        status: 'pass',
        message: 'Plugins loaded',
        details: {
          total: plugins.length,
          enabled,
        },
      };
    } catch (error) {
      return {
        status: 'warn',
        message: error instanceof Error ? error.message : 'Plugin check failed',
      };
    }
  }

  /**
   * Check filesystem access
   */
  private async checkFilesystem(): Promise<CheckResult> {
    try {
      const dbPath = process.env.NODE_DB_PATH || './data/nodes.db';

      if (!fs.existsSync(dbPath)) {
        return {
          status: 'fail',
          message: 'Database file not found',
          details: { path: dbPath },
        };
      }

      const stats = fs.statSync(dbPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      return {
        status: 'pass',
        message: 'Filesystem accessible',
        details: {
          databaseSizeMB: sizeMB,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Filesystem check failed',
      };
    }
  }

  /**
   * Check critical dependencies
   */
  private async checkDependencies(): Promise<CheckResult> {
    try {
      const dependencies = [
        '@modelcontextprotocol/sdk',
        'better-sqlite3',
        'n8n-workflow',
      ];

      const missing: string[] = [];
      for (const dep of dependencies) {
        try {
          require.resolve(dep);
        } catch {
          missing.push(dep);
        }
      }

      if (missing.length > 0) {
        return {
          status: 'fail',
          message: 'Missing dependencies',
          details: { missing },
        };
      }

      return {
        status: 'pass',
        message: 'Dependencies available',
        details: { checked: dependencies.length },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Dependency check failed',
      };
    }
  }

  /**
   * Determine overall health status
   */
  private determineOverallStatus(
    checks: { [key: string]: CheckResult }
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const results = Object.values(checks);

    // Any critical failures = unhealthy
    const hasCriticalFailure = results.some(
      (r) => r.status === 'fail' && ['database', 'process'].includes(r.message || '')
    );

    if (hasCriticalFailure) {
      return 'unhealthy';
    }

    // Any failures = degraded
    const hasFailure = results.some((r) => r.status === 'fail');
    if (hasFailure) {
      return 'degraded';
    }

    // Any warnings = degraded
    const hasWarning = results.some((r) => r.status === 'warn');
    if (hasWarning) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get detailed memory statistics
   */
  private getMemoryStats(): MemoryStats {
    const mem = process.memoryUsage();
    return {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      heapUsagePercent: (mem.heapUsed / mem.heapTotal) * 100,
      external: mem.external,
    };
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.nodeService) {
      return {
        connected: false,
        nodes: 0,
        size: 0,
      };
    }

    try {
      const stats = await this.nodeService.getDatabaseStatistics();
      const dbPath = process.env.NODE_DB_PATH || './data/nodes.db';
      const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

      return {
        connected: true,
        nodes: stats.totalNodes,
        size,
      };
    } catch {
      return {
        connected: false,
        nodes: 0,
        size: 0,
      };
    }
  }

  /**
   * Get plugin statistics
   */
  private getPluginStats(): PluginStats {
    if (!this.pluginLoader) {
      return {
        loaded: 0,
        enabled: 0,
      };
    }

    const plugins = this.pluginLoader.getPlugins();
    return {
      loaded: plugins.length,
      enabled: plugins.filter((p: any) => p.enabled).length,
    };
  }
}

/**
 * Express middleware for health checks
 */
export function healthCheckMiddleware(service: HealthCheckService) {
  return async (req: any, res: any) => {
    // Determine profile from query param
    const profile = (req.query.profile || 'readiness') as HealthCheckProfile;

    try {
      const result = await service.check(profile);

      // Set HTTP status based on health
      const statusCode =
        result.status === 'healthy'
          ? 200
          : result.status === 'degraded'
          ? 503
          : 503;

      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Health check failed',
      });
    }
  };
}
