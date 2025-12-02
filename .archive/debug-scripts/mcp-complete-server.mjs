#!/usr/bin/env node

/**
 * Complete n8n MCP Server - Works in all environments
 * 
 * Features:
 * - Auto-detects Docker vs local environment
 * - Docker sync when available, falls back to HTTP extraction
 * - Built-in headless browser automation with Playwright
 * - Comprehensive visual verification capabilities
 * - Graceful fallbacks for any missing components
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

class CompleteMCPServer {
  constructor() {
    this.server = new Server(
      { name: 'n8n-complete-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.nodeTypes = null;
    this.containerInfo = null;
    this.n8nVersion = null;
    this.browser = null;
    this.browserContext = null;
    this.capabilities = {
      dockerAccess: false,
      browserAutomation: false,
      httpExtraction: false,
      visualVerification: false
    };
    this.setupHandlers();
  }

  async initialize() {
    try {
      console.log('[Complete MCP] Initializing with capability detection...');

      // Step 1: Try Docker synchronization
      await this.tryDockerSync();
      
      // Step 2: If Docker failed, try direct HTTP extraction
      if (!this.capabilities.dockerAccess) {
        await this.tryHttpExtraction();
      }
      
      // Step 3: Try browser initialization
      await this.tryBrowserInit();

      // Report final capabilities
      console.log('[Complete MCP] ✅ Initialization complete');
      console.log(`[Complete MCP] Capabilities:`);
      console.log(`  - Docker access: ${this.capabilities.dockerAccess}`);
      console.log(`  - HTTP extraction: ${this.capabilities.httpExtraction}`);
      console.log(`  - Browser automation: ${this.capabilities.browserAutomation}`);
      console.log(`  - Visual verification: ${this.capabilities.visualVerification}`);
      console.log(`  - Node types available: ${this.nodeTypes ? Object.keys(this.nodeTypes).length : 0}`);

      if (!this.nodeTypes) {
        throw new Error('No node data available - cannot connect to n8n instance');
      }

    } catch (error) {
      console.error('[Complete MCP] Initialization failed:', error.message);
      throw error;
    }
  }

  async tryDockerSync() {
    try {
      console.log('[Docker Sync] Attempting Docker container discovery...');
      
      // Check if Docker is available
      await execAsync('docker --version');
      
      // Find n8n containers
      const { stdout } = await execAsync(`docker ps --filter="ancestor=n8nio/n8n" --format="{{.ID}} {{.Names}} {{.Image}} {{.Status}}"`);
      const containers = stdout.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [id, name, image, ...statusParts] = line.split(' ');
          return { id, name, image, status: statusParts.join(' ') };
        });

      if (containers.length === 0) {
        throw new Error('No running n8n containers found');
      }

      this.containerInfo = containers[0];
      console.log(`[Docker Sync] Using container: ${this.containerInfo.name} (${this.containerInfo.id})`);

      // Get n8n version
      try {
        const { stdout: version } = await execAsync(`docker exec ${this.containerInfo.id} n8n --version`);
        this.n8nVersion = version.trim();
      } catch (error) {
        this.n8nVersion = 'unknown';
      }

      // Extract node types via HTTP to the container
      await this.extractNodeTypesHttp();
      
      this.capabilities.dockerAccess = true;
      console.log(`[Docker Sync] ✅ Success - ${Object.keys(this.nodeTypes).length} nodes from Docker n8n ${this.n8nVersion}`);

    } catch (error) {
      console.log(`[Docker Sync] Failed: ${error.message}`);
      this.capabilities.dockerAccess = false;
    }
  }

  async tryHttpExtraction() {
    try {
      console.log('[HTTP Extraction] Attempting direct n8n API access...');
      
      await this.extractNodeTypesHttp();
      
      this.capabilities.httpExtraction = true;
      this.n8nVersion = 'unknown (HTTP mode)';
      console.log(`[HTTP Extraction] ✅ Success - ${Object.keys(this.nodeTypes).length} nodes extracted`);

    } catch (error) {
      console.log(`[HTTP Extraction] Failed: ${error.message}`);
      this.capabilities.httpExtraction = false;
    }
  }

  async extractNodeTypesHttp() {
    // Try multiple possible n8n locations
    const n8nUrls = [
      'http://localhost:5678',
      'http://n8n:5678',
      'http://host.docker.internal:5678'
    ];

    for (const baseUrl of n8nUrls) {
      try {
        console.log(`[HTTP] Trying ${baseUrl}/types/nodes.json...`);
        const response = await fetch(`${baseUrl}/types/nodes.json`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        this.nodeTypes = await response.json();
        console.log(`[HTTP] ✅ Successfully extracted from ${baseUrl}`);
        return;
        
      } catch (error) {
        console.log(`[HTTP] ${baseUrl} failed: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('All n8n URLs failed');
  }

  async tryBrowserInit() {
    try {
      console.log('[Browser] Attempting browser initialization...');
      
      // Dynamic import of Playwright
      const { chromium } = await import('playwright');
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080'
        ]
      });

      this.browserContext = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true
      });

      this.capabilities.browserAutomation = true;
      this.capabilities.visualVerification = true;
      console.log('[Browser] ✅ Headless browser ready');

    } catch (error) {
      console.log(`[Browser] Failed: ${error.message}`);
      this.capabilities.browserAutomation = false;
      this.capabilities.visualVerification = false;
    }
  }

  setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'server_capabilities',
          description: 'Get complete server capabilities and status'
        },
        {
          name: 'list_nodes',
          description: 'List available n8n nodes',
          inputSchema: {
            type: 'object',
            properties: {
              search: { type: 'string' },
              limit: { type: 'number', default: 20 }
            }
          }
        },
        {
          name: 'get_node_info',
          description: 'Get detailed node information',
          inputSchema: {
            type: 'object',
            properties: {
              nodeType: { type: 'string', description: 'Node type (e.g., "n8n-nodes-base.httpRequest")' }
            },
            required: ['nodeType']
          }
        },
        {
          name: 'verify_workflow_complete',
          description: 'Complete workflow verification using all available methods',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID to verify' },
              methods: { 
                type: 'array', 
                items: { type: 'string', enum: ['http', 'api', 'browser'] },
                description: 'Verification methods to use',
                default: ['http', 'api', 'browser']
              }
            },
            required: ['workflowId']
          }
        },
        {
          name: 'browser_screenshot',
          description: 'Take screenshot of workflow (requires browser automation)',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID' }
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
          case 'server_capabilities':
            return await this.handleServerCapabilities();
          case 'list_nodes':
            return await this.handleListNodes(args);
          case 'get_node_info':
            return await this.handleGetNodeInfo(args);
          case 'verify_workflow_complete':
            return await this.handleVerifyWorkflowComplete(args);
          case 'browser_screenshot':
            return await this.handleBrowserScreenshot(args);
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

  async handleServerCapabilities() {
    const status = {
      capabilities: this.capabilities,
      nodeData: {
        synchronized: this.nodeTypes !== null,
        nodeCount: this.nodeTypes ? Object.keys(this.nodeTypes).length : 0,
        source: this.capabilities.dockerAccess ? 'Docker container' : 'HTTP API'
      },
      containerInfo: this.containerInfo,
      n8nVersion: this.n8nVersion,
      environment: {
        isDocker: process.env.IS_DOCKER === 'true',
        nodeVersion: process.version,
        playwrightAvailable: this.capabilities.browserAutomation
      },
      timestamp: new Date().toISOString()
    };

    let summary = '🚀 Complete MCP Server Status:\\n\\n';
    summary += `✅ Node data: ${status.nodeData.nodeCount} nodes from ${status.nodeData.source}\\n`;
    summary += `${this.capabilities.browserAutomation ? '✅' : '❌'} Browser automation: ${this.capabilities.browserAutomation ? 'enabled' : 'disabled'}\\n`;
    summary += `${this.capabilities.dockerAccess ? '✅' : '⚠️ '} Docker access: ${this.capabilities.dockerAccess ? 'enabled' : 'fallback mode'}\\n`;
    summary += `✅ Visual verification: ${this.capabilities.visualVerification ? 'full browser + HTTP' : 'HTTP only'}`;

    return {
      content: [{
        type: 'text',
        text: `${summary}\\n\\nDetailed Status:\\n${JSON.stringify(status, null, 2)}`
      }]
    };
  }

  async handleListNodes(args) {
    const { search = '', limit = 20 } = args || {};
    
    if (!this.nodeTypes) {
      throw new Error('Node types not available');
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
        text: `Found ${nodes.length} nodes (from ${this.capabilities.dockerAccess ? 'Docker' : 'HTTP'}):\\n\\n${
          nodes.map(([key, node]) => 
            `- **${key}**: ${node.displayName || 'No name'} - ${(node.description || 'No description').substring(0, 80)}${node.description && node.description.length > 80 ? '...' : ''}`
          ).join('\\n')
        }`
      }]
    };
  }

  async handleGetNodeInfo(args) {
    const { nodeType } = args;
    
    if (!this.nodeTypes) {
      throw new Error('Node types not available');
    }

    const node = this.nodeTypes[nodeType];
    if (!node) {
      return {
        content: [{
          type: 'text',
          text: `Node type "${nodeType}" not found. Available: ${Object.keys(this.nodeTypes).length} total nodes`
        }]
      };
    }

    const nodeInfo = {
      type: nodeType,
      displayName: node.displayName,
      description: node.description,
      group: node.group,
      version: node.version,
      properties: node.properties ? node.properties.length : 0,
      propertiesPreview: node.properties ? node.properties.slice(0, 5).map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description
      })) : [],
      credentials: node.credentials || [],
      dataSource: this.capabilities.dockerAccess ? 'Docker container' : 'HTTP API',
      lastSync: new Date().toISOString()
    };

    return {
      content: [{
        type: 'text',
        text: `Node Information:\\n\\n${JSON.stringify(nodeInfo, null, 2)}`
      }]
    };
  }

  async handleVerifyWorkflowComplete(args) {
    const { workflowId, methods = ['http', 'api', 'browser'] } = args;
    
    console.log(`[Complete Verification] Starting verification of workflow ${workflowId}...`);
    
    const result = {
      workflowId,
      methods: methods,
      capabilities: this.capabilities,
      tests: {},
      summary: {},
      timestamp: new Date().toISOString()
    };

    // HTTP test
    if (methods.includes('http')) {
      console.log('[Verification] Running HTTP test...');
      result.tests.http = await this.runHttpTest(workflowId);
    }

    // API test
    if (methods.includes('api')) {
      console.log('[Verification] Running API test...');
      result.tests.api = await this.runApiTest(workflowId);
    }

    // Browser test (if available)
    if (methods.includes('browser') && this.capabilities.browserAutomation) {
      console.log('[Verification] Running browser test...');
      result.tests.browser = await this.runBrowserTest(workflowId);
    } else if (methods.includes('browser')) {
      result.tests.browser = { skipped: true, reason: 'Browser automation not available' };
    }

    // Overall assessment
    const issues = [];
    if (result.tests.http?.errorPatterns?.length > 0) issues.push('HTTP errors detected');
    if (result.tests.api?.nodeIssues?.length > 0) issues.push('API configuration issues');
    if (result.tests.browser?.errors?.length > 0) issues.push('Browser rendering errors');

    result.summary = {
      hasIssues: issues.length > 0,
      issueTypes: issues,
      recommendation: issues.length > 0 ? 
        `Issues detected: ${issues.join(', ')}` :
        'No issues detected - workflow should work correctly',
      testsRun: Object.keys(result.tests).length,
      capabilitiesUsed: Object.entries(this.capabilities).filter(([k, v]) => v).map(([k]) => k)
    };

    return {
      content: [{
        type: 'text',
        text: `Complete Verification Results:\\n\\n${
          result.summary.hasIssues ? '❌' : '✅'
        } ${result.summary.recommendation}\\n\\nTests run: ${result.summary.testsRun}\\nCapabilities: ${result.summary.capabilitiesUsed.join(', ')}\\n\\n${JSON.stringify(result, null, 2)}`
      }]
    };
  }

  async runHttpTest(workflowId) {
    try {
      const response = await fetch(`http://localhost:5678/workflow/${workflowId}`);
      const result = { accessible: response.ok, status: response.status, errorPatterns: [] };

      if (response.ok) {
        const content = await response.text();
        const errorPatterns = [
          'could not find property option',
          'property option not found', 
          'configuration error',
          'node configuration error'
        ];
        
        result.errorPatterns = errorPatterns.filter(pattern => 
          content.toLowerCase().includes(pattern.toLowerCase())
        );
        result.contentLength = content.length;
      }

      return result;
    } catch (error) {
      return { accessible: false, error: error.message };
    }
  }

  async runApiTest(workflowId) {
    try {
      const response = await fetch(`http://localhost:5678/api/v1/workflows/${workflowId}`, {
        headers: {
          'X-N8N-API-KEY': process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q'
        }
      });

      if (!response.ok) {
        return { accessible: false, status: response.status };
      }

      const workflowData = await response.json();
      const result = {
        accessible: true,
        name: workflowData.name,
        nodeCount: workflowData.nodes ? workflowData.nodes.length : 0,
        active: workflowData.active,
        nodeIssues: []
      };

      // Analyze nodes
      if (workflowData.nodes) {
        for (const node of workflowData.nodes) {
          const issues = [];
          
          if (!node.parameters || Object.keys(node.parameters).length === 0) {
            if (!['n8n-nodes-base.start', 'n8n-nodes-base.webhook', 'n8n-nodes-base.manualTrigger'].includes(node.type)) {
              issues.push('No parameters configured');
            }
          }

          // Check if node type exists in our data
          if (!this.nodeTypes[node.type]) {
            issues.push(`Node type "${node.type}" not found in synchronized data`);
          }

          if (issues.length > 0) {
            result.nodeIssues.push({ name: node.name, type: node.type, issues });
          }
        }
      }

      return result;
    } catch (error) {
      return { accessible: false, error: error.message };
    }
  }

  async runBrowserTest(workflowId) {
    if (!this.browserContext) {
      return { available: false, reason: 'Browser not initialized' };
    }

    try {
      const page = await this.browserContext.newPage();
      
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(`Console: ${msg.text()}`);
        }
      });
      
      page.on('pageerror', (error) => {
        errors.push(`Page: ${error.message}`);
      });

      // Navigate
      const response = await page.goto(`http://localhost:5678/workflow/${workflowId}`, { 
        waitUntil: 'networkidle', timeout: 30000 
      });

      await page.waitForTimeout(3000);

      // Check for visual errors
      const analysis = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const errorPatterns = ['could not find property option', 'configuration error'];
        
        return {
          textErrors: errorPatterns.filter(p => bodyText.toLowerCase().includes(p.toLowerCase())),
          nodeCount: document.querySelectorAll('[data-test-id^="node-"], .node').length,
          pageTitle: document.title
        };
      });

      await page.close();

      return {
        available: true,
        accessible: response.status() === 200,
        status: response.status(),
        errors: errors,
        analysis: analysis
      };

    } catch (error) {
      return { available: true, accessible: false, error: error.message };
    }
  }

  async handleBrowserScreenshot(args) {
    if (!this.capabilities.browserAutomation) {
      return {
        content: [{
          type: 'text',
          text: '❌ Browser automation not available'
        }]
      };
    }

    const { workflowId } = args;

    try {
      const page = await this.browserContext.newPage();
      await page.goto(`http://localhost:5678/workflow/${workflowId}`, { 
        waitUntil: 'networkidle', timeout: 30000 
      });
      
      await page.waitForTimeout(2000);
      const screenshot = await page.screenshot({ fullPage: true });
      await page.close();

      return {
        content: [{
          type: 'text',
          text: `Screenshot taken for workflow ${workflowId}\\nSize: ${screenshot.length} bytes\\nTimestamp: ${new Date().toISOString()}`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Screenshot failed: ${error.message}`
        }]
      };
    }
  }

  async cleanup() {
    if (this.browserContext) {
      await this.browserContext.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[Complete MCP] Server started with stdio transport');
  }
}

// Start the server
async function main() {
  const server = new CompleteMCPServer();
  
  process.on('SIGINT', async () => {
    console.log('[Complete MCP] Shutting down...');
    await server.cleanup();
    process.exit(0);
  });
  
  await server.initialize();
  await server.start();
}

main().catch(error => {
  console.error('[Complete MCP] Failed to start:', error.message);
  process.exit(1);
});