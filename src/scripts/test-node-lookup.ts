import { createDatabaseAdapter } from "../database/database-adapter";
import { NodeRepository } from "../database/node-repository";
import { join } from "path";

async function main() {
  const dbPath = join(process.cwd(), "nodes.db");
  console.log(`Loading database from: ${dbPath}`);

  const dbAdapter = createDatabaseAdapter(dbPath);
  const repo = new NodeRepository(dbAdapter as any);

  const testTypes = [
    "n8n-nodes-base.microsoftOutlook",
    "nodes-base.microsoftOutlook",
    "microsoftOutlook",
    "n8n-nodes-base.httpRequest",
    "nodes-base.httpRequest",
  ];

  for (const type of testTypes) {
    console.log(`\nLooking up: ${type}`);
    const node = repo.getNodeByType(type);
    if (node) {
      console.log(`✅ Found: ${node.nodeType} (Package: ${node.package})`);
    } else {
      console.log(`❌ Not Found`);
    }
  }
}

main().catch(console.error);
