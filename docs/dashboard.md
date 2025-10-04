# Configuration Dashboard

The n8n MCP Server includes a web-based dashboard for monitoring and management.

## Features

- **Real-time Health Monitoring** - Server health status and checks
- **System Metrics** - CPU, memory, uptime tracking
- **Cache Performance** - Hit rates, evictions, size monitoring
- **Plugin Management** - View loaded plugins
- **Configuration Overview** - Current server settings

## Starting the Dashboard

```bash
# Development mode (with auto-reload)
npm run dashboard:dev

# Production mode
npm run dashboard
```

The dashboard runs on port 3001 by default and is accessible at:
```
http://localhost:3001
```

## API Endpoints

The dashboard provides REST API endpoints:

- `GET /api/health` - Health check results
- `GET /api/metrics` - Prometheus metrics
- `GET /api/cache/stats` - Cache statistics
- `POST /api/cache/clear` - Clear caches
- `GET /api/plugins` - List plugins
- `GET /api/system` - System information
- `GET /api/config` - Configuration overview

## Configuration

Set the dashboard port via environment variable:

```bash
DASHBOARD_PORT=3001
```

## Auto-Refresh

The dashboard automatically refreshes data every 5 seconds to provide real-time monitoring.

## Security

In production, place the dashboard behind a reverse proxy with authentication:

```nginx
location /dashboard {
    auth_basic "Dashboard";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:3001;
}
```

## Metrics Export

View metrics in different formats:

- **Prometheus format**: `/api/metrics`
- **JSON format**: `/api/metrics?format=json`

## Integration

The dashboard integrates with:
- Health check service
- Metrics service
- Cache manager
- Plugin loader

See [src/dashboard/dashboard-server.ts](../src/dashboard/dashboard-server.ts) for implementation details.
