# Health Checks & Monitoring

The n8n MCP Server includes comprehensive health checks and Prometheus-compatible metrics for production monitoring.

## Health Check Profiles

### Liveness Check
Determines if the service is alive and responsive.

```bash
curl http://localhost:3001/api/health?profile=liveness
```

Checks:
- Process running
- Memory usage within limits

### Readiness Check
Determines if the service can handle requests.

```bash
curl http://localhost:3001/api/health?profile=readiness
```

Checks:
- Database connectivity
- Plugin system status

### Full Health Check
Comprehensive diagnostics including all checks plus filesystem and dependencies.

```bash
curl http://localhost:3001/api/health?profile=full
```

## Health Status Codes

- **200**: Healthy - Service is fully operational
- **503**: Degraded or Unhealthy - Service has issues

## Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-10-03T12:00:00.000Z",
  "uptime": 3600000,
  "checks": {
    "process": {
      "status": "pass",
      "message": "Process running normally",
      "details": { "uptime": 3600000, "pid": 12345 }
    },
    "memory": {
      "status": "pass",
      "message": "Memory usage normal",
      "details": { "heapUsedMB": 150, "heapUsagePercent": "45.2" }
    },
    "database": {
      "status": "pass",
      "message": "Database accessible",
      "duration": 5,
      "details": { "nodes": 525 }
    }
  }
}
```

## Prometheus Metrics

### Available Metrics

The server exposes Prometheus-compatible metrics at `/api/metrics`:

#### MCP Tool Metrics
- `mcp_tool_calls_total` - Total tool calls by tool and status
- `mcp_tool_duration_ms` - Tool execution duration histogram
- `mcp_tool_errors_total` - Tool errors by type

#### Database Metrics
- `db_query_duration_ms` - Database query duration histogram
- `db_queries_total` - Total queries by operation and status

#### Cache Metrics
- `cache_hits_total` - Cache hits by cache name
- `cache_misses_total` - Cache misses by cache name
- `cache_evictions_total` - Cache evictions by reason
- `cache_size` - Current cache size

#### System Metrics
- `process_cpu_percent` - CPU usage percentage
- `process_memory_bytes` - Memory usage (rss, heap_total, heap_used, external)
- `process_uptime_seconds` - Process uptime

#### HTTP Metrics (if HTTP mode enabled)
- `http_requests_total` - HTTP requests by method, path, and status
- `http_request_duration_ms` - HTTP request duration histogram

### Scraping Metrics

Configure Prometheus to scrape metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'n8n-mcp'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
```

### Metrics Format

Metrics are available in two formats:

**Prometheus format** (default):
```
curl http://localhost:3001/api/metrics
```

**JSON format**:
```
curl http://localhost:3001/api/metrics?format=json
```

## Kubernetes Integration

### Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /api/health?profile=liveness
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /api/health?profile=readiness
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

## Grafana Dashboard

Create a Grafana dashboard using these queries:

### Tool Call Rate
```promql
rate(mcp_tool_calls_total[5m])
```

### Average Tool Duration
```promql
rate(mcp_tool_duration_ms_sum[5m]) / rate(mcp_tool_duration_ms_count[5m])
```

### Cache Hit Rate
```promql
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))
```

### Memory Usage
```promql
process_memory_bytes{type="heap_used"} / process_memory_bytes{type="heap_total"}
```

## Alerting Rules

### High Memory Usage
```yaml
- alert: HighMemoryUsage
  expr: process_memory_bytes{type="heap_used"} / process_memory_bytes{type="heap_total"} > 0.9
  for: 5m
  annotations:
    summary: "High memory usage detected"
```

### High Error Rate
```yaml
- alert: HighErrorRate
  expr: rate(mcp_tool_errors_total[5m]) > 0.1
  for: 2m
  annotations:
    summary: "High tool error rate"
```

### Service Unhealthy
```yaml
- alert: ServiceUnhealthy
  expr: up{job="n8n-mcp"} == 0
  for: 1m
  annotations:
    summary: "n8n MCP Server is down"
```

## Implementation

Health checks and metrics are implemented in:
- [src/services/health-check.ts](../src/services/health-check.ts)
- [src/services/metrics-service.ts](../src/services/metrics-service.ts)
- [src/dashboard/dashboard-server.ts](../src/dashboard/dashboard-server.ts)

## Custom Metrics

Track custom metrics in your code:

```typescript
import { metrics } from './services/metrics-service.js';

// Increment a counter
metrics.incrementCounter('my_custom_counter', { label: 'value' });

// Set a gauge
metrics.setGauge('my_custom_gauge', 42, { label: 'value' });

// Observe a histogram (e.g., duration)
const endTimer = metrics.startTimer('my_custom_duration_ms', { operation: 'test' });
// ... do work ...
endTimer();
```

## Troubleshooting

### Metrics Not Appearing

1. Ensure dashboard is running: `npm run dashboard`
2. Check metrics endpoint: `curl http://localhost:3001/api/metrics`
3. Verify Prometheus configuration

### Health Check Failing

1. Check specific check that failed in response
2. Review logs for errors
3. Verify database connectivity
4. Check memory usage

### High Memory Usage

1. Clear caches: `curl -X POST http://localhost:3001/api/cache/clear`
2. Review metrics for memory leaks
3. Consider increasing heap size: `NODE_OPTIONS=--max-old-space-size=4096`
