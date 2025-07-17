// Working Visual Verification MCP Tools
// Lightweight system that actually works in Docker

import { LightweightVisualVerification } from '../services/lightweight-visual-verification';
import { logger } from '../utils/logger';

let visualSystem: LightweightVisualVerification | null = null;

/**
 * Working visual verification tool definitions
 */
export const workingVisualVerificationTools = [
  {
    name: 'setup_visual_verification',
    description: 'Initialize visual verification system that can actually see workflows. Works in Docker runtime without heavy dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        n8nUrl: {
          type: 'string',
          description: 'n8n instance URL (e.g., http://localhost:5678)',
          default: 'http://localhost:5678'
        },
        apiKey: {
          type: 'string',
          description: 'n8n API key for authentication (will use configured key if not provided)'
        }
      },
      required: []
    }
  },
  {
    name: 'verify_workflow_visually',
    description: 'Actually SEE a workflow and analyze it visually. Returns detailed visual analysis including layout, issues, and a description of what the workflow looks like.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'The n8n workflow ID to visually analyze'
        }
      },
      required: ['workflowId']
    }
  },
  {
    name: 'check_workflow_visual_health',
    description: 'Quick visual health check - tells you what issues can be seen in the workflow layout and structure.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'The workflow ID to check visually'
        }
      },
      required: ['workflowId']
    }
  }
];

/**
 * Handle working visual verification tool execution
 */
export async function executeWorkingVisualTool(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'setup_visual_verification':
        return await handleSetupVisualVerification(args);
      
      case 'verify_workflow_visually':
        return await handleVerifyWorkflowVisually(args);
      
      case 'check_workflow_visual_health':
        return await handleCheckWorkflowVisualHealth(args);
      
      default:
        throw new Error(`Unknown visual verification tool: ${name}`);
    }
  } catch (error) {
    logger.error(`[Working Visual] Error in tool ${name}:`, error);
    throw error;
  }
}

/**
 * Setup visual verification system
 */
async function handleSetupVisualVerification(args: {
  n8nUrl?: string;
  apiKey?: string;
}): Promise<any> {
  try {
    const n8nUrl = args.n8nUrl || process.env.N8N_API_URL || 'http://localhost:5678';
    const apiKey = args.apiKey || process.env.N8N_API_KEY;

    if (!apiKey) {
      throw new Error('API key is required. Provide it as parameter or set N8N_API_KEY environment variable.');
    }

    visualSystem = new LightweightVisualVerification(n8nUrl, apiKey);
    
    logger.info('[Working Visual] Visual verification system initialized');
    
    return {
      status: 'success',
      message: 'Visual verification system is now ready to see workflows!',
      n8nUrl,
      capabilities: [
        'Can analyze workflow layouts and positioning',
        'Can detect visual issues like overlapping nodes',
        'Can identify disconnected nodes and layout problems',
        'Can provide visual descriptions of workflows',
        'Can access n8n UI to verify workflow visibility',
        'Works in Docker runtime environment'
      ],
      nextSteps: [
        'Use verify_workflow_visually() to see a complete workflow analysis',
        'Use check_workflow_visual_health() for quick health checks'
      ]
    };
  } catch (error) {
    logger.error('[Working Visual] Setup failed:', error);
    throw new Error(`Failed to initialize visual verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify workflow visually
 */
async function handleVerifyWorkflowVisually(args: {
  workflowId: string;
}): Promise<any> {
  if (!visualSystem) {
    throw new Error('Visual verification system not initialized. Call setup_visual_verification first.');
  }

  const { workflowId } = args;
  
  try {
    logger.info(`[Working Visual] Starting visual analysis of workflow ${workflowId}`);
    
    const analysis = await visualSystem.verifyWorkflow(workflowId);
    
    return {
      workflowId: analysis.workflowId,
      workflowName: analysis.workflowName,
      
      // What I can actually SEE
      visualDescription: analysis.visualDescription,
      canSeeWorkflow: analysis.canSeeWorkflow,
      
      // Overall assessment
      overallHealth: analysis.overallHealth,
      
      // Detailed metrics
      structure: {
        nodeCount: analysis.nodeCount,
        connectionCount: analysis.connectionCount,
        layout: {
          dimensions: `${Math.round(analysis.layout.width)} x ${Math.round(analysis.layout.height)} pixels`,
          density: Math.round(analysis.layout.density * 100) / 100,
          averageSpacing: `${Math.round(analysis.layout.averageSpacing)} pixels`
        }
      },
      
      // Visual issues detected
      visualIssues: {
        total: analysis.issues.length,
        critical: analysis.issues.filter(i => i.severity === 'high').length,
        warnings: analysis.issues.filter(i => i.severity === 'medium').length,
        minor: analysis.issues.filter(i => i.severity === 'low').length,
        details: analysis.issues.map(issue => ({
          type: issue.type,
          severity: issue.severity,
          description: issue.description,
          node: issue.nodeName,
          position: issue.coordinates,
          howToFix: issue.suggestion
        }))
      },
      
      // Recommendations
      recommendations: generateVisualRecommendations(analysis),
      
      // Action needed
      actionRequired: analysis.overallHealth === 'error',
      canSafelyUse: analysis.overallHealth !== 'error'
    };
  } catch (error) {
    logger.error(`[Working Visual] Failed to verify workflow ${workflowId}:`, error);
    throw new Error(`Visual verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check workflow visual health
 */
async function handleCheckWorkflowVisualHealth(args: {
  workflowId: string;
}): Promise<any> {
  if (!visualSystem) {
    throw new Error('Visual verification system not initialized. Call setup_visual_verification first.');
  }

  const { workflowId } = args;
  
  try {
    logger.info(`[Working Visual] Checking visual health of workflow ${workflowId}`);
    
    const analysis = await visualSystem.verifyWorkflow(workflowId);
    
    return {
      workflowId: analysis.workflowId,
      workflowName: analysis.workflowName,
      overallHealth: analysis.overallHealth,
      
      quickSummary: analysis.visualDescription,
      
      healthCheck: {
        canSeeWorkflow: analysis.canSeeWorkflow,
        hasVisualIssues: analysis.issues.length > 0,
        issueCount: analysis.issues.length,
        criticalIssues: analysis.issues.filter(i => i.severity === 'high').length,
        layoutHealth: analysis.layout.averageSpacing > 150 ? 'good' : 'cramped',
        connectionHealth: analysis.connectionCount > 0 || analysis.nodeCount <= 1 ? 'good' : 'missing'
      },
      
      quickFixes: analysis.issues
        .filter(i => i.severity === 'high')
        .slice(0, 3)
        .map(issue => issue.suggestion),
      
      recommendation: getHealthRecommendation(analysis.overallHealth, analysis.issues.length)
    };
  } catch (error) {
    logger.error(`[Working Visual] Failed to check workflow health for ${workflowId}:`, error);
    throw new Error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate visual recommendations
 */
function generateVisualRecommendations(analysis: any): string[] {
  const recommendations: string[] = [];
  
  if (!analysis.canSeeWorkflow) {
    recommendations.push('⚠️ Unable to access workflow UI - check n8n URL and authentication');
  }
  
  const criticalIssues = analysis.issues.filter((i: any) => i.severity === 'high');
  const warningIssues = analysis.issues.filter((i: any) => i.severity === 'medium');
  
  if (criticalIssues.length > 0) {
    recommendations.push(`🚨 Fix ${criticalIssues.length} critical visual issue(s) before using this workflow`);
  }
  
  if (warningIssues.length > 0) {
    recommendations.push(`⚠️ Consider fixing ${warningIssues.length} layout warning(s) for better usability`);
  }
  
  if (analysis.layout.averageSpacing < 150 && analysis.nodeCount > 3) {
    recommendations.push('📐 Increase spacing between nodes for better readability');
  }
  
  if (analysis.connectionCount === 0 && analysis.nodeCount > 1) {
    recommendations.push('🔗 Connect the nodes to create a functional workflow');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ Workflow looks visually healthy - good to use!');
  }
  
  return recommendations;
}

/**
 * Get health recommendation
 */
function getHealthRecommendation(health: string, issueCount: number): string {
  switch (health) {
    case 'healthy':
      return 'Workflow is visually perfect and ready to use.';
    case 'warning':
      return `Workflow has ${issueCount} visual issues that should be addressed for better usability.`;
    case 'error':
      return `Workflow has critical visual issues that must be fixed before it can work properly.`;
    default:
      return 'Unable to determine workflow visual health.';
  }
}