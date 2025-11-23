#!/usr/bin/env node
/**
 * Diagnostic Script: Identify structural issues in broken n8n workflows
 *
 * This script uses the MCP server's WorkflowValidator to identify exactly
 * what's wrong with a workflow that won't render in n8n UI.
 *
 * Usage:
 *   npx ts-node scripts/diagnose-broken-workflow.ts <workflow-id>
 *   Example: npx ts-node scripts/diagnose-broken-workflow.ts 2dTTm6g4qFmcTob1
 */

import * as path from 'path';
import * as fs from 'fs';

// TypeScript needs to resolve modules from src
require('ts-node').register({
  project: path.join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
});

import { N8nApiClient } from '../src/services/n8n-api-client';
import { WorkflowValidator } from '../src/services/workflow-validator';
import { NodeRepository } from '../src/database/node-repository';
import { getN8nApiConfig } from '../src/config/n8n-api';

interface DiagnosticReport {
  timestamp: string;
  workflowId: string;
  workflowName: string;
  validationResult: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    errors: any[];
    warnings: any[];
    suggestions: string[];
  };
  nodeAnalysis: {
    totalNodes: number;
    nodeDetails: Array<{
      id: string;
      name: string;
      type: string;
      disabled: boolean;
      hasIssues: boolean;
      issues: string[];
    }>;
  };
  connectionAnalysis: {
    totalConnections: number;
    connectionDetails: Array<{
      source: string;
      targets: string[];
      type: string;
    }>;
  };
  recommendations: string[];
}

async function diagnoseWorkflow(workflowId: string): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('MCP Server Workflow Diagnostic Tool');
  console.log('='.repeat(80) + '\n');

  try {
    // Initialize services
    console.log('[1/5] Initializing services...');
    const config = getN8nApiConfig();

    if (!config) {
      console.error('ERROR: n8n API not configured. Check N8N_API_URL and N8N_API_KEY');
      process.exit(1);
    }

    const apiClient = new N8nApiClient(config);
    const repository = new NodeRepository();
    const validator = new WorkflowValidator(repository);

    console.log('✓ Services initialized\n');

    // Fetch workflow
    console.log(`[2/5] Fetching workflow ${workflowId}...`);
    let workflow;
    try {
      workflow = await apiClient.getWorkflow(workflowId);
      console.log(`✓ Workflow fetched: "${workflow.name}"\n`);
    } catch (error) {
      console.error(`ERROR: Could not fetch workflow: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    // Run validation
    console.log('[3/5] Running comprehensive validation...');
    const validationResult = await validator.validateWorkflow(workflow, {
      validateNodes: true,
      validateConnections: true,
      validateExpressions: true,
      profile: 'strict',
    });
    console.log('✓ Validation complete\n');

    // Analyze nodes
    console.log('[4/5] Analyzing node configuration...');
    const nodeDetails = workflow.nodes.map(node => {
      const issues: string[] = [];

      // Check for common issues
      if (!node.typeVersion && workflow.nodes.some(n => n.typeVersion)) {
        issues.push('Missing typeVersion (other nodes have it)');
      }

      if (!node.parameters || Object.keys(node.parameters).length === 0) {
        issues.push('No parameters configured');
      }

      return {
        id: node.id,
        name: node.name,
        type: node.type,
        disabled: node.disabled || false,
        hasIssues: issues.length > 0,
        issues,
      };
    });
    console.log(`✓ Analyzed ${workflow.nodes.length} nodes\n`);

    // Analyze connections
    console.log('[5/5] Analyzing workflow connections...');
    const connectionDetails: Array<{ source: string; targets: string[]; type: string }> = [];

    for (const [source, outputs] of Object.entries(workflow.connections)) {
      if (outputs.main) {
        const targets = outputs.main.flat()
          .filter(conn => conn && conn.node)
          .map(conn => conn.node);
        if (targets.length > 0) {
          connectionDetails.push({
            source,
            targets,
            type: 'main',
          });
        }
      }

      if (outputs.error) {
        const targets = outputs.error.flat()
          .filter(conn => conn && conn.node)
          .map(conn => conn.node);
        if (targets.length > 0) {
          connectionDetails.push({
            source,
            targets,
            type: 'error',
          });
        }
      }
    }
    console.log(`✓ Analyzed ${connectionDetails.length} connection paths\n`);

    // Build recommendations
    const recommendations: string[] = [];

    if (!validationResult.valid) {
      recommendations.push('🔴 WORKFLOW STRUCTURE IS BROKEN - Fix the errors below before deploying');

      if (validationResult.errors.some(e => e.message.includes('connection'))) {
        recommendations.push('  1. Fix connection issues (missing nodes, invalid references)');
      }

      if (validationResult.errors.some(e => e.message.includes('node'))) {
        recommendations.push('  2. Fix node configuration errors (type, parameters, typeVersion)');
      }

      if (validationResult.errors.some(e => e.message.includes('duplicate'))) {
        recommendations.push('  3. Remove duplicate connections or nodes');
      }

      if (validationResult.suggestions.length > 0) {
        recommendations.push(...validationResult.suggestions);
      }
    } else {
      recommendations.push('✅ Workflow structure is valid');
      recommendations.push('   Can be safely deployed and should render in n8n UI');
    }

    // Build report
    const report: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      validationResult: {
        valid: validationResult.valid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions,
      },
      nodeAnalysis: {
        totalNodes: workflow.nodes.length,
        nodeDetails,
      },
      connectionAnalysis: {
        totalConnections: connectionDetails.length,
        connectionDetails,
      },
      recommendations,
    };

    // Display results
    console.log('='.repeat(80));
    console.log('DIAGNOSTIC REPORT');
    console.log('='.repeat(80) + '\n');

    console.log(`Workflow: "${report.workflowName}" (${report.workflowId})`);
    console.log(`Generated: ${report.timestamp}\n`);

    console.log('VALIDATION STATUS');
    console.log('-'.repeat(80));
    if (report.validationResult.valid) {
      console.log('✅ VALID - Workflow structure is correct');
    } else {
      console.log('❌ INVALID - Workflow has structural errors');
    }
    console.log(`   Errors: ${report.validationResult.errorCount}`);
    console.log(`   Warnings: ${report.validationResult.warningCount}\n`);

    if (report.validationResult.errorCount > 0) {
      console.log('ERRORS');
      console.log('-'.repeat(80));
      report.validationResult.errors.forEach((error, idx) => {
        console.log(`${idx + 1}. [${error.nodeName || 'WORKFLOW'}] ${error.message}`);
        if (error.details) {
          console.log(`   Details: ${JSON.stringify(error.details)}`);
        }
      });
      console.log();
    }

    if (report.validationResult.warningCount > 0) {
      console.log('WARNINGS');
      console.log('-'.repeat(80));
      report.validationResult.warnings.forEach((warning, idx) => {
        console.log(`${idx + 1}. [${warning.nodeName || 'WORKFLOW'}] ${warning.message}`);
      });
      console.log();
    }

    console.log('NODE ANALYSIS');
    console.log('-'.repeat(80));
    console.log(`Total Nodes: ${report.nodeAnalysis.totalNodes}`);
    const problemNodes = report.nodeAnalysis.nodeDetails.filter(n => n.hasIssues);
    if (problemNodes.length > 0) {
      console.log(`Nodes with Issues: ${problemNodes.length}\n`);
      problemNodes.forEach(node => {
        console.log(`  ❌ ${node.name} (${node.type})`);
        node.issues.forEach(issue => console.log(`     - ${issue}`));
      });
    } else {
      console.log('All nodes appear correctly configured\n');
    }

    console.log('CONNECTION ANALYSIS');
    console.log('-'.repeat(80));
    console.log(`Total Connection Paths: ${report.connectionAnalysis.totalConnections}`);
    if (report.connectionAnalysis.totalConnections === 0) {
      console.log('⚠️  WARNING: No connections found in workflow');
    } else {
      report.connectionAnalysis.connectionDetails.forEach(conn => {
        console.log(`  ${conn.source} → [${conn.type}] → ${conn.targets.join(', ')}`);
      });
    }
    console.log();

    console.log('RECOMMENDATIONS');
    console.log('-'.repeat(80));
    report.recommendations.forEach(rec => console.log(rec));
    console.log();

    // Save report to file
    const reportPath = path.join(__dirname, `..`, `DIAGNOSTIC_REPORT_${workflowId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📁 Full report saved to: ${reportPath}\n`);

    console.log('='.repeat(80) + '\n');

    // Exit with appropriate code
    process.exit(report.validationResult.valid ? 0 : 1);

  } catch (error) {
    console.error('\nFATAL ERROR:', error instanceof Error ? error.message : String(error));
    console.error('\nStack:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

// Get workflow ID from command line
const workflowId = process.argv[2];

if (!workflowId) {
  console.error('Usage: npx ts-node scripts/diagnose-broken-workflow.ts <workflow-id>');
  console.error('Example: npx ts-node scripts/diagnose-broken-workflow.ts 2dTTm6g4qFmcTob1');
  process.exit(1);
}

diagnoseWorkflow(workflowId);
