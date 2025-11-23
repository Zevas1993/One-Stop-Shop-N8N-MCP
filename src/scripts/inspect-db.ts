import { createDatabaseAdapter } from "../database/database-adapter";
import { NodeRepository } from "../database/node-repository";
import * as path from "path";

async function inspect() {
  const dbPath = path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);
  const repo = new NodeRepository(db);

  const nodes = repo.listNodes({});
  console.log(`Total nodes: ${nodes.length}`);
  console.log("First 20 nodes:");
  nodes.slice(0, 20).forEach((n: any) => {
    console.log(
      `- ID: ${n.name} | Type: ${n.nodeType || n.type} | Display: ${
        n.displayName
      }`
    );
  });

  // Check for OpenAI
  console.log("\nSearching for OpenAI:");
  const openai = nodes.filter(
    (n: any) =>
      (n.nodeType && n.nodeType.toLowerCase().includes("openai")) ||
      (n.displayName && n.displayName.toLowerCase().includes("openai"))
  );
  openai.forEach((n: any) => {
    console.log(
      `- ID: ${n.id} | Type: ${n.nodeType} | Display: ${n.displayName} | Category: ${n.category}`
    );
  });
}

inspect();
