import { NodeRepository } from '../database/node-repository';
import { logger } from '../utils/logger';

export interface SemanticValidationResult {
  valid: boolean;
  warnings: SemanticWarning[];
  suggestions: SemanticSuggestion[];
  score: number; // 0-100, higher is better
}

export interface SemanticWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
}

export interface SemanticSuggestion {
  type: 'replace_code_node' | 'use_builtin_node' | 'simplify_workflow';
  message: string;
  nodeId?: string;
  recommendedNodeType?: string;
  reasoning: string;
}

interface WorkflowNode {
  id?: string;
  name: string;
  type: string;
  parameters?: any;
}

interface Workflow {
  nodes: WorkflowNode[];
  connections?: any;
}

/**
 * WorkflowSemanticValidator - Enforces "Built-in Nodes First" Policy
 *
 * This validator acts as a gatekeeper to guide AI agents toward using
 * built-in n8n nodes instead of over-relying on Code nodes.
 *
 * Key Principles:
 * 1. Code nodes should be LAST RESORT, not first choice
 * 2. n8n has 525+ built-in nodes - use them!
 * 3. A workflow with many Code nodes is a CODE SMELL
 * 4. Prefer built-in nodes for: HTTP, API calls, data transformation, logic
 */
export class WorkflowSemanticValidator {
  private nodeRepo: NodeRepository;

  // Thresholds for semantic analysis
  private readonly MAX_CODE_NODE_RATIO = 0.3; // Max 30% Code nodes
  private readonly IDEAL_CODE_NODE_RATIO = 0.1; // Ideal <10% Code nodes
  private readonly MIN_BUILTIN_NODES = 2; // Workflows should have at least 2 built-in nodes

  constructor(nodeRepo: NodeRepository) {
    this.nodeRepo = nodeRepo;
  }

  /**
   * Validate workflow semantics and provide guidance
   */
  async validateWorkflow(workflow: Workflow): Promise<SemanticValidationResult> {
    const warnings: SemanticWarning[] = [];
    const suggestions: SemanticSuggestion[] = [];
    let score = 100;

    // Analyze node composition
    const analysis = this.analyzeNodeComposition(workflow.nodes);

    // Check 1: Too many Code nodes (CRITICAL)
    if (analysis.codeNodeRatio > this.MAX_CODE_NODE_RATIO) {
      const penalty = 40;
      score -= penalty;

      warnings.push({
        severity: 'error',
        message: `❌ CRITICAL: ${Math.round(analysis.codeNodeRatio * 100)}% of nodes are Code nodes (max 30%)`,
      });

      suggestions.push({
        type: 'use_builtin_node',
        message: `This workflow relies too heavily on custom code. n8n has 525+ built-in nodes - please search for existing nodes first!`,
        reasoning: `Code nodes should be last resort. Built-in nodes are faster, more reliable, and easier to maintain.`
      });
    } else if (analysis.codeNodeRatio > this.IDEAL_CODE_NODE_RATIO) {
      const penalty = 20;
      score -= penalty;

      warnings.push({
        severity: 'warning',
        message: `⚠️  ${Math.round(analysis.codeNodeRatio * 100)}% of nodes are Code nodes (ideal <10%)`,
      });
    }

    // Check 2: Detect common Code node anti-patterns
    for (const codeNode of analysis.codeNodes) {
      const suggestions = await this.analyzeCodeNode(codeNode);
      if (suggestions.length > 0) {
        score -= 10 * suggestions.length;
        warnings.push({
          severity: 'warning',
          message: `Node "${codeNode.name}" might be replaceable with built-in nodes`,
          nodeId: codeNode.id,
          nodeName: codeNode.name,
          nodeType: codeNode.type
        });
      }
      suggestions.push(...suggestions);
    }

    // Check 3: Too few built-in nodes
    if (analysis.builtinNodeCount < this.MIN_BUILTIN_NODES && workflow.nodes.length > 1) {
      score -= 30;

      warnings.push({
        severity: 'error',
        message: `❌ Only ${analysis.builtinNodeCount} built-in nodes detected. Workflows should leverage n8n's built-in capabilities!`
      });

      suggestions.push({
        type: 'use_builtin_node',
        message: `Start by searching for built-in nodes that match your requirements before writing custom code`,
        reasoning: `Built-in nodes handle authentication, rate limiting, retries, and error handling automatically`
      });
    }

    // Check 4: Minimal architecture (just triggers + Code)
    if (this.isMinimalArchitecture(workflow)) {
      score -= 25;

      warnings.push({
        severity: 'warning',
        message: `⚠️  Detected minimal architecture pattern (trigger + code). This is usually a sign of under-utilizing n8n's capabilities.`
      });

      suggestions.push({
        type: 'simplify_workflow',
        message: `Consider using built-in nodes for data transformation, HTTP requests, and business logic`,
        reasoning: `The workflow appears to do everything in Code nodes when built-in nodes could handle it better`
      });
    }

    // Ensure score doesn't go negative
    score = Math.max(0, score);

    return {
      valid: score >= 60, // Pass threshold: 60%
      warnings,
      suggestions,
      score
    };
  }

  /**
   * Analyze node composition
   */
  private analyzeNodeComposition(nodes: WorkflowNode[]) {
    const codeNodes: WorkflowNode[] = [];
    let builtinNodeCount = 0;

    for (const node of nodes) {
      if (this.isCodeNode(node.type)) {
        codeNodes.push(node);
      } else if (!this.isTriggerNode(node.type)) {
        builtinNodeCount++;
      }
    }

    const totalActionNodes = nodes.length - nodes.filter(n => this.isTriggerNode(n.type)).length;
    const codeNodeRatio = totalActionNodes > 0 ? codeNodes.length / totalActionNodes : 0;

    return {
      codeNodes,
      codeNodeCount: codeNodes.length,
      builtinNodeCount,
      totalNodes: nodes.length,
      codeNodeRatio
    };
  }

  /**
   * Analyze a Code node to detect if it could be replaced
   */
  private async analyzeCodeNode(node: WorkflowNode): Promise<SemanticSuggestion[]> {
    const suggestions: SemanticSuggestion[] = [];
    const code = node.parameters?.jsCode || '';

    // Pattern 1: HTTP requests in Code nodes
    if (this.detectsHttpRequest(code)) {
      suggestions.push({
        type: 'replace_code_node',
        message: `Replace Code node "${node.name}" with HTTP Request node`,
        nodeId: node.id,
        recommendedNodeType: 'n8n-nodes-base.httpRequest',
        reasoning: `HTTP Request node handles authentication, retries, rate limiting, and error handling automatically`
      });
    }

    // Pattern 2: JSON/data transformation
    if (this.detectsDataTransformation(code)) {
      suggestions.push({
        type: 'replace_code_node',
        message: `Replace Code node "${node.name}" with Set/Edit Fields or Function node`,
        nodeId: node.id,
        recommendedNodeType: 'n8n-nodes-base.set',
        reasoning: `Set node provides visual interface for data transformation without writing code`
      });
    }

    // Pattern 3: Conditional logic
    if (this.detectsConditionalLogic(code)) {
      suggestions.push({
        type: 'replace_code_node',
        message: `Replace Code node "${node.name}" with IF or Switch node`,
        nodeId: node.id,
        recommendedNodeType: 'n8n-nodes-base.if',
        reasoning: `IF/Switch nodes provide visual branching logic that's easier to understand and maintain`
      });
    }

    // Pattern 4: API integration
    if (this.detectsApiIntegration(code)) {
      suggestions.push({
        type: 'use_builtin_node',
        message: `Search for a built-in integration node instead of using Code node "${node.name}"`,
        nodeId: node.id,
        reasoning: `n8n has 525+ built-in integrations. Check if there's already a node for this service.`
      });
    }

    return suggestions;
  }

  /**
   * Detect if workflow is minimal architecture (just trigger + code)
   */
  private isMinimalArchitecture(workflow: Workflow): boolean {
    const nodes = workflow.nodes;
    if (nodes.length <= 2) return true;

    const nonTriggerNodes = nodes.filter(n => !this.isTriggerNode(n.type));
    const codeNodes = nonTriggerNodes.filter(n => this.isCodeNode(n.type));

    // If >80% of non-trigger nodes are Code nodes, it's minimal architecture
    return nonTriggerNodes.length > 0 && (codeNodes.length / nonTriggerNodes.length) > 0.8;
  }

  /**
   * Check if node is a Code node
   */
  private isCodeNode(nodeType: string): boolean {
    return nodeType === 'n8n-nodes-base.code' ||
           nodeType === 'code' ||
           nodeType.includes('.code');
  }

  /**
   * Check if node is a trigger
   */
  private isTriggerNode(nodeType: string): boolean {
    return nodeType.toLowerCase().includes('trigger') ||
           nodeType.toLowerCase().includes('webhook');
  }

  /**
   * Detect HTTP request patterns in code
   */
  private detectsHttpRequest(code: string): boolean {
    const patterns = [
      /fetch\(/i,
      /axios\./i,
      /http\.get/i,
      /http\.post/i,
      /\$\.request/i,
      /XMLHttpRequest/i
    ];
    return patterns.some(pattern => pattern.test(code));
  }

  /**
   * Detect data transformation patterns
   */
  private detectsDataTransformation(code: string): boolean {
    const patterns = [
      /\.map\(/,
      /\.filter\(/,
      /\.reduce\(/,
      /JSON\.parse/,
      /JSON\.stringify/,
      /Object\.assign/,
      /Object\.keys/,
      /spread operator.*\.\.\./
    ];
    return patterns.some(pattern => pattern.test(code));
  }

  /**
   * Detect conditional logic patterns
   */
  private detectsConditionalLogic(code: string): boolean {
    const patterns = [
      /if\s*\(/,
      /else\s+if/,
      /switch\s*\(/,
      /\?\s*.*\s*:/,  // ternary operator
    ];

    // Only flag if there's significant branching logic (not just simple checks)
    const matches = patterns.filter(pattern => pattern.test(code)).length;
    return matches >= 2;
  }

  /**
   * Detect API integration patterns
   */
  private detectsApiIntegration(code: string): boolean {
    const apiServices = [
      /slack/i,
      /discord/i,
      /github/i,
      /jira/i,
      /salesforce/i,
      /hubspot/i,
      /stripe/i,
      /paypal/i,
      /shopify/i,
      /wordpress/i,
      /mailchimp/i,
      /sendgrid/i,
      /twilio/i
    ];
    return apiServices.some(pattern => pattern.test(code));
  }

  /**
   * Get semantic validation summary for logging
   */
  getSummary(result: SemanticValidationResult): string {
    const lines = [];
    lines.push(`\n📊 Workflow Semantic Validation Score: ${result.score}/100`);

    if (result.valid) {
      lines.push(`✅ PASSED - Workflow follows best practices`);
    } else {
      lines.push(`❌ FAILED - Workflow needs improvement`);
    }

    if (result.warnings.length > 0) {
      lines.push(`\n⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.forEach(w => lines.push(`   ${w.message}`));
    }

    if (result.suggestions.length > 0) {
      lines.push(`\n💡 Suggestions (${result.suggestions.length}):`);
      result.suggestions.slice(0, 3).forEach(s => lines.push(`   • ${s.message}`));
      if (result.suggestions.length > 3) {
        lines.push(`   ... and ${result.suggestions.length - 3} more`);
      }
    }

    return lines.join('\n');
  }
}
