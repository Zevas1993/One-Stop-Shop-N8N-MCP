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
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testConfigWithDiagnostics(nodeNames, configName) {
  const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
  const originalWorkflow = JSON.parse(backupJson);

  // Filter nodes
  const testNodes = originalWorkflow.nodes.filter(n =>
    nodeNames.includes(n.name)
  );

  // Filter connections
  const testConnections = {};
  for (const [sourceName, connObj] of Object.entries(originalWorkflow.connections)) {
    if (!testNodes.some(n => n.name === sourceName)) continue;

    const filteredConn = {};

    if (connObj.main) {
      filteredConn.main = connObj.main.map(outputArray =>
        outputArray.filter(conn =>
          testNodes.some(n => n.name === conn.node)
        )
      );
    }

    for (const aiType of ['ai_tool', 'ai_languageModel', 'ai_memory']) {
      if (connObj[aiType]) {
        filteredConn[aiType] = connObj[aiType].filter(conn =>
          testNodes.some(n => n.name === conn.node)
        );
        if (filteredConn[aiType].length === 0) {
          delete filteredConn[aiType];
        }
      }
    }

    if (Object.keys(filteredConn).length > 0) {
      testConnections[sourceName] = filteredConn;
    }
  }

  const testWorkflow = {
    name: configName,
    nodes: testNodes,
    connections: testConnections,
    settings: originalWorkflow.settings || {},
    staticData: originalWorkflow.staticData || {}
  };

  // Try to create it
  const result = await makeRequest('POST', '/api/v1/workflows', testWorkflow);

  if (result.status === 200 || result.status === 201) {
    const created = JSON.parse(result.body).data || JSON.parse(result.body);

    // Now try to GET it back (this is where the telemetry processing happens)
    const getResult = await makeRequest('GET', `/api/v1/workflows/${created.id}`);

    // Clean up
    await makeRequest('DELETE', `/api/v1/workflows/${created.id}`);

    if (getResult.status === 200) {
      return { status: 'SUCCESS', error: null };
    } else {
      return {
        status: 'FAILED_ON_GET',
        error: getResult.body.substring(0, 300),
        httpStatus: getResult.status
      };
    }
  } else {
    // Try to extract error message
    let errorMsg = result.body;
    try {
      const errJson = JSON.parse(result.body);
      errorMsg = errJson.message || errJson.error || result.body;
    } catch (e) {}

    return {
      status: 'FAILED_ON_CREATE',
      error: errorMsg.substring(0, 300),
      httpStatus: result.status
    };
  }
}

async function main() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║    FINDING EXACT NODE CAUSING THE ERROR                ║');
    console.log('║    (Testing creation AND retrieval)                    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
    const workflow = JSON.parse(backupJson);

    // Test with incrementally more nodes
    const testConfigs = [
      {
        name: 'Config 1: Triggers only',
        nodes: ['Open WebUI Chat Interface', 'Email Processing Trigger']
      },
      {
        name: 'Config 2: + Set nodes',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI'
        ]
      },
      {
        name: 'Config 3: + Outlook operations',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories'
        ]
      },
      {
        name: 'Config 4: + LangChain nodes (no connections)',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Clean Email Content',
          'AI Email Classifier',
          'Business Inquiry Agent',
          'Main Email Assistant'
        ]
      },
      {
        name: 'Config 5: + AI Tools',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Clean Email Content',
          'AI Email Classifier',
          'Business Inquiry Agent',
          'Main Email Assistant',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool'
        ]
      },
      {
        name: 'Config 6: + Vector Store',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Clean Email Content',
          'AI Email Classifier',
          'Business Inquiry Agent',
          'Main Email Assistant',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool',
          'Knowledge Search Tool'
        ]
      },
      {
        name: 'Config 7: + Memory & LM nodes',
        nodes: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Clean Email Content',
          'AI Email Classifier',
          'Business Inquiry Agent',
          'Main Email Assistant',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool',
          'Knowledge Search Tool',
          'OpenAI Chat Model',
          'Memory Buffer'
        ]
      },
      {
        name: 'Config 8: Full workflow (21 nodes)',
        nodes: workflow.nodes.map(n => n.name)
      }
    ];

    const results = [];

    for (const config of testConfigs) {
      process.stdout.write(`${config.name}... `);

      const testResult = await testConfigWithDiagnostics(config.nodes, config.name);

      if (testResult.status === 'SUCCESS') {
        console.log('✅ OK');
        results.push({
          config: config.name,
          nodeCount: config.nodes.length,
          status: 'SUCCESS'
        });
      } else {
        console.log(`❌ ${testResult.status}`);
        results.push({
          config: config.name,
          nodeCount: config.nodes.length,
          status: testResult.status,
          httpStatus: testResult.httpStatus,
          error: testResult.error
        });

        // Show which node was last added
        if (config.nodes.length > 0) {
          const prevIdx = testConfigs.indexOf(config) - 1;
          const prevNodes = prevIdx >= 0 ? testConfigs[prevIdx].nodes : [];
          const newNodes = config.nodes.filter(n => !prevNodes.includes(n));
          if (newNodes.length > 0) {
            console.log(`      New nodes in this config: ${newNodes.join(', ')}`);
          }
        }

        break;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.config} (${r.nodeCount} nodes)`);
      if (r.status === 'SUCCESS') {
        console.log(`   ✅ SUCCESS`);
      } else {
        console.log(`   ❌ ${r.status} (HTTP ${r.httpStatus})`);
        console.log(`   Error: ${r.error}`);
      }
    });

    const lastSuccess = results.filter(r => r.status === 'SUCCESS').pop();
    const firstFailure = results.find(r => r.status !== 'SUCCESS');

    if (firstFailure && lastSuccess) {
      console.log(`\n🎯 CULPRIT IDENTIFIED:`);
      console.log(`Last working: ${lastSuccess.config} (${lastSuccess.nodeCount} nodes)`);
      console.log(`First failing: ${firstFailure.config}`);

      const prevIdx = testConfigs.findIndex(c => c.name === lastSuccess.config);
      const currIdx = testConfigs.findIndex(c => c.name === firstFailure.config);

      if (prevIdx >= 0 && currIdx >= 0) {
        const prevNodes = testConfigs[prevIdx].nodes;
        const currNodes = testConfigs[currIdx].nodes;
        const problematicNodes = currNodes.filter(n => !prevNodes.includes(n));

        console.log(`\n⚠️  Problematic node(s) added in failing config:`);
        problematicNodes.forEach(n => console.log(`    - ${n}`));
      }
    }

    fs.writeFileSync('error-diagnosis.json', JSON.stringify(results, null, 2));
    console.log('\n✅ Results saved to error-diagnosis.json');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
