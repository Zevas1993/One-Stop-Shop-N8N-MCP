import { DataSource } from "typeorm";
import * as path from "path";

async function inspectDb() {
  const dbPath = "C:\\Users\\Chris Boyd\\.n8n\\database.sqlite";

  const dataSource = new DataSource({
    type: "sqlite",
    database: dbPath,
  });

  try {
    await dataSource.initialize();
    console.log("Database connected.");

    const migrations = await dataSource.query(
      `SELECT * FROM migrations ORDER BY id DESC LIMIT 5`
    );
    console.log("Last 5 migrations:");
    console.table(migrations);

    // Also check User table columns
    const userColumns = await dataSource.query(`PRAGMA table_info(user)`);
    console.log("User table columns:");
    console.table(userColumns);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await dataSource.destroy();
  }
}

inspectDb();
