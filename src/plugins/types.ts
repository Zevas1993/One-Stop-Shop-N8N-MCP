/**
 * Plugin System Type Definitions
 *
 * Defines the contract for n8n MCP Server plugins
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  license?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  /**
   * Called when the plugin is loaded
   */
  onLoad?(): Promise<void> | void;

  /**
   * Called when the plugin is unloaded
   */
  onUnload?(): Promise<void> | void;

  /**
   * Called before a tool is executed
   */
  beforeToolExecution?(toolName: string, params: any): Promise<any> | any;

  /**
   * Called after a tool is executed
   */
  afterToolExecution?(toolName: string, params: any, result: any): Promise<any> | any;

  /**
   * Called when an error occurs
   */
  onError?(error: Error, context?: any): Promise<void> | void;
}

/**
 * Plugin configuration options
 */
export interface PluginConfig {
  enabled?: boolean;
  [key: string]: any;
}

/**
 * Main plugin interface
 */
export interface Plugin {
  /**
   * Plugin metadata
   */
  metadata: PluginMetadata;

  /**
   * Plugin configuration
   */
  config?: PluginConfig;

  /**
   * Lifecycle hooks
   */
  hooks?: PluginHooks;

  /**
   * Additional MCP tools provided by this plugin
   */
  tools?: Tool[];

  /**
   * Initialize the plugin
   */
  initialize?(config?: PluginConfig): Promise<void> | void;

  /**
   * Cleanup plugin resources
   */
  cleanup?(): Promise<void> | void;
}

/**
 * Plugin loader options
 */
export interface PluginLoaderOptions {
  /**
   * Directory to load plugins from
   */
  pluginDir?: string;

  /**
   * Auto-reload plugins on file changes
   */
  watch?: boolean;

  /**
   * Configuration for each plugin
   */
  pluginConfigs?: Record<string, PluginConfig>;
}

/**
 * Plugin instance with runtime info
 */
export interface LoadedPlugin {
  plugin: Plugin;
  enabled: boolean;
  loadedAt: Date;
  path: string;
}
