#!/usr/bin/env node
/**
 * Script to analyze the Teams-Outlook-Assistant workflow
 * Queries n8n API to get workflow details, nodes, and connections
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error('Error: N8N_API_KEY not configured in .env file');
  process.exit(1);
}

interface N8NNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters?: Record<string, any>;
  credentials?: Record<string, any>;
}

interface N8NConnection {
  [sourceNode: string]: {
    [outputType: string]: Array<Array<{
      node: string;
      type: string;
      index: number;
    }>>;
  };
}

interface N8NWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8NNode[];
  connections: N8NConnection;
  settings?: Record<string, any>;
  tags?: Array<{ id: string; name: string }>;
}

async function makeN8NRequest(endpoint: string, method = 'GET', body?: any) {
  const url = `${N8N_API_URL}/api/v1${endpoint}`;
  const headers: Record<string, string> = {
    'X-N8N-API-KEY': N8N_API_KEY!,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to connect to n8n API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function listWorkflows(): Promise<N8NWorkflow[]> {
  console.log('📋 Listing all workflows...\n');
  const response = await makeN8NRequest('/workflows');
  return response.data || [];
}

async function getWorkflow(workflowId: string): Promise<N8NWorkflow> {
  console.log(`🔍 Fetching workflow ${workflowId}...\n`);
  return await makeN8NRequest(`/workflows/${workflowId}`);
}

async function analyzeWorkflow(workflow: N8NWorkflow) {
  console.log('=' .repeat(80));
  console.log(`WORKFLOW ANALYSIS: ${workflow.name}`);
  console.log('=' .repeat(80));
  console.log();

  // Basic info
  console.log('📊 BASIC INFORMATION');
  console.log('-' .repeat(80));
  console.log(`ID: ${workflow.id}`);
  console.log(`Name: ${workflow.name}`);
  console.log(`Active: ${workflow.active ? '✅ Yes' : '❌ No'}`);
  console.log(`Total Nodes: ${workflow.nodes.length}`);
  console.log();

  // Tags
  if (workflow.tags && workflow.tags.length > 0) {
    console.log('🏷️  TAGS');
    console.log('-' .repeat(80));
    workflow.tags.forEach(tag => console.log(`  - ${tag.name}`));
    console.log();
  }

  // Node analysis
  console.log('🔧 NODES');
  console.log('-' .repeat(80));

  const nodesByType: Record<string, N8NNode[]> = {};
  workflow.nodes.forEach(node => {
    if (!nodesByType[node.type]) {
      nodesByType[node.type] = [];
    }
    nodesByType[node.type].push(node);
  });

  Object.entries(nodesByType).forEach(([type, nodes]) => {
    console.log(`\n📦 ${type} (${nodes.length} instance${nodes.length > 1 ? 's' : ''})`);
    nodes.forEach(node => {
      console.log(`   • ${node.name} (ID: ${node.id}, v${node.typeVersion})`);

      // Show key parameters
      if (node.parameters && Object.keys(node.parameters).length > 0) {
        const importantParams = ['resource', 'operation', 'url', 'method', 'collection', 'table'];
        const params = Object.entries(node.parameters)
          .filter(([key]) => importantParams.includes(key))
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
        if (params) {
          console.log(`     Parameters: ${params}`);
        }
      }

      // Show credentials
      if (node.credentials && Object.keys(node.credentials).length > 0) {
        const creds = Object.keys(node.credentials).join(', ');
        console.log(`     Credentials: ${creds}`);
      }
    });
  });

  console.log();

  // Connection analysis
  console.log('🔗 CONNECTIONS');
  console.log('-' .repeat(80));

  if (Object.keys(workflow.connections).length === 0) {
    console.log('⚠️  No connections found');
  } else {
    Object.entries(workflow.connections).forEach(([sourceNode, outputs]) => {
      Object.entries(outputs).forEach(([outputType, connectionArrays]) => {
        connectionArrays.forEach((connections, outputIndex) => {
          connections.forEach(connection => {
            console.log(`${sourceNode} → ${connection.node} (${outputType}[${outputIndex}])`);
          });
        });
      });
    });
  }

  console.log();

  // Integration points
  console.log('🔌 INTEGRATION POINTS');
  console.log('-' .repeat(80));

  const integrations = {
    outlook: workflow.nodes.filter(n => n.type.toLowerCase().includes('outlook')),
    teams: workflow.nodes.filter(n => n.type.toLowerCase().includes('teams')),
    database: workflow.nodes.filter(n =>
      n.type.toLowerCase().includes('postgres') ||
      n.type.toLowerCase().includes('mysql') ||
      n.type.toLowerCase().includes('mongodb') ||
      n.type.toLowerCase().includes('supabase') ||
      n.type.toLowerCase().includes('airtable')
    ),
    webhooks: workflow.nodes.filter(n => n.type.toLowerCase().includes('webhook')),
    http: workflow.nodes.filter(n => n.type.toLowerCase().includes('http')),
    ai: workflow.nodes.filter(n =>
      n.type.toLowerCase().includes('ai') ||
      n.type.toLowerCase().includes('llm') ||
      n.type.toLowerCase().includes('openai') ||
      n.type.toLowerCase().includes('langchain')
    ),
  };

  Object.entries(integrations).forEach(([category, nodes]) => {
    if (nodes.length > 0) {
      console.log(`\n${category.toUpperCase()}: ${nodes.length} node${nodes.length > 1 ? 's' : ''}`);
      nodes.forEach(node => {
        console.log(`  • ${node.name} (${node.type})`);
      });
    }
  });

  console.log();
  console.log('=' .repeat(80));
  console.log();
}

async function main() {
  try {
    console.log('🚀 Teams-Outlook-Assistant Workflow Analyzer');
    console.log();

    // List all workflows
    const workflows = await listWorkflows();
    console.log(`Found ${workflows.length} workflow(s):\n`);
    workflows.forEach((wf, idx) => {
      console.log(`${idx + 1}. ${wf.name} (ID: ${wf.id}) - ${wf.active ? 'Active' : 'Inactive'}`);
    });
    console.log();

    // Find Teams-Outlook-Assistant workflow
    const teamsWorkflow = workflows.find(wf =>
      wf.name.toLowerCase().includes('teams') ||
      wf.name.toLowerCase().includes('outlook')
    );

    if (!teamsWorkflow) {
      console.log('⚠️  No Teams-Outlook-Assistant workflow found');
      console.log('Available workflows:');
      workflows.forEach(wf => console.log(`  - ${wf.name}`));
      return;
    }

    // Get full workflow details
    const fullWorkflow = await getWorkflow(teamsWorkflow.id);

    // Analyze the workflow
    await analyzeWorkflow(fullWorkflow);

    // Save workflow JSON for reference
    const fs = await import('fs/promises');
    const outputPath = path.join(process.cwd(), 'teams-outlook-workflow.json');
    await fs.writeFile(outputPath, JSON.stringify(fullWorkflow, null, 2));
    console.log(`💾 Full workflow JSON saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
