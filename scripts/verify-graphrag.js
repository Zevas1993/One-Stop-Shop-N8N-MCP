/**
 * Verify GraphRAG Database Contents
 *
 * This script checks the GraphRAG database to verify it has learned
 * all the n8n node information correctly.
 */

const path = require("path");
const fs = require("fs");

// Database setup
let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  console.error("better-sqlite3 not available");
  process.exit(1);
}

// Determine graph database path
function getGraphDbPath() {
  const graphDir = process.env.GRAPH_DIR || (
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming"), "n8n-mcp", "graph")
      : path.join(require("os").homedir(), ".cache", "n8n-mcp", "graph")
  );
  return path.join(graphDir, "graph.db");
}

console.log("=".repeat(60));
console.log("GraphRAG Database Verification");
console.log("=".repeat(60));

const dbPath = getGraphDbPath();
console.log(`\nDatabase: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error("\n✗ Database file not found!");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

// 1. Get basic stats
console.log("\n1. Database Statistics:");
const nodeCount = db.prepare(`SELECT COUNT(*) as count FROM nodes WHERE id NOT LIKE 'category:%'`).get();
const categoryNodeCount = db.prepare(`SELECT COUNT(*) as count FROM nodes WHERE id LIKE 'category:%'`).get();
const edgeCount = db.prepare(`SELECT COUNT(*) as count FROM edges`).get();
console.log(`   Total n8n nodes: ${nodeCount.count}`);
console.log(`   Category nodes: ${categoryNodeCount.count}`);
console.log(`   Edges: ${edgeCount.count}`);

// 2. Get metadata
console.log("\n2. Graph Metadata:");
const metadata = db.prepare(`SELECT * FROM graph_metadata`).all();
metadata.forEach(m => {
  console.log(`   ${m.key}: ${m.value}`);
});

// 3. Category breakdown
console.log("\n3. Nodes by Category:");
const categories = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM nodes
  WHERE id NOT LIKE 'category:%'
  GROUP BY category
  ORDER BY count DESC
`).all();
categories.forEach(c => {
  console.log(`   ${c.category}: ${c.count}`);
});

// 4. Sample AI nodes
console.log("\n4. Sample AI Nodes (first 10):");
const aiNodes = db.prepare(`
  SELECT id, label, description
  FROM nodes
  WHERE id LIKE '%langchain%' OR category = 'AI'
  LIMIT 10
`).all();
aiNodes.forEach(n => {
  console.log(`   ${n.label} (${n.id})`);
});

// 5. Sample trigger nodes
console.log("\n5. Sample Trigger Nodes (first 10):");
const triggerNodes = db.prepare(`
  SELECT id, label
  FROM nodes
  WHERE json_extract(metadata, '$.isTrigger') = 1
  LIMIT 10
`).all();
triggerNodes.forEach(n => {
  console.log(`   ${n.label} (${n.id})`);
});

// 6. Keyword search test
console.log("\n6. Keyword Search Test - 'http':");
const httpNodes = db.prepare(`
  SELECT id, label, keywords
  FROM nodes
  WHERE keywords LIKE '%http%'
  LIMIT 5
`).all();
httpNodes.forEach(n => {
  console.log(`   ${n.label} (${n.id})`);
});

// 7. Edge relationships
console.log("\n7. Sample Category Edges (first 10):");
const edges = db.prepare(`
  SELECT e.source_id, e.target_id, e.type, n1.label as source_label, n2.label as target_label
  FROM edges e
  JOIN nodes n1 ON e.source_id = n1.id
  JOIN nodes n2 ON e.target_id = n2.id
  LIMIT 10
`).all();
edges.forEach(e => {
  console.log(`   ${e.source_label} → ${e.type} → ${e.target_label}`);
});

// 8. Verify specific nodes exist
console.log("\n8. Verifying Key Nodes Exist:");
const keyNodes = [
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.code",
  "n8n-nodes-base.set",
  "n8n-nodes-base.if",
  "@n8n/n8n-nodes-langchain.agent",
  "@n8n/n8n-nodes-langchain.openAi",
];
keyNodes.forEach(nodeId => {
  const node = db.prepare(`SELECT id, label FROM nodes WHERE id = ?`).get(nodeId);
  if (node) {
    console.log(`   ✓ ${node.label} (${node.id})`);
  } else {
    console.log(`   ✗ ${nodeId} NOT FOUND`);
  }
});

db.close();

console.log("\n" + "=".repeat(60));
console.log("✓ GraphRAG Verification Complete!");
console.log("=".repeat(60));
