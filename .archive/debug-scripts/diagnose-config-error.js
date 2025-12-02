const https = require('https');
const http = require('http');

const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function diagnoseConfigError() {
  const workflow = await makeRequest({
    hostname: 'localhost',
    port: 5678,
    path: `/api/v1/workflows/${WORKFLOW_ID}`,
    method: 'GET',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('DIAGNOSING CONFIG ERROR');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Error: "Cannot read properties of undefined (reading \'config\')"');
  console.log('');
  console.log('This error occurs when n8n tries to access node.config but node is undefined');
  console.log('');

  console.log('CHECKING ALL NODES FOR ISSUES:');
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  workflow.nodes.forEach((node, i) => {
    console.log((i+1) + '. ' + node.name);
    console.log('   Type:', node.type);
    console.log('   ID:', node.id || 'MISSING ID!');
    console.log('   typeVersion:', node.typeVersion);
    console.log('   position:', JSON.stringify(node.position));

    // Check required fields
    const issues = [];

    if (!node.id) issues.push('Missing ID');
    if (!node.name) issues.push('Missing name');
    if (!node.type) issues.push('Missing type');
    if (!node.typeVersion && node.typeVersion !== 0) issues.push('Missing typeVersion');
    if (!node.position) issues.push('Missing position');
    if (!node.parameters) issues.push('Missing parameters');

    // Check for credentials field (should exist even if empty)
    if (!('credentials' in node)) {
      issues.push('Missing credentials field (should be {} if no creds)');
    }

    // Check specific node types
    if (node.type === 'n8n-nodes-base.webhook') {
      if (!node.webhookId) issues.push('Missing webhookId (required for webhook nodes)');
    }

    if (node.type === 'n8n-nodes-base.code') {
      if (!node.parameters.jsCode && !node.parameters.code) {
        issues.push('Code node missing jsCode/code parameter');
      }
    }

    if (node.type === 'n8n-nodes-base.httpRequest') {
      if (!('options' in node.parameters)) {
        issues.push('HTTP Request missing options field');
      }
    }

    if (issues.length > 0) {
      console.log('   ⚠️  ISSUES:');
      issues.forEach(issue => console.log('      - ' + issue));
    } else {
      console.log('   ✅ No obvious issues');
    }

    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('CHECKING CONNECTIONS:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  const nodeNames = new Set(workflow.nodes.map(n => n.name));

  Object.entries(workflow.connections || {}).forEach(([sourceName, connection]) => {
    console.log('From:', sourceName);

    if (!nodeNames.has(sourceName)) {
      console.log('   ❌ ERROR: Source node "' + sourceName + '" does not exist!');
    }

    if (connection.main) {
      connection.main.forEach((outputs, outputIndex) => {
        outputs.forEach((target) => {
          console.log('   → To:', target.node);
          if (!nodeNames.has(target.node)) {
            console.log('      ❌ ERROR: Target node "' + target.node + '" does not exist!');
          }
        });
      });
    }
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('RECOMMENDATION:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('The "config" error often comes from:');
  console.log('1. Missing node fields (id, credentials, webhookId, etc.)');
  console.log('2. Invalid connection references');
  console.log('3. Missing typeVersion on nodes');
  console.log('');
  console.log('Check the issues listed above and fix them.');
  console.log('');
}

diagnoseConfigError().catch(console.error);
