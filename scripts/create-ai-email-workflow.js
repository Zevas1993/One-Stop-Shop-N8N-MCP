#!/usr/bin/env node

/**
 * Create AI Email Agent with Teams Bot workflow in n8n
 */

const https = require('http');
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const API_KEY = process.env.N8N_API_KEY;

async function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function createWorkflow() {
  console.log('📧 Creating AI Email Agent with Teams Bot workflow...\n');

  // Read the workflow JSON
  const workflowPath = path.join(__dirname, '..', 'workflows', 'ai-email-agent-teams-bot.json');
  const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  // Create the workflow using n8n API
  const options = {
    hostname: 'localhost',
    port: 5678,
    path: '/api/v1/workflows',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': API_KEY
    }
  };

  const response = await makeRequest(options, workflowData);

  if (response.status === 200 || response.status === 201) {
    console.log('✅ Workflow created successfully!\n');
    console.log('📋 Workflow Details:');
    console.log(`  - ID: ${response.body.id}`);
    console.log(`  - Name: ${response.body.name}`);
    console.log(`  - Nodes: ${response.body.nodes?.length || 0}`);
    console.log(`\n🌐 View in n8n: ${N8N_URL}/workflow/${response.body.id}\n`);

    console.log('⚙️  Next Steps:\n');
    console.log('1. Open the workflow in n8n');
    console.log('2. Configure Microsoft Outlook credentials');
    console.log('3. Configure Microsoft Teams credentials');
    console.log('4. Configure OpenAI credentials');
    console.log('5. Set environment variable: TEAMS_BUSINESS_OWNER_CHAT_ID');
    console.log('6. Activate the workflow\n');

    return response.body;
  } else {
    console.error('❌ Failed to create workflow');
    console.error('Status:', response.status);
    console.error('Response:', JSON.stringify(response.body, null, 2));
    throw new Error('Workflow creation failed');
  }
}

async function main() {
  try {
    if (!API_KEY) {
      console.error('❌ Missing N8N_API_KEY environment variable');
      process.exit(1);
    }

    await createWorkflow();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
