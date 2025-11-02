/**
 * Distributed Tracing
 * Collects and exports distributed traces for system analysis
 * Supports multiple trace export formats (Jaeger, Zipkin, etc.)
 */

import { logger } from '../utils/logger';
import { SpanContext, TelemetrySpan } from './telemetry';

/**
 * Trace for export
 */
export interface ExportableTrace {
  traceID: string;
  processes: Record<string, ProcessInfo>;
  spans: ExportableSpan[];
}

/**
 * Process info in trace
 */
export interface ProcessInfo {
  serviceName: string;
  tags: Record<string, string | number>;
}

/**
 * Span for export
 */
export interface ExportableSpan {
  traceID: string;
  spanID: string;
  parentSpanID?: string;
  operationName: string;
  startTime: number;
  duration: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{
    timestamp: number;
    fields: Record<string, string>;
  }>;
  processID: string;
}

/**
 * Trace Export Configuration
 */
export interface TraceExportConfig {
  exportInterval?: number; // ms between exports
  batchSize?: number; // Traces per batch
  format?: 'jaeger' | 'zipkin' | 'otlp';
  endpoint?: string; // Export endpoint URL
  serviceName?: string;
}

/**
 * Distributed Trace Collection
 */
export class DistributedTraceCollector {
  private config: Required<TraceExportConfig>;
  private traces: Map<string, ExportableTrace> = new Map();
  private spans: Map<string, ExportableSpan> = new Map();
  private spanIdCounter = 0;

  constructor(config?: TraceExportConfig) {
    this.config = {
      exportInterval: config?.exportInterval ?? 60000,
      batchSize: config?.batchSize ?? 100,
      format: config?.format ?? 'jaeger',
      endpoint: config?.endpoint ?? 'http://localhost:6831',
      serviceName: config?.serviceName ?? 'n8n-mcp-system',
    };

    logger.info('[DistributedTraceCollector] Initialized', {
      format: this.config.format,
      endpoint: this.config.endpoint,
      serviceName: this.config.serviceName,
    });
  }

  /**
   * Create a new trace
   */
  createTrace(traceId: string, serviceName?: string): ExportableTrace {
    const processId = `process_${this.spanIdCounter++}`;

    const trace: ExportableTrace = {
      traceID: traceId,
      processes: {
        [processId]: {
          serviceName: serviceName || this.config.serviceName,
          tags: {
            'client.version': '1.0.0',
            'span.kind': 'server',
          },
        },
      },
      spans: [],
    };

    this.traces.set(traceId, trace);
    return trace;
  }

  /**
   * Add span to trace
   */
  addSpan(trace: ExportableTrace, telemetrySpan: TelemetrySpan, processId: string): void {
    const exportableSpan: ExportableSpan = {
      traceID: trace.traceID,
      spanID: telemetrySpan.spanId,
      parentSpanID: telemetrySpan.parentSpanId,
      operationName: telemetrySpan.name,
      startTime: telemetrySpan.startTime * 1000, // Convert to microseconds
      duration: (telemetrySpan.duration || 0) * 1000, // Convert to microseconds
      tags: this.convertAttributesToTags(telemetrySpan.attributes),
      logs: telemetrySpan.events.map((event) => ({
        timestamp: event.timestamp * 1000,
        fields: {
          'event.name': event.name,
          'message': JSON.stringify(event.attributes || {}),
        },
      })),
      processID: processId,
    };

    // Add status as tag
    if (telemetrySpan.status === 'error') {
      exportableSpan.tags['error'] = true;
      if (telemetrySpan.errorMessage) {
        exportableSpan.tags['error.object'] = telemetrySpan.errorMessage;
      }
    }

    trace.spans.push(exportableSpan);
    this.spans.set(telemetrySpan.spanId, exportableSpan);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): ExportableTrace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all traces ready for export
   */
  getTracesForExport(limit?: number): ExportableTrace[] {
    let traces = Array.from(this.traces.values());

    if (limit) {
      traces = traces.slice(0, limit);
    }

    return traces;
  }

  /**
   * Export traces in Jaeger format
   */
  exportJaeger(): Array<{
    traceID: string;
    processes: Record<string, ProcessInfo>;
    spans: ExportableSpan[];
  }> {
    return Array.from(this.traces.values());
  }

  /**
   * Export traces in Zipkin format
   */
  exportZipkin(): Array<{
    traceId: string;
    name: string;
    id: string;
    parentId?: string;
    timestamp: number;
    duration: number;
    localEndpoint: {
      serviceName: string;
    };
    tags: Record<string, string>;
    annotations?: Array<{
      timestamp: number;
      value: string;
    }>;
  }> {
    const zipkinTraces: any[] = [];

    for (const trace of this.traces.values()) {
      for (const span of trace.spans) {
        zipkinTraces.push({
          traceId: trace.traceID,
          name: span.operationName,
          id: span.spanID,
          parentId: span.parentSpanID,
          timestamp: span.startTime,
          duration: span.duration,
          localEndpoint: {
            serviceName: trace.processes[span.processID]?.serviceName || this.config.serviceName,
          },
          tags: span.tags,
          annotations: span.logs.map((log) => ({
            timestamp: log.timestamp,
            value: Object.values(log.fields).join(' '),
          })),
        });
      }
    }

    return zipkinTraces;
  }

  /**
   * Export traces in OpenTelemetry Protocol (OTLP) format
   */
  exportOTLP(): {
    resourceSpans: Array<{
      resource: {
        attributes: Array<{
          key: string;
          value: { stringValue?: string; intValue?: number };
        }>;
      };
      scopeSpans: Array<{
        scope: { name: string; version: string };
        spans: Array<{
          traceId: string;
          spanId: string;
          parentSpanId?: string;
          name: string;
          startTimeUnixNano: number;
          endTimeUnixNano: number;
          attributes?: Array<{
            key: string;
            value: { stringValue?: string; intValue?: number };
          }>;
          status: { code: number };
        }>;
      }>;
    }>;
  } {
    const resourceSpans = [];

    for (const trace of this.traces.values()) {
      const spans = trace.spans.map((span) => ({
        traceId: trace.traceID,
        spanId: span.spanID,
        parentSpanId: span.parentSpanID,
        name: span.operationName,
        startTimeUnixNano: span.startTime * 1000000,
        endTimeUnixNano: (span.startTime + span.duration) * 1000000,
        attributes: Object.entries(span.tags).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? { stringValue: value } : { intValue: value as number },
        })),
        status: { code: span.tags['error'] ? 2 : 0 },
      }));

      resourceSpans.push({
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: this.config.serviceName } },
            { key: 'service.version', value: { stringValue: '1.0.0' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'n8n-mcp-tracer', version: '1.0.0' },
            spans,
          },
        ],
      });
    }

    return { resourceSpans };
  }

  /**
   * Clear old traces
   */
  clearOldTraces(olderThanMs: number = 3600000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let removed = 0;

    for (const [traceId, trace] of this.traces.entries()) {
      if (trace.spans.length > 0) {
        const traceTime = Math.min(...trace.spans.map((s) => s.startTime));
        if (traceTime < cutoffTime * 1000) {
          this.traces.delete(traceId);
          removed++;
        }
      }
    }

    logger.info('[DistributedTraceCollector] Old traces cleared', {
      tracesRemoved: removed,
    });

    return removed;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalTraces: number;
    totalSpans: number;
    averageSpansPerTrace: number;
    oldestTrace: number;
    newestTrace: number;
  } {
    const traces = Array.from(this.traces.values());

    if (traces.length === 0) {
      return {
        totalTraces: 0,
        totalSpans: 0,
        averageSpansPerTrace: 0,
        oldestTrace: 0,
        newestTrace: 0,
      };
    }

    const totalSpans = traces.reduce((sum, t) => sum + t.spans.length, 0);
    const avgSpansPerTrace = totalSpans / traces.length;

    const allStartTimes = traces.flatMap((t) => t.spans.map((s) => s.startTime));
    const oldestTrace = Math.min(...allStartTimes);
    const newestTrace = Math.max(...allStartTimes);

    return {
      totalTraces: traces.length,
      totalSpans,
      averageSpansPerTrace: avgSpansPerTrace,
      oldestTrace: oldestTrace / 1000, // Convert back to ms
      newestTrace: newestTrace / 1000,
    };
  }

  /**
   * Export all traces in configured format
   */
  exportTraces(): any {
    switch (this.config.format) {
      case 'jaeger':
        return this.exportJaeger();
      case 'zipkin':
        return this.exportZipkin();
      case 'otlp':
        return this.exportOTLP();
      default:
        return this.exportJaeger();
    }
  }

  /**
   * Convert telemetry attributes to trace tags
   */
  private convertAttributesToTags(attributes: Record<string, any>): Record<string, string | number | boolean> {
    const tags: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        tags[key] = value;
      }
    }

    return tags;
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<TraceExportConfig> {
    return this.config;
  }
}

/**
 * Factory function to create distributed trace collector
 */
export function createDistributedTraceCollector(config?: TraceExportConfig): DistributedTraceCollector {
  return new DistributedTraceCollector(config);
}
