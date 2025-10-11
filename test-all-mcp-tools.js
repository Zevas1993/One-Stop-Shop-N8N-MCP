const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const testResults = {
  timestamp: new Date().toISOString(),
  totalTests: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  results: []
};

function logTest(toolName, action, status, details) {
  testResults.totalTests++;
  const result = { toolName, action, status, details };

  if (status === 'PASS') {
    testResults.passed++;
    console.log(`✅ ${toolName} (${action}): ${details}`);
  } else if (status === 'FAIL') {
    testResults.failed++;
    console.log(`❌ ${toolName} (${action}): ${details}`);
  } else {
    testResults.skipped++;
    console.log(`⏭️  ${toolName} (${action}): ${details}`);
  }

  testResults.results.push(result);
}

async function testAllTools() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: process.env
  });

  const client = new Client({ name: 'tool-tester', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('🧪 Starting Comprehensive MCP Tool Test Suite\n');
  console.log('='.repeat(60));

  // 1. List all available tools
  console.log('\n📋 Listing Available Tools...\n');
  const toolsResponse = await client.request({ method: 'tools/list' }, ListToolsRequestSchema);
  const tools = toolsResponse.tools;
  console.log(`Found ${tools.length} tools:\n`);
  tools.forEach(tool => console.log(`  - ${tool.name}: ${tool.description.substring(0, 80)}...`));

  console.log('\n' + '='.repeat(60));
  console.log('\n🔬 Testing Each Tool...\n');

  // 2. Test node_discovery tool
  console.log('\n--- Testing node_discovery ---');

  try {
    // Test search action
    const searchResult = await client.callTool({
      name: 'node_discovery',
      arguments: { action: 'search', query: 'slack', limit: 5 }
    });
    const searchData = JSON.parse(searchResult.content[0].text);
    logTest('node_discovery', 'search', 'PASS', `Found ${searchData.totalCount} Slack nodes`);
  } catch (error) {
    logTest('node_discovery', 'search', 'FAIL', error.message);
  }

  try {
    // Test list action
    const listResult = await client.callTool({
      name: 'node_discovery',
      arguments: { action: 'list', category: 'trigger', limit: 5 }
    });
    const listData = JSON.parse(listResult.content[0].text);
    logTest('node_discovery', 'list', 'PASS', `Listed ${listData.nodes?.length || 0} trigger nodes`);
  } catch (error) {
    logTest('node_discovery', 'list', 'FAIL', error.message);
  }

  try {
    // Test get_info action
    const infoResult = await client.callTool({
      name: 'node_discovery',
      arguments: { action: 'get_info', nodeType: 'nodes-base.slack' }
    });
    const infoData = JSON.parse(infoResult.content[0].text);
    logTest('node_discovery', 'get_info', 'PASS', `Got info for ${infoData.displayName}`);
  } catch (error) {
    logTest('node_discovery', 'get_info', 'FAIL', error.message);
  }

  try {
    // Test get_documentation action
    const docsResult = await client.callTool({
      name: 'node_discovery',
      arguments: { action: 'get_documentation', nodeType: 'nodes-base.slack' }
    });
    const docsData = JSON.parse(docsResult.content[0].text);
    logTest('node_discovery', 'get_documentation', 'PASS', `Got docs: ${docsData.hasDocumentation ? 'Yes' : 'Fallback'}`);
  } catch (error) {
    logTest('node_discovery', 'get_documentation', 'FAIL', error.message);
  }

  // 3. Test node_validation tool
  console.log('\n--- Testing node_validation ---');

  try {
    // Test validate_minimal action
    const validateResult = await client.callTool({
      name: 'node_validation',
      arguments: {
        action: 'validate_minimal',
        nodeType: 'nodes-base.slack',
        configuration: { resource: 'message', operation: 'post' }
      }
    });
    const validateData = JSON.parse(validateResult.content[0].text);
    logTest('node_validation', 'validate_minimal', 'PASS', `Validation: ${validateData.valid ? 'Valid' : 'Invalid'}`);
  } catch (error) {
    logTest('node_validation', 'validate_minimal', 'FAIL', error.message);
  }

  try {
    // Test get_dependencies action
    const depsResult = await client.callTool({
      name: 'node_validation',
      arguments: {
        action: 'get_dependencies',
        nodeType: 'nodes-base.slack'
      }
    });
    const depsData = JSON.parse(depsResult.content[0].text);
    logTest('node_validation', 'get_dependencies', 'PASS', `Found ${Object.keys(depsData.dependencies || {}).length} dependencies`);
  } catch (error) {
    logTest('node_validation', 'get_dependencies', 'FAIL', error.message);
  }

  try {
    // Test list_tasks action
    const tasksResult = await client.callTool({
      name: 'node_validation',
      arguments: { action: 'list_tasks' }
    });
    const tasksData = JSON.parse(tasksResult.content[0].text);
    logTest('node_validation', 'list_tasks', 'PASS', `Found ${tasksData.tasks?.length || 0} task templates`);
  } catch (error) {
    logTest('node_validation', 'list_tasks', 'FAIL', error.message);
  }

  // 4. Test template_system tool
  console.log('\n--- Testing template_system ---');

  try {
    // Test search action
    const templateSearchResult = await client.callTool({
      name: 'template_system',
      arguments: { action: 'search', query: 'email', limit: 3 }
    });
    const templateSearchData = JSON.parse(templateSearchResult.content[0].text);
    logTest('template_system', 'search', 'PASS', `Found ${templateSearchData.results?.length || 0} email templates`);
  } catch (error) {
    logTest('template_system', 'search', 'FAIL', error.message);
  }

  try {
    // Test get_by_node action
    const nodeTemplatesResult = await client.callTool({
      name: 'template_system',
      arguments: { action: 'get_by_node', nodeType: 'nodes-base.slack' }
    });
    const nodeTemplatesData = JSON.parse(nodeTemplatesResult.content[0].text);
    logTest('template_system', 'get_by_node', 'PASS', `Found ${nodeTemplatesData.templates?.length || 0} Slack templates`);
  } catch (error) {
    logTest('template_system', 'get_by_node', 'FAIL', error.message);
  }

  // 5. Test workflow_manager tool (requires n8n API)
  console.log('\n--- Testing workflow_manager ---');

  const apiConfigured = process.env.N8N_API_URL && process.env.N8N_API_KEY;

  if (!apiConfigured) {
    logTest('workflow_manager', 'all', 'SKIP', 'N8N_API_URL or N8N_API_KEY not configured');
  } else {
    try {
      // Test list action
      const listWorkflowsResult = await client.callTool({
        name: 'workflow_manager',
        arguments: { action: 'list', limit: 5 }
      });
      const workflowsData = JSON.parse(listWorkflowsResult.content[0].text);
      logTest('workflow_manager', 'list', 'PASS', `Found ${workflowsData.data?.workflows?.length || 0} workflows`);
    } catch (error) {
      logTest('workflow_manager', 'list', 'FAIL', error.message);
    }

    try {
      // Test get action (using first workflow if available)
      const listResult = await client.callTool({
        name: 'workflow_manager',
        arguments: { action: 'list', limit: 1 }
      });
      const listData = JSON.parse(listResult.content[0].text);

      if (listData.data?.workflows?.[0]?.id) {
        const workflowId = listData.data.workflows[0].id;
        const getResult = await client.callTool({
          name: 'workflow_manager',
          arguments: { action: 'get', id: workflowId }
        });
        const getData = JSON.parse(getResult.content[0].text);
        logTest('workflow_manager', 'get', 'PASS', `Retrieved workflow: ${getData.data?.name || 'Unknown'}`);
      } else {
        logTest('workflow_manager', 'get', 'SKIP', 'No workflows available to test');
      }
    } catch (error) {
      logTest('workflow_manager', 'get', 'FAIL', error.message);
    }
  }

  // 6. Test workflow_execution tool (requires n8n API)
  console.log('\n--- Testing workflow_execution ---');

  if (!apiConfigured) {
    logTest('workflow_execution', 'all', 'SKIP', 'N8N_API_URL or N8N_API_KEY not configured');
  } else {
    try {
      // Test list action
      const listExecResult = await client.callTool({
        name: 'workflow_execution',
        arguments: { action: 'list', limit: 5 }
      });
      const execData = JSON.parse(listExecResult.content[0].text);
      logTest('workflow_execution', 'list', 'PASS', `Found ${execData.data?.executions?.length || 0} executions`);
    } catch (error) {
      logTest('workflow_execution', 'list', 'FAIL', error.message);
    }
  }

  // 7. Test workflow_diff tool (requires n8n API)
  console.log('\n--- Testing workflow_diff ---');

  if (!apiConfigured) {
    logTest('workflow_diff', 'all', 'SKIP', 'N8N_API_URL or N8N_API_KEY not configured');
  } else {
    try {
      // Test validate action (dry run)
      const validateDiffResult = await client.callTool({
        name: 'workflow_diff',
        arguments: {
          action: 'validate',
          workflowId: 'test123',
          operations: [
            { type: 'addNode', node: { name: 'Test Node', type: 'nodes-base.noOp' } }
          ]
        }
      });
      const diffData = JSON.parse(validateDiffResult.content[0].text);
      logTest('workflow_diff', 'validate', diffData.success ? 'PASS' : 'FAIL',
        diffData.success ? 'Validation successful' : diffData.error || 'Validation failed');
    } catch (error) {
      logTest('workflow_diff', 'validate', 'FAIL', error.message);
    }
  }

  // 8. Test n8n_system tool (requires n8n API)
  console.log('\n--- Testing n8n_system ---');

  if (!apiConfigured) {
    logTest('n8n_system', 'all', 'SKIP', 'N8N_API_URL or N8N_API_KEY not configured');
  } else {
    try {
      // Test health_check action
      const healthResult = await client.callTool({
        name: 'n8n_system',
        arguments: { action: 'health_check' }
      });
      const healthData = JSON.parse(healthResult.content[0].text);
      logTest('n8n_system', 'health_check', 'PASS',
        `Health: ${healthData.data?.healthy ? 'Healthy' : 'Unhealthy'}`);
    } catch (error) {
      logTest('n8n_system', 'health_check', 'FAIL', error.message);
    }

    try {
      // Test list_tools action
      const listToolsResult = await client.callTool({
        name: 'n8n_system',
        arguments: { action: 'list_tools' }
      });
      const toolsData = JSON.parse(listToolsResult.content[0].text);
      logTest('n8n_system', 'list_tools', 'PASS',
        `Found ${toolsData.data?.tools?.length || 0} n8n tools available`);
    } catch (error) {
      logTest('n8n_system', 'list_tools', 'FAIL', error.message);
    }
  }

  await client.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  console.log(`Total Tests: ${testResults.totalTests}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`\nSuccess Rate: ${((testResults.passed / (testResults.totalTests - testResults.skipped)) * 100).toFixed(1)}%`);

  // Save detailed results
  fs.writeFileSync('test-results.json', JSON.stringify(testResults, null, 2));
  console.log('\n✅ Detailed results saved to test-results.json');

  return testResults;
}

// Import schema
const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

testAllTools().catch(console.error);
