import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

interface NodeInfo {
  node_type: string;
  package_name: string;
  display_name: string;
  description?: string;
  category?: string;
  properties_schema?: string;
  operations?: string;
}

/**
 * Live repository that pulls node information directly from running n8n Docker container
 * instead of using a pre-built database. This eliminates memory pressure during startup.
 */
export class LiveDockerRepository {
  private containerName: string;
  private nodeCache: Map<string, NodeInfo> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(containerName: string = 'n8n') {
    this.containerName = containerName;
  }

  /**
   * Execute a command inside the n8n Docker container
   */
  private async execInContainer(command: string): Promise<string> {
    try {
      const dockerCommand = `docker exec ${this.containerName} ${command}`;
      const { stdout, stderr } = await execAsync(dockerCommand);
      
      if (stderr && !stderr.includes('DeprecationWarning')) {
        logger.warn(`Docker exec stderr: ${stderr}`);
      }
      
      return stdout.trim();
    } catch (error) {
      logger.error(`Failed to execute in container ${this.containerName}:`, error);
      throw new Error(`Docker container not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get list of all available nodes from the running container
   */
  async listNodes(options: { category?: string; search?: string; limit?: number } = {}): Promise<NodeInfo[]> {
    // Check cache first
    if (this.cacheExpiry > Date.now() && this.nodeCache.size > 0) {
      return this.filterNodes(Array.from(this.nodeCache.values()), options);
    }

    try {
      // Get node list from n8n container
      const nodeListCommand = `node -e "
        const { NodeTypes } = require('n8n-workflow');
        const { LoadNodesAndCredentials } = require('n8n-core');
        
        async function getNodes() {
          const loadNodesAndCredentials = new LoadNodesAndCredentials();
          await loadNodesAndCredentials.init();
          
          const nodeTypes = loadNodesAndCredentials.getNodeTypes();
          const nodes = [];
          
          for (const [nodeTypeName, nodeType] of Object.entries(nodeTypes)) {
            const description = nodeType.description;
            nodes.push({
              node_type: nodeTypeName,
              package_name: description.packageName || 'n8n-nodes-base',
              display_name: description.displayName,
              description: description.description,
              category: description.group?.[0] || 'Other',
              properties_schema: JSON.stringify(description.properties || []),
              operations: JSON.stringify(description.operations || [])
            });
          }
          
          console.log(JSON.stringify(nodes));
        }
        
        getNodes().catch(console.error);
      "`;

      const output = await this.execInContainer(nodeListCommand);
      const nodes: NodeInfo[] = JSON.parse(output);
      
      // Update cache
      this.nodeCache.clear();
      nodes.forEach(node => {
        this.nodeCache.set(node.node_type, node);
      });
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      
      logger.info(`Loaded ${nodes.length} nodes from Docker container`);
      return this.filterNodes(nodes, options);
      
    } catch (error) {
      logger.error('Failed to get nodes from Docker container:', error);
      
      // Fallback to basic node list if container command fails
      return this.getFallbackNodes(options);
    }
  }

  /**
   * Get specific node information
   */
  async getNode(nodeType: string): Promise<NodeInfo | null> {
    const nodes = await this.listNodes();
    return nodes.find(node => node.node_type === nodeType) || null;
  }

  /**
   * Search nodes by query
   */
  async searchNodes(query: string, limit: number = 20): Promise<NodeInfo[]> {
    const nodes = await this.listNodes();
    const searchTerm = query.toLowerCase();
    
    const matches = nodes.filter(node => 
      node.node_type.toLowerCase().includes(searchTerm) ||
      node.display_name.toLowerCase().includes(searchTerm) ||
      (node.description && node.description.toLowerCase().includes(searchTerm))
    );
    
    return matches.slice(0, limit);
  }

  /**
   * Filter nodes based on options
   */
  private filterNodes(nodes: NodeInfo[], options: { category?: string; search?: string; limit?: number }): NodeInfo[] {
    let filtered = nodes;

    if (options.category) {
      filtered = filtered.filter(node => 
        node.category?.toLowerCase() === options.category?.toLowerCase()
      );
    }

    if (options.search) {
      const searchTerm = options.search.toLowerCase();
      filtered = filtered.filter(node =>
        node.node_type.toLowerCase().includes(searchTerm) ||
        node.display_name.toLowerCase().includes(searchTerm) ||
        (node.description && node.description.toLowerCase().includes(searchTerm))
      );
    }

    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Fallback method when Docker container is not available
   */
  private getFallbackNodes(options: { category?: string; search?: string; limit?: number }): NodeInfo[] {
    const basicNodes: NodeInfo[] = [
      {
        node_type: 'n8n-nodes-base.httpRequest',
        package_name: 'n8n-nodes-base',
        display_name: 'HTTP Request',
        description: 'Makes an HTTP request and returns the response data',
        category: 'Communication'
      },
      {
        node_type: 'n8n-nodes-base.webhook',
        package_name: 'n8n-nodes-base', 
        display_name: 'Webhook',
        description: 'Waits for webhooks and returns the received data',
        category: 'Trigger'
      },
      {
        node_type: 'n8n-nodes-base.code',
        package_name: 'n8n-nodes-base',
        display_name: 'Code',
        description: 'Runs custom JavaScript code',
        category: 'Development'
      }
    ];

    logger.warn('Using fallback node list - Docker container not available');
    return this.filterNodes(basicNodes, options);
  }

  /**
   * Check if Docker container is running
   */
  async isContainerRunning(): Promise<boolean> {
    try {
      await execAsync(`docker ps --filter "name=${this.containerName}" --format "{{.Names}}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cached_nodes: this.nodeCache.size,
      cache_expires_in: Math.max(0, this.cacheExpiry - Date.now()),
      cache_ttl: this.CACHE_TTL
    };
  }
}