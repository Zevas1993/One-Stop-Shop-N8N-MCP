const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
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
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║    FETCHING ORIGINAL WORKFLOW FROM DATABASE            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(`Fetching workflow ${workflowId}...\n`);

    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    console.log(`Status: ${result.status}`);

    if (result.status === 200) {
      const workflow = JSON.parse(result.body).data || JSON.parse(result.body);

      console.log(`\n✅ Workflow retrieved successfully`);
      console.log(`\nName: ${workflow.name}`);
      console.log(`Nodes: ${workflow.nodes.length}`);
      console.log(`Connections: ${Object.keys(workflow.connections).length}`);

      // Save the actual workflow as stored in n8n
      fs.writeFileSync('original-workflow-from-api.json', JSON.stringify(workflow, null, 2));

      // Compare with backup
      console.log(`\nComparing with backup file...`);
      const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
      const backup = JSON.parse(backupJson);

      console.log(`\nBackup Nodes: ${backup.nodes.length}`);
      console.log(`Backup Connections: ${Object.keys(backup.connections).length}`);

      // Check for differences
      if (JSON.stringify(workflow.nodes) === JSON.stringify(backup.nodes)) {
        console.log(`\n✅ Nodes are identical to backup`);
      } else {
        console.log(`\n❌ Nodes differ from backup`);

        // Find differences
        if (workflow.nodes.length !== backup.nodes.length) {
          console.log(`   Node count: ${workflow.nodes.length} vs ${backup.nodes.length}`);
        }

        for (let i = 0; i < Math.max(workflow.nodes.length, backup.nodes.length); i++) {
          if (!workflow.nodes[i]) {
            console.log(`   Missing node at index ${i}: ${backup.nodes[i].name}`);
          } else if (!backup.nodes[i]) {
            console.log(`   Extra node at index ${i}: ${workflow.nodes[i].name}`);
          } else if (JSON.stringify(workflow.nodes[i]) !== JSON.stringify(backup.nodes[i])) {
            console.log(`   Node differs at index ${i}: ${workflow.nodes[i].name}`);
          }
        }
      }

      // Check connections
      if (JSON.stringify(workflow.connections) === JSON.stringify(backup.connections)) {
        console.log(`✅ Connections are identical to backup`);
      } else {
        console.log(`❌ Connections differ from backup`);
      }

      console.log(`\n📁 Saved to original-workflow-from-api.json`);

    } else {
      console.log(`❌ Failed to fetch: ${result.status}`);
      console.log(result.body.substring(0, 500));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
