#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the workflow file
const workflowPath = path.join(__dirname, 'AI_EMAIL_MANAGER_COMPLETE.json');
const workflowJson = fs.readFileSync(workflowPath, 'utf-8');
const workflow = JSON.parse(workflowJson);

console.log('🔍 Validating Workflow: AI Email Manager\n');
console.log('=' .repeat(60));

// Check 1: Required properties
console.log('\n✅ Check 1: Required Properties');
const requiredProps = ['name', 'nodes', 'connections'];
let hasRequiredProps = true;
for (const prop of requiredProps) {
  if (!(prop in workflow)) {
    console.log(`   ❌ Missing: ${prop}`);
    hasRequiredProps = false;
  } else {
    console.log(`   ✅ ${prop}: Present`);
  }
}

// Check 2: Forbidden properties
console.log('\n✅ Check 2: Forbidden Properties (n8n API would reject these)');
const forbiddenProps = ['active', 'description', 'tags', 'createdAt', 'updatedAt', 'id', 'versions'];
let hasForbidden = false;
for (const prop of forbiddenProps) {
  if (prop in workflow) {
    console.log(`   ❌ FORBIDDEN: ${prop} (remove before deploying)`);
    hasForbidden = true;
  }
}
if (!hasForbidden) {
  console.log(`   ✅ No forbidden properties found`);
}

// Check 3: Node validation
console.log('\n✅ Check 3: Nodes Validation');
console.log(`   Total nodes: ${workflow.nodes.length}`);

const nodeTypes = {};
for (const node of workflow.nodes) {
  if (!nodeTypes[node.type]) {
    nodeTypes[node.type] = [];
  }
  nodeTypes[node.type].push(node.name);
}

for (const [type, names] of Object.entries(nodeTypes)) {
  // Check if node type has proper prefix
  if (!type.includes('.')) {
    console.log(`   ⚠️  WARNING: Node type "${type}" missing package prefix`);
  } else {
    console.log(`   ✅ ${type} (${names.length} node${names.length > 1 ? 's' : ''})`);
  }
}

// Check 4: Connection validation
console.log('\n✅ Check 4: Connections Validation');
const connectedNodes = new Set();
const referencedNodes = new Set();

for (const [fromNode, connections] of Object.entries(workflow.connections)) {
  connectedNodes.add(fromNode);

  if (connections.main) {
    for (const mainConnections of connections.main) {
      if (Array.isArray(mainConnections)) {
        for (const conn of mainConnections) {
          if (conn.node) {
            referencedNodes.add(conn.node);
          }
        }
      }
    }
  }
}

// Check that all connected/referenced nodes exist
const nodeIds = new Set(workflow.nodes.map(n => n.id || n.name));
let connectionErrors = false;

for (const nodeId of referencedNodes) {
  if (!nodeIds.has(nodeId)) {
    console.log(`   ❌ ERROR: Connection references non-existent node: ${nodeId}`);
    connectionErrors = true;
  }
}

if (!connectionErrors) {
  console.log(`   ✅ All ${connectedNodes.size} connected node IDs are valid`);
  console.log(`   ✅ Total connections: ${referencedNodes.size} nodes referenced`);
}

// Check 5: Agent Cluster node validation
console.log('\n✅ Check 5: Agent Cluster Node Configuration');
const agentNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.agentCluster');
if (agentNode) {
  console.log(`   ✅ Found Agent Cluster node: "${agentNode.name}"`);
  if (agentNode.parameters?.systemPrompt) {
    console.log(`   ✅ System prompt configured (${agentNode.parameters.systemPrompt.length} chars)`);
  }
  if (agentNode.parameters?.tools && Array.isArray(agentNode.parameters.tools)) {
    console.log(`   ✅ Tools connected: ${agentNode.parameters.tools.length} tools`);
    for (const tool of agentNode.parameters.tools) {
      console.log(`      - ${tool.name}: ${tool.description}`);
    }
  }
  if (agentNode.parameters?.model) {
    console.log(`   ✅ Model: ${agentNode.parameters.model}`);
  }
} else {
  console.log(`   ❌ ERROR: Agent Cluster node not found (required for AI functionality)`);
}

// Check 6: Teams and Outlook credentials
console.log('\n✅ Check 6: Integration Credentials');
const credentialTypes = new Set();
for (const node of workflow.nodes) {
  if (node.credentials) {
    Object.keys(node.credentials).forEach(credType => {
      credentialTypes.add(credType);
    });
  }
}

if (credentialTypes.size > 0) {
  console.log(`   ✅ Credentials required:`);
  for (const cred of credentialTypes) {
    console.log(`      - ${cred}`);
  }
} else {
  console.log(`   ⚠️  WARNING: No credentials defined (may need to add)`);
}

// Summary
console.log('\n' + '=' .repeat(60));
console.log('\n📋 VALIDATION SUMMARY\n');

const hasErrors = hasForbidden || connectionErrors || !hasRequiredProps;
if (!hasErrors && agentNode) {
  console.log('✅ Workflow is ready for deployment!');
  console.log('\n📝 Next steps:');
  console.log('1. Configure Microsoft Teams OAuth2 credentials');
  console.log('2. Configure Microsoft Outlook OAuth2 credentials');
  console.log('3. Configure OpenAI API credentials');
  console.log('4. Deploy workflow to n8n instance');
  console.log('5. Test webhook with sample Teams message');
  console.log('\n🔗 Workflow creates connections:');
  console.log('   Teams Message → Get Emails → Agent Cluster → Send Response');
  console.log('   Agent Cluster also handles: Email summarization, drafting, categorization');
} else {
  console.log('❌ Workflow has validation errors. Fix before deploying.');
  if (!hasRequiredProps) {
    console.log('   - Missing required properties');
  }
  if (hasForbidden) {
    console.log('   - Contains forbidden properties');
  }
  if (connectionErrors) {
    console.log('   - Invalid connection references');
  }
  if (!agentNode) {
    console.log('   - Missing Agent Cluster node');
  }
}
