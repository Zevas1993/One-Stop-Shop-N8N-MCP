const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

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
  const result = { toolName, action, status, details, timestamp: new Date().toISOString() };

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

async function testTool(client, toolName, args, actionName) {
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    const data = JSON.parse(result.content[0].text);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testAllTools() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: process.env
  });

  const client = new Client({ name: 'tool-tester', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('🧪 MCP Tool Test Suite\n');
  console.log('='.repeat(60) + '\n');

  const apiConfigured = process.env.N8N_API_URL && process.env.N8N_API_KEY;
  console.log(`N8N API Configured: ${apiConfigured ? '✅ Yes' : '❌ No'}\n`);
  console.log('='.repeat(60) + '\n');

  // Test 1: node_discovery - search
  console.log('Testing node_discovery...');
  let result = await testTool(client, 'node_discovery', { action: 'search', query: 'slack', limit: 5 });
  if (result.success) {
    logTest('node_discovery', 'search', 'PASS', `Found ${result.data.totalCount || result.data.results?.length} results`);
  } else {
    logTest('node_discovery', 'search', 'FAIL', result.error);
  }

  // Test 2: node_discovery - list
  result = await testTool(client, 'node_discovery', { action: 'list', category: 'trigger', limit: 5 });
  if (result.success) {
    logTest('node_discovery', 'list', 'PASS', `Listed ${result.data.nodes?.length || result.data.totalCount} nodes`);
  } else {
    logTest('node_discovery', 'list', 'FAIL', result.error);
  }

  // Test 3: node_discovery - get_info
  result = await testTool(client, 'node_discovery', { action: 'get_info', nodeType: 'nodes-base.slack' });
  if (result.success) {
    logTest('node_discovery', 'get_info', 'PASS', `Got info for ${result.data.displayName || result.data.name}`);
  } else {
    logTest('node_discovery', 'get_info', 'FAIL', result.error);
  }

  // Test 4: node_discovery - get_documentation
  result = await testTool(client, 'node_discovery', { action: 'get_documentation', nodeType: 'nodes-base.slack' });
  if (result.success) {
    logTest('node_discovery', 'get_documentation', 'PASS', `Has docs: ${result.data.hasDocumentation ? 'Yes' : 'Fallback'}`);
  } else {
    logTest('node_discovery', 'get_documentation', 'FAIL', result.error);
  }

  // Test 5: node_discovery - search_properties
  result = await testTool(client, 'node_discovery', { action: 'search_properties', nodeType: 'nodes-base.slack', query: 'channel' });
  if (result.success) {
    logTest('node_discovery', 'search_properties', 'PASS', `Found ${result.data.properties?.length || 0} matching properties`);
  } else {
    logTest('node_discovery', 'search_properties', 'FAIL', result.error);
  }

  // Test 6: node_validation - validate_minimal
  console.log('\nTesting node_validation...');
  result = await testTool(client, 'node_validation', {
    action: 'validate_minimal',
    nodeType: 'nodes-base.slack',
    configuration: { resource: 'message', operation: 'post' }
  });
  if (result.success) {
    logTest('node_validation', 'validate_minimal', 'PASS', `Valid: ${result.data.valid}`);
  } else {
    logTest('node_validation', 'validate_minimal', 'FAIL', result.error);
  }

  // Test 7: node_validation - get_dependencies
  result = await testTool(client, 'node_validation', { action: 'get_dependencies', nodeType: 'nodes-base.slack' });
  if (result.success) {
    logTest('node_validation', 'get_dependencies', 'PASS', `Found dependencies`);
  } else {
    logTest('node_validation', 'get_dependencies', 'FAIL', result.error);
  }

  // Test 8: node_validation - list_tasks
  result = await testTool(client, 'node_validation', { action: 'list_tasks' });
  if (result.success) {
    logTest('node_validation', 'list_tasks', 'PASS', `Found ${result.data.tasks?.length || result.data.totalTasks} tasks`);
  } else {
    logTest('node_validation', 'list_tasks', 'FAIL', result.error);
  }

  // Test 9: template_system - search
  console.log('\nTesting template_system...');
  result = await testTool(client, 'template_system', { action: 'search', query: 'email', limit: 3 });
  if (result.success) {
    logTest('template_system', 'search', 'PASS', `Found ${result.data.results?.length || result.data.totalCount} templates`);
  } else {
    logTest('template_system', 'search', 'FAIL', result.error);
  }

  // Test 10: template_system - get_by_node
  result = await testTool(client, 'template_system', { action: 'get_by_node', nodeType: 'nodes-base.slack' });
  if (result.success) {
    logTest('template_system', 'get_by_node', 'PASS', `Found ${result.data.templates?.length || 0} Slack templates`);
  } else {
    logTest('template_system', 'get_by_node', 'FAIL', result.error);
  }

  // Conditional tests - only if n8n API is configured
  if (apiConfigured) {
    console.log('\nTesting workflow_manager...');

    // Test 11: workflow_manager - list
    result = await testTool(client, 'workflow_manager', { action: 'list', limit: 5 });
    if (result.success) {
      logTest('workflow_manager', 'list', 'PASS', `Found ${result.data.workflows?.length || result.data.data?.workflows?.length} workflows`);
    } else {
      logTest('workflow_manager', 'list', 'FAIL', result.error);
    }

    // Test 12: workflow_execution - list
    console.log('\nTesting workflow_execution...');
    result = await testTool(client, 'workflow_execution', { action: 'list', limit: 5 });
    if (result.success) {
      logTest('workflow_execution', 'list', 'PASS', `Found ${result.data.executions?.length || result.data.data?.executions?.length} executions`);
    } else {
      logTest('workflow_execution', 'list', 'FAIL', result.error);
    }

    // Test 13: n8n_system - health_check
    console.log('\nTesting n8n_system...');
    result = await testTool(client, 'n8n_system', { action: 'health_check' });
    if (result.success) {
      logTest('n8n_system', 'health_check', 'PASS', `Healthy: ${result.data.healthy || result.data.data?.healthy}`);
    } else {
      logTest('n8n_system', 'health_check', 'FAIL', result.error);
    }

    // Test 14: n8n_system - list_tools
    result = await testTool(client, 'n8n_system', { action: 'list_tools' });
    if (result.success) {
      logTest('n8n_system', 'list_tools', 'PASS', `Found ${result.data.tools?.length || result.data.data?.tools?.length} tools`);
    } else {
      logTest('n8n_system', 'list_tools', 'FAIL', result.error);
    }
  } else {
    logTest('workflow_manager', 'all', 'SKIP', 'N8N API not configured');
    logTest('workflow_execution', 'all', 'SKIP', 'N8N API not configured');
    logTest('workflow_diff', 'all', 'SKIP', 'N8N API not configured');
    logTest('n8n_system', 'all', 'SKIP', 'N8N API not configured');
  }

  await client.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  console.log(`Total Tests: ${testResults.totalTests}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);

  const successfulTests = testResults.totalTests - testResults.skipped;
  if (successfulTests > 0) {
    console.log(`\nSuccess Rate: ${((testResults.passed / successfulTests) * 100).toFixed(1)}%`);
  }

  // Save detailed results
  fs.writeFileSync('test-results.json', JSON.stringify(testResults, null, 2));
  console.log('\n✅ Detailed results saved to test-results.json\n');

  return testResults;
}

testAllTools().catch(console.error);
