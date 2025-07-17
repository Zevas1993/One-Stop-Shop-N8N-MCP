#!/usr/bin/env node

/**
 * Complete n8n MCP Server with Docker Sync + Browser Automation
 * 
 * Features:
 * - Docker synchronization with running n8n instance (833 nodes)
 * - Built-in headless browser automation with Playwright
 * - Visual verification that can detect browser-only rendering errors
 * - Graceful fallback to HTTP-only mode if browser fails
 * - Ready for Docker deployment with all dependencies included
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

class CompleteMCPBrowserServer {
  constructor() {
    this.server = new Server(
      { name: 'n8n-complete-browser-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.nodeTypes = null;
    this.containerInfo = null;
    this.n8nVersion = null;
    this.browser = null;
    this.browserContext = null;
    this.browserAvailable = false;
    this.setupHandlers();
  }

  async initialize() {
    try {
      console.log('[Complete MCP] Initializing with Docker + Browser...');

      // Step 1: Docker synchronization
      await this.initializeDockerSync();
      
      // Step 2: Browser initialization (graceful fallback)
      await this.initializeBrowser();

      console.log('[Complete MCP] ✅ Initialization complete');
      console.log(`[Complete MCP] - Docker sync: ${this.nodeTypes ? Object.keys(this.nodeTypes).length : 0} nodes`);
      console.log(`[Complete MCP] - Browser automation: ${this.browserAvailable ? 'enabled' : 'disabled (HTTP-only mode)'}`);

    } catch (error) {
      console.error('[Complete MCP] Initialization failed:', error.message);
      throw error;
    }
  }

  async initializeDockerSync() {
    console.log('[Docker Sync] Finding n8n container...');
    
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
    console.log(`[Docker Sync] ✅ Synchronized ${Object.keys(this.nodeTypes).length} node types`);
  }

  async initializeBrowser() {
    try {
      console.log('[Browser] Initializing headless browser...');
      
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

      this.browserAvailable = true;
      console.log('[Browser] ✅ Headless browser ready');

    } catch (error) {
      console.warn('[Browser] Browser initialization failed, continuing in HTTP-only mode:', error.message);
      this.browser = null;
      this.browserContext = null;
      this.browserAvailable = false;
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
      
    } catch (error) {
      throw new Error(`Failed to extract node types: ${error.message}`);
    }
  }

  setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'server_status',
          description: 'Get complete server status (Docker sync + Browser automation)'
        },
        {
          name: 'list_nodes_from_docker',
          description: 'List nodes synchronized from Docker container',
          inputSchema: {
            type: 'object',
            properties: {
              search: { type: 'string' },
              limit: { type: 'number', default: 20 }
            }
          }
        },
        {
          name: 'get_node_from_docker',
          description: 'Get detailed node information from Docker-synchronized data',
          inputSchema: {
            type: 'object',
            properties: {
              nodeType: { type: 'string', description: 'Node type (e.g., "n8n-nodes-base.httpRequest")' }
            },
            required: ['nodeType']
          }
        },
        {
          name: 'verify_workflow_visual',
          description: 'Complete visual verification using Docker sync + browser automation',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID to verify' },
              skipBrowser: { type: 'boolean', description: 'Skip browser automation, use HTTP-only', default: false }
            },
            required: ['workflowId']
          }
        },
        {
          name: 'navigate_to_workflow',
          description: 'Navigate browser to specific workflow (requires browser automation)',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID' },
              takeScreenshot: { type: 'boolean', default: false }
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
          case 'server_status':
            return await this.handleServerStatus();
          case 'list_nodes_from_docker':
            return await this.handleListNodes(args);
          case 'get_node_from_docker':
            return await this.handleGetNode(args);
          case 'verify_workflow_visual':
            return await this.handleVerifyWorkflowVisual(args);
          case 'navigate_to_workflow':
            return await this.handleNavigateToWorkflow(args);
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

  async handleServerStatus() {
    const status = {
      dockerSync: {
        synchronized: this.nodeTypes !== null,
        containerInfo: this.containerInfo,
        n8nVersion: this.n8nVersion,
        nodeCount: this.nodeTypes ? Object.keys(this.nodeTypes).length : 0
      },
      browserAutomation: {
        available: this.browserAvailable,
        playwrightReady: this.browser !== null && this.browserContext !== null
      },
      capabilities: {
        dockerExtraction: true,
        httpVerification: true,
        browserVerification: this.browserAvailable,
        visualErrorDetection: this.browserAvailable,
        realTimeSync: true
      },
      environment: {
        isDocker: process.env.IS_DOCKER === 'true',
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      }
    };

    return {
      content: [{
        type: 'text',
        text: `Complete MCP Server Status:\\n\\n${JSON.stringify(status, null, 2)}\\n\\n${
          status.browserAutomation.available 
            ? '✅ Full browser verification available' 
            : '⚠️ Browser verification unavailable - HTTP-only mode'
        }\\n${
          status.dockerSync.synchronized
            ? `✅ Live sync with Docker n8n ${status.dockerSync.n8nVersion} (${status.dockerSync.nodeCount} nodes)`
            : '❌ Docker sync failed'
        }`
      }]
    };
  }

  async handleListNodes(args) {
    const { search = '', limit = 20 } = args || {};
    
    if (!this.nodeTypes) {
      throw new Error('Node types not synchronized');
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
        text: `Found ${nodes.length} nodes from Docker n8n ${this.n8nVersion}:\\n\\n${
          nodes.map(([key, node]) => 
            `- **${key}**: ${node.displayName || 'No name'} - ${(node.description || 'No description').substring(0, 100)}${node.description && node.description.length > 100 ? '...' : ''}`
          ).join('\\n')
        }`
      }]
    };
  }

  async handleGetNode(args) {
    const { nodeType } = args;
    
    if (!this.nodeTypes) {
      throw new Error('Node types not synchronized');
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

    // Return comprehensive node info
    const nodeInfo = {
      type: nodeType,
      displayName: node.displayName,
      description: node.description,
      group: node.group,
      version: node.version,
      properties: node.properties ? node.properties.length : 0,
      propertiesDetailed: node.properties ? node.properties.slice(0, 10).map(p => ({
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description,
        default: p.default
      })) : [],
      credentials: node.credentials || [],
      sourceContainer: this.containerInfo.name,
      n8nVersion: this.n8nVersion,
      syncTime: new Date().toISOString()
    };

    return {
      content: [{
        type: 'text',
        text: `Node Information (from Docker ${this.containerInfo.name}):\\n\\n${JSON.stringify(nodeInfo, null, 2)}`
      }]
    };
  }

  async handleVerifyWorkflowVisual(args) {
    const { workflowId, skipBrowser = false } = args;
    
    console.log(`[Visual Verification] Starting verification of workflow ${workflowId}...`);
    
    const result = {
      workflowId,
      verification: {
        dockerSync: true,
        browserAutomation: this.browserAvailable && !skipBrowser
      },
      tests: {},
      summary: {}
    };

    try {
      // Test 1: HTTP Access
      console.log('[Visual Verification] Running HTTP access test...');
      const httpResult = await this.runHttpTest(workflowId);
      result.tests.httpAccess = httpResult;

      // Test 2: API Analysis
      console.log('[Visual Verification] Running API analysis...');
      const apiResult = await this.runApiTest(workflowId);
      result.tests.apiAnalysis = apiResult;

      // Test 3: Browser Verification (if available)
      if (this.browserAvailable && !skipBrowser) {
        console.log('[Visual Verification] Running browser automation test...');
        const browserResult = await this.runBrowserTest(workflowId);
        result.tests.browserVerification = browserResult;
      } else {
        result.tests.browserVerification = {
          skipped: true,
          reason: skipBrowser ? 'Skipped by request' : 'Browser not available'
        };
      }

      // Overall assessment
      const hasHttpErrors = result.tests.httpAccess.errorPatterns?.length > 0;
      const hasApiErrors = result.tests.apiAnalysis.nodeIssues?.length > 0;
      const hasBrowserErrors = result.tests.browserVerification.errors?.length > 0 || 
                              result.tests.browserVerification.visualErrors?.length > 0;

      result.summary = {
        hasIssues: hasHttpErrors || hasApiErrors || hasBrowserErrors,
        issueTypes: {
          httpErrors: hasHttpErrors,
          apiErrors: hasApiErrors, 
          browserErrors: hasBrowserErrors
        },
        recommendation: hasHttpErrors || hasApiErrors || hasBrowserErrors ?
          'Issues detected - workflow may not render correctly' :
          'No issues detected - workflow should work correctly',
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: `Complete Visual Verification Results:\\n\\n${JSON.stringify(result, null, 2)}\\n\\n${
            result.summary.hasIssues 
              ? `❌ ${result.summary.recommendation}` 
              : `✅ ${result.summary.recommendation}`
          }`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Visual verification failed: ${error.message}`
        }]
      };
    }
  }

  async runHttpTest(workflowId) {
    try {
      const response = await fetch(`http://localhost:5678/workflow/${workflowId}`);
      const result = {
        accessible: response.ok,
        status: response.status,
        errorPatterns: []
      };

      if (response.ok) {
        const content = await response.text();
        const errorPatterns = [
          'could not find property option',
          'property option not found',
          'configuration error',
          'node configuration error',
          'parameter validation failed'
        ];
        
        result.errorPatterns = errorPatterns.filter(pattern => 
          content.toLowerCase().includes(pattern.toLowerCase())
        );
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
        nodeIssues: []
      };

      // Analyze nodes for configuration issues
      if (workflowData.nodes) {
        for (const node of workflowData.nodes) {
          const issues = [];
          
          if (!node.parameters || Object.keys(node.parameters).length === 0) {
            if (!['n8n-nodes-base.start', 'n8n-nodes-base.webhook', 'n8n-nodes-base.manualTrigger'].includes(node.type)) {
              issues.push('No parameters configured');
            }
          } else {
            for (const [key, value] of Object.entries(node.parameters)) {
              if (value === undefined || value === null) {
                issues.push(`Parameter "${key}" is undefined/null`);
              }
            }
          }

          // Check if node type exists in our Docker-synchronized data
          if (!this.nodeTypes[node.type]) {
            issues.push(`Node type "${node.type}" not found in Docker-synchronized nodes`);
          }

          if (issues.length > 0) {
            result.nodeIssues.push({
              name: node.name,
              type: node.type,
              issues: issues
            });
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
      return { available: false, reason: 'Browser context not initialized' };
    }

    try {
      const page = await this.browserContext.newPage();
      
      // Set up error detection
      const errors = [];
      const consoleMessages = [];
      
      page.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push(`${msg.type()}: ${text}`);
        if (msg.type() === 'error') {
          errors.push(`Console Error: ${text}`);
        }
      });
      
      page.on('pageerror', (error) => {
        errors.push(`Page Error: ${error.message}`);
      });

      // Navigate to workflow
      const workflowUrl = `http://localhost:5678/workflow/${workflowId}`;
      const response = await page.goto(workflowUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Wait for rendering
      await page.waitForTimeout(5000);

      // Check for visual errors
      const visualAnalysis = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        
        const errorPatterns = [
          'could not find property option',
          'property option not found',
          'configuration error'
        ];
        
        const foundErrors = [];
        for (const pattern of errorPatterns) {
          if (bodyText.toLowerCase().includes(pattern.toLowerCase())) {
            foundErrors.push(pattern);
          }
        }
        
        const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"], .alert');
        const visualErrors = Array.from(errorElements).map(el => ({
          text: el.textContent?.trim() || '',
          className: el.className
        })).filter(el => el.text.length > 0);
        
        return {
          textErrors: foundErrors,
          visualErrors: visualErrors,
          nodeCount: document.querySelectorAll('[data-test-id^="node-"], .node').length
        };
      });

      await page.close();

      return {
        available: true,
        accessible: response.status() === 200,
        status: response.status(),
        errors: errors,
        visualErrors: visualAnalysis.visualErrors,
        textErrors: visualAnalysis.textErrors,
        nodeCount: visualAnalysis.nodeCount,
        consoleMessageCount: consoleMessages.length
      };

    } catch (error) {
      return {
        available: true,
        accessible: false,
        error: error.message
      };
    }
  }

  async handleNavigateToWorkflow(args) {
    if (!this.browserAvailable) {
      return {
        content: [{
          type: 'text',
          text: '❌ Browser automation not available'
        }]
      };
    }

    const { workflowId, takeScreenshot = false } = args;

    try {
      const page = await this.browserContext.newPage();
      
      const workflowUrl = `http://localhost:5678/workflow/${workflowId}`;
      await page.goto(workflowUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      const title = await page.title();
      const url = page.url();
      
      let screenshot = null;
      if (takeScreenshot) {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshot = screenshotBuffer.toString('base64');
      }

      await page.close();

      return {
        content: [{
          type: 'text',
          text: `Browser Navigation Results:\\n\\nWorkflow: ${workflowId}\\nTitle: ${title}\\nURL: ${url}\\nScreenshot taken: ${takeScreenshot}\\nScreenshot size: ${screenshot ? screenshot.length : 0} bytes`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Browser navigation failed: ${error.message}`
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

// Start the complete server
async function main() {
  const server = new CompleteMCPBrowserServer();
  
  // Cleanup on exit
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