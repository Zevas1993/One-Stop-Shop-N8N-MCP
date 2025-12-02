const fs = require('fs');
const http = require('http');

const workflowData = JSON.parse(fs.readFileSync('AI_EMAIL_MANAGER_WORKFLOW.json', 'utf8'));
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';

const postData = JSON.stringify(workflowData);

const options = {
  hostname: 'localhost',
  port: 5678,
  path: '/api/v1/workflows',
  method: 'POST',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`✅ Response Status: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.id) {
        console.log('\n🎉 WORKFLOW CREATED SUCCESSFULLY!\n');
        console.log(`✅ Workflow ID: ${json.id}`);
        console.log(`✅ Name: ${json.name}`);
        console.log(`✅ Nodes: ${json.nodes.length}`);
        console.log(`✅ Active: ${json.active}`);
        console.log(`✅ Created: ${json.createdAt}`);
        console.log(`\n📋 NODES INCLUDED:`);
        json.nodes.forEach((n, i) => {
          console.log(`   ${i+1}. ${n.name} (${n.type})`);
        });
        console.log(`\n🌐 Access at: http://localhost:5678/workflows/${json.id}`);
      } else {
        console.log('Error Response:', json);
      }
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ HTTP ERROR:', err.message);
  process.exit(1);
});

console.log('🚀 Deploying AI Email Manager Workflow...\n');
req.write(postData);
req.end();
