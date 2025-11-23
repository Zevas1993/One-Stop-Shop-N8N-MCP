import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const WORKFLOW_ID = '2dTTm6g4qFmcTob1';

async function main() {
  try {
    const response = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
      },
    });

    const workflow = response.data;

    console.log('\n🔍 WORKFLOW STATE SUMMARY');
    console.log('='.repeat(80));
    console.log(`ID: ${workflow.id}`);
    console.log(`Name: ${workflow.name}`);
    console.log(`Status: ${workflow.active ? 'ACTIVE ✓' : 'INACTIVE'}`);
    console.log(`Total Nodes: ${workflow.nodes.length}`);
    console.log('\n📋 NODE LIST:');
    console.log('='.repeat(80));

    workflow.nodes.forEach((node: any, index: number) => {
      console.log(`${index + 1}. ${node.name}`);
      console.log(`   Type: ${node.type}`);
      console.log(`   ID: ${node.id}`);
      if (node.parameters?.resource) {
        console.log(`   Resource: ${node.parameters.resource}`);
      }
      if (node.parameters?.operation) {
        console.log(`   Operation: ${node.parameters.operation}`);
      }
      console.log('');
    });

    console.log('='.repeat(80));

    // Find our new nodes
    const newNodeNames = ['Microsoft Teams', 'Outlook Calendar', 'Email Attachments'];
    const newNodes = workflow.nodes.filter((n: any) => newNodeNames.includes(n.name));

    if (newNodes.length > 0) {
      console.log('\n✅ NEWLY ADDED NODES:');
      console.log('='.repeat(80));
      newNodes.forEach((node: any) => {
        console.log(`✓ ${node.name} (${node.type})`);
        console.log(`  ID: ${node.id}`);
        if (node.parameters?.resource) {
          console.log(`  Resource: ${node.parameters.resource}`);
        }
        if (node.parameters?.operation) {
          console.log(`  Operation: ${node.parameters.operation}`);
        }
        console.log('');
      });
    }

    // Check connections
    console.log('\n🔗 CONNECTIONS:');
    console.log('='.repeat(80));
    Object.entries(workflow.connections).forEach(([nodeName, connections]: [string, any]) => {
      if (connections.main && connections.main[0] && connections.main[0].length > 0) {
        console.log(`${nodeName} →`);
        connections.main[0].forEach((conn: any) => {
          console.log(`  → ${conn.node}`);
        });
      }
    });
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

main();
