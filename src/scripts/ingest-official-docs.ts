import * as fs from "fs/promises";
import * as path from "path";
import { EnhancedDocumentationFetcher } from "../utils/enhanced-documentation-fetcher";
import { createDatabaseAdapter } from "../database/database-adapter";
import { logger } from "../utils/logger";

async function main() {
  console.log("🚀 Starting Official Documentation Ingestion...");

  // 1. Initialize DB
  const dbPath =
    process.env.NODE_DB_PATH || path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);

  // 2. Initialize Docs Fetcher
  const docsPath = path.join(process.cwd(), "temp", "n8n-docs");
  const fetcher = new EnhancedDocumentationFetcher(docsPath);

  console.log("📦 Cloning/Updating n8n-docs repository...");
  await fetcher.ensureDocsRepository();
  console.log("✅ Repository ready.");

  // 3. Define paths to scan based on official structure
  const baseDocsPath = path.join(docsPath, "docs", "integrations", "builtin");
  const categories = [
    { dir: "core-nodes", category: "Core Nodes", type: "core" },
    { dir: "app-nodes", category: "App Nodes", type: "app" },
    { dir: "trigger-nodes", category: "Triggers", type: "trigger" },
    { dir: "credentials", category: "Credentials", type: "credential" }, // Although user might not need credentials in the graph as nodes
  ];

  let totalProcessed = 0;

  for (const cat of categories) {
    const dirPath = path.join(baseDocsPath, cat.dir);
    console.log(`\n📂 Scanning category: ${cat.category} (${dirPath})...`);

    try {
      await fs.access(dirPath);
    } catch {
      console.warn(`⚠️ Directory not found: ${dirPath}`);
      continue;
    }

    const files = await fs.readdir(dirPath, { recursive: true });
    const mdFiles = files.filter((f) => f.endsWith(".md") && !f.includes("/_")); // Exclude partials

    console.log(`   Found ${mdFiles.length} documentation files.`);

    for (const file of mdFiles) {
      const filePath = path.join(dirPath, file.toString());
      const content = await fs.readFile(filePath, "utf-8");

      // Extract metadata
      const nodeName = path.basename(file.toString(), ".md");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : nodeName;

      // Attempt to find existing node in DB to update, or insert new
      // We assume nodeType might match the filename or we construct a generic one
      const nodeType = `n8n-nodes-base.${nodeName}`; // Best guess for ID

      // Check if node exists
      // Schema: node_type (PK), display_name, category, description, source_content, package_name
      // Note: 'name' column does not exist, use 'display_name' or rely on 'node_type'
      const existing = db
        .prepare("SELECT node_type, category FROM nodes WHERE node_type = ?")
        .get(nodeType) as any;

      if (existing) {
        // Update existing node with official category if generic
        if (
          !existing.category ||
          existing.category === "Other" ||
          existing.category === "transform"
        ) {
          db.prepare(
            "UPDATE nodes SET category = ?, documentation = ? WHERE node_type = ?"
          ).run(
            cat.category,
            `https://docs.n8n.io/integrations/builtin/${cat.dir}/${nodeName}/`,
            nodeType
          );
        }
      } else {
        // Insert placeholder for missing node found in docs
        db.prepare(
          `
          INSERT INTO nodes (
            node_type, package_name, display_name, category, description,
            source_content, documentation
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          nodeType,
          "n8n-nodes-base",
          title,
          cat.category,
          `Official documentation: ${title}`,
          "// Placeholder from docs",
          `https://docs.n8n.io/integrations/builtin/${cat.dir}/${nodeName}/`
        );
      }
      totalProcessed++;
      if (totalProcessed % 50 === 0) process.stdout.write(".");
    }
  }

  console.log(
    `\n\n✅ Ingestion Complete. Processed ${totalProcessed} nodes from official docs.`
  );
}

main().catch(console.error);
