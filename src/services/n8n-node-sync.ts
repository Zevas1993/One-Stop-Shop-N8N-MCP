import { N8nApiClient } from './n8n-api-client';
import { NodeRepository } from '../database/node-repository';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface SyncResult {
  synced: boolean;
  version: string;
  method?: 'version-match' | 'docker' | 'npm' | 'skip';
  nodesCount?: number;
}

export interface VersionDetectionResult {
  version: string;
  source: 'api' | 'docker' | 'npm' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * N8nNodeSync - Synchronizes MCP node database with connected n8n instance
 *
 * Challenge: n8n has NO API to list available node types
 * Solution: Multi-pronged approach:
 * 1. Detect n8n instance version via health check API
 * 2. Match version to known node catalog (version mapping)
 * 3. Trigger rebuild if version mismatch detected
 * 4. Fallback to Docker/NPM extraction if needed
 */
export class N8nNodeSync {
  private n8nClient: N8nApiClient;
  private nodeRepo: NodeRepository;

  constructor(n8nClient: N8nApiClient, nodeRepo: NodeRepository) {
    this.n8nClient = n8nClient;
    this.nodeRepo = nodeRepo;
  }

  /**
   * Detect n8n instance version
   * Uses multiple methods in order of reliability
   */
  async detectInstanceVersion(): Promise<VersionDetectionResult> {
    // Method 1: Try n8n health check API (most reliable)
    try {
      const health = await this.n8nClient.healthCheck();
      if (health.n8nVersion) {
        logger.info(`Detected n8n version from API: ${health.n8nVersion}`);
        return {
          version: health.n8nVersion,
          source: 'api',
          confidence: 'high'
        };
      }
    } catch (error) {
      logger.warn('Could not detect version from n8n API health check');
    }

    // Method 2: Try Docker inspection (for containerized n8n)
    try {
      const dockerVersion = await this.detectDockerVersion();
      if (dockerVersion) {
        logger.info(`Detected n8n version from Docker: ${dockerVersion}`);
        return {
          version: dockerVersion,
          source: 'docker',
          confidence: 'medium'
        };
      }
    } catch (error) {
      logger.debug('Docker version detection failed (not in Docker environment?)');
    }

    // Method 3: Try local npm package (for NPX installations)
    try {
      const npmVersion = await this.detectNpmVersion();
      if (npmVersion) {
        logger.info(`Detected n8n version from local npm: ${npmVersion}`);
        return {
          version: npmVersion,
          source: 'npm',
          confidence: 'medium'
        };
      }
    } catch (error) {
      logger.warn('Could not detect version from local npm packages');
    }

    // Fallback: return unknown
    logger.warn('Could not detect n8n instance version from any source');
    return {
      version: 'unknown',
      source: 'unknown',
      confidence: 'low'
    };
  }

  /**
   * Detect version from Docker container
   */
  private async detectDockerVersion(): Promise<string | null> {
    try {
      // Try to read package.json from n8n container
      // Common container names: n8n, n8n-container, n8n_n8n_1
      const containerNames = ['n8n', 'n8n-container', 'n8n_n8n_1'];

      for (const containerName of containerNames) {
        try {
          const { stdout } = await execAsync(
            `docker exec ${containerName} cat /usr/local/lib/node_modules/n8n/package.json`
          );
          const packageJson = JSON.parse(stdout);
          return packageJson.version;
        } catch {
          // Try next container name
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect version from local npm installation
   */
  private async detectNpmVersion(): Promise<string | null> {
    try {
      // Try to read local node_modules/n8n/package.json
      const packageJsonPath = path.join(process.cwd(), 'node_modules', 'n8n', 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      return packageJson.version;
    } catch (error) {
      return null;
    }
  }

  /**
   * Main sync method - checks if database needs update and triggers rebuild
   */
  async syncToInstance(): Promise<SyncResult> {
    logger.info('Checking n8n instance node synchronization...');

    // Detect instance version
    const detection = await this.detectInstanceVersion();

    if (detection.confidence === 'low' || detection.version === 'unknown') {
      logger.warn('⚠️  Could not reliably detect n8n version - using existing database');
      logger.warn('   To enable auto-sync, ensure N8N_API_URL and N8N_API_KEY are set');
      return {
        synced: false,
        version: 'unknown',
        method: 'skip'
      };
    }

    // Check current database version
    const currentDbVersion = await this.nodeRepo.getDbVersion();

    logger.info(`Instance version: ${detection.version} (${detection.source})`);
    logger.info(`Database version: ${currentDbVersion || 'not set'}`);

    // Version match - no sync needed
    if (currentDbVersion === detection.version) {
      logger.info('✅ Node database is already up-to-date');
      return {
        synced: false,
        version: currentDbVersion,
        method: 'version-match'
      };
    }

    // Version mismatch - trigger rebuild
    logger.info(`🔄 Version mismatch detected - triggering node database rebuild`);
    logger.info(`   Rebuilding for n8n ${detection.version}...`);

    const rebuildResult = await this.rebuildForVersion(detection.version, detection.source);

    if (rebuildResult.success) {
      logger.info(`✅ Node database synchronized with n8n ${detection.version}`);
      logger.info(`   Loaded ${rebuildResult.nodesCount} nodes`);

      return {
        synced: true,
        version: detection.version,
        method: rebuildResult.method as 'docker' | 'npm',
        nodesCount: rebuildResult.nodesCount
      };
    } else {
      logger.error(`❌ Failed to rebuild node database: ${rebuildResult.error}`);
      logger.warn('   Continuing with existing database');

      return {
        synced: false,
        version: currentDbVersion || 'unknown',
        method: 'skip'
      };
    }
  }

  /**
   * Trigger database rebuild for specific n8n version
   */
  private async rebuildForVersion(
    version: string,
    source: 'api' | 'docker' | 'npm' | 'unknown'
  ): Promise<{ success: boolean; nodesCount?: number; method?: string; error?: string }> {
    try {
      // Different rebuild strategies based on source
      switch (source) {
        case 'docker':
          return await this.rebuildFromDocker(version);

        case 'npm':
        case 'api':
          return await this.rebuildFromNpm(version);

        default:
          return {
            success: false,
            error: `Unknown source: ${source}`
          };
      }
    } catch (error) {
      logger.error(`Error during rebuild: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Rebuild database from Docker container
   */
  private async rebuildFromDocker(version: string): Promise<{
    success: boolean;
    nodesCount?: number;
    method?: string;
    error?: string;
  }> {
    try {
      logger.info('Attempting to rebuild from Docker container...');

      // Use npm run db:rebuild which supports Docker extraction
      const { stdout, stderr } = await execAsync('npm run db:rebuild', {
        env: {
          ...process.env,
          N8N_VERSION_OVERRIDE: version
        },
        timeout: 300000 // 5 minutes
      });

      if (stderr && !stderr.includes('deprecated')) {
        logger.warn(`Rebuild warnings: ${stderr}`);
      }

      // Count nodes in database
      const nodesCount = await this.nodeRepo.getTotalCount();

      return {
        success: true,
        nodesCount,
        method: 'docker'
      };
    } catch (error) {
      logger.error(`Docker rebuild failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Rebuild database from local npm packages
   */
  private async rebuildFromNpm(version: string): Promise<{
    success: boolean;
    nodesCount?: number;
    method?: string;
    error?: string;
  }> {
    try {
      logger.info('Attempting to rebuild from local npm packages...');

      // Run npm rebuild command
      const { stdout, stderr } = await execAsync('npm run db:rebuild', {
        env: {
          ...process.env,
          N8N_VERSION_OVERRIDE: version
        },
        timeout: 300000 // 5 minutes
      });

      if (stderr && !stderr.includes('deprecated')) {
        logger.warn(`Rebuild warnings: ${stderr}`);
      }

      // Update database version metadata
      await this.nodeRepo.setDbVersion(version);

      // Count nodes in database
      const nodesCount = await this.nodeRepo.getTotalCount();

      return {
        success: true,
        nodesCount,
        method: 'npm'
      };
    } catch (error) {
      logger.error(`NPM rebuild failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Notify GraphRAG that node catalog has changed
   * This invalidates caches and triggers knowledge graph update
   */
  async notifyGraphRAG(): Promise<void> {
    try {
      logger.info('Notifying GraphRAG of node catalog changes...');

      // Import GraphRAG bridge dynamically to avoid circular dependencies
      const { GraphRAGBridge } = await import('../ai/graphrag-bridge');
      const bridge = GraphRAGBridge.get();

      // Invalidate cache
      await bridge.invalidateCache();

      logger.info('GraphRAG cache invalidated successfully');

      // Note: Full knowledge graph rebuild will happen on next query
      // due to cache miss. This is more efficient than rebuilding immediately.
    } catch (error) {
      logger.warn(`Could not notify GraphRAG: ${error}`);
      logger.warn('GraphRAG knowledge may be stale until next cache invalidation');
    }
  }

  /**
   * Build node catalog from existing workflows (fallback method)
   * Used when version detection fails
   */
  async buildNodeCatalogFromWorkflows(): Promise<Set<string>> {
    logger.info('Building node catalog from existing workflows (fallback method)...');

    try {
      const workflows = await this.n8nClient.listWorkflows({ limit: 1000 });
      const usedNodeTypes = new Set<string>();

      for (const workflow of workflows.data) {
        try {
          const workflowId = workflow.id;
          if (!workflowId) continue;

          const full = await this.n8nClient.getWorkflow(workflowId);
          for (const node of full.nodes) {
            usedNodeTypes.add(node.type);
          }
        } catch (error) {
          logger.debug(`Could not fetch workflow ${workflow.id}: ${error}`);
        }
      }

      logger.info(`Found ${usedNodeTypes.size} unique node types in ${workflows.data.length} workflows`);

      return usedNodeTypes;
    } catch (error) {
      logger.error(`Failed to build node catalog from workflows: ${error}`);
      return new Set<string>();
    }
  }
}
