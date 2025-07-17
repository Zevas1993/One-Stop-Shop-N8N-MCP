#!/usr/bin/env node

/**
 * Simple Docker-Synchronized n8n MCP Server
 * 
 * Extracts node information directly from the running n8n Docker container
 * on startup to ensure perfect compatibility.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

class SimpleDockerSyncMCP {
  constructor() {
    this.server = new Server(
      { name: 'n8n-docker-sync-simple', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.nodeTypes = null;
    this.containerInfo = null;
    this.n8nVersion = null;
    this.setupHandlers();
  }

  async initialize() {
    try {
      console.log('[Docker Sync] Initializing with Docker container...');

      // Find n8n container
      const containers = await this.findN8nContainers();
      if (containers.length === 0) {
        throw new Error('No running n8n containers found');
      }

      this.containerInfo = containers[0];
      console.log(`[Docker Sync] Using container: ${this.containerInfo.name} (${this.containerInfo.id})`);

      // Get n8n version
      this.n8nVersion = await this.getN8nVersion(this.containerInfo.id);
      console.log(`[Docker Sync] n8n version: ${this.n8nVersion}`);

      // Extract node types from running instance
      await this.extractNodeTypes();
      
      console.log(`[Docker Sync] ✅ Successfully synchronized ${Object.keys(this.nodeTypes).length} node types from Docker container`);

    } catch (error) {
      console.error('[Docker Sync] Initialization failed:', error.message);
      throw error;
    }
  }

  async findN8nContainers() {
    const { stdout } = await execAsync(`docker ps --filter="ancestor=n8nio/n8n" --format="{{.ID}} {{.Names}} {{.Image}} {{.Status}}"`);
    return stdout.trim().split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [id, name, image, ...statusParts] = line.split(' ');
        return { id, name, image, status: statusParts.join(' ') };
      });
  }

  async getN8nVersion(containerId) {
    try {
      const { stdout } = await execAsync(`docker exec ${containerId} n8n --version`);
      return stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  async extractNodeTypes() {
    try {
      const response = await fetch('http://localhost:5678/types/nodes.json');
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      this.nodeTypes = await response.json();
      console.log(`[Docker Sync] Extracted ${Object.keys(this.nodeTypes).length} node types from running n8n instance`);
      
    } catch (error) {
      throw new Error(`Failed to extract node types from n8n API: ${error.message}`);
    }
  }

  setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'docker_sync_status',
          description: 'Get synchronization status with Docker container'
        },
        {
          name: 'list_nodes_from_docker',
          description: 'List all n8n nodes synchronized from Docker container',
          inputSchema: {
            type: 'object',
            properties: {
              search: { type: 'string', description: 'Search term' },
              limit: { type: 'number', description: 'Max results', default: 20 }
            }
          }
        },
        {
          name: 'get_node_from_docker',
          description: 'Get node information directly from Docker-synchronized data',
          inputSchema: {
            type: 'object',
            properties: {
              nodeType: { type: 'string', description: 'Node type (e.g., "n8n-nodes-base.httpRequest")' }
            },
            required: ['nodeType']
          }
        },
        {
          name: 'test_visual_verification',
          description: 'Test visual verification against the Docker n8n instance',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID to test' }
            },
            required: ['workflowId']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'docker_sync_status':
            return await this.handleSyncStatus();
          case 'list_nodes_from_docker':
            return await this.handleListNodes(args);
          case 'get_node_from_docker':
            return await this.handleGetNode(args);
          case 'test_visual_verification':
            return await this.handleTestVisualVerification(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });
  }

  async handleSyncStatus() {
    const status = {
      synchronized: this.nodeTypes !== null,
      containerInfo: this.containerInfo,
      n8nVersion: this.n8nVersion,
      nodeCount: this.nodeTypes ? Object.keys(this.nodeTypes).length : 0,
      syncTime: new Date().toISOString()
    };

    return {
      content: [{
        type: 'text',
        text: `Docker Sync Status:\n\n${JSON.stringify(status, null, 2)}\n\n✅ MCP server is synchronized with Docker container running n8n ${this.n8nVersion}`
      }]
    };
  }

  async handleListNodes(args) {
    const { search = '', limit = 20 } = args || {};
    
    if (!this.nodeTypes) {
      throw new Error('Node types not synchronized yet');
    }

    let nodes = Object.entries(this.nodeTypes);
    
    if (search) {
      const searchLower = search.toLowerCase();
      nodes = nodes.filter(([key, node]) => 
        key.toLowerCase().includes(searchLower) ||
        (node.displayName && node.displayName.toLowerCase().includes(searchLower)) ||
        (node.description && node.description.toLowerCase().includes(searchLower))
      );
    }

    nodes = nodes.slice(0, limit);

    return {
      content: [{
        type: 'text',
        text: `Found ${nodes.length} nodes from Docker n8n ${this.n8nVersion}:\n\n${
          nodes.map(([key, node]) => 
            `- **${key}**: ${node.displayName || 'No name'} - ${(node.description || 'No description').substring(0, 100)}${node.description && node.description.length > 100 ? '...' : ''}`
          ).join('\n')
        }`
      }]
    };
  }

  async handleGetNode(args) {
    const { nodeType } = args;
    
    if (!this.nodeTypes) {
      throw new Error('Node types not synchronized yet');
    }

    const node = this.nodeTypes[nodeType];
    if (!node) {
      return {
        content: [{
          type: 'text',
          text: `Node type "${nodeType}" not found in Docker-synchronized data. Available types: ${Object.keys(this.nodeTypes).length}`
        }]
      };
    }

    // Return essential info about the node
    const nodeInfo = {
      type: nodeType,
      displayName: node.displayName,
      description: node.description,
      group: node.group,
      version: node.version,
      properties: node.properties ? node.properties.length : 0,
      propertiesSample: node.properties ? node.properties.slice(0, 5).map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description
      })) : [],
      sourceContainer: this.containerInfo.name,
      n8nVersion: this.n8nVersion
    };

    return {
      content: [{
        type: 'text',
        text: `Node Information (from Docker ${this.containerInfo.name}):\n\n${JSON.stringify(nodeInfo, null, 2)}`
      }]
    };
  }

  async handleTestVisualVerification(args) {
    const { workflowId } = args;
    
    try {
      console.log(`[Visual Verification] Testing workflow ${workflowId}...`);
      
      // Comprehensive visual verification
      const result = {
        workflowId,
        containerVersion: this.n8nVersion,
        testTime: new Date().toISOString(),
        tests: {}
      };

      // Test 1: HTTP Access
      const workflowUrl = `http://localhost:5678/workflow/${workflowId}`;
      const response = await fetch(workflowUrl);
      result.tests.httpAccess = {
        accessible: response.ok,
        status: response.status,
        contentLength: 0,
        errorPatterns: []
      };

      if (response.ok) {
        const content = await response.text();
        result.tests.httpAccess.contentLength = content.length;
        
        // Check for error patterns in HTML
        const errorPatterns = [
          'could not find property option',
          'property option not found', 
          'configuration error',
          'node configuration error',
          'parameter validation failed',
          'error loading workflow',
          'undefined is not a function',
          'cannot read property'
        ];
        
        result.tests.httpAccess.errorPatterns = errorPatterns.filter(pattern => 
          content.toLowerCase().includes(pattern.toLowerCase())
        );
      }

      // Test 2: API Data Analysis
      try {
        const apiResponse = await fetch(`http://localhost:5678/api/v1/workflows/${workflowId}`, {
          headers: {
            'X-N8N-API-KEY': process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q'
          }
        });
        
        if (apiResponse.ok) {
          const workflowData = await apiResponse.json();
          result.tests.apiAnalysis = {
            accessible: true,
            name: workflowData.name,
            nodeCount: workflowData.nodes ? workflowData.nodes.length : 0,
            active: workflowData.active,
            nodeIssues: []
          };
          
          // Analyze nodes for configuration issues that cause visual errors
          if (workflowData.nodes) {
            for (const node of workflowData.nodes) {
              const issues = [];
              
              // Check for configuration issues that cause "property option" errors
              if (!node.parameters || Object.keys(node.parameters).length === 0) {
                if (!['n8n-nodes-base.start', 'n8n-nodes-base.webhook', 'n8n-nodes-base.manualTrigger'].includes(node.type)) {
                  issues.push('No parameters configured');
                }
              } else {
                // Check for undefined/null values that cause visual errors
                for (const [key, value] of Object.entries(node.parameters)) {
                  if (value === undefined || value === null) {
                    issues.push(`Parameter "${key}" is undefined/null`);
                  }
                  if (typeof value === 'string' && (value.includes('undefined') || value.includes('null'))) {
                    issues.push(`Parameter "${key}" contains undefined/null text`);
                  }
                  
                  // Check for empty objects that might cause property option errors
                  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
                    issues.push(`Parameter "${key}" is empty object`);
                  }
                }
              }
              
              // Check for missing node type in our synchronized data
              const nodeExists = Object.values(this.nodeTypes).some(n => 
                n.displayName === node.type.split('.').pop() || 
                Object.keys(this.nodeTypes).includes(node.type)
              );
              
              if (!nodeExists) {
                issues.push(`Node type "${node.type}" not found in Docker-synchronized nodes`);
              }
              
              if (issues.length > 0) {
                result.tests.apiAnalysis.nodeIssues.push({
                  name: node.name,
                  type: node.type,
                  issues: issues
                });
              }
            }
          }
        } else {
          result.tests.apiAnalysis = {
            accessible: false,
            error: `API returned ${apiResponse.status}`
          };
        }
      } catch (apiError) {
        result.tests.apiAnalysis = {
          accessible: false,
          error: apiError.message
        };
      }

      // Test 3: Docker Container Health
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Check for recent errors in Docker logs
        const { stdout: logs } = await execAsync(`docker logs ${this.containerInfo.id} --tail 20 2>&1 | grep -i "error\\|workflow\\|${workflowId}" || echo "No relevant logs"`);
        
        result.tests.dockerHealth = {
          recentErrors: logs.includes('No relevant logs') ? [] : logs.split('\n').filter(line => line.trim())
        };
      } catch (dockerError) {
        result.tests.dockerHealth = {
          error: dockerError.message
        };
      }

      // Overall assessment
      const hasHttpErrors = result.tests.httpAccess.errorPatterns.length > 0;
      const hasNodeIssues = result.tests.apiAnalysis.nodeIssues && result.tests.apiAnalysis.nodeIssues.length > 0;
      const hasDockerErrors = result.tests.dockerHealth.recentErrors && result.tests.dockerHealth.recentErrors.length > 0;
      
      result.overallStatus = {
        hasIssues: hasHttpErrors || hasNodeIssues || hasDockerErrors,
        summary: hasHttpErrors || hasNodeIssues || hasDockerErrors ? 
          'Issues detected that may cause visual rendering problems' :
          'No obvious issues detected - workflow should render correctly'
      };

      return {
        content: [{
          type: 'text',
          text: `Enhanced Visual Verification Results:\n\n${JSON.stringify(result, null, 2)}\n\n${
            result.overallStatus.hasIssues ? 
              `⚠️ ${result.overallStatus.summary}` : 
              `✅ ${result.overallStatus.summary}`
          }`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Enhanced visual verification failed: ${error.message}`
        }]
      };
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[Docker Sync] MCP Server started with stdio transport');
  }
}

// Start the server
async function main() {
  const server = new SimpleDockerSyncMCP();
  await server.initialize();
  await server.start();
}

main().catch(error => {
  console.error('[Docker Sync] Failed to start:', error.message);
  process.exit(1);
});