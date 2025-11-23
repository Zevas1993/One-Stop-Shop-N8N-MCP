import { createDatabaseAdapter } from "../database/database-adapter";
import path from "path";

async function main() {
  const dbPath =
    process.env.NODE_DB_PATH || path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);

  console.log("📊 Inspecting Schema for: nodes");
  const columns = db.prepare("PRAGMA table_info(nodes)").all();
  console.table(columns);
}

main().catch(console.error);
