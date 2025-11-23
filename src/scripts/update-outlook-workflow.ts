import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const WORKFLOW_ID = '2dTTm6g4qFmcTob1';

interface WorkflowResponse {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: any;
  settings: any;
  staticData?: any;
  tags?: any[];
}

async function getWorkflow(workflowId: string): Promise<WorkflowResponse> {
  console.log(`\n📥 Fetching workflow ${workflowId}...`);
  const response = await axios.get(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, {
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
    },
  });
  return response.data;
}

async function updateWorkflow(workflowId: string, workflow: any): Promise<WorkflowResponse> {
  console.log(`\n📤 Updating workflow ${workflowId}...`);
  const response = await axios.put(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, workflow, {
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
}

async function activateWorkflow(workflowId: string): Promise<void> {
  console.log(`\n🚀 Activating workflow ${workflowId}...`);
  try {
    // First try PATCH method
    await axios.patch(
      `${N8N_API_URL}/api/v1/workflows/${workflowId}`,
      { active: true },
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    if (error.response?.status === 405) {
      // If PATCH not supported, try POST to /activate endpoint
      try {
        await axios.post(
          `${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`,
          {},
          {
            headers: {
              'X-N8N-API-KEY': N8N_API_KEY,
            },
          }
        );
      } catch (postError: any) {
        console.warn('⚠️  Activation failed. You may need to activate the workflow manually in n8n UI.');
        console.warn('   Error:', postError.message);
        return; // Don't throw, just warn
      }
    } else {
      throw error;
    }
  }
}

function generateNodeId(): string {
  return Math.random().toString(36).substring(2, 15);
}

async function main() {
  try {
    console.log('🎯 UPDATING ULTIMATE OUTLOOK AI ASSISTANT WORKFLOW');
    console.log('=' .repeat(60));

    // Step 1: Get current workflow
    const workflow = await getWorkflow(WORKFLOW_ID);
    console.log(`\n✅ Current workflow fetched:`);
    console.log(`   - Name: ${workflow.name}`);
    console.log(`   - Status: ${workflow.active ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`   - Nodes: ${workflow.nodes.length}`);

    const beforeNodeCount = workflow.nodes.length;

    // Step 2: Find the Main Agent node to connect new nodes
    const mainAgentNode = workflow.nodes.find(n =>
      n.type === 'n8n-nodes-base.agent' ||
      n.name.toLowerCase().includes('main') ||
      n.name.toLowerCase().includes('agent')
    );

    if (!mainAgentNode) {
      console.error('❌ Could not find Main Agent node');
      return;
    }

    console.log(`\n📍 Found Main Agent node: ${mainAgentNode.name} (${mainAgentNode.id})`);

    // Step 3: Check if nodes already exist
    const hasTeamsNode = workflow.nodes.some(n => n.name === 'Microsoft Teams');
    const hasCalendarNode = workflow.nodes.some(n => n.name === 'Outlook Calendar');
    const hasAttachmentNode = workflow.nodes.some(n => n.name === 'Email Attachments');

    if (hasTeamsNode && hasCalendarNode && hasAttachmentNode) {
      console.log('\n✅ All required nodes already exist in the workflow!');
      console.log('   - Microsoft Teams');
      console.log('   - Outlook Calendar');
      console.log('   - Email Attachments');
      console.log('\nSkipping node creation...');
    } else {
      console.log('\n📍 Missing nodes - will add them now...');
    }

    const newNodes: any[] = [];

    // A) Microsoft Teams node
    if (!hasTeamsNode) {
      const teamsNodeId = generateNodeId();
      const teamsNode = {
      id: teamsNodeId,
      name: 'Microsoft Teams',
      type: 'n8n-nodes-base.microsoftTeams',
      typeVersion: 2,
      position: [mainAgentNode.position[0] + 400, mainAgentNode.position[1] - 200],
      parameters: {
        resource: 'message',
        operation: 'send',
      },
      credentials: {
        microsoftTeamsOAuth2Api: {
          id: '1', // Will need to be configured
          name: 'Microsoft Teams account',
        },
      },
      };
      newNodes.push(teamsNode);
    }

    // B) Calendar node (using Outlook calendar)
    if (!hasCalendarNode) {
      const calendarNodeId = generateNodeId();
      const calendarNode = {
      id: calendarNodeId,
      name: 'Outlook Calendar',
      type: 'n8n-nodes-base.microsoftOutlook',
      typeVersion: 2.1,
      position: [mainAgentNode.position[0] + 400, mainAgentNode.position[1]],
      parameters: {
        resource: 'calendar',
        operation: 'getAll',
      },
      credentials: {
        microsoftOutlookOAuth2Api: {
          id: '1', // Will need to be configured
          name: 'Microsoft Outlook account',
        },
      },
      };
      newNodes.push(calendarNode);
    }

    // C) Message Attachment node
    if (!hasAttachmentNode) {
      const attachmentNodeId = generateNodeId();
      const attachmentNode = {
      id: attachmentNodeId,
      name: 'Email Attachments',
      type: 'n8n-nodes-base.microsoftOutlook',
      typeVersion: 2.1,
      position: [mainAgentNode.position[0] + 400, mainAgentNode.position[1] + 200],
      parameters: {
        resource: 'messageAttachment',
        operation: 'download',
      },
      credentials: {
        microsoftOutlookOAuth2Api: {
          id: '1', // Will need to be configured
          name: 'Microsoft Outlook account',
        },
      },
      };
      newNodes.push(attachmentNode);
    }

    if (newNodes.length === 0) {
      console.log('\n✅ No new nodes to add. Workflow is already up to date!');

      // Step 7: Just try to activate
      await activateWorkflow(WORKFLOW_ID);

      // Verify
      const verifiedWorkflow = await getWorkflow(WORKFLOW_ID);
      console.log(`\n✅ VERIFICATION:`);
      console.log(`   - Status: ${verifiedWorkflow.active ? 'ACTIVE ✓' : 'INACTIVE (activate manually)'}`);
      console.log(`   - Total nodes: ${verifiedWorkflow.nodes.length}`);
      return;
    }

    console.log(`\n➕ Adding ${newNodes.length} new nodes:`);
    newNodes.forEach(node => {
      console.log(`   - ${node.name} (${node.type})`);
    });

    // Step 4: Add nodes to workflow
    workflow.nodes.push(...newNodes);

    // Step 5: Add connections from Main Agent to new nodes
    if (!workflow.connections[mainAgentNode.name]) {
      workflow.connections[mainAgentNode.name] = {};
    }
    if (!workflow.connections[mainAgentNode.name].main) {
      workflow.connections[mainAgentNode.name].main = [[]];
    }

    // Connect Main Agent to new nodes
    newNodes.forEach(node => {
      workflow.connections[mainAgentNode.name].main[0].push(
        { node: node.name, type: 'main', index: 0 }
      );
    });

    console.log(`\n🔗 Added connections from ${mainAgentNode.name} to new nodes`);

    // Step 6: Update the workflow
    const updatedWorkflow = await updateWorkflow(WORKFLOW_ID, {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
      staticData: workflow.staticData,
    });

    console.log(`\n✅ Workflow updated successfully!`);
    console.log(`   - Before nodes: ${beforeNodeCount}`);
    console.log(`   - After nodes: ${updatedWorkflow.nodes.length}`);
    console.log(`   - New nodes added: ${updatedWorkflow.nodes.length - beforeNodeCount}`);

    // Step 7: Activate the workflow
    await activateWorkflow(WORKFLOW_ID);
    console.log(`\n🚀 Workflow activated successfully!`);

    // Step 8: Verify changes
    const verifiedWorkflow = await getWorkflow(WORKFLOW_ID);
    console.log(`\n✅ VERIFICATION:`);
    console.log(`   - Status: ${verifiedWorkflow.active ? 'ACTIVE ✓' : 'INACTIVE ✗'}`);
    console.log(`   - Total nodes: ${verifiedWorkflow.nodes.length}`);
    console.log(`   - New nodes present:`);

    const nodeNames = ['Microsoft Teams', 'Outlook Calendar', 'Email Attachments'];
    const addedNodes = verifiedWorkflow.nodes.filter(n =>
      nodeNames.includes(n.name)
    );

    addedNodes.forEach(node => {
      console.log(`     ✓ ${node.name} (${node.type})`);
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 WORKFLOW UPDATE COMPLETE!');
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error('\n❌ Error updating workflow:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
