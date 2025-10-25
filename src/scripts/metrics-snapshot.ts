#!/usr/bin/env ts-node
import { GraphRAGBridge } from '../ai/graphrag-bridge';

async function main() {
  const bridge = GraphRAGBridge.get();

  // 50+ unique queries to properly measure P50/P95 latencies
  const uniqueQueries = [
    // Real-world use cases (25 queries)
    'airtable high priority slack notification',
    'webhook response to api',
    'fan out fan in parallel merge',
    'supervisor error retry monitor',
    'send email with attachments',
    'loop items in array',
    'transform json data',
    'filter records by date',
    'aggregate sum totals',
    'merge two datasets',
    'validate form input',
    'call rest api endpoint',
    'parse csv file',
    'generate pdf report',
    'schedule recurring task',
    'monitor file changes',
    'decompress zip archive',
    'encrypt sensitive data',
    'split string by delimiter',
    'count occurrences in text',
    'replace keywords in template',
    'sort items ascending',
    'remove duplicate entries',
    'batch records in groups',
    'delay execution by time',

    // Pattern-based queries (25 queries)
    'error handling workflow',
    'retry failed operation',
    'webhook integration',
    'api response',
    'parallel processing',
    'merge results',
    'supervisor monitoring',
    'error trigger node',
    'notification on failure',
    'conditional routing',
    'trigger on event',
    'respond to webhook',
    'execute in parallel',
    'merge outputs',
    'fan out tasks',
    'fan in results',
    'supervisor pattern',
    'error handling',
    'retry logic',
    'timeout handling',
    'batch operations',
    'stream processing',
    'throttle requests',
    'buffer responses',
    'compose workflows',
  ];

  // Run all unique queries to collect real latency distribution
  for (const q of uniqueQueries) {
    try {
      await bridge.queryGraph({ text: q, top_k: 5 });
    } catch (e) {
      console.error('query failed:', (e as Error).message);
    }
  }

  // Add cache hit measurements by re-running first 10 queries
  // This tests cache efficiency after warm-up
  for (let i = 0; i < 10; i++) {
    try {
      await bridge.queryGraph({ text: uniqueQueries[i], top_k: 5 });
    } catch (e) {
      console.error('cache hit test failed:', (e as Error).message);
    }
  }

  const snapshot = bridge.getMetricsSnapshot();
  console.log(JSON.stringify({ ok: true, metrics: snapshot }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

