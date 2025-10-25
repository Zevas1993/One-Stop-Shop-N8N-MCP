#!/usr/bin/env ts-node
import { GraphRAGBridge } from '../ai/graphrag-bridge';

async function main() {
  const query = process.argv.slice(2).join(' ') || 'airtable high priority slack notification';
  const bridge = GraphRAGBridge.get();
  const t0 = Date.now();
  const res = await bridge.queryGraph({ text: query, top_k: 5 });
  const dur = Date.now() - t0;
  // Print compact result
  console.log(JSON.stringify({ ok: true, latency_ms: dur, result: res }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

