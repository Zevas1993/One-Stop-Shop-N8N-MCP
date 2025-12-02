const path = require("path");
const dbPath = "C:\\Users\\Chris Boyd\\.n8n\\database.sqlite";

console.log("Attempting to repair DB at:", dbPath);

try {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  console.log("Connected via better-sqlite3");

  // 1. Add role column if missing
  try {
    const userCols = db.prepare("PRAGMA table_info(user)").all();
    const hasRole = userCols.some((c) => c.name === "role");

    if (!hasRole) {
      console.log("Adding 'role' column...");
      db.prepare("ALTER TABLE user ADD COLUMN role TEXT").run();
      console.log("Column added.");

      // 2. Populate role from roleSlug
      console.log("Populating 'role' from 'roleSlug'...");
      db.prepare("UPDATE user SET role = roleSlug").run();
      console.log("Data populated.");
    } else {
      console.log("'role' column already exists.");
    }
  } catch (e) {
    console.error("Error adding column:", e.message);
  }

  // 3. Delete future migration
  try {
    const futureMigrationId = 1763572724000; // From previous debug output
    console.log(`Checking for future migration ${futureMigrationId}...`);
    const migration = db
      .prepare("SELECT * FROM migrations WHERE id = ?")
      .get(futureMigrationId);

    if (migration) {
      console.log("Found future migration. Deleting...");
      db.prepare("DELETE FROM migrations WHERE id = ?").run(futureMigrationId);
      console.log("Future migration deleted.");
    } else {
      console.log("Future migration not found.");
    }
  } catch (e) {
    console.error("Error deleting migration:", e.message);
  }

  db.close();
  console.log("Repair complete.");
} catch (e) {
  console.log("better-sqlite3 failed:", e.message);
  // Fallback to sqlite3 if needed, but better-sqlite3 should work as it worked for debug
}
