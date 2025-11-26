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

async function main() {
  try {
    console.log('Fetching original complex workflow...\n');

    // Get the original workflow from backup
    const originalJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
    const originalWorkflow = JSON.parse(originalJson);

    console.log(`Original workflow has ${originalWorkflow.nodes.length} nodes`);
    console.log(`Original workflow has ${Object.keys(originalWorkflow.connections).length} connection objects\n`);

    // Start with just the triggers and basic nodes
    const testConfigs = [
      {
        name: 'Config 1: Just triggers',
        nodeNames: ['Open WebUI Chat Interface', 'Email Processing Trigger']
      },
      {
        name: 'Config 2: Triggers + Set nodes',
        nodeNames: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI'
        ]
      },
      {
        name: 'Config 3: Add basic operations',
        nodeNames: [
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
        name: 'Config 4: Add AI nodes (no connections yet)',
        nodeNames: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Main Email Assistant',
          'Business Inquiry Agent',
          'OpenAI Chat Model',
          'Memory Buffer'
        ]
      },
      {
        name: 'Config 5: Add all AI support nodes',
        nodeNames: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Main Email Assistant',
          'Business Inquiry Agent',
          'OpenAI Chat Model',
          'Memory Buffer',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool',
          'Knowledge Search Tool'
        ]
      },
      {
        name: 'Config 6: Add processing nodes',
        nodeNames: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Main Email Assistant',
          'Business Inquiry Agent',
          'OpenAI Chat Model',
          'Memory Buffer',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool',
          'Knowledge Search Tool',
          'Process Each Email',
          'Clean Email Content',
          'AI Email Classifier',
          'Email Category Router'
        ]
      },
      {
        name: 'Config 7: Add response nodes',
        nodeNames: [
          'Open WebUI Chat Interface',
          'Email Processing Trigger',
          'Parse Chat Input',
          'Extract Email Metadata',
          'Format Response for WebUI',
          'Get Unprocessed Emails',
          'Move Spam to Junk',
          'Update Email Categories',
          'Main Email Assistant',
          'Business Inquiry Agent',
          'OpenAI Chat Model',
          'Memory Buffer',
          'Create Draft Tool',
          'Send Email Tool',
          'Search Emails Tool',
          'Knowledge Search Tool',
          'Process Each Email',
          'Clean Email Content',
          'AI Email Classifier',
          'Email Category Router',
          'Send Response to WebUI'
        ]
      }
    ];

    const results = [];

    for (const config of testConfigs) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(config.name);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Filter nodes
      const testNodes = originalWorkflow.nodes.filter(n =>
        config.nodeNames.includes(n.name)
      );

      console.log(`Nodes: ${testNodes.length} / ${config.nodeNames.length}`);

      // Filter connections - only keep connections between nodes in our test set
      const testConnections = {};
      for (const [sourceName, connObj] of Object.entries(originalWorkflow.connections)) {
        if (!testNodes.some(n => n.name === sourceName)) continue;

        const filteredConn = {};

        // Filter main connections
        if (connObj.main) {
          filteredConn.main = connObj.main.map(outputArray =>
            outputArray.filter(conn =>
              testNodes.some(n => n.name === conn.node)
            )
          );
        }

        // Filter AI connections
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

      console.log(`Connections: ${Object.keys(testConnections).length}`);

      // Create test workflow
      const testWorkflow = {
        name: config.name,
        nodes: testNodes,
        connections: testConnections,
        settings: originalWorkflow.settings || {},
        staticData: originalWorkflow.staticData || {}
      };

      // Try to create it
      const result = await makeRequest('POST', '/api/v1/workflows', testWorkflow);

      if (result.status === 200 || result.status === 201) {
        const created = JSON.parse(result.body).data || JSON.parse(result.body);
        console.log(`✅ Created successfully (ID: ${created.id})`);
        results.push({
          config: config.name,
          status: 'SUCCESS',
          id: created.id,
          nodeCount: testNodes.length
        });

        // Clean up
        await makeRequest('DELETE', `/api/v1/workflows/${created.id}`);
      } else {
        console.log(`❌ Failed to create`);
        results.push({
          config: config.name,
          status: 'FAILED',
          error: result.body.substring(0, 200)
        });
        break; // Stop at first failure
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.config}`);
      if (r.status === 'SUCCESS') {
        console.log(`   ✅ SUCCESS (${r.nodeCount} nodes)`);
      } else {
        console.log(`   ❌ FAILED`);
        if (r.error) {
          console.log(`   ${r.error}`);
        }
      }
    });

    const lastSuccess = results.filter(r => r.status === 'SUCCESS').pop();
    const firstFailure = results.find(r => r.status === 'FAILED');

    if (firstFailure && lastSuccess) {
      console.log(`\n🎯 CULPRIT IDENTIFIED:`);
      console.log(`Last working config: ${lastSuccess.config} (${lastSuccess.nodeCount} nodes)`);
      console.log(`First failing config: ${firstFailure.config}`);
      console.log('\nThe problematic node(s) are in the failing config but not in the last successful one.');
    }

    fs.writeFileSync('rebuild-results.json', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
