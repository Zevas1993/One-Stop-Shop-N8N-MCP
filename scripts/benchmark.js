#!/usr/bin/env node

/**
 * Performance Benchmark Script
 *
 * Measures performance baselines for:
 * - MCP tool latency
 * - Database query performance
 * - Memory usage
 * - Node parsing operations
 * - Cache effectiveness
 */

const { performance } = require('perf_hooks');
const v8 = require('v8');
const path = require('path');
const fs = require('fs');

// Track process start
const processStartTime = performance.now();
const processStartMem = process.memoryUsage();

// Import services
let NodeDocumentationService;
let MCPEngine;

async function loadServices() {
  const buildPath = path.join(__dirname, '..', 'dist');

  if (!fs.existsSync(buildPath)) {
    console.error('❌ Build not found. Run: npm run build');
    process.exit(1);
  }

  const { NodeDocumentationService: NDS } = await import('../dist/services/node-documentation-service.js');
  const { MCPEngine: MCPEng } = await import('../dist/mcp-engine.js');

  NodeDocumentationService = NDS;
  MCPEngine = MCPEng;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format milliseconds to human readable
 */
function formatTime(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Measure memory usage
 */
function getMemoryStats() {
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();

  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    heapLimit: heapStats.heap_size_limit,
    heapUsagePercent: (mem.heapUsed / heapStats.heap_size_limit * 100).toFixed(2)
  };
}

/**
 * Run benchmark with timing
 */
async function benchmark(name, fn, iterations = 1) {
  const times = [];
  const memBefore = getMemoryStats();

  // Warmup
  if (iterations > 1) {
    await fn();
  }

  // Run iterations
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const memAfter = getMemoryStats();

  // Calculate statistics
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

  const memDelta = memAfter.heapUsed - memBefore.heapUsed;

  return {
    name,
    iterations,
    avg,
    min,
    max,
    median,
    memoryDelta: memDelta,
    memoryAfter: memAfter.heapUsed
  };
}

/**
 * Database query benchmarks
 */
async function benchmarkDatabase(service) {
  console.log('\n📊 Database Benchmarks\n');

  const results = [];

  // List all nodes
  results.push(await benchmark('List all nodes', async () => {
    await service.listNodes();
  }, 10));

  // Search nodes
  results.push(await benchmark('Search nodes (FTS)', async () => {
    await service.searchNodes('webhook http request');
  }, 10));

  // Get node info
  results.push(await benchmark('Get node info', async () => {
    await service.getNode('n8n-nodes-base.httpRequest');
  }, 10));

  // Get node essentials
  results.push(await benchmark('Get node essentials', async () => {
    await service.getNodeEssentials('n8n-nodes-base.httpRequest');
  }, 10));

  // Search properties
  results.push(await benchmark('Search node properties', async () => {
    await service.searchNodeProperties('n8n-nodes-base.httpRequest', 'authentication');
  }, 10));

  // List AI tools
  results.push(await benchmark('List AI tools', async () => {
    await service.listAITools();
  }, 10));

  // Get database stats
  results.push(await benchmark('Get database statistics', async () => {
    await service.getDatabaseStatistics();
  }, 10));

  // Print results
  results.forEach(result => {
    console.log(`  ${result.name}`);
    console.log(`    Avg: ${formatTime(result.avg)} | Min: ${formatTime(result.min)} | Max: ${formatTime(result.max)} | Median: ${formatTime(result.median)}`);
    console.log(`    Memory: ${result.memoryDelta > 0 ? '+' : ''}${formatBytes(result.memoryDelta)} | Heap Used: ${formatBytes(result.memoryAfter)}`);
    console.log('');
  });

  return results;
}

/**
 * MCP tool benchmarks
 */
async function benchmarkMCPTools(engine) {
  console.log('\n🛠️  MCP Tool Benchmarks\n');

  const results = [];

  // n8n_system tool - list nodes
  results.push(await benchmark('n8n_system: list_nodes', async () => {
    await engine.callTool('n8n_system', {
      action: 'list_nodes',
      filters: { category: 'Communication' }
    });
  }, 10));

  // n8n_system tool - get node
  results.push(await benchmark('n8n_system: get_node', async () => {
    await engine.callTool('n8n_system', {
      action: 'get_node',
      nodeName: 'n8n-nodes-base.httpRequest'
    });
  }, 10));

  // n8n_system tool - search nodes
  results.push(await benchmark('n8n_system: search_nodes', async () => {
    await engine.callTool('n8n_system', {
      action: 'search_nodes',
      query: 'webhook http'
    });
  }, 10));

  // n8n_workflow tool - validate
  results.push(await benchmark('n8n_workflow: validate_workflow', async () => {
    await engine.callTool('n8n_workflow', {
      action: 'validate_workflow',
      workflow: {
        name: 'Test Workflow',
        nodes: [
          {
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [250, 300],
            webhookId: 'test-webhook',
            parameters: {
              httpMethod: 'POST',
              path: 'test-webhook',
              responseMode: 'onReceived'
            }
          }
        ],
        connections: {}
      },
      options: { profile: 'strict' }
    });
  }, 5));

  // Print results
  results.forEach(result => {
    console.log(`  ${result.name}`);
    console.log(`    Avg: ${formatTime(result.avg)} | Min: ${formatTime(result.min)} | Max: ${formatTime(result.max)} | Median: ${formatTime(result.median)}`);
    console.log(`    Memory: ${result.memoryDelta > 0 ? '+' : ''}${formatBytes(result.memoryDelta)} | Heap Used: ${formatBytes(result.memoryAfter)}`);
    console.log('');
  });

  return results;
}

/**
 * Generate benchmark report
 */
function generateReport(dbResults, mcpResults, memStats, totalTime) {
  const report = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    totalTime: totalTime,
    memory: memStats,
    database: dbResults.map(r => ({
      operation: r.name,
      avgTime: r.avg,
      minTime: r.min,
      maxTime: r.max,
      medianTime: r.median,
      memoryDelta: r.memoryDelta
    })),
    mcpTools: mcpResults.map(r => ({
      tool: r.name,
      avgTime: r.avg,
      minTime: r.min,
      maxTime: r.max,
      medianTime: r.median,
      memoryDelta: r.memoryDelta
    }))
  };

  // Save report
  const reportPath = path.join(__dirname, '..', 'benchmark-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Report saved to: ${reportPath}`);

  return report;
}

/**
 * Main benchmark execution
 */
async function main() {
  console.log('🚀 n8n MCP Server Performance Benchmark\n');
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);
  console.log(`Working Directory: ${process.cwd()}\n`);

  try {
    // Load services
    console.log('📦 Loading services...');
    await loadServices();

    // Initialize services
    console.log('🔧 Initializing services...');
    const service = new NodeDocumentationService();
    await service.initialize();

    const engine = new MCPEngine();
    await engine.initialize();

    console.log('✅ Services initialized\n');

    // Run benchmarks
    const dbResults = await benchmarkDatabase(service);
    const mcpResults = await benchmarkMCPTools(engine);

    // Memory statistics
    console.log('\n💾 Memory Statistics\n');
    const memStats = getMemoryStats();
    console.log(`  RSS: ${formatBytes(memStats.rss)}`);
    console.log(`  Heap Used: ${formatBytes(memStats.heapUsed)} (${memStats.heapUsagePercent}% of limit)`);
    console.log(`  Heap Total: ${formatBytes(memStats.heapTotal)}`);
    console.log(`  Heap Limit: ${formatBytes(memStats.heapLimit)}`);
    console.log(`  External: ${formatBytes(memStats.external)}\n`);

    const totalTime = performance.now() - processStartTime;
    console.log(`⏱️  Total benchmark time: ${formatTime(totalTime)}\n`);

    // Generate report
    const report = generateReport(dbResults, mcpResults, memStats, totalTime);

    // Performance assessment
    console.log('\n📈 Performance Assessment\n');

    const avgDbTime = dbResults.reduce((sum, r) => sum + r.avg, 0) / dbResults.length;
    const avgMcpTime = mcpResults.reduce((sum, r) => sum + r.avg, 0) / mcpResults.length;

    console.log(`  Average Database Query: ${formatTime(avgDbTime)}`);
    console.log(`  Average MCP Tool Call: ${formatTime(avgMcpTime)}`);

    // Performance grades
    const dbGrade = avgDbTime < 10 ? '🟢 Excellent' : avgDbTime < 50 ? '🟡 Good' : '🔴 Needs Optimization';
    const mcpGrade = avgMcpTime < 100 ? '🟢 Excellent' : avgMcpTime < 500 ? '🟡 Good' : '🔴 Needs Optimization';
    const memGrade = parseFloat(memStats.heapUsagePercent) < 50 ? '🟢 Excellent' : parseFloat(memStats.heapUsagePercent) < 80 ? '🟡 Good' : '🔴 High Usage';

    console.log(`\n  Database Performance: ${dbGrade}`);
    console.log(`  MCP Tool Performance: ${mcpGrade}`);
    console.log(`  Memory Usage: ${memGrade}\n`);

    // Cleanup
    await service.close();

    console.log('✅ Benchmark complete!\n');

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { benchmark, formatTime, formatBytes, getMemoryStats };
