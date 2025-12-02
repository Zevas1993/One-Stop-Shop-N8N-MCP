#!/usr/bin/env node

/**
 * Verify Current n8n Workflows via MCP Tools
 *
 * This script uses the MCP tools to query the actual n8n system
 * and retrieve information about the current workflow setup
 */

const http = require('http');
const { spawn } = require('child_process');

// Function to make JSON-RPC calls to MCP server
async function callMCPTool(toolName, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n📡 Calling MCP Tool: ${toolName}`);
    console.log(`Args:`, args);

    // For now, we'll document what we'd like to retrieve
    const requests = {
      'list_workflows': 'List all workflows in n8n instance',
      'get_workflow_structure': 'Get workflow structure and nodes',
      'list_nodes': 'List available n8n nodes with details',
      'search_nodes': 'Search for specific nodes'
    };

    // Log what we would retrieve
    console.log(`\nWould retrieve: ${requests[toolName]}`);
    resolve({
      status: 'would_call',
      tool: toolName,
      message: 'MCP tool call (requires stdio connection)'
    });
  });
}

// Main analysis
async function analyzeWorkflows() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Current n8n Workflow Analysis via MCP Tools');
  console.log('═══════════════════════════════════════════════════════════\n');

  const tools = [
    {
      name: 'list_workflows',
      args: {},
      description: 'Retrieve all workflow IDs, names, and basic info'
    },
    {
      name: 'get_workflow_structure',
      args: { workflowId: 'teams-outlook-assistant' },
      description: 'Get the current Teams-Outlook workflow structure'
    },
    {
      name: 'list_nodes',
      args: {
        filter: 'microsoft',
        limit: 50
      },
      description: 'List all Microsoft-related nodes (Outlook, Teams)'
    },
    {
      name: 'search_nodes',
      args: {
        query: 'code',
        limit: 20
      },
      description: 'Search for Code nodes in the system'
    }
  ];

  console.log('Tools to call via MCP:\n');
  for (const tool of tools) {
    console.log(`\n1️⃣  TOOL: ${tool.name}`);
    console.log(`   Description: ${tool.description}`);
    console.log(`   Arguments:`, JSON.stringify(tool.args, null, 2));
    await callMCPTool(tool.name, tool.args);
  }

  // Document what we need to discover
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('   WORKFLOW ANALYSIS OBJECTIVES');
  console.log('═══════════════════════════════════════════════════════════\n');

  const objectives = {
    'Current Nodes': [
      'Identify all nodes in current workflow',
      'Document node configurations',
      'Map data flow between nodes',
      'Identify trigger points',
      'List output destinations'
    ],
    'Node Parameters': [
      'Get Outlook trigger configuration',
      'Get Teams integration setup',
      'List all node parameters and settings',
      'Document API connections',
      'Note any custom code nodes'
    ],
    'Data Flow': [
      'Trace email data from trigger to output',
      'Document variable mappings',
      'Identify transformations applied',
      'List database interactions',
      'Map decision points'
    ],
    'Integration Points': [
      'Confirm Outlook API connectivity',
      'Confirm Teams API connectivity',
      'Check database connections',
      'Verify AI/ML integrations',
      'Check GraphRAG bridge status'
    ],
    'Error Handling': [
      'Identify error handlers',
      'Document fallback procedures',
      'Check logging setup',
      'Review retry logic',
      'Note escalation paths'
    ]
  };

  for (const [category, items] of Object.entries(objectives)) {
    console.log(`\n📋 ${category}:`);
    items.forEach(item => {
      console.log(`   ✓ ${item}`);
    });
  }

  // Document the query we would make
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('   MCP QUERIES TO EXECUTE');
  console.log('═══════════════════════════════════════════════════════════\n');

  const queries = [
    {
      title: 'Get Workflow Details',
      code: `
      GET /mcp/tools
      {
        "method": "tools/call",
        "params": {
          "name": "get_workflow_structure",
          "arguments": {
            "workflowId": "teams-outlook-assistant",
            "includeNodeDetails": true,
            "includeConnections": true,
            "includeParameters": true
          }
        }
      }
      `
    },
    {
      title: 'List All Nodes in Workflow',
      code: `
      {
        "method": "tools/call",
        "params": {
          "name": "get_workflow_details",
          "arguments": {
            "workflowId": "teams-outlook-assistant"
          }
        }
      }
      `
    },
    {
      title: 'Get Node Types Used',
      code: `
      {
        "method": "tools/call",
        "params": {
          "name": "list_nodes",
          "arguments": {
            "filter": ".*",
            "limit": 100
          }
        }
      }
      `
    }
  ];

  queries.forEach((query, idx) => {
    console.log(`Query ${idx + 1}: ${query.title}`);
    console.log(query.code);
  });

  // Document findings to expect
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('   EXPECTED WORKFLOW COMPONENTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const components = {
    'INPUT TRIGGERS': [
      '✓ Outlook Email Trigger (new email detection)',
      '✓ Teams Message Trigger (user message detection)',
      '✓ Possibly Manual Trigger (for testing)'
    ],
    'EMAIL PROCESSING': [
      '✓ Email enrichment/parsing nodes',
      '✓ Data extraction nodes',
      '✓ Possibly fraud detection nodes'
    ],
    'AI ORCHESTRATION': [
      '✓ Central Orchestrator node',
      '✓ Pattern matching nodes',
      '✓ AI/Claude integration nodes',
      '✓ Routing logic nodes'
    ],
    'SPECIALIZED AGENTS': [
      '✓ Fraud Classifier Agent',
      '✓ Triage Agent',
      '✓ High Priority Response Agent',
      '✓ Possibly other specialized agents'
    ],
    'OUTPUT CHANNELS': [
      '✓ Outlook (Draft creation, Email sending)',
      '✓ Microsoft Teams (Message sending)',
      '✓ Possibly database storage'
    ],
    'DATABASE OPERATIONS': [
      '✓ Search/query nodes',
      '✓ Insert/update nodes',
      '✓ Logging nodes'
    ]
  };

  for (const [section, items] of Object.entries(components)) {
    console.log(`\n${section}:`);
    items.forEach(item => {
      console.log(`   ${item}`);
    });
  }

  // Next steps
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('   NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`
  1. EXECUTE MCP TOOL CALLS
     Use n8n's MCP interface to retrieve actual workflow structure

  2. DOCUMENT CURRENT STATE
     Create detailed map of current nodes and connections

  3. IDENTIFY ENHANCEMENT POINTS
     Find where to insert new intelligence nodes

  4. PLAN NODE ADDITIONS
     Create detailed plan for each new node with:
       - Position in workflow
       - Input/output mappings
       - Configuration parameters
       - Data transformations

  5. IMPLEMENTATION APPROACH
     Based on actual workflow structure:
       - Determine insertion points for enrichment
       - Plan context loading integration
       - Design Teams card formatting
       - Plan error handling paths
  `);

  console.log('\n═══════════════════════════════════════════════════════════\n');
  console.log('Ready to execute MCP tool calls when connected via stdio.\n');
}

// Run analysis
analyzeWorkflows().catch(err => {
  console.error('Error during analysis:', err);
  process.exit(1);
});
