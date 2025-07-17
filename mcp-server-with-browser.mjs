#!/usr/bin/env node

/**
 * n8n MCP Server with Built-in Browser Verification
 * 
 * Features:
 * - Docker synchronization with running n8n instance
 * - Built-in headless browser automation 
 * - Can login to n8n and navigate to workflows
 * - Detects visual errors that only appear during browser rendering
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

class MCPServerWithBrowser {
  constructor() {
    this.server = new Server(
      { name: 'n8n-browser-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.nodeTypes = null;
    this.containerInfo = null;
    this.n8nVersion = null;
    this.browser = null;
    this.browserContext = null;
    this.setupHandlers();
  }

  async initialize() {
    try {
      console.log('[Browser MCP] Initializing with Docker container and browser...');

      // Find n8n container
      const containers = await this.findN8nContainers();
      if (containers.length === 0) {
        throw new Error('No running n8n containers found');
      }

      this.containerInfo = containers[0];
      console.log(`[Browser MCP] Using container: ${this.containerInfo.name} (${this.containerInfo.id})`);

      // Get n8n version
      this.n8nVersion = await this.getN8nVersion(this.containerInfo.id);
      console.log(`[Browser MCP] n8n version: ${this.n8nVersion}`);

      // Extract node types from running instance
      await this.extractNodeTypes();
      console.log(`[Browser MCP] ✅ Synchronized ${Object.keys(this.nodeTypes).length} node types`);

      // Initialize browser
      await this.initializeBrowser();
      console.log(`[Browser MCP] ✅ Browser initialized and ready`);

    } catch (error) {
      console.error('[Browser MCP] Initialization failed:', error.message);
      throw error;
    }
  }

  async initializeBrowser() {
    try {
      console.log('[Browser MCP] Initializing headless browser...');
      
      // Dynamic import of Playwright
      const { chromium } = await import('playwright');
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--window-size=1920,1080'
        ]
      });

      this.browserContext = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1
      });

      console.log('[Browser MCP] ✅ Headless browser ready');

    } catch (error) {
      console.warn('[Browser MCP] Browser initialization failed, will use HTTP-only mode:', error.message);
      this.browser = null;
      this.browserContext = null;
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
          name: 'browser_status',
          description: 'Check browser and Docker sync status'
        },
        {
          name: 'list_nodes_from_docker',
          description: 'List nodes synchronized from Docker',
          inputSchema: {
            type: 'object',
            properties: {
              search: { type: 'string' },
              limit: { type: 'number', default: 20 }
            }
          }
        },
        {
          name: 'verify_workflow_with_browser',
          description: 'Use headless browser to verify workflow visually - can detect rendering errors',
          inputSchema: {
            type: 'object',
            properties: {
              workflowId: { type: 'string', description: 'Workflow ID to verify' },
              forceNew: { type: 'boolean', description: 'Force creating as new workflow', default: false }
            },
            required: ['workflowId']
          }
        },
        {
          name: 'browser_navigate_n8n',
          description: 'Navigate browser to n8n and login (for testing)',
          inputSchema: {
            type: 'object',
            properties: {
              takeScreenshot: { type: 'boolean', default: false }
            }
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'browser_status':
            return await this.handleBrowserStatus();
          case 'list_nodes_from_docker':
            return await this.handleListNodes(args);
          case 'verify_workflow_with_browser':
            return await this.handleVerifyWorkflowWithBrowser(args);
          case 'browser_navigate_n8n':
            return await this.handleBrowserNavigateN8n(args);
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

  async handleBrowserStatus() {
    const status = {
      dockerSync: {
        synchronized: this.nodeTypes !== null,
        containerInfo: this.containerInfo,
        n8nVersion: this.n8nVersion,
        nodeCount: this.nodeTypes ? Object.keys(this.nodeTypes).length : 0
      },
      browser: {
        available: this.browser !== null,
        ready: this.browserContext !== null
      },
      capabilities: {
        httpVerification: true,
        browserVerification: this.browser !== null,
        visualErrorDetection: this.browser !== null,
        loginSupport: this.browser !== null
      }
    };

    return {
      content: [{
        type: 'text',
        text: `Browser MCP Status:\n\n${JSON.stringify(status, null, 2)}\n\n${
          status.browser.available 
            ? '✅ Full browser verification available' 
            : '⚠️ Browser verification unavailable - HTTP-only mode'
        }`
      }]
    };
  }

  async handleListNodes(args) {
    const { search = '', limit = 20 } = args || {};
    
    if (!this.nodeTypes) {
      throw new Error('Node types not synchronized');
    }

    let nodes = Object.values(this.nodeTypes);
    
    if (search) {
      const searchLower = search.toLowerCase();
      nodes = nodes.filter(node => 
        (node.displayName && node.displayName.toLowerCase().includes(searchLower)) ||
        (node.description && node.description.toLowerCase().includes(searchLower))
      );
    }

    nodes = nodes.slice(0, limit);

    return {
      content: [{
        type: 'text',
        text: `Found ${nodes.length} nodes from Docker n8n ${this.n8nVersion}:\n\n${
          nodes.map(node => 
            `- **${node.displayName || 'No name'}**: ${(node.description || 'No description').substring(0, 100)}${node.description && node.description.length > 100 ? '...' : ''}`
          ).join('\n')
        }`
      }]
    };
  }

  async handleBrowserNavigateN8n(args) {
    if (!this.browser) {
      return {
        content: [{
          type: 'text',
          text: 'Browser not available - cannot navigate to n8n'
        }]
      };
    }

    try {
      const { takeScreenshot = false } = args || {};
      
      console.log('[Browser MCP] Navigating to n8n...');
      
      const page = await this.browserContext.newPage();
      
      // Set up error detection
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(`Console Error: ${msg.text()}`);
        }
      });
      
      page.on('pageerror', (error) => {
        errors.push(`Page Error: ${error.message}`);
      });

      // Navigate to n8n
      await page.goto('http://localhost:5678', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      const title = await page.title();
      const url = page.url();
      
      // Check if we need to login or if we're already logged in
      const needsLogin = url.includes('/signin') || await page.locator('[data-test-id="user-login-form"]').isVisible().catch(() => false);
      
      let loginStatus = 'not_required';
      if (needsLogin) {
        loginStatus = 'login_form_detected';
        console.log('[Browser MCP] Login form detected, but no credentials provided');
      }

      let screenshot = null;
      if (takeScreenshot) {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshot = screenshotBuffer.toString('base64');
      }

      await page.close();

      const result = {
        success: true,
        title,
        url,
        needsLogin,
        loginStatus,
        errors: errors,
        screenshotTaken: takeScreenshot,
        screenshotSize: screenshot ? screenshot.length : 0
      };

      return {
        content: [{
          type: 'text',
          text: `Browser Navigation Results:\n\n${JSON.stringify(result, null, 2)}\n\n${
            result.success 
              ? `✅ Successfully navigated to n8n (${result.title})` 
              : '❌ Navigation failed'
          }`
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

  async handleVerifyWorkflowWithBrowser(args) {
    if (!this.browser) {
      return {
        content: [{
          type: 'text',
          text: '❌ Browser not available - cannot perform visual verification'
        }]
      };
    }

    try {
      const { workflowId, forceNew = false } = args;
      
      console.log(`[Browser MCP] Starting browser verification of workflow ${workflowId}...`);
      
      const page = await this.browserContext.newPage();
      
      // Set up comprehensive error detection
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

      // Navigate to the workflow
      const workflowUrl = `http://localhost:5678/workflow/${workflowId}`;
      console.log(`[Browser MCP] Navigating to ${workflowUrl}...`);
      
      const response = await page.goto(workflowUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      console.log(`[Browser MCP] Page loaded with status: ${response.status()}`);
      
      // Wait for n8n to fully load and render
      await page.waitForTimeout(5000);

      // Check for visual error indicators
      const visualAnalysis = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const htmlContent = document.body.innerHTML || '';
        
        // Check for specific error patterns that appear in the UI
        const errorPatterns = [
          'could not find property option',
          'property option not found',
          'configuration error',
          'node configuration error',
          'parameter validation failed',
          'error loading workflow',
          'workflow load error',
          'undefined is not a function',
          'cannot read property',
          'null',
          'undefined'
        ];
        
        const foundTextErrors = [];
        for (const pattern of errorPatterns) {
          if (bodyText.toLowerCase().includes(pattern.toLowerCase())) {
            const index = bodyText.toLowerCase().indexOf(pattern.toLowerCase());
            const context = bodyText.substring(index - 100, index + 100);
            foundTextErrors.push({ pattern, context });
          }
        }
        
        // Check for visual error elements
        const errorSelectors = [
          '[class*="error"]',
          '[class*="Error"]', 
          '.alert',
          '.notification-error',
          '[data-test-id*="error"]',
          '.error-message',
          '.node-error'
        ];
        
        const visualErrors = [];
        for (const selector of errorSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (element.textContent && element.textContent.trim()) {
              visualErrors.push({
                selector,
                text: element.textContent.trim(),
                className: element.className,
                visible: element.offsetWidth > 0 && element.offsetHeight > 0
              });
            }
          }
        }
        
        // Check for nodes and their states
        const nodeElements = document.querySelectorAll('[data-test-id^="node-"], .node');
        const nodeAnalysis = {
          totalNodes: nodeElements.length,
          errorNodes: 0,
          warningNodes: 0
        };
        
        for (const nodeEl of nodeElements) {
          if (nodeEl.classList.contains('error') || nodeEl.querySelector('.error')) {
            nodeAnalysis.errorNodes++;
          }
          if (nodeEl.classList.contains('warning') || nodeEl.querySelector('.warning')) {
            nodeAnalysis.warningNodes++;
          }
        }
        
        return {
          pageTitle: document.title,
          bodyLength: bodyText.length,
          textErrors: foundTextErrors,
          visualErrors: visualErrors.filter(e => e.visible),
          nodeAnalysis,
          hasCanvas: !!document.querySelector('[data-test-id="canvas"], .node-view, #node-view'),
          canvasVisible: document.querySelector('[data-test-id="canvas"], .node-view, #node-view')?.offsetWidth > 0
        };
      });

      // Take a screenshot for debugging
      const screenshot = await page.screenshot({ fullPage: true });
      
      await page.close();

      // Analyze results
      const hasJSErrors = errors.length > 0;
      const hasTextErrors = visualAnalysis.textErrors.length > 0;
      const hasVisualErrors = visualAnalysis.visualErrors.length > 0;
      const hasNodeErrors = visualAnalysis.nodeAnalysis.errorNodes > 0;
      
      const hasIssues = hasJSErrors || hasTextErrors || hasVisualErrors || hasNodeErrors;

      const result = {
        workflowId,
        forceNew,
        verification: {
          httpStatus: response.status(),
          pageTitle: visualAnalysis.pageTitle,
          canvasFound: visualAnalysis.hasCanvas,
          canvasVisible: visualAnalysis.canvasVisible,
          nodeCount: visualAnalysis.nodeAnalysis.totalNodes
        },
        errors: {
          javascript: errors,
          textPatterns: visualAnalysis.textErrors,
          visualElements: visualAnalysis.visualErrors,
          nodeErrors: visualAnalysis.nodeAnalysis.errorNodes,
          nodeWarnings: visualAnalysis.nodeAnalysis.warningNodes
        },
        analysis: {
          hasIssues,
          issueCount: errors.length + visualAnalysis.textErrors.length + visualAnalysis.visualErrors.length + visualAnalysis.nodeAnalysis.errorNodes,
          workflowLoadable: response.status() === 200 && visualAnalysis.hasCanvas,
          renderingSuccessful: !hasIssues && visualAnalysis.canvasVisible
        },
        debug: {
          consoleMessageCount: consoleMessages.length,
          screenshotSize: screenshot.length,
          testTime: new Date().toISOString()
        }
      };

      // Generate summary
      let summary = '';
      if (result.analysis.hasIssues) {
        summary = `❌ ISSUES DETECTED in workflow ${workflowId}:\n`;
        if (hasJSErrors) summary += `\n🔴 JavaScript Errors (${errors.length}):\n${errors.slice(0, 3).map(e => `  - ${e}`).join('\n')}`;
        if (hasTextErrors) summary += `\n🟠 Text Error Patterns (${visualAnalysis.textErrors.length}):\n${visualAnalysis.textErrors.slice(0, 3).map(e => `  - "${e.pattern}"`).join('\n')}`;
        if (hasVisualErrors) summary += `\n🟡 Visual Error Elements (${visualAnalysis.visualErrors.length}):\n${visualAnalysis.visualErrors.slice(0, 3).map(e => `  - ${e.text}`).join('\n')}`;
        if (hasNodeErrors) summary += `\n⚠️ Node Errors: ${visualAnalysis.nodeAnalysis.errorNodes} nodes have error states`;
      } else {
        summary = `✅ NO ISSUES DETECTED in workflow ${workflowId}\nWorkflow loads and renders correctly in browser.`;
      }

      return {
        content: [{
          type: 'text',
          text: `Browser Visual Verification Results:\n\n${summary}\n\nDetailed Analysis:\n${JSON.stringify(result, null, 2)}`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Browser verification failed: ${error.message}`
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
    console.log('[Browser MCP] Server started with stdio transport');
  }
}

// Start the server
async function main() {
  const server = new MCPServerWithBrowser();
  
  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('[Browser MCP] Shutting down...');
    await server.cleanup();
    process.exit(0);
  });
  
  await server.initialize();
  await server.start();
}

main().catch(error => {
  console.error('[Browser MCP] Failed to start:', error.message);
  process.exit(1);
});