# Plugin Development Guide

The n8n MCP Server includes a powerful plugin system that allows you to extend functionality without modifying core code.

## Table of Contents

- [Quick Start](#quick-start)
- [Plugin Structure](#plugin-structure)
- [Plugin API](#plugin-api)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Adding Custom Tools](#adding-custom-tools)
- [Configuration](#configuration)
- [Hot Reload](#hot-reload)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Quick Start

### 1. Create a Plugin

Create a file in the `plugins/` directory:

```typescript
// plugins/my-plugin.js
export default {
  metadata: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My awesome plugin',
    author: 'Your Name',
    license: 'MIT'
  },

  async initialize(config) {
    console.log('Plugin initialized!');
  },

  hooks: {
    async onLoad() {
      console.log('Plugin loaded');
    }
  }
};
```

### 2. Enable the Plugin

Add to your `.env` file:

```env
PLUGINS_ENABLED=true
PLUGIN_DIR=./plugins
PLUGIN_WATCH=true
```

### 3. Configure (Optional)

Create `plugin-config.json`:

```json
{
  "my-plugin": {
    "enabled": true,
    "customOption": "value"
  }
}
```

## Plugin Structure

A plugin is a JavaScript/TypeScript module that exports a `Plugin` object:

```typescript
interface Plugin {
  metadata: PluginMetadata;      // Required metadata
  config?: PluginConfig;         // Configuration schema
  hooks?: PluginHooks;           // Lifecycle hooks
  tools?: Tool[];                // Additional MCP tools
  initialize?(config?: any): Promise<void> | void;
  cleanup?(): Promise<void> | void;
}
```

### Metadata (Required)

```typescript
{
  metadata: {
    name: 'plugin-name',           // Required: Unique identifier
    version: '1.0.0',              // Required: Semver version
    description: 'Description',    // Required: Short description
    author: 'Your Name',           // Optional
    homepage: 'https://...',       // Optional
    license: 'MIT',                // Optional
    keywords: ['tag1', 'tag2'],    // Optional
    dependencies: {                // Optional: npm dependencies
      'package': '^1.0.0'
    }
  }
}
```

## Plugin API

### Lifecycle Methods

#### `initialize(config)`

Called when the plugin is first loaded. Use this to:
- Set up resources
- Validate configuration
- Initialize services

```typescript
async initialize(config?: PluginConfig) {
  this.db = await connectToDatabase(config.dbUrl);
  this.cache = new Cache(config.cacheSize);
}
```

#### `cleanup()`

Called when the plugin is unloaded. Use this to:
- Close connections
- Clean up resources
- Save state

```typescript
async cleanup() {
  await this.db.close();
  await this.cache.flush();
}
```

## Lifecycle Hooks

Hooks allow you to intercept and modify tool execution:

### `onLoad()`

Called after the plugin is loaded and initialized:

```typescript
hooks: {
  async onLoad() {
    logger.info('Plugin is now active');
    await this.warmupCache();
  }
}
```

### `onUnload()`

Called before the plugin is unloaded:

```typescript
hooks: {
  async onUnload() {
    logger.info('Plugin shutting down');
    await this.saveState();
  }
}
```

### `beforeToolExecution(toolName, params)`

Called before ANY MCP tool executes. Can modify parameters:

```typescript
hooks: {
  async beforeToolExecution(toolName: string, params: any) {
    // Log all tool calls
    logger.info(`Executing: ${toolName}`, params);

    // Add authentication
    if (params.authenticate) {
      params.token = await this.getAuthToken();
    }

    // Return modified params
    return params;
  }
}
```

### `afterToolExecution(toolName, params, result)`

Called after tool execution. Can modify results:

```typescript
hooks: {
  async afterToolExecution(toolName: string, params: any, result: any) {
    // Cache results
    await this.cache.set(`${toolName}:${JSON.stringify(params)}`, result);

    // Add metadata
    result.executedAt = new Date();
    result.pluginVersion = this.metadata.version;

    return result;
  }
}
```

### `onError(error, context)`

Called when any error occurs:

```typescript
hooks: {
  async onError(error: Error, context?: any) {
    // Send to error tracking service
    await this.errorTracker.captureException(error, {
      context,
      user: context?.user,
      toolName: context?.toolName
    });

    // Send alert if critical
    if (error.message.includes('CRITICAL')) {
      await this.sendSlackAlert(error);
    }
  }
}
```

## Adding Custom Tools

Plugins can register additional MCP tools:

```typescript
tools: [
  {
    name: 'my_custom_tool',
    description: 'Does something cool',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'The input data'
        },
        options: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['json', 'xml']
            }
          }
        }
      },
      required: ['input']
    }
  }
]
```

Tool handlers are implemented separately and registered with the MCP server.

## Configuration

### Plugin-Specific Configuration

Pass configuration via `plugin-config.json`:

```json
{
  "analytics-plugin": {
    "enabled": true,
    "trackingId": "UA-XXXXX-Y",
    "sampleRate": 0.1,
    "endpoints": {
      "tracking": "https://analytics.example.com/track",
      "events": "https://analytics.example.com/events"
    }
  }
}
```

Access in your plugin:

```typescript
async initialize(config?: PluginConfig) {
  this.trackingId = config.trackingId;
  this.sampleRate = config.sampleRate || 1.0;
  this.endpoints = config.endpoints;
}
```

### Environment Variables

Read from environment:

```typescript
async initialize(config?: PluginConfig) {
  const apiKey = process.env.MY_PLUGIN_API_KEY;
  const endpoint = config.endpoint || process.env.MY_PLUGIN_ENDPOINT;
}
```

## Hot Reload

When `PLUGIN_WATCH=true`, plugins automatically reload when files change:

1. **File Changed**: Plugin is unloaded (cleanup + onUnload)
2. **Module Cache Cleared**: Forces fresh import
3. **Reloaded**: Plugin is initialized again

**Note**: State is lost during reload. Save important data in `onUnload()`.

## Best Practices

### 1. Error Handling

Always wrap operations in try-catch:

```typescript
hooks: {
  async beforeToolExecution(toolName: string, params: any) {
    try {
      return await this.processParams(params);
    } catch (error) {
      logger.error('Failed to process params:', error);
      return params; // Return original params on error
    }
  }
}
```

### 2. Async Operations

Use async/await for all I/O operations:

```typescript
async initialize(config?: PluginConfig) {
  // Good
  await this.loadData();
  await this.connectToService();

  // Bad (blocks event loop)
  this.loadDataSync();
}
```

### 3. Resource Cleanup

Always clean up in the cleanup() method:

```typescript
async cleanup() {
  // Close connections
  if (this.db) await this.db.close();

  // Clear timers
  if (this.interval) clearInterval(this.interval);

  // Remove listeners
  this.removeAllListeners();
}
```

### 4. Performance

- Cache expensive operations
- Use async hooks sparingly
- Don't block tool execution

```typescript
hooks: {
  async afterToolExecution(toolName: string, params: any, result: any) {
    // Good: Fire and forget for logging
    this.logAsync(toolName, params, result).catch(logger.error);

    // Bad: Blocks tool response
    await this.expensiveOperation(result);

    return result;
  }
}
```

### 5. Configuration Validation

Validate config in initialize():

```typescript
async initialize(config?: PluginConfig) {
  if (!config?.apiKey) {
    throw new Error('API key is required');
  }

  if (config.timeout && config.timeout < 1000) {
    throw new Error('Timeout must be >= 1000ms');
  }
}
```

## Examples

### Analytics Plugin

Track tool usage:

```typescript
export default {
  metadata: {
    name: 'analytics',
    version: '1.0.0',
    description: 'Track MCP tool usage'
  },

  async initialize(config) {
    this.analytics = new Analytics(config.trackingId);
  },

  hooks: {
    async afterToolExecution(toolName, params, result) {
      await this.analytics.track('tool_executed', {
        tool: toolName,
        success: !result.error,
        duration: result.duration
      });

      return result;
    }
  }
};
```

### Caching Plugin

Cache expensive operations:

```typescript
export default {
  metadata: {
    name: 'cache',
    version: '1.0.0',
    description: 'Cache tool results'
  },

  async initialize(config) {
    this.cache = new LRUCache({ max: 1000 });
  },

  hooks: {
    async beforeToolExecution(toolName, params) {
      const key = `${toolName}:${JSON.stringify(params)}`;
      const cached = this.cache.get(key);

      if (cached) {
        // Return cached result directly
        return { _cached: true, ...params };
      }

      return params;
    },

    async afterToolExecution(toolName, params, result) {
      if (!params._cached) {
        const key = `${toolName}:${JSON.stringify(params)}`;
        this.cache.set(key, result);
      }

      return result;
    }
  }
};
```

### Rate Limiting Plugin

Prevent abuse:

```typescript
export default {
  metadata: {
    name: 'rate-limiter',
    version: '1.0.0',
    description: 'Rate limit tool calls'
  },

  async initialize(config) {
    this.limits = new Map();
    this.maxPerMinute = config.maxPerMinute || 60;
  },

  hooks: {
    async beforeToolExecution(toolName, params) {
      const key = `${toolName}:${params.userId}`;
      const count = this.limits.get(key) || 0;

      if (count >= this.maxPerMinute) {
        throw new Error('Rate limit exceeded');
      }

      this.limits.set(key, count + 1);

      // Reset after 1 minute
      setTimeout(() => this.limits.delete(key), 60000);

      return params;
    }
  }
};
```

## Testing Plugins

Create a test file:

```typescript
// plugins/my-plugin.test.ts
import { describe, it, expect } from '@jest/globals';
import myPlugin from './my-plugin.js';

describe('MyPlugin', () => {
  it('should initialize', async () => {
    await myPlugin.initialize({ apiKey: 'test' });
    expect(myPlugin.metadata.name).toBe('my-plugin');
  });

  it('should process params', async () => {
    const params = { test: true };
    const result = await myPlugin.hooks.beforeToolExecution('test', params);
    expect(result).toBeDefined();
  });
});
```

## Debugging

Enable debug logging:

```env
MCP_LOG_LEVEL=debug
```

Then check logs:

```typescript
import { logger } from '../utils/logger.js';

logger.debug('Plugin state:', this.state);
logger.info('Processing tool:', toolName);
logger.error('Failed to execute:', error);
```

## Publishing Plugins

1. **Package**: Create an npm package
2. **Document**: Add README with usage instructions
3. **Version**: Follow semver (1.0.0, 1.1.0, 2.0.0)
4. **Publish**: `npm publish`

Users can install:

```bash
npm install my-n8n-mcp-plugin
```

And use:

```javascript
// plugin-config.json
{
  "my-n8n-mcp-plugin": {
    "enabled": true
  }
}
```

## Support

- **Issues**: [GitHub Issues](https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/discussions)
- **Examples**: See `src/plugins/example-plugin.ts`
