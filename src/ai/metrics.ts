/**
 * Metrics Collection and Export
 * Comprehensive performance metrics for system monitoring
 * Provides counters, gauges, histograms for observability
 */

import { logger } from '../utils/logger';

/**
 * Metric types
 */
export type MetricValue = number;

/**
 * Counter metric
 */
export interface CounterMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Gauge metric (snapshot of current value)
 */
export interface GaugeMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Histogram metric (distribution of values)
 */
export interface HistogramMetric {
  name: string;
  buckets: Map<number, number>;
  sum: number;
  count: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Metrics Configuration
 */
export interface MetricsConfig {
  enabled?: boolean;
  exportInterval?: number; // ms between metric exports
  histogramBuckets?: number[];
}

/**
 * Metrics Service
 */
export class MetricsService {
  private config: Required<MetricsConfig>;
  private counters: Map<string, CounterMetric> = new Map();
  private gauges: Map<string, GaugeMetric> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();

  // Predefined metrics
  private queryCounter = 0;
  private successCounter = 0;
  private errorCounter = 0;
  private executionTimes: number[] = [];
  private qualityScores: number[] = [];

  constructor(config?: MetricsConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      exportInterval: config?.exportInterval ?? 60000,
      histogramBuckets: config?.histogramBuckets ?? [10, 50, 100, 500, 1000, 5000],
    };

    logger.info('[MetricsService] Initialized', {
      enabled: this.config.enabled,
      exportInterval: this.config.exportInterval,
    });

    // Initialize common histograms
    this.initializeHistogram('execution_time_ms', this.config.histogramBuckets);
    this.initializeHistogram('quality_score', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    const key = this.getMetricKey(name, labels);
    let metric = this.counters.get(key);

    if (!metric) {
      metric = {
        name,
        value: 0,
        labels: labels || {},
        timestamp: Date.now(),
      };
    }

    metric.value++;
    metric.timestamp = Date.now();
    this.counters.set(key, metric);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    const key = this.getMetricKey(name, labels);

    this.gauges.set(key, {
      name,
      value,
      labels: labels || {},
      timestamp: Date.now(),
    });
  }

  /**
   * Record a histogram value
   */
  recordHistogramValue(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enabled) return;

    const key = this.getMetricKey(name, labels);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      histogram = {
        name,
        buckets: new Map(),
        sum: 0,
        count: 0,
        labels: labels || {},
        timestamp: Date.now(),
      };

      // Initialize buckets
      for (const bucket of this.config.histogramBuckets) {
        histogram.buckets.set(bucket, 0);
      }
    }

    // Add to bucket
    for (const [bucket, _] of histogram.buckets.entries()) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }

    histogram.sum += value;
    histogram.count++;
    histogram.timestamp = Date.now();
    this.histograms.set(key, histogram);
  }

  /**
   * Record query execution metrics
   */
  recordQuery(success: boolean, executionTime: number, qualityScore: number): void {
    this.queryCounter++;
    this.incrementCounter('queries_total');
    this.recordHistogramValue('execution_time_ms', executionTime);
    this.recordHistogramValue('quality_score', qualityScore);
    this.setGauge('last_execution_time_ms', executionTime);
    this.setGauge('last_quality_score', qualityScore);

    if (success) {
      this.successCounter++;
      this.incrementCounter('queries_successful');
    } else {
      this.errorCounter++;
      this.incrementCounter('queries_failed');
    }

    this.executionTimes.push(executionTime);
    this.qualityScores.push(qualityScore);

    // Keep only last 1000 values
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }
    if (this.qualityScores.length > 1000) {
      this.qualityScores.shift();
    }
  }

  /**
   * Get counter metric
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  /**
   * Get gauge metric
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  /**
   * Get histogram metric
   */
  getHistogram(name: string, labels?: Record<string, string>): HistogramMetric | undefined {
    const key = this.getMetricKey(name, labels);
    return this.histograms.get(key);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): {
    counters: CounterMetric[];
    gauges: GaugeMetric[];
    histograms: HistogramMetric[];
  } {
    return {
      counters: Array.from(this.counters.values()),
      gauges: Array.from(this.gauges.values()),
      histograms: Array.from(this.histograms.values()),
    };
  }

  /**
   * Get system statistics
   */
  getStatistics(): {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    successRate: number;
    averageExecutionTime: number;
    medianExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
    averageQualityScore: number;
    medianQualityScore: number;
  } {
    const successRate = this.queryCounter > 0 ? this.successCounter / this.queryCounter : 0;

    const avgExecTime =
      this.executionTimes.length > 0
        ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
        : 0;

    const medianExecTime = this.getPercentile(this.executionTimes, 0.5);
    const p95ExecTime = this.getPercentile(this.executionTimes, 0.95);
    const p99ExecTime = this.getPercentile(this.executionTimes, 0.99);

    const avgQualityScore =
      this.qualityScores.length > 0
        ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
        : 0;

    const medianQualityScore = this.getPercentile(this.qualityScores, 0.5);

    return {
      totalQueries: this.queryCounter,
      successfulQueries: this.successCounter,
      failedQueries: this.errorCounter,
      successRate,
      averageExecutionTime: avgExecTime,
      medianExecutionTime: medianExecTime,
      p95ExecutionTime: p95ExecTime,
      p99ExecutionTime: p99ExecTime,
      averageQualityScore: avgQualityScore,
      medianQualityScore,
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const metric of this.counters.values()) {
      const labels = this.formatLabels(metric.labels);
      lines.push(`# HELP ${metric.name} Counter metric`);
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name}${labels} ${metric.value}`);
    }

    // Gauges
    for (const metric of this.gauges.values()) {
      const labels = this.formatLabels(metric.labels);
      lines.push(`# HELP ${metric.name} Gauge metric`);
      lines.push(`# TYPE ${metric.name} gauge`);
      lines.push(`${metric.name}${labels} ${metric.value}`);
    }

    // Histograms
    for (const metric of this.histograms.values()) {
      const labels = this.formatLabels(metric.labels);
      lines.push(`# HELP ${metric.name} Histogram metric`);
      lines.push(`# TYPE ${metric.name} histogram`);

      for (const [bucket, count] of metric.buckets.entries()) {
        const bucketLabels = { ...metric.labels, le: bucket.toString() };
        lines.push(`${metric.name}_bucket${this.formatLabels(bucketLabels)} ${count}`);
      }

      lines.push(`${metric.name}_sum${labels} ${metric.sum}`);
      lines.push(`${metric.name}_count${labels} ${metric.count}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.queryCounter = 0;
    this.successCounter = 0;
    this.errorCounter = 0;
    this.executionTimes = [];
    this.qualityScores = [];
    logger.info('[MetricsService] All metrics cleared');
  }

  /**
   * Initialize histogram
   */
  private initializeHistogram(name: string, buckets: number[]): void {
    const histogram: HistogramMetric = {
      name,
      buckets: new Map(),
      sum: 0,
      count: 0,
      labels: {},
      timestamp: Date.now(),
    };

    for (const bucket of buckets) {
      histogram.buckets.set(bucket, 0);
    }

    this.histograms.set(name, histogram);
  }

  /**
   * Get metric key from name and labels
   */
  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}{${labelPairs}}`;
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return '';
    }

    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${pairs}}`;
  }

  /**
   * Calculate percentile
   */
  private getPercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<MetricsConfig> {
    return this.config;
  }
}

/**
 * Factory function to create metrics service
 */
export function createMetricsService(config?: MetricsConfig): MetricsService {
  return new MetricsService(config);
}
