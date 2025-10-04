const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function buildTeamsWorkflow() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: {
      N8N_API_URL: 'http://localhost:5678',
      N8N_API_KEY: 'n8n_api_c9b9c4b1a1c23dbc70e6e5dcd39dfc3c46d0e50f95c0c4df36b98db7c4b21f76'
    }
  });

  const client = new Client({ name: 'teams-workflow-builder', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('🚀 Building Teams AI Email Agent Workflow with AI Agent node...\n');

  // Step 1: Get the workflow
  console.log('📥 Getting current workflow...');
  const getResult = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'get',
      workflowId: '3tiHPw5yRh1lyanL'
    }
  });
  const currentWorkflow = JSON.parse(getResult.content[0].text);
  console.log(`Current workflow has ${currentWorkflow.nodes.length} nodes\n`);

  // Step 2: Build complete workflow with AI Agent
  console.log('🔧 Adding AI Agent and Teams integration nodes...\n');

  const operations = [
    // Add AI Agent node
    {
      type: 'addNode',
      node: {
        name: 'AI Email Agent',
        type: 'nodes-langchain.agent',
        parameters: {
          promptType: 'define',
          text: 'Analyze the incoming email and determine if it requires immediate attention based on:\n1. Sender importance\n2. Keywords indicating urgency\n3. Action items requested\n\nProvide a summary and recommend if it should be sent to Teams.',
          options: {}
        },
        position: [740, 240]
      }
    },
    // Add Teams message node for important emails
    {
      type: 'addNode',
      node: {
        name: 'Send to Teams',
        type: 'nodes-base.microsoftTeams',
        parameters: {
          resource: 'message',
          operation: 'send',
          chatId: '={{ $json.teamsChatId }}',
          messageType: 'text',
          message: '🚨 Important Email Alert\n\n**From:** {{ $json.from }}\n**Subject:** {{ $json.subject }}\n\n**AI Analysis:** {{ $json.aiSummary }}'
        },
        position: [940, 200]
      }
    },
    // Add Teams bot trigger
    {
      type: 'addNode',
      node: {
        name: 'Teams Bot Trigger',
        type: 'nodes-base.microsoftTeamsTrigger',
        parameters: {
          resource: 'message',
          chatId: '={{ $json.chatId }}'
        },
        position: [240, 400]
      }
    },
    // Add AI response generator
    {
      type: 'addNode',
      node: {
        name: 'Generate Response',
        type: 'nodes-langchain.agent',
        parameters: {
          promptType: 'define',
          text: 'Based on the user question about emails: {{ $json.message }}\n\nProvide a helpful response using the email data available.',
          options: {}
        },
        position: [440, 400]
      }
    },
    // Add Teams response node
    {
      type: 'addNode',
      node: {
        name: 'Send Response',
        type: 'nodes-base.microsoftTeams',
        parameters: {
          resource: 'message',
          operation: 'send',
          chatId: '={{ $json.chatId }}',
          messageType: 'text',
          message: '={{ $json.response }}'
        },
        position: [640, 400]
      }
    },
    // Connect email fetch to AI Agent
    {
      type: 'addConnection',
      source: 'Gmail Trigger',
      target: 'AI Email Agent'
    },
    // Connect AI Agent to Teams send
    {
      type: 'addConnection',
      source: 'AI Email Agent',
      target: 'Send to Teams'
    },
    // Connect Teams trigger to AI response
    {
      type: 'addConnection',
      source: 'Teams Bot Trigger',
      target: 'Generate Response'
    },
    // Connect AI response to Teams send
    {
      type: 'addConnection',
      source: 'Generate Response',
      target: 'Send Response'
    }
  ];

  // Apply operations in batches of 5
  for (let i = 0; i < operations.length; i += 5) {
    const batch = operations.slice(i, i + 5);
    console.log(`Applying operations ${i + 1} to ${Math.min(i + 5, operations.length)}...`);

    const result = await client.callTool({
      name: 'workflow_diff',
      arguments: {
        action: 'update',
        workflowId: '3tiHPw5yRh1lyanL',
        operations: batch
      }
    });

    const data = JSON.parse(result.content[0].text);
    if (data.success) {
      console.log(`✅ Successfully applied ${data.appliedCount} operations`);
    } else {
      console.log(`❌ Error: ${data.error}`);
      if (data.validationErrors) {
        data.validationErrors.forEach(err => {
          console.log(`   - ${err.operation}: ${err.error}`);
        });
      }
      break;
    }
  }

  // Step 3: Verify the final workflow
  console.log('\n📊 Getting final workflow state...');
  const finalResult = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'get',
      workflowId: '3tiHPw5yRh1lyanL'
    }
  });
  const finalWorkflow = JSON.parse(finalResult.content[0].text);

  console.log(`\n✅ Workflow complete with ${finalWorkflow.nodes.length} nodes:`);
  finalWorkflow.nodes.forEach(node => {
    console.log(`   - ${node.name} (${node.type})`);
  });

  console.log('\n🎯 Workflow Features:');
  console.log('   ✅ AI-powered email analysis');
  console.log('   ✅ Automatic Teams notifications for important emails');
  console.log('   ✅ Teams bot for querying emails');
  console.log('   ✅ AI-generated responses to questions');

  await client.close();
}

buildTeamsWorkflow().catch(console.error);
