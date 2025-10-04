/**
 * Example Plugin
 *
 * Demonstrates how to create a plugin for the n8n MCP Server
 */

import { Plugin, PluginConfig } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Example plugin that adds custom logging and a demo tool
 */
const examplePlugin: Plugin = {
  metadata: {
    name: 'example-plugin',
    version: '1.0.0',
    description: 'Example plugin demonstrating the plugin system',
    author: 'n8n MCP Team',
    license: 'MIT',
    keywords: ['example', 'demo'],
  },

  // Initialize the plugin
  async initialize(config?: PluginConfig) {
    logger.info('Example plugin initialized with config:', config);
  },

  // Lifecycle hooks
  hooks: {
    async onLoad() {
      logger.info('Example plugin loaded');
    },

    async onUnload() {
      logger.info('Example plugin unloaded');
    },

    async beforeToolExecution(toolName: string, params: any) {
      logger.info(`[Example Plugin] Before executing tool: ${toolName}`);
      // You can modify params here and return them
      return params;
    },

    async afterToolExecution(toolName: string, params: any, result: any) {
      logger.info(`[Example Plugin] After executing tool: ${toolName}`);
      // You can modify the result here
      return result;
    },

    async onError(error: Error, context?: any) {
      logger.error('[Example Plugin] Error occurred:', error);
      logger.error('[Example Plugin] Context:', context);
    },
  },

  // Additional MCP tools provided by this plugin
  tools: [
    {
      name: 'example_tool',
      description: 'An example tool added by the plugin system',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'A message to process',
          },
        },
        required: ['message'],
      },
    },
  ],

  // Cleanup resources
  async cleanup() {
    logger.info('Example plugin cleanup');
  },
};

export default examplePlugin;
