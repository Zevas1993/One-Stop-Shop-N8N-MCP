/**
 * Plugin Loader
 *
 * Loads, manages, and hot-reloads plugins
 */

import * as fs from 'fs';
import * as path from 'path';
import { watch } from 'fs';
import { logger } from '../utils/logger.js';
import {
  Plugin,
  PluginLoaderOptions,
  LoadedPlugin,
  PluginConfig,
} from './types.js';

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private options: PluginLoaderOptions;

  constructor(options: PluginLoaderOptions = {}) {
    this.options = {
      pluginDir: options.pluginDir || path.join(process.cwd(), 'plugins'),
      watch: options.watch ?? false,
      pluginConfigs: options.pluginConfigs || {},
    };
  }

  /**
   * Load all plugins from the plugin directory
   */
  async loadPlugins(): Promise<void> {
    const { pluginDir } = this.options;

    if (!fs.existsSync(pluginDir)) {
      logger.info(`Plugin directory does not exist: ${pluginDir}`);
      return;
    }

    const files = fs.readdirSync(pluginDir);

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        const pluginPath = path.join(pluginDir, file);
        await this.loadPlugin(pluginPath);
      }
    }

    if (this.options.watch) {
      this.startWatching();
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Dynamic import for ES modules
      const module = await import(`file://${pluginPath}`);
      const plugin: Plugin = module.default || module;

      if (!this.validatePlugin(plugin)) {
        logger.error(`Invalid plugin at ${pluginPath}`);
        return;
      }

      const pluginName = plugin.metadata.name;
      const config = this.options.pluginConfigs?.[pluginName];

      // Check if plugin is enabled
      const enabled = config?.enabled ?? true;

      if (!enabled) {
        logger.info(`Plugin ${pluginName} is disabled, skipping`);
        return;
      }

      // Initialize plugin
      if (plugin.initialize) {
        await plugin.initialize(config);
      }

      // Call onLoad hook
      if (plugin.hooks?.onLoad) {
        await plugin.hooks.onLoad();
      }

      // Store loaded plugin
      this.plugins.set(pluginName, {
        plugin,
        enabled,
        loadedAt: new Date(),
        path: pluginPath,
      });

      logger.info(`✅ Loaded plugin: ${pluginName} v${plugin.metadata.version}`);
    } catch (error) {
      logger.error(`Failed to load plugin from ${pluginPath}:`, error);
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginName);
    if (!loadedPlugin) {
      return;
    }

    const { plugin } = loadedPlugin;

    try {
      // Call onUnload hook
      if (plugin.hooks?.onUnload) {
        await plugin.hooks.onUnload();
      }

      // Cleanup
      if (plugin.cleanup) {
        await plugin.cleanup();
      }

      this.plugins.delete(pluginName);
      logger.info(`Unloaded plugin: ${pluginName}`);
    } catch (error) {
      logger.error(`Failed to unload plugin ${pluginName}:`, error);
    }
  }

  /**
   * Reload a plugin (unload then load)
   */
  async reloadPlugin(pluginName: string): Promise<void> {
    const loadedPlugin = this.plugins.get(pluginName);
    if (!loadedPlugin) {
      return;
    }

    const pluginPath = loadedPlugin.path;

    logger.info(`Reloading plugin: ${pluginName}`);

    await this.unloadPlugin(pluginName);

    // Clear module cache to force reload
    delete require.cache[require.resolve(pluginPath)];

    await this.loadPlugin(pluginPath);
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all tools from all plugins
   */
  getAllTools() {
    const tools: any[] = [];

    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.plugin.tools) {
        tools.push(...loadedPlugin.plugin.tools);
      }
    }

    return tools;
  }

  /**
   * Execute beforeToolExecution hooks
   */
  async executeBeforeHooks(toolName: string, params: any): Promise<any> {
    let modifiedParams = params;

    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.plugin.hooks?.beforeToolExecution) {
        try {
          const result = await loadedPlugin.plugin.hooks.beforeToolExecution(
            toolName,
            modifiedParams
          );
          if (result !== undefined) {
            modifiedParams = result;
          }
        } catch (error) {
          logger.error(
            `Error in beforeToolExecution hook for plugin ${loadedPlugin.plugin.metadata.name}:`,
            error
          );
        }
      }
    }

    return modifiedParams;
  }

  /**
   * Execute afterToolExecution hooks
   */
  async executeAfterHooks(
    toolName: string,
    params: any,
    result: any
  ): Promise<any> {
    let modifiedResult = result;

    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.plugin.hooks?.afterToolExecution) {
        try {
          const hookResult = await loadedPlugin.plugin.hooks.afterToolExecution(
            toolName,
            params,
            modifiedResult
          );
          if (hookResult !== undefined) {
            modifiedResult = hookResult;
          }
        } catch (error) {
          logger.error(
            `Error in afterToolExecution hook for plugin ${loadedPlugin.plugin.metadata.name}:`,
            error
          );
        }
      }
    }

    return modifiedResult;
  }

  /**
   * Execute onError hooks
   */
  async executeErrorHooks(error: Error, context?: any): Promise<void> {
    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.plugin.hooks?.onError) {
        try {
          await loadedPlugin.plugin.hooks.onError(error, context);
        } catch (hookError) {
          logger.error(
            `Error in onError hook for plugin ${loadedPlugin.plugin.metadata.name}:`,
            hookError
          );
        }
      }
    }
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: any): plugin is Plugin {
    if (!plugin.metadata) {
      logger.error('Plugin missing metadata');
      return false;
    }

    if (!plugin.metadata.name) {
      logger.error('Plugin missing name in metadata');
      return false;
    }

    if (!plugin.metadata.version) {
      logger.error('Plugin missing version in metadata');
      return false;
    }

    return true;
  }

  /**
   * Start watching plugin directory for changes
   */
  private startWatching(): void {
    const { pluginDir } = this.options;

    if (!pluginDir || !fs.existsSync(pluginDir)) {
      return;
    }

    logger.info(`👁️  Watching plugin directory: ${pluginDir}`);

    const watcher = watch(pluginDir, async (eventType, filename) => {
      if (!filename || (!filename.endsWith('.js') && !filename.endsWith('.mjs'))) {
        return;
      }

      const pluginPath = path.join(pluginDir, filename);

      if (eventType === 'change') {
        // Find plugin by path and reload it
        for (const [name, loadedPlugin] of this.plugins.entries()) {
          if (loadedPlugin.path === pluginPath) {
            logger.info(`Plugin file changed: ${filename}`);
            await this.reloadPlugin(name);
            break;
          }
        }
      } else if (eventType === 'rename') {
        // Check if file was added or removed
        if (fs.existsSync(pluginPath)) {
          logger.info(`New plugin detected: ${filename}`);
          await this.loadPlugin(pluginPath);
        } else {
          // File was removed, find and unload plugin
          for (const [name, loadedPlugin] of this.plugins.entries()) {
            if (loadedPlugin.path === pluginPath) {
              logger.info(`Plugin removed: ${filename}`);
              await this.unloadPlugin(name);
              break;
            }
          }
        }
      }
    });

    this.watchers.set(pluginDir, watcher);
  }

  /**
   * Stop watching plugin directory
   */
  stopWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Cleanup all plugins and watchers
   */
  async cleanup(): Promise<void> {
    this.stopWatching();

    for (const pluginName of this.plugins.keys()) {
      await this.unloadPlugin(pluginName);
    }
  }
}
