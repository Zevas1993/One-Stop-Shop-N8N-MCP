const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

function makeRequest(method, path) {
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
    req.end();
  });
}

async function main() {
  try {
    console.log('Fetching workflow...');
    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status !== 200) {
      console.error('Failed to fetch:', result.status);
      return;
    }

    const workflow = result.data.data || result.data;

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYZING NODE CONFIGURATIONS FOR ISSUES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const issues = [];

    workflow.nodes.forEach((node, idx) => {
      console.log(`[${idx}] ${node.name} (${node.type})`);

      // Check if node has required base structure
      if (!node.id) {
        issues.push(`Node ${idx} (${node.name}): Missing ID`);
        console.log('  ❌ Missing id');
      }
      if (!node.type) {
        issues.push(`Node ${idx}: Missing type`);
        console.log('  ❌ Missing type');
      }
      if (!node.position) {
        issues.push(`Node ${idx} (${node.name}): Missing position`);
        console.log('  ❌ Missing position');
      }
      if (node.typeVersion === undefined) {
        issues.push(`Node ${idx} (${node.name}): Missing typeVersion`);
        console.log('  ❌ Missing typeVersion');
      }

      // Check if parameters exist and are valid objects
      if (node.parameters === undefined) {
        console.log('  ⚠️  parameters is undefined (should be empty object)');
      } else if (node.parameters === null) {
        console.log('  ❌ parameters is null (should be object)');
        issues.push(`Node ${idx} (${node.name}): parameters is null`);
      } else if (typeof node.parameters !== 'object') {
        console.log(`  ❌ parameters is ${typeof node.parameters} (should be object)`);
        issues.push(`Node ${idx} (${node.name}): parameters is not an object`);
      } else {
        console.log(`  ✅ parameters: ${Object.keys(node.parameters).length} keys`);
      }

      // Check for null/undefined values in parameters
      if (node.parameters && typeof node.parameters === 'object') {
        for (const [key, value] of Object.entries(node.parameters)) {
          if (value === null) {
            console.log(`     ⚠️  parameter "${key}" is null`);
          } else if (value === undefined) {
            console.log(`     ❌ parameter "${key}" is undefined`);
            issues.push(`Node ${idx}.${key}: undefined value`);
          }
        }
      }

      console.log('');
    });

    // Check for any nodes with problematic type names
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CHECKING NODE TYPES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const nodeTypes = {};
    workflow.nodes.forEach(node => {
      if (!nodeTypes[node.type]) {
        nodeTypes[node.type] = [];
      }
      nodeTypes[node.type].push(node.name);
    });

    for (const [type, nodes] of Object.entries(nodeTypes)) {
      console.log(`${type}`);
      console.log(`  Count: ${nodes.length}`);
      console.log(`  Nodes: ${nodes.join(', ')}`);

      // Check if type looks valid
      if (!type.includes('.') && !type.includes('-')) {
        console.log(`  ❌ WARNING: Type doesn't have standard format!`);
        issues.push(`Node type "${type}" doesn't match expected format`);
      }
      console.log('');
    }

    // Check for agent/langchain nodes specifically
    console.log('═══════════════════════════════════════════════════════════');
    console.log('AGENT NODE DETAILED ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const agentNodes = workflow.nodes.filter(n => n.type.includes('agent'));

    agentNodes.forEach(agent => {
      console.log(`${agent.name}:`);
      console.log(`  Type: ${agent.type}`);
      console.log(`  TypeVersion: ${agent.typeVersion}`);
      console.log(`  Parameters:`, JSON.stringify(agent.parameters, null, 4));

      // These are critical for agents
      if (!agent.parameters) {
        console.log('  ❌ CRITICAL: No parameters!');
        issues.push(`Agent ${agent.name}: Missing parameters`);
      } else {
        // Agent nodes need specific parameters
        const hasPrompt = 'text' in agent.parameters || 'prompt' in agent.parameters;
        console.log(`  Prompt configured: ${hasPrompt ? '✅' : '❌'}`);
        if (!hasPrompt) {
          issues.push(`Agent ${agent.name}: Missing prompt/text`);
        }
      }
      console.log('');
    });

    // Save detailed analysis
    console.log('═══════════════════════════════════════════════════════════');
    console.log('SAVING ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    fs.writeFileSync('node-config-analysis.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      totalNodes: workflow.nodes.length,
      issues,
      nodeTypes,
      workflow: {
        name: workflow.name,
        nodes: workflow.nodes.map(n => ({
          id: n.id,
          name: n.name,
          type: n.type,
          typeVersion: n.typeVersion,
          hasParameters: !!n.parameters,
          parametersType: n.parameters ? typeof n.parameters : 'missing',
          positionValid: Array.isArray(n.position) && n.position.length === 2
        }))
      }
    }, null, 2));

    console.log('✅ Saved to node-config-analysis.json');

    if (issues.length > 0) {
      console.log('\n❌ ISSUES FOUND:');
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue}`);
      });
    } else {
      console.log('\n✅ No structural issues found!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
