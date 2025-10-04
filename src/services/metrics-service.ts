/**
 * Metrics Service
 *
 * Prometheus-compatible metrics collection and reporting
 */

import { logger } from '../utils/logger.js';

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels?: string[];
}

export interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramValue {
  sum: number;
  count: number;
  buckets: HistogramBucket[];
}

/**
 * Prometheus-style metrics collector
 */
export class MetricsService {
  private metrics: Map<string, Metric> = new Map();
  private values: Map<string, Map<string, MetricValue>> = new Map();
  private histograms: Map<string, Map<string, HistogramValue>> = new Map();

  // Default histogram buckets (in milliseconds)
  private readonly DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  constructor() {
    this.registerDefaultMetrics();
  }

  /**
   * Register default metrics
   */
  private registerDefaultMetrics(): void {
    // MCP Tool metrics
    this.registerMetric({
      name: 'mcp_tool_calls_total',
      type: 'counter',
      help: 'Total number of MCP tool calls',
      labels: ['tool', 'status'],
    });

    this.registerMetric({
      name: 'mcp_tool_duration_ms',
      type: 'histogram',
      help: 'MCP tool execution duration in milliseconds',
      labels: ['tool'],
    });

    this.registerMetric({
      name: 'mcp_tool_errors_total',
      type: 'counter',
      help: 'Total number of MCP tool errors',
      labels: ['tool', 'error_type'],
    });

    // Database metrics
    this.registerMetric({
      name: 'db_query_duration_ms',
      type: 'histogram',
      help: 'Database query duration in milliseconds',
      labels: ['operation'],
    });

    this.registerMetric({
      name: 'db_queries_total',
      type: 'counter',
      help: 'Total number of database queries',
      labels: ['operation', 'status'],
    });

    // Cache metrics
    this.registerMetric({
      name: 'cache_hits_total',
      type: 'counter',
      help: 'Total number of cache hits',
      labels: ['cache'],
    });

    this.registerMetric({
      name: 'cache_misses_total',
      type: 'counter',
      help: 'Total number of cache misses',
      labels: ['cache'],
    });

    this.registerMetric({
      name: 'cache_evictions_total',
      type: 'counter',
      help: 'Total number of cache evictions',
      labels: ['cache', 'reason'],
    });

    this.registerMetric({
      name: 'cache_size',
      type: 'gauge',
      help: 'Current cache size',
      labels: ['cache'],
    });

    // System metrics
    this.registerMetric({
      name: 'process_cpu_percent',
      type: 'gauge',
      help: 'Process CPU usage percentage',
    });

    this.registerMetric({
      name: 'process_memory_bytes',
      type: 'gauge',
      help: 'Process memory usage in bytes',
      labels: ['type'],
    });

    this.registerMetric({
      name: 'process_uptime_seconds',
      type: 'gauge',
      help: 'Process uptime in seconds',
    });

    // HTTP metrics (if HTTP server is running)
    this.registerMetric({
      name: 'http_requests_total',
      type: 'counter',
      help: 'Total number of HTTP requests',
      labels: ['method', 'path', 'status'],
    });

    this.registerMetric({
      name: 'http_request_duration_ms',
      type: 'histogram',
      help: 'HTTP request duration in milliseconds',
      labels: ['method', 'path'],
    });
  }

  /**
   * Register a new metric
   */
  registerMetric(metric: Metric): void {
    this.metrics.set(metric.name, metric);

    if (metric.type === 'histogram') {
      this.histograms.set(metric.name, new Map());
    } else {
      this.values.set(metric.name, new Map());
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const key = this.getLabelKey(labels);
    const metricValues = this.values.get(name);

    if (!metricValues) {
      logger.warn(`Metric not found: ${name}`);
      return;
    }

    const current = metricValues.get(key);
    const newValue = (current?.value || 0) + value;

    metricValues.set(key, {
      value: newValue,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getLabelKey(labels);
    const metricValues = this.values.get(name);

    if (!metricValues) {
      logger.warn(`Metric not found: ${name}`);
      return;
    }

    metricValues.set(key, {
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getLabelKey(labels);
    const histogramValues = this.histograms.get(name);

    if (!histogramValues) {
      logger.warn(`Histogram not found: ${name}`);
      return;
    }

    let histogram = histogramValues.get(key);

    if (!histogram) {
      histogram = {
        sum: 0,
        count: 0,
        buckets: this.DEFAULT_BUCKETS.map((le) => ({ le, count: 0 })),
      };
      histogramValues.set(key, histogram);
    }

    histogram.sum += value;
    histogram.count++;

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
  }

  /**
   * Start timing an operation (returns a function to stop the timer)
   */
  startTimer(metricName: string, labels?: Record<string, string>): () => void {
    const start = Date.now();

    return () => {
      const duration = Date.now() - start;
      this.observeHistogram(metricName, duration, labels);
    };
  }

  /**
   * Get metric value
   */
  getMetric(name: string, labels?: Record<string, string>): number | undefined {
    const key = this.getLabelKey(labels);
    const metricValues = this.values.get(name);

    return metricValues?.get(key)?.value;
  }

  /**
   * Get all metrics in Prometheus text format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Export counters and gauges
    for (const [name, metric] of this.metrics.entries()) {
      if (metric.type === 'histogram') {
        continue; // Handle separately
      }

      // Add HELP and TYPE
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);

      // Add values
      const metricValues = this.values.get(name);
      if (metricValues) {
        for (const [key, value] of metricValues.entries()) {
          const labelStr = this.formatLabels(value.labels);
          lines.push(`${name}${labelStr} ${value.value}`);
        }
      }

      lines.push(''); // Empty line between metrics
    }

    // Export histograms
    for (const [name, metric] of this.metrics.entries()) {
      if (metric.type !== 'histogram') {
        continue;
      }

      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} histogram`);

      const histogramValues = this.histograms.get(name);
      if (histogramValues) {
        for (const [key, histogram] of histogramValues.entries()) {
          const baseLabels = this.parseLabels(key);

          // Output buckets
          for (const bucket of histogram.buckets) {
            const labels = { ...baseLabels, le: bucket.le.toString() };
            const labelStr = this.formatLabels(labels);
            lines.push(`${name}_bucket${labelStr} ${bucket.count}`);
          }

          // Output +Inf bucket
          const infLabels = { ...baseLabels, le: '+Inf' };
          const infLabelStr = this.formatLabels(infLabels);
          lines.push(`${name}_bucket${infLabelStr} ${histogram.count}`);

          // Output sum and count
          const baseLabelStr = this.formatLabels(baseLabels);
          lines.push(`${name}_sum${baseLabelStr} ${histogram.sum}`);
          lines.push(`${name}_count${baseLabelStr} ${histogram.count}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON
   */
  getMetricsJSON(): any {
    const result: any = {};

    for (const [name, metric] of this.metrics.entries()) {
      if (metric.type === 'histogram') {
        const histogramValues = this.histograms.get(name);
        result[name] = Array.from(histogramValues?.entries() || []).map(([key, value]) => ({
          labels: this.parseLabels(key),
          ...value,
        }));
      } else {
        const metricValues = this.values.get(name);
        result[name] = Array.from(metricValues?.entries() || []).map(([key, value]) => ({
          labels: value.labels,
          value: value.value,
        }));
      }
    }

    return result;
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics(): void {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    this.setGauge('process_memory_bytes', mem.rss, { type: 'rss' });
    this.setGauge('process_memory_bytes', mem.heapTotal, { type: 'heap_total' });
    this.setGauge('process_memory_bytes', mem.heapUsed, { type: 'heap_used' });
    this.setGauge('process_memory_bytes', mem.external, { type: 'external' });
    this.setGauge('process_uptime_seconds', uptime);

    // CPU usage (requires measurement over time)
    // This is a simplified version - for production, use a proper CPU monitoring library
    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) / uptime / require('os').cpus().length * 100;
    this.setGauge('process_cpu_percent', cpuPercent);
  }

  /**
   * Start periodic system metrics collection
   */
  startSystemMetricsCollection(intervalMs: number = 15000): NodeJS.Timeout {
    this.updateSystemMetrics();

    const interval = setInterval(() => {
      this.updateSystemMetrics();
    }, intervalMs);

    logger.info(`Started system metrics collection: ${intervalMs}ms`);
    return interval;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metricValues of this.values.values()) {
      metricValues.clear();
    }
    for (const histogramValues of this.histograms.values()) {
      histogramValues.clear();
    }
  }

  /**
   * Generate label key from labels object
   */
  private getLabelKey(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '__default__';
    }

    return JSON.stringify(
      Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
    );
  }

  /**
   * Parse label key back to object
   */
  private parseLabels(key: string): Record<string, string> | undefined {
    if (key === '__default__') {
      return undefined;
    }

    try {
      const entries = JSON.parse(key);
      return Object.fromEntries(entries);
    } catch {
      return undefined;
    }
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return `{${labelPairs}}`;
  }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsService();

/**
 * Express middleware for metrics endpoint
 */
export function metricsMiddleware(req: any, res: any) {
  const format = req.query.format || 'prometheus';

  try {
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(metrics.getMetricsJSON(), null, 2));
    } else {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics.getPrometheusMetrics());
    }
  } catch (error) {
    logger.error('Failed to generate metrics:', error);
    res.status(500).send('Failed to generate metrics');
  }
}
