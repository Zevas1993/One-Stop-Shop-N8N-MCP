#!/usr/bin/env node

/**
 * Deep Diagnostic Analysis of n8n Workflow Rendering Issue
 *
 * This script analyzes why workflow 2dTTm6g4qFmcTob1 won't render in the n8n UI
 */

const fs = require('fs');
const path = require('path');

// Load the actual workflow from the API
const actualWorkflow = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'actual-workflow-from-api.json'), 'utf8')
);

console.log('================================================================================');
console.log('DEEP DIAGNOSTIC ANALYSIS: Workflow Rendering Issue');
console.log('================================================================================\n');

// ============================================================================
// 1. BASIC WORKFLOW INFORMATION
// ============================================================================
console.log('1. BASIC WORKFLOW INFORMATION');
console.log('─'.repeat(80));
console.log(`Workflow ID: ${actualWorkflow.id}`);
console.log(`Name: ${actualWorkflow.name}`);
console.log(`Active: ${actualWorkflow.active}`);
console.log(`Created: ${actualWorkflow.createdAt}`);
console.log(`Updated: ${actualWorkflow.updatedAt}`);
console.log(`Total Nodes: ${actualWorkflow.nodes.length}`);
console.log(`Total Connections: ${Object.keys(actualWorkflow.connections || {}).length}`);
console.log();

// ============================================================================
// 2. DETAILED NODE ANALYSIS
// ============================================================================
console.log('2. DETAILED NODE ANALYSIS');
console.log('─'.repeat(80));

const nodeIssues = [];
const nodeNames = new Set();
const nodeIds = new Set();

actualWorkflow.nodes.forEach((node, index) => {
  console.log(`\nNode ${index + 1}:`);
  console.log(`  ID: ${node.id}`);
  console.log(`  Name: ${node.name}`);
  console.log(`  Type: ${node.type}`);
  console.log(`  Position: ${JSON.stringify(node.position)}`);
  console.log(`  TypeVersion: ${node.typeVersion}`);

  // Track node IDs and names
  nodeIds.add(node.id);
  if (nodeNames.has(node.name)) {
    nodeIssues.push(`DUPLICATE NAME: "${node.name}" appears multiple times`);
  }
  nodeNames.add(node.name);

  // Check required fields
  if (!node.id) nodeIssues.push(`Node ${index}: Missing ID`);
  if (!node.name) nodeIssues.push(`Node ${index}: Missing name`);
  if (!node.type) nodeIssues.push(`Node ${index}: Missing type`);
  if (!node.typeVersion) nodeIssues.push(`Node ${index}: Missing typeVersion`);

  // Check position array
  if (!Array.isArray(node.position)) {
    nodeIssues.push(`Node "${node.name}": Position is not an array`);
  } else if (node.position.length !== 2) {
    nodeIssues.push(`Node "${node.name}": Position array must have exactly 2 elements, has ${node.position.length}`);
  } else if (typeof node.position[0] !== 'number' || typeof node.position[1] !== 'number') {
    nodeIssues.push(`Node "${node.name}": Position values must be numbers`);
  }

  // Check for null/undefined in critical fields
  if (node.parameters === null || node.parameters === undefined) {
    nodeIssues.push(`Node "${node.name}": Parameters is null/undefined`);
  }

  // Check for problematic parameter values
  if (node.parameters) {
    const paramStr = JSON.stringify(node.parameters);
    if (paramStr.includes('undefined') || paramStr.includes('null')) {
      console.log(`  WARNING: Parameters contain null/undefined values`);
      console.log(`  Parameters: ${paramStr.substring(0, 200)}...`);
    }
  }

  console.log(`  Parameters Keys: ${node.parameters ? Object.keys(node.parameters).join(', ') : 'none'}`);
});

console.log();

// ============================================================================
// 3. CONNECTION ANALYSIS
// ============================================================================
console.log('\n3. CONNECTION ANALYSIS');
console.log('─'.repeat(80));

const connectionIssues = [];
const connections = actualWorkflow.connections || {};

Object.entries(connections).forEach(([sourceName, outputs]) => {
  console.log(`\nFrom: "${sourceName}"`);

  // Check if source node exists
  if (!nodeNames.has(sourceName)) {
    connectionIssues.push(`Connection source "${sourceName}" does not match any node name`);
  }

  Object.entries(outputs).forEach(([outputType, connectionGroups]) => {
    console.log(`  Output Type: ${outputType}`);

    if (Array.isArray(connectionGroups)) {
      connectionGroups.forEach((group, groupIndex) => {
        console.log(`    Group ${groupIndex}:`);

        if (Array.isArray(group)) {
          group.forEach((conn, connIndex) => {
            console.log(`      Connection ${connIndex}:`);
            console.log(`        Target Node: ${conn.node}`);
            console.log(`        Type: ${conn.type}`);
            console.log(`        Index: ${conn.index}`);

            // Check if target node exists
            if (!nodeNames.has(conn.node)) {
              connectionIssues.push(`Connection to "${conn.node}" from "${sourceName}" - target node does not exist`);
            }

            // Check for required connection fields
            if (!conn.node) connectionIssues.push(`Connection from "${sourceName}": Missing target node`);
            if (!conn.type) connectionIssues.push(`Connection from "${sourceName}": Missing type`);
            if (conn.index === null || conn.index === undefined) {
              connectionIssues.push(`Connection from "${sourceName}" to "${conn.node}": Missing index`);
            }
          });
        } else {
          connectionIssues.push(`Connection group is not an array in "${sourceName}"`);
        }
      });
    } else {
      connectionIssues.push(`Output type "${outputType}" in "${sourceName}" is not an array`);
    }
  });
});

console.log();

// ============================================================================
// 4. NODE TYPES VALIDATION
// ============================================================================
console.log('\n4. NODE TYPES VALIDATION');
console.log('─'.repeat(80));

const nodeTypeIssues = [];
const nodesByType = {};

actualWorkflow.nodes.forEach(node => {
  if (!nodesByType[node.type]) {
    nodesByType[node.type] = [];
  }
  nodesByType[node.type].push(node.name);

  // Check for common node type issues
  if (node.type.startsWith('nodes-base.')) {
    nodeTypeIssues.push(`Node "${node.name}": Type starts with "nodes-base." instead of "n8n-nodes-base."`);
  }

  if (node.type.includes('..')) {
    nodeTypeIssues.push(`Node "${node.name}": Type contains double dots: ${node.type}`);
  }

  if (!node.type.includes('.') && !node.type.startsWith('@')) {
    nodeTypeIssues.push(`Node "${node.name}": Type missing package prefix: ${node.type}`);
  }
});

console.log('Node Types Found:');
Object.entries(nodesByType).forEach(([type, nodes]) => {
  console.log(`  ${type}: ${nodes.length} node(s)`);
  nodes.forEach(name => console.log(`    - ${name}`));
});

console.log();

// ============================================================================
// 5. AI CONNECTION ANALYSIS (LangChain)
// ============================================================================
console.log('\n5. AI CONNECTION ANALYSIS (LangChain)');
console.log('─'.repeat(80));

const aiConnectionIssues = [];
const aiNodeTypes = {
  'ai_languageModel': [],
  'ai_memory': [],
  'ai_tool': [],
  'ai_agent': []
};

// Find all agent nodes
const agentNodes = actualWorkflow.nodes.filter(n =>
  n.type.includes('.agent') || n.type.includes('Agent')
);

console.log(`Agent Nodes Found: ${agentNodes.length}`);
agentNodes.forEach(agent => {
  console.log(`\n  Agent: "${agent.name}" (${agent.id})`);

  // Check for AI connections TO this agent
  let hasLanguageModel = false;
  let hasTools = false;
  let hasMemory = false;

  Object.entries(connections).forEach(([sourceName, outputs]) => {
    Object.entries(outputs).forEach(([outputType, connectionGroups]) => {
      if (Array.isArray(connectionGroups)) {
        connectionGroups.forEach(group => {
          if (Array.isArray(group)) {
            group.forEach(conn => {
              if (conn.node === agent.name) {
                console.log(`    Incoming: ${sourceName} (${conn.type})`);

                if (conn.type === 'ai_languageModel') hasLanguageModel = true;
                if (conn.type === 'ai_tool') hasTools = true;
                if (conn.type === 'ai_memory') hasMemory = true;

                if (!['main', 'ai_languageModel', 'ai_tool', 'ai_memory', 'ai_outputParser'].includes(conn.type)) {
                  aiConnectionIssues.push(`Unknown connection type "${conn.type}" to agent "${agent.name}"`);
                }
              }
            });
          }
        });
      }
    });
  });

  console.log(`    Has Language Model: ${hasLanguageModel}`);
  console.log(`    Has Tools: ${hasTools}`);
  console.log(`    Has Memory: ${hasMemory}`);

  if (!hasLanguageModel) {
    aiConnectionIssues.push(`Agent "${agent.name}" missing ai_languageModel connection`);
  }
});

console.log();

// ============================================================================
// 6. JSON STRUCTURE VALIDATION
// ============================================================================
console.log('\n6. JSON STRUCTURE VALIDATION');
console.log('─'.repeat(80));

const structureIssues = [];

// Check for circular references
try {
  JSON.stringify(actualWorkflow);
  console.log('✓ No circular references detected');
} catch (e) {
  structureIssues.push(`Circular reference detected: ${e.message}`);
  console.log('✗ CIRCULAR REFERENCE DETECTED');
}

// Check for very deep nesting
function checkDepth(obj, maxDepth = 20, currentDepth = 0) {
  if (currentDepth > maxDepth) {
    return currentDepth;
  }

  if (obj && typeof obj === 'object') {
    const depths = Object.values(obj).map(v => checkDepth(v, maxDepth, currentDepth + 1));
    return Math.max(currentDepth, ...depths);
  }

  return currentDepth;
}

const maxDepth = checkDepth(actualWorkflow);
console.log(`Max JSON nesting depth: ${maxDepth}`);
if (maxDepth > 15) {
  structureIssues.push(`Very deep nesting detected: ${maxDepth} levels`);
}

// Check for huge strings
function findLargeStrings(obj, path = '', threshold = 10000) {
  const issues = [];

  if (typeof obj === 'string' && obj.length > threshold) {
    issues.push(`Large string at ${path}: ${obj.length} characters`);
  } else if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      issues.push(...findLargeStrings(value, `${path}.${key}`, threshold));
    });
  }

  return issues;
}

const largeStrings = findLargeStrings(actualWorkflow);
if (largeStrings.length > 0) {
  console.log('\nLarge strings found:');
  largeStrings.forEach(s => console.log(`  ${s}`));
}

console.log();

// ============================================================================
// 7. SETTINGS VALIDATION
// ============================================================================
console.log('\n7. SETTINGS VALIDATION');
console.log('─'.repeat(80));

const settingsIssues = [];

if (actualWorkflow.settings) {
  console.log('Workflow Settings:');
  console.log(JSON.stringify(actualWorkflow.settings, null, 2));

  // Check for invalid setting values
  if (actualWorkflow.settings.executionTimeout < 0) {
    settingsIssues.push('Negative executionTimeout value');
  }
} else {
  console.log('No settings defined');
}

console.log();

// ============================================================================
// 8. SUMMARY OF ALL ISSUES
// ============================================================================
console.log('\n8. SUMMARY OF ALL ISSUES');
console.log('═'.repeat(80));

const allIssues = [
  ...nodeIssues,
  ...connectionIssues,
  ...nodeTypeIssues,
  ...aiConnectionIssues,
  ...structureIssues,
  ...settingsIssues
];

if (allIssues.length === 0) {
  console.log('✓ NO ISSUES DETECTED - Workflow structure appears valid');
  console.log('\nThe workflow JSON is structurally sound. The rendering issue may be:');
  console.log('  1. A UI-specific bug in n8n');
  console.log('  2. A browser cache issue');
  console.log('  3. A frontend rendering error');
  console.log('  4. Missing node type definitions in the n8n instance');
} else {
  console.log(`✗ FOUND ${allIssues.length} ISSUES:\n`);

  allIssues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
}

console.log();

// ============================================================================
// 9. SPECIFIC RENDERING BLOCKERS
// ============================================================================
console.log('\n9. POTENTIAL RENDERING BLOCKERS');
console.log('═'.repeat(80));

const blockers = [];

// Check for invalid position arrays
actualWorkflow.nodes.forEach(node => {
  if (!Array.isArray(node.position) || node.position.length !== 2) {
    blockers.push({
      severity: 'CRITICAL',
      node: node.name,
      issue: 'Invalid position array',
      detail: `Position must be [x, y] array with 2 numbers, got: ${JSON.stringify(node.position)}`
    });
  }
});

// Check for broken connections
Object.entries(connections).forEach(([sourceName, outputs]) => {
  if (!nodeNames.has(sourceName)) {
    blockers.push({
      severity: 'CRITICAL',
      node: sourceName,
      issue: 'Connection from non-existent node',
      detail: `Connections reference node "${sourceName}" which doesn't exist`
    });
  }

  Object.entries(outputs).forEach(([outputType, connectionGroups]) => {
    if (Array.isArray(connectionGroups)) {
      connectionGroups.forEach(group => {
        if (Array.isArray(group)) {
          group.forEach(conn => {
            if (!nodeNames.has(conn.node)) {
              blockers.push({
                severity: 'CRITICAL',
                node: conn.node,
                issue: 'Connection to non-existent node',
                detail: `Connection from "${sourceName}" points to non-existent node "${conn.node}"`
              });
            }
          });
        }
      });
    }
  });
});

// Check for missing required node data
actualWorkflow.nodes.forEach(node => {
  if (!node.id || !node.name || !node.type) {
    blockers.push({
      severity: 'CRITICAL',
      node: node.name || node.id || 'unknown',
      issue: 'Missing required node fields',
      detail: `Node missing: ${!node.id ? 'id ' : ''}${!node.name ? 'name ' : ''}${!node.type ? 'type' : ''}`
    });
  }
});

if (blockers.length === 0) {
  console.log('✓ No obvious rendering blockers found');
} else {
  console.log(`✗ FOUND ${blockers.length} POTENTIAL RENDERING BLOCKERS:\n`);

  blockers.forEach((blocker, index) => {
    console.log(`${index + 1}. [${blocker.severity}] ${blocker.issue}`);
    console.log(`   Node: ${blocker.node}`);
    console.log(`   Detail: ${blocker.detail}`);
    console.log();
  });
}

// ============================================================================
// 10. COMPARISON WITH EXPECTED STRUCTURE
// ============================================================================
console.log('\n10. WORKFLOW STATISTICS');
console.log('═'.repeat(80));

console.log(`Total Nodes: ${actualWorkflow.nodes.length}`);
console.log(`Total Connections (source nodes): ${Object.keys(connections).length}`);

let totalConnectionCount = 0;
Object.values(connections).forEach(outputs => {
  Object.values(outputs).forEach(groups => {
    if (Array.isArray(groups)) {
      groups.forEach(group => {
        if (Array.isArray(group)) {
          totalConnectionCount += group.length;
        }
      });
    }
  });
});

console.log(`Total Individual Connections: ${totalConnectionCount}`);
console.log(`Nodes with Incoming Connections: ${new Set(
  Object.values(connections).flatMap(outputs =>
    Object.values(outputs).flatMap(groups =>
      Array.isArray(groups) ? groups.flatMap(group =>
        Array.isArray(group) ? group.map(c => c.node) : []
      ) : []
    )
  )
).size}`);

console.log(`Nodes with No Incoming Connections: ${
  actualWorkflow.nodes.filter(node => {
    const incoming = Object.values(connections).some(outputs =>
      Object.values(outputs).some(groups =>
        Array.isArray(groups) && groups.some(group =>
          Array.isArray(group) && group.some(c => c.node === node.name)
        )
      )
    );
    return !incoming;
  }).length
}`);

console.log(`Nodes with No Outgoing Connections: ${
  actualWorkflow.nodes.filter(node => !connections[node.name]).length
}`);

console.log('\n' + '═'.repeat(80));
console.log('END OF DIAGNOSTIC ANALYSIS');
console.log('═'.repeat(80));
