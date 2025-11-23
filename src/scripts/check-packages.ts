import { createDatabaseAdapter } from "../database/database-adapter";
import * as path from "path";

async function checkPackages() {
  const dbPath = path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);

  const rows = db
    .prepare(
      "SELECT package_name, COUNT(*) as count FROM nodes GROUP BY package_name"
    )
    .all();
  console.log("Nodes by Package:");
  console.table(rows);
}

checkPackages();
