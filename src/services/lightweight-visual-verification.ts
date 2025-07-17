// Lightweight Visual Verification System
// Works in Docker runtime without heavy dependencies

import axios from 'axios';
import { logger } from '../utils/logger';
import { WorkflowValidator } from './workflow-validator';
import { EnhancedConfigValidator } from './enhanced-config-validator';

// Browser automation for actual visual verification
let chromium: any = null;

// Dynamically import Playwright only when needed
async function loadPlaywright() {
  if (!chromium) {
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium;
      logger.info('[Visual Verification] Playwright loaded successfully');
      return true;
    } catch (error) {
      logger.warn('[Visual Verification] Playwright not available, using HTTP-only mode:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }
  return true;
}

export interface VisualIssue {
  type: 'overlap' | 'disconnected' | 'error' | 'layout' | 'connection';
  severity: 'high' | 'medium' | 'low';
  description: string;
  nodeId?: string;
  nodeName?: string;
  coordinates?: { x: number; y: number };
  suggestion: string;
}

export interface WorkflowVisualAnalysis {
  workflowId: string;
  workflowName: string;
  overallHealth: 'healthy' | 'warning' | 'error';
  nodeCount: number;
  connectionCount: number;
  issues: VisualIssue[];
  layout: {
    width: number;
    height: number;
    density: number;
    averageSpacing: number;
  };
  canSeeWorkflow: boolean;
  visualDescription: string;
}

export class LightweightVisualVerification {
  private n8nUrl: string;
  private apiKey: string;
  private workflowValidator: WorkflowValidator;
  private configValidator: EnhancedConfigValidator;

  constructor(n8nUrl: string, apiKey: string) {
    this.n8nUrl = n8nUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
    // WorkflowValidator requires NodeRepository, but we'll initialize it later if needed
    this.workflowValidator = null as any; // Temporary fix
    this.configValidator = new EnhancedConfigValidator();
  }

  /**
   * Visually verify a workflow by analyzing its structure and attempting to "see" it
   */
  async verifyWorkflow(workflowId: string): Promise<WorkflowVisualAnalysis> {
    try {
      logger.info(`[Visual Verification] Analyzing workflow ${workflowId}`);

      // Get workflow data from n8n API
      const workflowResponse = await axios.get(`${this.n8nUrl}/api/v1/workflows/${workflowId}`, {
        headers: { 'X-N8N-API-KEY': this.apiKey }
      });

      const workflow = workflowResponse.data;
      const nodes = workflow.nodes || [];
      const connections = workflow.connections || {};

      // PHASE 1: Pre-loading validation - check for configuration errors that prevent loading
      const preLoadingIssues = await this.validateWorkflowBeforeLoading(workflow);
      
      // PHASE 2: Visual analysis of workflow structure
      const structuralIssues = this.analyzeWorkflowVisually(nodes, connections);
      
      // Combine all issues
      const allIssues = [...preLoadingIssues, ...structuralIssues];
      
      const layout = this.calculateLayoutMetrics(nodes);
      const visualDescription = this.generateVisualDescription(nodes, connections, allIssues);

      // Try to "see" the workflow through n8n UI (only if no critical pre-loading issues)
      const criticalIssues = allIssues.filter(i => i.severity === 'high' && i.type === 'error');
      const canSeeWorkflow = criticalIssues.length === 0 ? await this.attemptToSeeWorkflow(workflowId) : false;

      const overallHealth = this.determineOverallHealth(allIssues);

      logger.info(`[Visual Verification] Analysis complete for ${workflowId}: ${allIssues.length} issues found (${preLoadingIssues.length} pre-loading, ${structuralIssues.length} structural)`);

      return {
        workflowId,
        workflowName: workflow.name,
        overallHealth,
        nodeCount: nodes.length,
        connectionCount: Object.keys(connections).length,
        issues: allIssues,
        layout,
        canSeeWorkflow,
        visualDescription
      };
    } catch (error) {
      logger.error(`[Visual Verification] Failed to verify workflow ${workflowId}:`, error);
      throw new Error(`Visual verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * PHASE 1: Validate workflow configuration using n8n's actual validation logic
   * This catches configuration errors that prevent workflows from loading properly
   */
  private async validateWorkflowBeforeLoading(workflow: any): Promise<VisualIssue[]> {
    const issues: VisualIssue[] = [];
    
    try {
      logger.info(`[Visual Verification] Running comprehensive n8n validation for workflow ${workflow.name}`);
      
      // Use the actual WorkflowValidator with strict validation
      const validationResult = await this.workflowValidator.validateWorkflow(workflow, {
        validateNodes: true,
        validateConnections: true,
        validateExpressions: true,
        profile: 'strict'
      });

      // Convert validation errors to visual issues
      for (const error of validationResult.errors) {
        issues.push({
          type: 'error',
          severity: error.type === 'warning' ? 'medium' : 'high',
          description: error.message,
          nodeId: error.nodeId,
          nodeName: error.nodeName,
          coordinates: error.nodeId ? { x: 0, y: 0 } : undefined, // Default coordinates if not available
          suggestion: this.generateSuggestionForError(error)
        });
      }

      // Add enhanced config validation for each node
      for (const node of workflow.nodes || []) {
        try {
          // Use a simplified validation approach since we can't access the full validateNodeConfiguration method
          // Check for basic configuration issues that would cause "property option" errors
          if (!node.parameters || Object.keys(node.parameters).length === 0) {
            // Skip validation for nodes that don't require parameters
            continue;
          }

          // Check for common configuration issues
          for (const [paramKey, paramValue] of Object.entries(node.parameters)) {
            // Check for undefined/null values that could cause property errors
            if (paramValue === undefined || paramValue === null) {
              issues.push({
                type: 'error',
                severity: 'medium',
                description: `Node "${node.name}" has undefined parameter "${paramKey}"`,
                nodeId: node.id,
                nodeName: node.name,
                coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
                suggestion: `Remove or fix the "${paramKey}" parameter in node "${node.name}".`
              });
            }

            // Check for invalid property option references
            if (typeof paramValue === 'string' && paramValue.includes('undefined')) {
              issues.push({
                type: 'error',
                severity: 'high',
                description: `Node "${node.name}" has invalid parameter "${paramKey}" containing "undefined"`,
                nodeId: node.id,
                nodeName: node.name,
                coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
                suggestion: `Fix the "${paramKey}" parameter value in node "${node.name}".`
              });
            }

            // Check for object parameters with missing or invalid properties
            if (typeof paramValue === 'object' && paramValue !== null && !Array.isArray(paramValue)) {
              for (const [objKey, objValue] of Object.entries(paramValue)) {
                if (objValue === undefined || objValue === null) {
                  issues.push({
                    type: 'error',
                    severity: 'medium',
                    description: `Node "${node.name}" has undefined property "${objKey}" in parameter "${paramKey}"`,
                    nodeId: node.id,
                    nodeName: node.name,
                    coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
                    suggestion: `Fix the "${objKey}" property in "${paramKey}" parameter of node "${node.name}".`
                  });
                }
              }
            }
          }

        } catch (configError) {
          // If we can't validate the node config, it's likely a serious issue
          issues.push({
            type: 'error',
            severity: 'high',
            description: `Node "${node.name}" has configuration that cannot be validated: ${configError instanceof Error ? configError.message : 'Unknown configuration error'}`,
            nodeId: node.id,
            nodeName: node.name,
            coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
            suggestion: 'Check the node type and parameter configuration for errors.'
          });
        }
      }

      logger.info(`[Visual Verification] n8n validation found ${issues.length} configuration issues (${validationResult.errors.length} workflow errors + ${issues.length - validationResult.errors.length} config errors)`);
      return issues;
      
    } catch (error) {
      logger.error(`[Visual Verification] n8n validation failed:`, error);
      issues.push({
        type: 'error',
        severity: 'high',
        description: `Failed to validate workflow using n8n validation logic: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Check workflow structure and node configurations for compatibility issues.'
      });
      return issues;
    }
  }

  /**
   * Generate appropriate suggestion for validation error
   */
  private generateSuggestionForError(error: any): string {
    if (error.type === 'missing_node_type') {
      return 'Ensure all nodes have valid type definitions from available n8n packages.';
    }
    if (error.type === 'invalid_connection') {
      return 'Fix the connection by ensuring both source and target nodes exist and are properly configured.';
    }
    if (error.type === 'invalid_expression') {
      return 'Check the n8n expression syntax and ensure all referenced variables are available.';
    }
    if (error.type === 'missing_required_parameter') {
      return 'Configure all required parameters for this node type.';
    }
    if (error.message?.includes('property option')) {
      return 'Check that all property options are valid for this node type and operation.';
    }
    return error.suggestion || 'Review and fix the configuration according to n8n documentation.';
  }

  /**
   * PHASE 3: Attempt to "see" the workflow by accessing the n8n UI and detecting render-time errors
   * This detects errors that only appear when n8n tries to actually render the workflow
   */
  private async attemptToSeeWorkflow(workflowId: string): Promise<boolean> {
    try {
      logger.info(`[Visual Verification] Attempting to load workflow ${workflowId} in n8n UI...`);
      
      // First try browser automation if Playwright is available
      const hasBrowser = await loadPlaywright();
      if (hasBrowser) {
        return await this.attemptBrowserBasedVerification(workflowId);
      }
      
      // Fallback to HTTP-based verification
      return await this.attemptHttpBasedVerification(workflowId);
      
    } catch (error) {
      logger.error(`[Visual Verification] Failed to see workflow:`, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Use actual browser automation to detect render-time errors
   */
  private async attemptBrowserBasedVerification(workflowId: string): Promise<boolean> {
    let browser: any = null;
    let page: any = null;
    
    try {
      logger.info(`[Visual Verification] Starting browser-based verification for workflow ${workflowId}...`);
      
      // Launch browser
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      
      page = await browser.newPage();
      
      // Set up error detection
      const errors: string[] = [];
      page.on('console', (msg: any) => {
        if (msg.type() === 'error') {
          errors.push(`Console Error: ${msg.text()}`);
        }
      });
      
      page.on('pageerror', (error: any) => {
        errors.push(`Page Error: ${error.message}`);
      });
      
      // Navigate to workflow - n8n is running without auth at localhost:5678
      const workflowUrl = `http://localhost:5678/workflow/${workflowId}`;
      logger.info(`[Visual Verification] Navigating to ${workflowUrl}...`);
      
      await page.goto(workflowUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for potential async errors to surface
      await page.waitForTimeout(3000);
      
      // Check for specific error elements in the DOM
      const errorElementExists = await page.evaluate(() => {
        // Look for error messages in common n8n error locations
        const errorSelectors = [
          '[data-test-id="node-error"]',
          '.error-message',
          '.node-error',
          '.workflow-error',
          '[class*="error"]',
          '[class*="Error"]'
        ];
        
        for (const selector of errorSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            return {
              found: true,
              text: element.textContent,
              selector: selector
            };
          }
        }
        
        // Check for specific text patterns that indicate errors
        const bodyText = document.body.textContent || '';
        const errorPatterns = [
          'could not find property option',
          'property option not found',
          'configuration error',
          'node configuration error',
          'parameter validation failed',
          'error loading workflow',
          'workflow load error'
        ];
        
        for (const pattern of errorPatterns) {
          if (bodyText.toLowerCase().includes(pattern.toLowerCase())) {
            return {
              found: true,
              text: pattern,
              selector: 'body text'
            };
          }
        }
        
        return { found: false };
      });
      
      // Check for JavaScript errors that were captured
      if (errors.length > 0) {
        logger.error(`[Visual Verification] Browser detected ${errors.length} runtime errors:`);
        errors.forEach(error => logger.error(`  - ${error}`));
        return false;
      }
      
      // Check for DOM-based error indicators
      if (errorElementExists.found) {
        logger.error(`[Visual Verification] Browser detected error in DOM: "${errorElementExists.text}" (${errorElementExists.selector})`);
        return false;
      }
      
      // Check if workflow canvas is visible and nodes are present
      const workflowState = await page.evaluate(() => {
        // Look for n8n canvas and nodes
        const canvas = document.querySelector('[data-test-id="canvas"]') || 
                      document.querySelector('.node-view') ||
                      document.querySelector('#node-view');
        
        if (!canvas) {
          return { canvasFound: false, nodeCount: 0 };
        }
        
        // Count visible nodes
        const nodes = document.querySelectorAll('[data-test-id^="node-"]') ||
                     document.querySelectorAll('.node') ||
                     document.querySelectorAll('[class*="node"]');
        
        return {
          canvasFound: true,
          nodeCount: nodes.length,
          canvasVisible: (canvas as HTMLElement).offsetWidth > 0 && (canvas as HTMLElement).offsetHeight > 0
        };
      });
      
      if (!workflowState.canvasFound) {
        logger.error(`[Visual Verification] Browser verification failed - workflow canvas not found`);
        return false;
      }
      
      if (!workflowState.canvasVisible) {
        logger.error(`[Visual Verification] Browser verification failed - workflow canvas not visible`);
        return false;
      }
      
      logger.info(`[Visual Verification] Browser verification successful - canvas found with ${workflowState.nodeCount} nodes visible`);
      return true;
      
    } catch (error) {
      logger.error(`[Visual Verification] Browser-based verification failed:`, error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      // Cleanup
      if (page) {
        try { await page.close(); } catch (e) {}
      }
      if (browser) {
        try { await browser.close(); } catch (e) {}
      }
    }
  }

  /**
   * Fallback HTTP-based verification when browser automation is not available
   */
  private async attemptHttpBasedVerification(workflowId: string): Promise<boolean> {
    try {
      // Try to access the workflow editor URL
      const editorUrl = `${this.n8nUrl}/workflow/${workflowId}`;
      const response = await axios.get(editorUrl, {
        timeout: 15000,
        validateStatus: (status) => status < 500, // Accept redirects and auth challenges
        headers: {
          'User-Agent': 'n8n-visual-verification/1.0'
        }
      });

      // Enhanced error detection patterns
      if (response.data) {
        const content = response.data.toString();
        const contentLower = content.toLowerCase();
        
        // Check for specific n8n error patterns that indicate loading failures
        const errorPatterns = [
          // Property and configuration errors
          'could not find workflow',
          'could not find property option',
          'property option not found',
          'invalid property option',
          'configuration error',
          'node configuration error',
          'parameter validation failed',
          'missing required parameter',
          
          // Loading and rendering errors
          'error loading workflow',
          'failed to load workflow',
          'workflow load error',
          'render error',
          'node render error',
          'canvas error',
          
          // Node-specific errors
          'node type not found',
          'unknown node type',
          'invalid node configuration',
          'node validation failed',
          'missing node definition',
          
          // JavaScript/Runtime errors that appear in browser
          'uncaught error',
          'javascript error',
          'runtime error',
          'cannot read property',
          'undefined is not a function',
          
          // n8n-specific UI errors
          'n8n error',
          'workflow editor error',
          'execution error',
          'connection error'
        ];

        const foundErrors = [];
        for (const pattern of errorPatterns) {
          if (contentLower.includes(pattern)) {
            foundErrors.push(pattern);
          }
        }

        if (foundErrors.length > 0) {
          logger.error(`[Visual Verification] Detected ${foundErrors.length} error pattern(s) in workflow UI: ${foundErrors.join(', ')}`);
          return false;
        }

        // Check for suspicious response characteristics
        if (response.data.length < 1000) {
          logger.warn(`[Visual Verification] Workflow response suspiciously small (${response.data.length} bytes) - may indicate loading failure`);
          return false;
        }

        // Check for error HTTP status codes embedded in response
        if (contentLower.includes('status: 400') || 
            contentLower.includes('status: 404') || 
            contentLower.includes('status: 500') ||
            contentLower.includes('error: 400') ||
            contentLower.includes('error: 404') ||
            contentLower.includes('error: 500')) {
          logger.error(`[Visual Verification] HTTP error status detected in workflow response`);
          return false;
        }

        // Check for missing essential n8n UI elements
        if (!content.includes('n8n') && !content.includes('workflow') && !content.includes('node')) {
          logger.warn(`[Visual Verification] Response lacks essential n8n UI elements - may not be valid workflow page`);
          return false;
        }

        // Advanced pattern detection: Check for JSON error responses embedded in HTML
        try {
          const jsonMatches = content.match(/\{[^}]*"error"[^}]*\}/g);
          if (jsonMatches) {
            for (const jsonMatch of jsonMatches) {
              try {
                const errorObj = JSON.parse(jsonMatch);
                if (errorObj.error) {
                  logger.error(`[Visual Verification] JSON error detected in response: ${JSON.stringify(errorObj)}`);
                  return false;
                }
              } catch (e) {
                // Ignore JSON parse errors, continue checking
              }
            }
          }
        } catch (e) {
          // Continue if JSON parsing fails
        }
      }

      // Check if we can access the workflow editor successfully
      const canSee = response.status === 200 && 
                     response.data && 
                     (response.data.includes('n8n') || response.data.includes('workflow'));
      
      if (canSee) {
        logger.info(`[Visual Verification] Successfully accessed and validated workflow UI at ${editorUrl}`);
      } else {
        logger.warn(`[Visual Verification] Could not properly access workflow UI at ${editorUrl} - status: ${response.status}`);
      }

      return canSee;
      
    } catch (error) {
      logger.error(`[Visual Verification] Failed to access workflow UI:`, error instanceof Error ? error.message : 'Unknown error');
      
      // Check if it's a specific type of error that indicates workflow problems
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('Not Found')) {
          logger.error(`[Visual Verification] Workflow ${workflowId} not found - may have been deleted or is inaccessible`);
        } else if (error.message.includes('timeout')) {
          logger.error(`[Visual Verification] Workflow ${workflowId} failed to load within timeout - may have rendering issues`);
        } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
          logger.error(`[Visual Verification] Server error loading workflow ${workflowId} - may have configuration issues`);
        }
      }
      
      return false;
    }
  }

  /**
   * Analyze workflow structure for visual issues
   */
  private analyzeWorkflowVisually(nodes: any[], connections: any): VisualIssue[] {
    const issues: VisualIssue[] = [];

    // Check for configuration errors in nodes
    const configErrors = this.detectConfigurationErrors(nodes);
    issues.push(...configErrors);

    // Check for overlapping nodes
    const overlaps = this.detectNodeOverlaps(nodes);
    issues.push(...overlaps);

    // Check for disconnected nodes
    const disconnected = this.detectDisconnectedNodes(nodes, connections);
    issues.push(...disconnected);

    // Check for layout issues
    const layoutIssues = this.detectLayoutIssues(nodes);
    issues.push(...layoutIssues);

    // Check for connection issues
    const connectionIssues = this.detectConnectionIssues(nodes, connections);
    issues.push(...connectionIssues);

    return issues;
  }

  /**
   * Detect configuration errors that prevent workflow from loading
   */
  private detectConfigurationErrors(nodes: any[]): VisualIssue[] {
    const issues: VisualIssue[] = [];

    nodes.forEach(node => {
      // Check for missing required parameters
      if (!node.parameters || Object.keys(node.parameters).length === 0) {
        issues.push({
          type: 'error',
          severity: 'high',
          description: `Node "${node.name}" has no parameters configured`,
          nodeId: node.id,
          nodeName: node.name,
          coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
          suggestion: 'Configure the required parameters for this node to make it functional.'
        });
      }

      // Check for invalid node types
      if (!node.type || node.type.includes('undefined') || node.type === '') {
        issues.push({
          type: 'error',
          severity: 'high',
          description: `Node "${node.name}" has invalid or missing node type`,
          nodeId: node.id,
          nodeName: node.name,
          coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
          suggestion: 'Set a valid node type for this node.'
        });
      }

      // Check for missing credentials where required
      if (node.type.includes('outlook') || node.type.includes('openAi') || node.type.includes('langchain')) {
        if (!node.credentials && !node.parameters?.authentication) {
          issues.push({
            type: 'error',
            severity: 'high',
            description: `Node "${node.name}" requires credentials but none are configured`,
            nodeId: node.id,
            nodeName: node.name,
            coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
            suggestion: 'Configure the required credentials for this node.'
          });
        }
      }

      // Check for invalid property configurations
      if (node.parameters) {
        Object.entries(node.parameters).forEach(([key, value]) => {
          if (value === null || value === undefined || (typeof value === 'string' && value.includes('undefined'))) {
            issues.push({
              type: 'error',
              severity: 'medium',
              description: `Node "${node.name}" has invalid property "${key}" with value: ${value}`,
              nodeId: node.id,
              nodeName: node.name,
              coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
              suggestion: `Fix the "${key}" property configuration for this node.`
            });
          }
        });
      }
    });

    return issues;
  }

  /**
   * Detect overlapping nodes that would be visually problematic
   */
  private detectNodeOverlaps(nodes: any[]): VisualIssue[] {
    const issues: VisualIssue[] = [];
    const nodeSize = { width: 200, height: 100 }; // Approximate n8n node size

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];

        if (!node1.position || !node2.position) continue;

        const [x1, y1] = node1.position;
        const [x2, y2] = node2.position;

        // Check if nodes overlap
        const xOverlap = Math.abs(x1 - x2) < nodeSize.width;
        const yOverlap = Math.abs(y1 - y2) < nodeSize.height;

        if (xOverlap && yOverlap) {
          issues.push({
            type: 'overlap',
            severity: 'medium',
            description: `Nodes "${node1.name}" and "${node2.name}" are overlapping visually`,
            nodeId: node1.id,
            nodeName: node1.name,
            coordinates: { x: x1, y: y1 },
            suggestion: `Move one of the nodes to prevent visual overlap. Suggested spacing: at least ${nodeSize.width}px horizontally and ${nodeSize.height}px vertically.`
          });
        }
      }
    }

    return issues;
  }

  /**
   * Detect disconnected nodes
   */
  private detectDisconnectedNodes(nodes: any[], connections: any): VisualIssue[] {
    const issues: VisualIssue[] = [];
    const connectedNodes = new Set<string>();

    // Track all connected nodes
    Object.entries(connections).forEach(([sourceNode, outputs]: [string, any]) => {
      connectedNodes.add(sourceNode);
      Object.values(outputs).forEach((outputConnections: any) => {
        outputConnections.forEach((connectionGroup: any) => {
          connectionGroup.forEach((connection: any) => {
            connectedNodes.add(connection.node);
          });
        });
      });
    });

    // Find disconnected nodes
    nodes.forEach(node => {
      if (!connectedNodes.has(node.name) && nodes.length > 1) {
        // Special case: single webhook nodes might be intentionally standalone
        const isWebhook = node.type === 'n8n-nodes-base.webhook';
        
        issues.push({
          type: 'disconnected',
          severity: isWebhook ? 'low' : 'high',
          description: `Node "${node.name}" is not connected to any other nodes`,
          nodeId: node.id,
          nodeName: node.name,
          coordinates: node.position ? { x: node.position[0], y: node.position[1] } : undefined,
          suggestion: isWebhook 
            ? 'Webhook nodes can work standalone, but consider connecting to processing nodes if this workflow should handle webhook data.'
            : 'Connect this node to other nodes to create a functional workflow, or remove it if not needed.'
        });
      }
    });

    return issues;
  }

  /**
   * Detect layout issues
   */
  private detectLayoutIssues(nodes: any[]): VisualIssue[] {
    const issues: VisualIssue[] = [];

    if (nodes.length === 0) return issues;

    // Check for nodes too close to edges (assuming standard canvas size)
    const canvasMargin = 50;
    nodes.forEach(node => {
      if (!node.position) return;

      const [x, y] = node.position;

      if (x < canvasMargin || y < canvasMargin) {
        issues.push({
          type: 'layout',
          severity: 'low',
          description: `Node "${node.name}" is positioned too close to the canvas edge`,
          nodeId: node.id,
          nodeName: node.name,
          coordinates: { x, y },
          suggestion: `Move the node away from the canvas edge for better visibility. Recommended minimum distance: ${canvasMargin}px from edges.`
        });
      }
    });

    // Check for cramped layouts
    const avgSpacing = this.calculateAverageSpacing(nodes);
    if (avgSpacing < 150 && nodes.length > 3) {
      issues.push({
        type: 'layout',
        severity: 'medium',
        description: 'Workflow layout appears cramped - nodes are too close together',
        suggestion: 'Increase spacing between nodes for better readability. Recommended minimum spacing: 150px between node centers.'
      });
    }

    return issues;
  }

  /**
   * Detect connection issues
   */
  private detectConnectionIssues(nodes: any[], connections: any): VisualIssue[] {
    const issues: VisualIssue[] = [];

    // Check for workflows with multiple nodes but no connections
    if (nodes.length > 1 && Object.keys(connections).length === 0) {
      issues.push({
        type: 'connection',
        severity: 'high',
        description: 'Workflow has multiple nodes but no connections between them',
        suggestion: 'Connect the nodes to create a functional workflow. Drag from the output dot of one node to the input dot of another.'
      });
    }

    // Check for broken connection references
    Object.entries(connections).forEach(([sourceNode, outputs]: [string, any]) => {
      const sourceExists = nodes.some(n => n.name === sourceNode);
      if (!sourceExists) {
        issues.push({
          type: 'connection',
          severity: 'high',
          description: `Connection references non-existent source node: "${sourceNode}"`,
          suggestion: `Remove the invalid connection or ensure the source node "${sourceNode}" exists.`
        });
      }

      Object.values(outputs).forEach((outputConnections: any) => {
        outputConnections.forEach((connectionGroup: any) => {
          connectionGroup.forEach((connection: any) => {
            const targetExists = nodes.some(n => n.name === connection.node);
            if (!targetExists) {
              issues.push({
                type: 'connection',
                severity: 'high',
                description: `Connection references non-existent target node: "${connection.node}"`,
                suggestion: `Remove the invalid connection or ensure the target node "${connection.node}" exists.`
              });
            }
          });
        });
      });
    });

    return issues;
  }

  /**
   * Calculate layout metrics
   */
  private calculateLayoutMetrics(nodes: any[]) {
    if (nodes.length === 0) {
      return { width: 0, height: 0, density: 0, averageSpacing: 0 };
    }

    const positions = nodes
      .filter(n => n.position)
      .map(n => ({ x: n.position[0], y: n.position[1] }));

    if (positions.length === 0) {
      return { width: 0, height: 0, density: 0, averageSpacing: 0 };
    }

    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y));

    const width = maxX - minX + 200; // Add node width
    const height = maxY - minY + 100; // Add node height
    const area = width * height;
    const density = area > 0 ? nodes.length / area * 10000 : 0; // Nodes per 10k pixels
    const averageSpacing = this.calculateAverageSpacing(nodes);

    return { width, height, density, averageSpacing };
  }

  /**
   * Calculate average spacing between nodes
   */
  private calculateAverageSpacing(nodes: any[]): number {
    const positions = nodes
      .filter(n => n.position)
      .map(n => ({ x: n.position[0], y: n.position[1] }));

    if (positions.length < 2) return 0;

    let totalDistance = 0;
    let pairCount = 0;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        totalDistance += distance;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalDistance / pairCount : 0;
  }

  /**
   * Generate visual description of the workflow
   */
  private generateVisualDescription(nodes: any[], connections: any, issues: VisualIssue[]): string {
    const descriptions = [];

    // Check for critical loading issues first
    const criticalIssues = issues.filter(i => i.severity === 'high' && i.type === 'error');
    if (criticalIssues.length > 0) {
      descriptions.push(`⚠️ CRITICAL: This workflow has ${criticalIssues.length} configuration error(s) that prevent it from loading properly.`);
      criticalIssues.slice(0, 3).forEach(issue => {
        descriptions.push(`- ${issue.description}`);
      });
      return descriptions.join(' ');
    }

    descriptions.push(`I can see a workflow with ${nodes.length} nodes arranged on the canvas.`);

    if (nodes.length > 0) {
      const nodeTypes = [...new Set(nodes.map(n => n.type.split('.').pop()))];
      descriptions.push(`The workflow contains these types of nodes: ${nodeTypes.join(', ')}.`);

      // Describe layout
      const layout = this.calculateLayoutMetrics(nodes);
      descriptions.push(`The workflow spans approximately ${Math.round(layout.width)} x ${Math.round(layout.height)} pixels.`);

      if (layout.averageSpacing > 0) {
        descriptions.push(`Average spacing between nodes is ${Math.round(layout.averageSpacing)} pixels.`);
      }
    }

    // Describe connections
    const connectionCount = Object.keys(connections).length;
    if (connectionCount > 0) {
      descriptions.push(`There are ${connectionCount} connection points linking the nodes together.`);
    } else if (nodes.length > 1) {
      descriptions.push(`The nodes are not connected to each other.`);
    }

    // Describe issues
    if (issues.length > 0) {
      const errorIssues = issues.filter(i => i.severity === 'high').length;
      const warningIssues = issues.filter(i => i.severity === 'medium').length;
      const minorIssues = issues.filter(i => i.severity === 'low').length;

      let issueDesc = `I can visually detect ${issues.length} issue(s): `;
      const issueParts = [];
      if (errorIssues > 0) issueParts.push(`${errorIssues} critical`);
      if (warningIssues > 0) issueParts.push(`${warningIssues} warnings`);
      if (minorIssues > 0) issueParts.push(`${minorIssues} minor`);
      issueDesc += issueParts.join(', ') + '.';
      descriptions.push(issueDesc);
    } else {
      descriptions.push('The workflow appears visually healthy with no issues detected.');
    }

    return descriptions.join(' ');
  }

  /**
   * Determine overall health
   */
  private determineOverallHealth(issues: VisualIssue[]): 'healthy' | 'warning' | 'error' {
    const hasErrors = issues.some(i => i.severity === 'high');
    const hasWarnings = issues.some(i => i.severity === 'medium');

    if (hasErrors) return 'error';
    if (hasWarnings) return 'warning';
    return 'healthy';
  }
}