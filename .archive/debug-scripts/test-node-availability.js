const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;

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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    console.log('Testing node type availability in n8n...\n');

    // Get the workflow to extract node types
    const result = await makeRequest('GET', '/api/v1/workflows/tbdgq0FZmJKLQlsl');

    if (result.status !== 200) {
      console.error('Failed to fetch workflow:', result.status);
      return;
    }

    const workflow = result.data.data || result.data;

    // Get unique node types
    const nodeTypes = [...new Set(workflow.nodes.map(n => n.type))];

    console.log(`Found ${nodeTypes.length} unique node types:\n`);

    // Try to create a test workflow with each node type individually
    const issues = [];
    const working = [];

    for (const nodeType of nodeTypes.sort()) {
      console.log(`Testing: ${nodeType}...`);

      // Create minimal test workflow with this node type
      const testWorkflow = {
        name: `Test ${nodeType}`,
        nodes: [
          {
            id: 'test-node',
            name: 'Test Node',
            type: nodeType,
            position: [100, 100],
            parameters: {},
            typeVersion: 1
          }
        ],
        connections: {},
        settings: {},
        staticData: {}
      };

      // Try to create it
      const createResult = await makeRequest('POST', '/api/v1/workflows', testWorkflow);

      if (createResult.status === 200 || createResult.status === 201) {
        const created = createResult.data.data || createResult.data;
        console.log(`  ✅ Success (ID: ${created.id})`);
        working.push(nodeType);

        // Clean up - delete it
        await makeRequest('DELETE', `/api/v1/workflows/${created.id}`);
      } else {
        console.log(`  ❌ Failed with status ${createResult.status}`);
        if (typeof createResult.data === 'string') {
          console.log(`     ${createResult.data.substring(0, 100)}`);
        } else {
          console.log(`     ${JSON.stringify(createResult.data).substring(0, 100)}`);
        }
        issues.push({
          type: nodeType,
          status: createResult.status,
          error: createResult.data
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Working node types: ${working.length}`);
    working.forEach(t => console.log(`   ${t}`));

    if (issues.length > 0) {
      console.log(`\n❌ Problematic node types: ${issues.length}`);
      issues.forEach(issue => {
        console.log(`   ${issue.type}`);
        console.log(`      Status: ${issue.status}`);
      });
    } else {
      console.log('\n✅ All node types are available!');
    }

    // Save report
    fs.writeFileSync('node-availability-report.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      totalTypes: nodeTypes.length,
      working: working,
      issues: issues,
      allNodeTypes: nodeTypes
    }, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
