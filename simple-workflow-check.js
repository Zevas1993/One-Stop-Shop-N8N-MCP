const http = require('http');

const n8nUrl = 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

if (!apiKey) {
  console.error('❌ N8N_API_KEY environment variable not set');
  process.exit(1);
}

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
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);
    console.log('Status:', result.status);
    
    if (result.status !== 200) {
      console.error('Response:', result.body);
      return;
    }
    
    try {
      const data = JSON.parse(result.body);
      console.log('Response keys:', Object.keys(data));
      
      if (data.data) {
        const wf = data.data;
        console.log('\n✅ Workflow structure:');
        console.log('- Nodes:', Array.isArray(wf.nodes), wf.nodes ? wf.nodes.length : 0);
        console.log('- Connections:', typeof wf.connections, wf.connections ? Object.keys(wf.connections).length : 0);
        console.log('- Name:', wf.name);
        console.log('- ID:', wf.id);
        
        // Check first node
        if (wf.nodes && wf.nodes[0]) {
          console.log('\nFirst node:');
          console.log(JSON.stringify(wf.nodes[0], null, 2));
        }
      } else {
        console.log('Full response:', JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.error('Parse error:', e.message);
      console.error('Body:', result.body.substring(0, 500));
    }
  } catch (error) {
    console.error('Request error:', error.message);
  }
}

main();
