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

async function deepInspect() {
  console.log('\n🔬 DEEP INSPECTION: Broken vs Working Workflows\n');
  console.log('='.repeat(70));

  const broken = await makeRequest('/workflows/Baf9nylVDD1pzj9Q');
  const working = await makeRequest('/workflows/A9h8Zsm6kYpsmilu');

  console.log('\n📊 WORKFLOW COMPARISON:\n');
  console.log(`BROKEN:  "${broken.name}"`);
  console.log(`         Nodes: ${broken.nodes.length}`);
  console.log(`         Connections: ${Object.keys(broken.connections || {}).length}`);
  console.log(`         Settings: ${JSON.stringify(broken.settings)}`);

  console.log(`\nWORKING: "${working.name}"`);
  console.log(`         Nodes: ${working.nodes.length}`);
  console.log(`         Connections: ${Object.keys(working.connections || {}).length}`);
  console.log(`         Settings: ${JSON.stringify(working.settings)}`);

  console.log('\n\n📦 NODE-BY-NODE COMPARISON:\n');

  // Group by node type for comparison
  const brokenByType = {};
  const workingByType = {};

  broken.nodes.forEach(n => {
    if (!brokenByType[n.type]) brokenByType[n.type] = [];
    brokenByType[n.type].push(n);
  });

  working.nodes.forEach(n => {
    if (!workingByType[n.type]) workingByType[n.type] = [];
    workingByType[n.type].push(n);
  });

  // Check each node type
  const allTypes = new Set([...Object.keys(brokenByType), ...Object.keys(workingByType)]);

  allTypes.forEach(type => {
    const brokenNodes = brokenByType[type] || [];
    const workingNodes = workingByType[type] || [];

    console.log(`\n${type}:`);
    console.log(`  Broken:  ${brokenNodes.length} node(s)`);
    console.log(`  Working: ${workingNodes.length} node(s)`);

    if (brokenNodes.length > 0 && workingNodes.length > 0) {
      const brokenSample = brokenNodes[0];
      const workingSample = workingNodes[0];

      console.log(`\n  🔴 BROKEN node "${brokenSample.name}":`);
      console.log(`     typeVersion: ${brokenSample.typeVersion}`);
      console.log(`     credentials: ${JSON.stringify(brokenSample.credentials)}`);
      console.log(`     parameters: ${Object.keys(brokenSample.parameters || {}).join(', ')}`);

      console.log(`\n  🟢 WORKING node "${workingSample.name}":`);
      console.log(`     typeVersion: ${workingSample.typeVersion}`);
      console.log(`     credentials: ${JSON.stringify(workingSample.credentials)}`);
      console.log(`     parameters: ${Object.keys(workingSample.parameters || {}).join(', ')}`);

      // Field comparison
      const brokenFields = new Set(Object.keys(brokenSample));
      const workingFields = new Set(Object.keys(workingSample));

      const missing = [...workingFields].filter(f => !brokenFields.has(f));
      const extra = [...brokenFields].filter(f => !workingFields.has(f));

      if (missing.length > 0) {
        console.log(`\n     ⚠️  MISSING in broken: ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        console.log(`     ⚠️  EXTRA in broken: ${extra.join(', ')}`);
      }
    }
  });

  // Save full comparison
  fs.writeFileSync('broken-workflow-full.json', JSON.stringify(broken, null, 2));
  fs.writeFileSync('working-workflow-full.json', JSON.stringify(working, null, 2));

  console.log('\n\n📁 Saved full workflows to:');
  console.log('   - broken-workflow-full.json');
  console.log('   - working-workflow-full.json');

  // Check for specific issues
  console.log('\n\n🔍 SPECIFIC ISSUE CHECKS:\n');

  // Check credentials
  const brokenNoCreds = broken.nodes.filter(n => !n.credentials);
  const workingNoCreds = working.nodes.filter(n => !n.credentials);
  console.log(`Nodes WITHOUT credentials object:`);
  console.log(`  Broken:  ${brokenNoCreds.length}`);
  console.log(`  Working: ${workingNoCreds.length}`);

  // Check empty parameters
  const brokenEmptyParams = broken.nodes.filter(n => !n.parameters || Object.keys(n.parameters).length === 0);
  const workingEmptyParams = working.nodes.filter(n => !n.parameters || Object.keys(n.parameters).length === 0);
  console.log(`\nNodes with EMPTY parameters:`);
  console.log(`  Broken:  ${brokenEmptyParams.length} ${brokenEmptyParams.map(n => n.name).join(', ')}`);
  console.log(`  Working: ${workingEmptyParams.length} ${workingEmptyParams.map(n => n.name).join(', ')}`);

  // Check connections structure
  console.log(`\nConnections structure:`);
  console.log(`  Broken:  ${JSON.stringify(broken.connections).substring(0, 200)}...`);
  console.log(`  Working: ${JSON.stringify(working.connections).substring(0, 200)}...`);

  console.log('\n');
}

deepInspect().catch(console.error);
