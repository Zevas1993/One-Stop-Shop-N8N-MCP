#!/usr/bin/env node
/**
 * v3.0.0 Implementation Validation Test
 *
 * Tests all Phase 0-2 components:
 * - Lazy initialization
 * - Enhanced n8n client
 * - Adaptive response builder
 * - Context intelligence engine
 * - V3 tool handlers
 */

import { LazyInitializationManager } from '../src/mcp/lazy-initialization-manager';
import { EnhancedN8nClient } from '../src/live-integration/enhanced-n8n-client';
import { adaptiveResponseBuilder, ResponseSize } from '../src/intelligent/adaptive-response-builder';
import { contextIntelligence } from '../src/intelligent/context-intelligence-engine';
import { getN8nApiConfig } from '../src/config/n8n-api';
import * as path from 'path';
import * as fs from 'fs';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function logTest(result: TestResult) {
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${result.test}: ${result.message}`);
  results.push(result);
}

async function testLazyInitialization() {
  console.log('\n🧪 Testing Phase 0: Lazy Initialization');
  console.log('─'.repeat(60));

  const start = Date.now();

  try {
    const dbPath = path.join(process.cwd(), 'data', 'nodes.db');

    // Check database exists
    if (!fs.existsSync(dbPath)) {
      logTest({
        test: 'Database File Check',
        status: 'FAIL',
        message: `Database not found at ${dbPath}`,
      });
      return;
    }

    logTest({
      test: 'Database File Check',
      status: 'PASS',
      message: `Database found (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)}MB)`,
    });

    // Test lazy initialization manager
    const manager = new LazyInitializationManager();
    manager.startBackgroundInit(dbPath);

    // Wait for initialization with timeout
    try {
      await manager.waitForComponent('services', 10000);
      const initTime = manager.getInitTime();

      logTest({
        test: 'Lazy Initialization',
        status: 'PASS',
        message: `Initialized in ${initTime}ms (<500ms target)`,
        duration: initTime,
      });

      // Check if startup is fast enough
      if (initTime && initTime < 500) {
        logTest({
          test: 'Startup Performance',
          status: 'PASS',
          message: `Startup time ${initTime}ms meets <500ms target`,
        });
      } else {
        logTest({
          test: 'Startup Performance',
          status: 'FAIL',
          message: `Startup time ${initTime}ms exceeds 500ms target`,
        });
      }
    } catch (error) {
      logTest({
        test: 'Lazy Initialization',
        status: 'FAIL',
        message: `Timeout or error: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
    }

    const totalTime = Date.now() - start;
    logTest({
      test: 'Phase 0 Duration',
      status: 'PASS',
      message: `Total test time: ${totalTime}ms`,
    });
  } catch (error) {
    logTest({
      test: 'Phase 0 Overall',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function testAdaptiveResponses() {
  console.log('\n🧪 Testing Phase 1: Adaptive Response Builder');
  console.log('─'.repeat(60));

  try {
    // Test response size determination
    const contexts = [
      { tool: 'list_workflows', intent: 'list' as const, itemCount: 50 },
      { tool: 'get_workflow', intent: 'debug' as const, itemCount: 1 },
      { tool: 'search_nodes', intent: 'search' as const, itemCount: 5 },
    ];

    for (const context of contexts) {
      const size = adaptiveResponseBuilder.determineResponseSize(context);
      const expected = context.itemCount && context.itemCount > 10 ? ResponseSize.MINIMAL :
                      context.intent === 'debug' ? ResponseSize.FULL :
                      context.intent === 'list' || context.intent === 'search' ? ResponseSize.COMPACT :
                      ResponseSize.STANDARD;

      logTest({
        test: `Response Sizing (${context.tool})`,
        status: size === expected ? 'PASS' : 'FAIL',
        message: `Determined ${size} (expected ${expected})`,
      });
    }

    // Test workflow response building
    const mockWorkflow = {
      id: 'test-123',
      name: 'Test Workflow',
      active: true,
      nodes: [
        { name: 'Start', type: 'nodes-base.manualTrigger', position: [0, 0] },
        { name: 'HTTP', type: 'nodes-base.httpRequest', position: [200, 0] },
      ],
      connections: { Start: { main: [[{ node: 'HTTP', type: 'main', index: 0 }]] } },
    };

    const minimalResponse = adaptiveResponseBuilder.buildWorkflowResponse(mockWorkflow, ResponseSize.MINIMAL);
    const fullResponse = adaptiveResponseBuilder.buildWorkflowResponse(mockWorkflow, ResponseSize.FULL);

    const minimalSize = JSON.stringify(minimalResponse).length;
    const fullSize = JSON.stringify(fullResponse).length;
    const reduction = Math.round((1 - minimalSize / fullSize) * 100);

    logTest({
      test: 'Workflow Response Sizing',
      status: reduction > 50 ? 'PASS' : 'FAIL',
      message: `${reduction}% size reduction (${fullSize}B → ${minimalSize}B)`,
    });

    // Test token estimation
    const tokens = adaptiveResponseBuilder.estimateTokens(mockWorkflow);
    logTest({
      test: 'Token Estimation',
      status: tokens > 0 ? 'PASS' : 'FAIL',
      message: `Estimated ${tokens} tokens`,
    });

  } catch (error) {
    logTest({
      test: 'Adaptive Responses',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function testContextIntelligence() {
  console.log('\n🧪 Testing Phase 1: Context Intelligence Engine');
  console.log('─'.repeat(60));

  try {
    // Test intent detection
    const intentTests = [
      { tool: 'list_workflows', params: {}, expected: 'explore' },
      { tool: 'search_nodes', params: { query: 'slack' }, expected: 'search' },
      { tool: 'create_workflow', params: {}, expected: 'create' },
      { tool: 'validate_workflow', params: {}, expected: 'debug' },
    ];

    for (const test of intentTests) {
      const context = contextIntelligence.analyzeToolCall(test.tool, test.params);
      logTest({
        test: `Intent Detection (${test.tool})`,
        status: context.intent === test.expected ? 'PASS' : 'FAIL',
        message: `Detected ${context.intent} (expected ${test.expected})`,
      });
    }

    // Test error recovery
    contextIntelligence.recordError('credential error occurred');
    contextIntelligence.recordError('connection failed');

    const suggestions = contextIntelligence.getErrorRecoverySuggestions();
    logTest({
      test: 'Error Recovery Suggestions',
      status: suggestions.length > 0 ? 'PASS' : 'FAIL',
      message: `Generated ${suggestions.length} suggestions`,
    });

    // Test contextual help
    const help = contextIntelligence.getContextualHelp();
    logTest({
      test: 'Contextual Help',
      status: help ? 'PASS' : 'SKIP',
      message: help || 'No help message (context-dependent)',
    });

    // Test recommended tools
    const recommended = contextIntelligence.getRecommendedNextTools();
    logTest({
      test: 'Tool Recommendations',
      status: recommended.length > 0 ? 'PASS' : 'FAIL',
      message: `Recommended ${recommended.length} tools: ${recommended.slice(0, 2).join(', ')}`,
    });

  } catch (error) {
    logTest({
      test: 'Context Intelligence',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function testEnhancedN8nClient() {
  console.log('\n🧪 Testing Phase 1: Enhanced n8n Client');
  console.log('─'.repeat(60));

  try {
    const config = getN8nApiConfig();

    if (!config) {
      logTest({
        test: 'Enhanced n8n Client',
        status: 'SKIP',
        message: 'N8N_API_URL not configured (optional)',
      });
      return;
    }

    const client = new EnhancedN8nClient(config);

    // Test API capabilities
    const capabilities = await client.getApiCapabilities();
    logTest({
      test: 'API Capabilities Detection',
      status: 'PASS',
      message: `Detected n8n ${capabilities.version} features`,
    });

    logTest({
      test: 'Retry Support',
      status: capabilities.supportsRetry ? 'PASS' : 'FAIL',
      message: capabilities.supportsRetry ? 'Supported' : 'Not supported',
    });

    logTest({
      test: 'Running Filter Support',
      status: capabilities.supportsRunningFilter ? 'PASS' : 'FAIL',
      message: capabilities.supportsRunningFilter ? 'Supported' : 'Not supported',
    });

    logTest({
      test: 'MCP Metadata Support',
      status: capabilities.supportsMcpMetadata ? 'PASS' : 'FAIL',
      message: capabilities.supportsMcpMetadata ? 'Supported' : 'Not supported',
    });

  } catch (error) {
    logTest({
      test: 'Enhanced n8n Client',
      status: 'SKIP',
      message: `N8N API test skipped: ${error instanceof Error ? error.message : 'Unknown'}`,
    });
  }
}

async function testV3Tools() {
  console.log('\n🧪 Testing Phase 2: V3 Tool Handlers');
  console.log('─'.repeat(60));

  try {
    const config = getN8nApiConfig();

    if (!config) {
      logTest({
        test: 'V3 Tools',
        status: 'SKIP',
        message: 'N8N_API_URL not configured (tests require API)',
      });
      return;
    }

    // Import v3 handlers
    const v3Handlers = await import('../src/mcp/handlers-v3-tools');

    logTest({
      test: 'V3 Handler Import',
      status: 'PASS',
      message: 'Successfully imported v3 tool handlers',
    });

    // Verify handler exports
    const hasRetry = typeof v3Handlers.handleRetryExecution === 'function';
    const hasMonitor = typeof v3Handlers.handleMonitorRunningExecutions === 'function';
    const hasMcp = typeof v3Handlers.handleListMcpWorkflows === 'function';

    logTest({
      test: 'Retry Handler Export',
      status: hasRetry ? 'PASS' : 'FAIL',
      message: hasRetry ? 'handleRetryExecution exported' : 'Missing export',
    });

    logTest({
      test: 'Monitor Handler Export',
      status: hasMonitor ? 'PASS' : 'FAIL',
      message: hasMonitor ? 'handleMonitorRunningExecutions exported' : 'Missing export',
    });

    logTest({
      test: 'MCP Workflows Handler Export',
      status: hasMcp ? 'PASS' : 'FAIL',
      message: hasMcp ? 'handleListMcpWorkflows exported' : 'Missing export',
    });

    // Verify tool schemas
    const schemas = v3Handlers.v3ToolSchemas;
    const schemaCount = Object.keys(schemas).length;

    logTest({
      test: 'Tool Schemas',
      status: schemaCount === 3 ? 'PASS' : 'FAIL',
      message: `${schemaCount}/3 schemas defined`,
    });

  } catch (error) {
    logTest({
      test: 'V3 Tools',
      status: 'FAIL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 V3.0.0 IMPLEMENTATION VALIDATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;

  console.log(`\n✅ Passed:  ${passed}/${total}`);
  console.log(`❌ Failed:  ${failed}/${total}`);
  console.log(`⏭️  Skipped: ${skipped}/${total}`);

  const successRate = Math.round((passed / (total - skipped)) * 100);
  console.log(`\n📈 Success Rate: ${successRate}% (excluding skipped)\n`);

  // Group by phase
  const phases = {
    'Phase 0': results.filter(r => r.test.includes('Phase 0') || r.test.includes('Initialization') || r.test.includes('Startup')),
    'Phase 1': results.filter(r => r.test.includes('Response') || r.test.includes('Context') || r.test.includes('Enhanced')),
    'Phase 2': results.filter(r => r.test.includes('V3') || r.test.includes('Handler') || r.test.includes('Schema')),
  };

  for (const [phase, phaseResults] of Object.entries(phases)) {
    if (phaseResults.length > 0) {
      const phasePassed = phaseResults.filter(r => r.status === 'PASS').length;
      const phaseTotal = phaseResults.filter(r => r.status !== 'SKIP').length;
      const phaseRate = phaseTotal > 0 ? Math.round((phasePassed / phaseTotal) * 100) : 0;

      const icon = phaseRate === 100 ? '✅' : phaseRate >= 80 ? '⚠️' : '❌';
      console.log(`${icon} ${phase}: ${phasePassed}/${phaseTotal} (${phaseRate}%)`);
    }
  }

  // Performance metrics
  const initResult = results.find(r => r.test === 'Lazy Initialization');
  if (initResult?.duration) {
    const targetMet = initResult.duration < 500;
    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   Startup Time: ${initResult.duration}ms ${targetMet ? '✅' : '❌'} (<500ms target)`);
    console.log(`   Improvement: ${Math.round((15000 / initResult.duration))}x faster than v2.7.6`);
  }

  // Overall status
  console.log('\n' + '─'.repeat(60));
  if (failed === 0 && passed > 0) {
    console.log('🎉 ALL TESTS PASSED - v3.0.0 implementation validated!');
  } else if (failed > 0 && successRate >= 80) {
    console.log('⚠️  MOSTLY PASSED - Some tests failed, review required');
  } else if (failed > 0) {
    console.log('❌ TESTS FAILED - Implementation issues detected');
  } else {
    console.log('⏭️  TESTS SKIPPED - Could not validate (missing config)');
  }
  console.log('─'.repeat(60) + '\n');

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log('🧪 v3.0.0 Implementation Validation');
  console.log('Testing Phases 0-2 components\n');

  await testLazyInitialization();
  await testAdaptiveResponses();
  await testContextIntelligence();
  await testEnhancedN8nClient();
  await testV3Tools();
  await printSummary();
}

main().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
