/**
 * Telemetry Infrastructure
 * Provides comprehensive OpenTelemetry integration for distributed tracing
 * Captures traces, spans, and metrics across the entire system
 */

import { logger } from '../utils/logger';

/**
 * Span attributes
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
  'component.name'?: string;
  'operation.name'?: string;
  'query'?: string;
  'intent'?: string;
  'result.count'?: number;
  'quality.score'?: number;
  'duration.ms'?: number;
}

/**
 * Span context for linking
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
}

/**
 * Telemetry span
 */
export interface TelemetrySpan {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  parentSpanId?: string;
  attributes: SpanAttributes;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: SpanAttributes;
  }>;
  status: 'unset' | 'ok' | 'error';
  errorMessage?: string;
}

/**
 * Telemetry Configuration
 */
export interface TelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  serviceVersion?: string;
  samplingRate?: number; // 0-1, what fraction of traces to collect
  maxSpansPerTrace?: number;
  exportInterval?: number; // ms between exports
}

/**
 * Telemetry Infrastructure
 */
export class TelemetryService {
  private config: Required<TelemetryConfig>;
  private spans: Map<string, TelemetrySpan> = new Map();
  private traces: Map<string, TelemetrySpan[]> = new Map();
  private activeSpans: Map<string, TelemetrySpan> = new Map();
  private spanCounter = 0;

  constructor(config?: TelemetryConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      serviceName: config?.serviceName ?? 'n8n-mcp-system',
      serviceVersion: config?.serviceVersion ?? '1.0.0',
      samplingRate: config?.samplingRate ?? 1.0,
      maxSpansPerTrace: config?.maxSpansPerTrace ?? 100,
      exportInterval: config?.exportInterval ?? 60000,
    };

    logger.info('[TelemetryService] Initialized', {
      serviceName: this.config.serviceName,
      samplingRate: this.config.samplingRate,
    });
  }

  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: SpanAttributes, parentSpanId?: string): SpanContext {
    if (!this.config.enabled) {
      return {
        traceId: 'disabled',
        spanId: 'disabled',
      };
    }

    // Check sampling
    if (Math.random() > this.config.samplingRate) {
      return {
        traceId: 'sampled-out',
        spanId: 'sampled-out',
      };
    }

    const traceId = parentSpanId ? this.getTraceIdForSpan(parentSpanId) : this.generateTraceId();
    const spanId = this.generateSpanId();

    const span: TelemetrySpan = {
      spanId,
      traceId,
      name,
      startTime: Date.now(),
      parentSpanId,
      attributes: {
        'component.name': this.config.serviceName,
        'operation.name': name,
        ...attributes,
      },
      events: [],
      status: 'unset',
    };

    this.spans.set(spanId, span);
    this.activeSpans.set(spanId, span);

    // Add to trace
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }
    const traceSpans = this.traces.get(traceId)!;
    if (traceSpans.length < this.config.maxSpansPerTrace) {
      traceSpans.push(span);
    }

    logger.debug('[TelemetryService] Span started', {
      traceId: traceId.substring(0, 8),
      spanId: spanId.substring(0, 8),
      name,
    });

    return { traceId, spanId, parentSpanId };
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    if (errorMessage) {
      span.errorMessage = errorMessage;
    }

    this.activeSpans.delete(spanId);

    logger.debug('[TelemetryService] Span ended', {
      spanId: spanId.substring(0, 8),
      duration: span.duration,
      status,
    });
  }

  /**
   * Add event to span
   */
  addSpanEvent(spanId: string, eventName: string, attributes?: SpanAttributes): void {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    span.events.push({
      name: eventName,
      timestamp: Date.now(),
      attributes,
    });

    logger.debug('[TelemetryService] Span event added', {
      spanId: spanId.substring(0, 8),
      eventName,
    });
  }

  /**
   * Set span attributes
   */
  setSpanAttributes(spanId: string, attributes: SpanAttributes): void {
    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    Object.assign(span.attributes, attributes);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): TelemetrySpan[] {
    return this.traces.get(traceId) || [];
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): TelemetrySpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get all traces
   */
  getAllTraces(): Array<{
    traceId: string;
    spanCount: number;
    totalDuration: number;
    status: 'ok' | 'error' | 'mixed';
  }> {
    const traces = [];

    for (const [traceId, spans] of this.traces.entries()) {
      if (spans.length === 0) continue;

      const startTime = Math.min(...spans.map((s) => s.startTime));
      const endTime = Math.max(...spans.map((s) => s.endTime || s.startTime));
      const totalDuration = endTime - startTime;

      const statuses = spans.map((s) => s.status);
      const hasErrors = statuses.includes('error');
      const allOk = statuses.every((s) => s === 'ok');
      const status = allOk ? ('ok' as const) : hasErrors ? ('error' as const) : ('mixed' as const);

      traces.push({
        traceId: traceId.substring(0, 16),
        spanCount: spans.length,
        totalDuration,
        status,
      });
    }

    return traces;
  }

  /**
   * Export traces in OpenTelemetry format
   */
  exportTraces(): {
    resourceSpans: Array<{
      resource: {
        attributes: Record<string, string | number>;
      };
      instrumentationLibrarySpans: Array<{
        spans: TelemetrySpan[];
      }>;
    }>;
  } {
    const spans = Array.from(this.spans.values());

    return {
      resourceSpans: [
        {
          resource: {
            attributes: {
              'service.name': this.config.serviceName,
              'service.version': this.config.serviceVersion,
            },
          },
          instrumentationLibrarySpans: [
            {
              spans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Clear old traces (for memory management)
   */
  clearOldTraces(olderThanMs: number = 3600000): number {
    const cutoffTime = Date.now() - olderThanMs;
    let removed = 0;

    for (const [traceId, spans] of this.traces.entries()) {
      if (spans.length > 0 && spans[0].startTime < cutoffTime) {
        // Remove old trace's spans from spans map
        for (const span of spans) {
          this.spans.delete(span.spanId);
        }
        this.traces.delete(traceId);
        removed++;
      }
    }

    logger.info('[TelemetryService] Old traces cleared', {
      tracesRemoved: removed,
      timeCutoff: olderThanMs,
    });

    return removed;
  }

  /**
   * Get telemetry statistics
   */
  getStatistics(): {
    totalSpans: number;
    totalTraces: number;
    activeSpans: number;
    averageSpansPerTrace: number;
    errorRate: number;
  } {
    const totalSpans = this.spans.size;
    const totalTraces = this.traces.size;
    const activeSpans = this.activeSpans.size;

    let totalSpansInTraces = 0;
    let errorSpans = 0;

    for (const spans of this.traces.values()) {
      totalSpansInTraces += spans.length;
      errorSpans += spans.filter((s) => s.status === 'error').length;
    }

    const averageSpansPerTrace = totalTraces > 0 ? totalSpansInTraces / totalTraces : 0;
    const errorRate = totalSpans > 0 ? errorSpans / totalSpans : 0;

    return {
      totalSpans,
      totalTraces,
      activeSpans,
      averageSpansPerTrace,
      errorRate,
    };
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return `span-${this.spanCounter++}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get trace ID for span (lookup parent's trace)
   */
  private getTraceIdForSpan(parentSpanId: string): string {
    const parentSpan = this.spans.get(parentSpanId);
    return parentSpan?.traceId || this.generateTraceId();
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<TelemetryConfig> {
    return this.config;
  }
}

/**
 * Factory function to create telemetry service
 */
export function createTelemetryService(config?: TelemetryConfig): TelemetryService {
  return new TelemetryService(config);
}
