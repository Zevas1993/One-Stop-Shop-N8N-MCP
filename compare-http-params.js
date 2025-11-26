const http = require('http');
const fs = require('fs');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';

async function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1${path}`,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function compare() {
  console.log('\n🔍 COMPARING HTTP REQUEST NODE PARAMETERS\n');
  console.log('='.repeat(70));

  const broken = await makeRequest('/workflows/Baf9nylVDD1pzj9Q');
  const working = await makeRequest('/workflows/A9h8Zsm6kYpsmilu');

  const brokenHttp = broken.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  const workingHttp = working.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');

  console.log(`\n📊 BROKEN WORKFLOW: ${brokenHttp.length} HTTP Request nodes`);
  brokenHttp.forEach(node => {
    console.log(`\n  Node: ${node.name}`);
    console.log(`  Parameters: ${Object.keys(node.parameters).join(', ')}`);
    console.log(`  Has nodeCredentialType: ${!!node.parameters.nodeCredentialType}`);
    if (node.parameters.nodeCredentialType) {
      console.log(`  nodeCredentialType value: "${node.parameters.nodeCredentialType}"`);
    }
    console.log(`  Has genericAuthType: ${!!node.parameters.genericAuthType}`);
    if (node.parameters.genericAuthType) {
      console.log(`  genericAuthType value: "${node.parameters.genericAuthType}"`);
    }
  });

  console.log(`\n\n📊 WORKING WORKFLOW: ${workingHttp.length} HTTP Request nodes`);
  workingHttp.forEach(node => {
    console.log(`\n  Node: ${node.name}`);
    console.log(`  Parameters: ${Object.keys(node.parameters).join(', ')}`);
    console.log(`  Has nodeCredentialType: ${!!node.parameters.nodeCredentialType}`);
    console.log(`  Has genericAuthType: ${!!node.parameters.genericAuthType}`);
  });

  console.log('\n\n💡 KEY DIFFERENCES:');
  const brokenParams = new Set();
  brokenHttp.forEach(n => Object.keys(n.parameters).forEach(k => brokenParams.add(k)));

  const workingParams = new Set();
  workingHttp.forEach(n => Object.keys(n.parameters).forEach(k => workingParams.add(k)));

  const extraInBroken = [...brokenParams].filter(p => !workingParams.has(p));
  const missingInBroken = [...workingParams].filter(p => !brokenParams.has(p));

  if (extraInBroken.length > 0) {
    console.log(`\n  ❌ EXTRA in broken (should remove): ${extraInBroken.join(', ')}`);
  }
  if (missingInBroken.length > 0) {
    console.log(`\n  ⚠️  MISSING in broken: ${missingInBroken.join(', ')}`);
  }

  // Save for detailed inspection
  fs.writeFileSync('broken-http-nodes.json', JSON.stringify(brokenHttp, null, 2));
  fs.writeFileSync('working-http-nodes.json', JSON.stringify(workingHttp, null, 2));
  console.log('\n📁 Saved detailed comparison to broken-http-nodes.json and working-http-nodes.json\n');
}

compare().catch(console.error);
