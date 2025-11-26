const https = require('https');
const http = require('http');

const API_KEY = process.env.N8N_API_KEY;
const BROKEN_ID = 'Baf9nylVDD1pzj9Q';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5678,
      path,
      method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    }, (res) => {
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

async function compareWorkflows() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('WORKFLOW STRUCTURE COMPARISON');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get list of workflows
  const workflows = await makeRequest('/api/v1/workflows');

  console.log('Available workflows:');
  workflows.data.forEach((w, i) => {
    const status = w.id === BROKEN_ID ? '❌ BROKEN' : '✅';
    console.log(`${i + 1}. ${status} ${w.name} (ID: ${w.id})`);
  });

  // Find a working workflow (not the broken one)
  const workingWorkflow = workflows.data.find(w => w.id !== BROKEN_ID && !w.isArchived);

  if (!workingWorkflow) {
    console.log('\n❌ No working workflows found for comparison');
    return;
  }

  console.log(`\n📊 Using "${workingWorkflow.name}" as reference WORKING workflow`);

  // Fetch both workflows in detail
  const broken = await makeRequest(`/api/v1/workflows/${BROKEN_ID}`);
  const working = await makeRequest(`/api/v1/workflows/${workingWorkflow.id}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('WORKFLOW-LEVEL FIELDS COMPARISON');
  console.log('═══════════════════════════════════════════════════════\n');

  // Compare top-level fields
  const workflowFields = new Set([...Object.keys(working), ...Object.keys(broken)]);

  for (const field of workflowFields) {
    const inWorking = field in working;
    const inBroken = field in broken;

    if (inWorking && !inBroken) {
      console.log(`❌ MISSING in broken: ${field}`);
      console.log(`   Value in working: ${JSON.stringify(working[field])}\n`);
    } else if (!inWorking && inBroken) {
      console.log(`⚠️  EXTRA in broken: ${field}`);
    } else if (typeof working[field] !== typeof broken[field]) {
      console.log(`⚠️  TYPE MISMATCH: ${field}`);
      console.log(`   Working: ${typeof working[field]}, Broken: ${typeof broken[field]}\n`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('NODE-LEVEL FIELDS COMPARISON');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get all unique node fields from both workflows
  const workingNodeFields = new Set();
  const brokenNodeFields = new Set();

  working.nodes.forEach(n => Object.keys(n).forEach(k => workingNodeFields.add(k)));
  broken.nodes.forEach(n => Object.keys(n).forEach(k => brokenNodeFields.add(k)));

  // Find missing fields in broken nodes
  const missingInBroken = [...workingNodeFields].filter(f => !brokenNodeFields.has(f));
  const extraInBroken = [...brokenNodeFields].filter(f => !workingNodeFields.has(f));

  if (missingInBroken.length > 0) {
    console.log('❌ Fields present in working nodes but MISSING in broken:');
    missingInBroken.forEach(f => {
      const example = working.nodes.find(n => f in n);
      console.log(`   - ${f}: ${JSON.stringify(example[f])}`);
    });
    console.log('');
  }

  if (extraInBroken.length > 0) {
    console.log('⚠️  Extra fields in broken nodes:');
    extraInBroken.forEach(f => console.log(`   - ${f}`));
    console.log('');
  }

  // Check specific node types
  console.log('═══════════════════════════════════════════════════════');
  console.log('HTTP REQUEST NODES COMPARISON');
  console.log('═══════════════════════════════════════════════════════\n');

  const workingHttp = working.nodes.find(n => n.type === 'n8n-nodes-base.httpRequest');
  const brokenHttp = broken.nodes.find(n => n.type === 'n8n-nodes-base.httpRequest');

  if (workingHttp && brokenHttp) {
    console.log('Working HTTP Request node fields:');
    console.log(JSON.stringify(Object.keys(workingHttp).sort(), null, 2));
    console.log('\nBroken HTTP Request node fields:');
    console.log(JSON.stringify(Object.keys(brokenHttp).sort(), null, 2));

    console.log('\nWorking HTTP Request parameters:');
    console.log(JSON.stringify(Object.keys(workingHttp.parameters).sort(), null, 2));
    console.log('\nBroken HTTP Request parameters:');
    console.log(JSON.stringify(Object.keys(brokenHttp.parameters).sort(), null, 2));
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('ROOT CAUSE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('The error "Cannot read properties of undefined (reading \'config\')"');
  console.log('suggests that n8n UI is trying to access .config on undefined.');
  console.log('');
  console.log('This could be:');
  console.log('1. Missing node field that should exist');
  console.log('2. Malformed node structure');
  console.log('3. Missing workflow-level metadata');
  console.log('');
  console.log('Compare the fields above to identify the issue.');
}

compareWorkflows().catch(console.error);
