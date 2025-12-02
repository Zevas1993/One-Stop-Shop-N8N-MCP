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

async function checkWorkflow() {
  const workflow = await makeRequest({
    hostname: 'localhost',
    port: 5678,
    path: `/api/v1/workflows/${WORKFLOW_ID}`,
    method: 'GET',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('WORKFLOW STATUS CHECK');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Workflow ID:', workflow.id);
  console.log('Workflow Name:', workflow.name);
  console.log('Active:', workflow.active);
  console.log('Last Updated:', workflow.updatedAt);
  console.log('Total Nodes:', workflow.nodes.length);
  console.log('');

  console.log('DETAILED NODE INSPECTION:');
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  workflow.nodes.forEach((node, i) => {
    console.log((i+1) + '. ' + node.name);
    console.log('   Type:', node.type);
    console.log('   Type Version:', node.typeVersion);

    if (node.type === 'n8n-nodes-base.httpRequest') {
      console.log('   ⚠️  HTTP REQUEST NODE - CHECKING OPTIONS:');
      const hasOptions = 'options' in node.parameters;
      console.log('   Has "options" field?', hasOptions);
      if (hasOptions) {
        console.log('   Options value:', JSON.stringify(node.parameters.options));
      } else {
        console.log('   ❌ MISSING OPTIONS FIELD!!!');
      }
    }

    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('CONCLUSION:');
  console.log('═══════════════════════════════════════════════════════');

  const httpNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  const httpNodesWithOptions = httpNodes.filter(n => 'options' in n.parameters);

  console.log('');
  console.log('HTTP Request Nodes:', httpNodes.length);
  console.log('HTTP Nodes with options:', httpNodesWithOptions.length);
  console.log('');

  if (httpNodes.length === httpNodesWithOptions.length) {
    console.log('✅ ALL HTTP REQUEST NODES HAVE OPTIONS FIELD');
    console.log('');
    console.log('The workflow data is CORRECT in the API.');
    console.log('');
    console.log('If you\'re still seeing the error in the UI, try:');
    console.log('1. Hard refresh browser (Ctrl+Shift+R)');
    console.log('2. Clear browser cache');
    console.log('3. Close and reopen the workflow');
    console.log('4. Restart n8n server');
  } else {
    console.log('❌ SOME HTTP REQUEST NODES ARE MISSING OPTIONS FIELD');
    console.log('Run fix-workflow-now.js to fix this');
  }
  console.log('');
}

checkWorkflow().catch(console.error);
