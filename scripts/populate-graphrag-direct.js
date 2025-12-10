/**
 * Direct GraphRAG Population Script
 *
 * This script fetches nodes from n8n using session auth and directly
 * populates the SQLite GraphRAG database without needing the Python backend.
 */

const axios = require("axios");
const { createHash } = require("crypto");
const path = require("path");
const fs = require("fs");

// Load environment
require("dotenv").config({ override: true });

// Database setup - use sql.js for compatibility
let Database;
try {
  Database = require("better-sqlite3");
  console.log("Using better-sqlite3");
} catch (e) {
  // Fallback to sql.js would require async - skip for now
  console.log("better-sqlite3 not available, checking for existing db...");
}

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_USERNAME = process.env.N8N_USERNAME;
const N8N_PASSWORD = process.env.N8N_PASSWORD;

// Determine graph database path
function getGraphDbPath() {
  const graphDir = process.env.GRAPH_DIR || (
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming"), "n8n-mcp", "graph")
      : path.join(require("os").homedir(), ".cache", "n8n-mcp", "graph")
  );

  // Ensure directory exists
  if (!fs.existsSync(graphDir)) {
    fs.mkdirSync(graphDir, { recursive: true });
  }

  return path.join(graphDir, "graph.db");
}

console.log("=".repeat(60));
console.log("GraphRAG Direct Population Script");
console.log("=".repeat(60));
console.log("\nConfiguration:");
console.log(`  n8n URL: ${N8N_API_URL}`);
console.log(`  Username: ${N8N_USERNAME || "NOT SET"}`);
console.log(`  Password: ${N8N_PASSWORD ? "***" : "NOT SET"}`);

// Session-based authentication
async function loginToN8n() {
  console.log("\n[Auth] Logging in to n8n...");

  const response = await axios.post(
    `${N8N_API_URL}/rest/login`,
    {
      emailOrLdapLoginId: N8N_USERNAME,
      password: N8N_PASSWORD,
    },
    {
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    }
  );

  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} - ${JSON.stringify(response.data)}`);
  }

  // Extract n8n-auth cookie
  const setCookie = response.headers["set-cookie"];
  if (!setCookie) {
    throw new Error("No Set-Cookie header in login response");
  }

  for (const cookie of setCookie) {
    const match = cookie.match(/n8n-auth=([^;]+)/);
    if (match) {
      console.log("[Auth] Login successful!");
      return match[1];
    }
  }

  throw new Error("No n8n-auth cookie found in response");
}

// Fetch all nodes from n8n internal endpoint
async function fetchNodes(authCookie) {
  console.log("\n[Fetch] Getting nodes from /types/nodes.json...");

  const response = await axios.get(`${N8N_API_URL}/types/nodes.json`, {
    headers: {
      Cookie: `n8n-auth=${authCookie}`,
    },
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch nodes: ${response.status}`);
  }

  const nodes = response.data || [];
  console.log(`[Fetch] Got ${nodes.length} nodes`);
  return nodes;
}

// Transform node to graph entity
function transformNode(node) {
  // Build keywords from various sources
  const keywords = [];

  // Add name parts as keywords
  if (node.name) {
    keywords.push(...node.name.split(/[.\-_]/).filter(k => k.length > 2));
  }

  // Add display name words
  if (node.displayName) {
    keywords.push(...node.displayName.split(/\s+/).filter(k => k.length > 2));
  }

  // Add categories from codex
  if (node.codex?.categories) {
    keywords.push(...node.codex.categories);
  }

  // Add groups
  if (node.group) {
    keywords.push(...node.group);
  }

  // Add aliases from codex
  if (node.codex?.alias) {
    keywords.push(...node.codex.alias);
  }

  // Deduplicate and lowercase keywords
  const uniqueKeywords = [...new Set(keywords.map(k => String(k).toLowerCase()))];

  // Determine category
  const category = node.codex?.categories?.[0] ||
                   (node.group?.includes("trigger") ? "trigger" : null) ||
                   (node.name?.includes("langchain") ? "ai" : null) ||
                   node.group?.[0] ||
                   "uncategorized";

  const isTrigger = node.group?.includes("trigger") ||
                    node.name?.toLowerCase().includes("trigger") ||
                    node.name?.toLowerCase().includes("webhook");

  const isAI = node.name?.includes("langchain") ||
               node.group?.includes("ai") ||
               node.codex?.categories?.includes("AI");

  // Build description
  const descParts = [node.description || ""];
  if (node.properties?.length > 0) {
    const propNames = node.properties.slice(0, 5).map(p => p.displayName || p.name);
    descParts.push(`Properties: ${propNames.join(", ")}`);
  }

  const now = Math.floor(Date.now() / 1000);

  return {
    id: node.name,
    label: node.displayName || node.name,
    description: descParts.join(". "),
    category: category,
    keywords: JSON.stringify(uniqueKeywords),
    metadata: JSON.stringify({
      nodeType: node.name,
      displayName: node.displayName,
      isTrigger: isTrigger,
      isAI: isAI,
      propertyCount: node.properties?.length || 0,
      groups: node.group || [],
      version: node.version || 1,
    }),
    created_at: now,
    updated_at: now,
  };
}

// Initialize database schema
function initializeDb(db) {
  console.log("\n[DB] Initializing database schema...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      category TEXT,
      keywords TEXT,
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category);
    CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL,
      strength REAL DEFAULT 1.0,
      metadata TEXT,
      created_at INTEGER,
      FOREIGN KEY (source_id) REFERENCES nodes(id),
      FOREIGN KEY (target_id) REFERENCES nodes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);

    CREATE TABLE IF NOT EXISTS graph_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );
  `);

  console.log("[DB] Schema initialized");
}

// Insert nodes into database
function insertNodes(db, nodes) {
  console.log(`\n[DB] Inserting ${nodes.length} nodes...`);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO nodes (id, label, description, category, keywords, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entities) => {
    let count = 0;
    for (const entity of entities) {
      insertStmt.run(
        entity.id,
        entity.label,
        entity.description,
        entity.category,
        entity.keywords,
        entity.metadata,
        entity.created_at,
        entity.updated_at
      );
      count++;

      // Progress indicator every 100 nodes
      if (count % 100 === 0) {
        process.stdout.write(`\r[DB] Progress: ${count}/${entities.length}`);
      }
    }
    return count;
  });

  const count = insertMany(nodes);
  console.log(`\n[DB] Inserted ${count} nodes`);

  // Update metadata
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT OR REPLACE INTO graph_metadata (key, value, updated_at) VALUES (?, ?, ?)`)
    .run("node_count", String(count), now);
  db.prepare(`INSERT OR REPLACE INTO graph_metadata (key, value, updated_at) VALUES (?, ?, ?)`)
    .run("last_populated", new Date().toISOString(), now);
  db.prepare(`INSERT OR REPLACE INTO graph_metadata (key, value, updated_at) VALUES (?, ?, ?)`)
    .run("source", "n8n-session-auth", now);

  return count;
}

// Create category relationships
function createCategoryEdges(db) {
  console.log("\n[DB] Creating category relationships...");

  // Get unique categories
  const categories = db.prepare(`SELECT DISTINCT category FROM nodes WHERE category IS NOT NULL`).all();

  // Create category nodes
  const now = Math.floor(Date.now() / 1000);
  const insertNode = db.prepare(`
    INSERT OR REPLACE INTO nodes (id, label, description, category, keywords, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEdge = db.prepare(`
    INSERT OR REPLACE INTO edges (id, source_id, target_id, type, strength, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let edgeCount = 0;

  for (const row of categories) {
    const catId = `category:${row.category}`;

    // Create category node
    insertNode.run(
      catId,
      row.category,
      `Category: ${row.category}`,
      "category",
      JSON.stringify([row.category]),
      JSON.stringify({ type: "category" }),
      now,
      now
    );

    // Find all nodes in this category and create edges
    const nodesInCategory = db.prepare(`SELECT id FROM nodes WHERE category = ? AND id NOT LIKE 'category:%'`).all(row.category);

    for (const node of nodesInCategory) {
      const edgeId = createHash("sha256").update(`${node.id}:${catId}`).digest("hex").substring(0, 16);
      insertEdge.run(
        edgeId,
        node.id,
        catId,
        "belongs_to_category",
        1.0,
        now
      );
      edgeCount++;
    }
  }

  console.log(`[DB] Created ${edgeCount} category edges for ${categories.length} categories`);
  return edgeCount;
}

// Main execution
async function main() {
  let db = null;

  try {
    // Step 1: Login to n8n
    const authCookie = await loginToN8n();

    // Step 2: Fetch nodes
    const rawNodes = await fetchNodes(authCookie);

    if (rawNodes.length === 0) {
      console.error("\n✗ No nodes found. Check n8n connection and credentials.");
      process.exit(1);
    }

    // Step 3: Transform nodes
    console.log("\n[Transform] Converting nodes to graph entities...");
    const entities = rawNodes.map(transformNode);
    console.log(`[Transform] Transformed ${entities.length} nodes`);

    // Count by category
    const categoryCounts = {};
    entities.forEach(e => {
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    });
    console.log("\nCategory breakdown:");
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} nodes`);
      });

    // Step 4: Open database
    const dbPath = getGraphDbPath();
    console.log(`\n[DB] Database path: ${dbPath}`);

    if (!Database) {
      console.error("\n✗ better-sqlite3 not available. Install it with: npm install better-sqlite3");
      process.exit(1);
    }

    db = new Database(dbPath);

    // Step 5: Initialize schema
    initializeDb(db);

    // Step 6: Insert nodes
    const insertedCount = insertNodes(db, entities);

    // Step 7: Create relationships
    const edgeCount = createCategoryEdges(db);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("GraphRAG Population Complete!");
    console.log("=".repeat(60));
    console.log(`  Database: ${dbPath}`);
    console.log(`  Nodes inserted: ${insertedCount}`);
    console.log(`  Edges created: ${edgeCount}`);
    console.log(`  Categories: ${Object.keys(categoryCounts).length}`);
    console.log("\n✓ GraphRAG now has knowledge of all n8n nodes!");

  } catch (error) {
    console.error("\n✗ Error:", error.message);
    if (error.response?.data) {
      console.error("  Response:", JSON.stringify(error.response.data));
    }
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

main();
