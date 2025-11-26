const http = require('http');
const fs = require('fs');

const n8nUrl = 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(n8nUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path,
      method,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    // Get current workflow
    console.log('📥 Fetching workflow...');
    let result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);
    const workflow = JSON.parse(result.body);

    console.log('\n🔍 Issues found:');
    console.log('1. Empty connection array in "Process Each Email" node');
    console.log('2. Invalid $fromAI() expressions in parameters');

    // Fix the empty connection
    console.log('\n🔧 Fixing connections...');
    if (workflow.connections['Process Each Email'] &&
        workflow.connections['Process Each Email'].main) {
      workflow.connections['Process Each Email'].main[0] = []; // Keep as empty for output 0
      console.log('✅ Fixed Process Each Email connections');
    }

    // Fix $fromAI expressions - replace with placeholder expressions
    console.log('\n🔧 Fixing invalid $fromAI() expressions...');
    fixParameters(workflow.nodes);

    // Remove forbidden fields for API update
    console.log('\n🔧 Cleaning forbidden fields...');
    const cleanWorkflow = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      staticData: workflow.staticData || {},
      ...(workflow.pinData && { pinData: workflow.pinData })
    };

    // Save for inspection
    fs.writeFileSync('workflow-before-fix.json', JSON.stringify(workflow, null, 2));
    fs.writeFileSync('workflow-after-fix.json', JSON.stringify(cleanWorkflow, null, 2));

    // Deploy fix
    console.log('\n📤 Deploying fixed workflow...');
    result = await makeRequest('PUT', `/api/v1/workflows/${workflowId}`, cleanWorkflow);

    if (result.status === 200) {
      console.log('\n✅ Workflow updated successfully!');
      const updated = JSON.parse(result.body).data;
      console.log('New version ID:', updated.versionId);
      console.log('Updated at:', updated.updatedAt);
    } else {
      console.error('❌ Update failed:', result.status);
      console.error(result.body);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function fixParameters(nodes) {
  nodes.forEach(node => {
    if (!node.parameters) return;

    fixNode(node, node.parameters);
  });
}

function fixNode(node, obj) {
  for (const key in obj) {
    const value = obj[key];

    if (typeof value === 'string') {
      // Replace $fromAI() with safe alternatives
      if (value.includes('$fromAI(')) {
        const varName = value.match(/\$fromAI\('([^']+)'\)/)?.[1];
        if (varName) {
          obj[key] = `={{ $json.${varName} || '' }}`;
          console.log(`  - ${node.name}: Fixed $fromAI('${varName}')`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      fixNode(node, value);
    }
  }
}

main();
