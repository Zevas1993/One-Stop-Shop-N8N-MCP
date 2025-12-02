const path = require("path");
const dbPath =
  process.argv[2] || "C:\\Users\\Chris Boyd\\.n8n\\database.sqlite";

console.log("Attempting to open DB at:", dbPath);

try {
  // Try better-sqlite3 first as n8n uses it often
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });
  console.log("Connected via better-sqlite3");

  const rows = db
    .prepare("SELECT * FROM migrations ORDER BY id DESC LIMIT 5")
    .all();
  console.log("Last 5 migrations:");
  console.table(rows);

  const userCols = db.prepare("PRAGMA table_info(user)").all();
  console.log("User table columns:");
  console.table(userCols);

  db.close();
} catch (e) {
  console.log("better-sqlite3 failed:", e.message);

  try {
    const sqlite3 = require("sqlite3").verbose();
    const db = new sqlite3.Database(dbPath);
    console.log("Connected via sqlite3");

    db.serialize(() => {
      db.all(
        "SELECT * FROM migrations ORDER BY id DESC LIMIT 5",
        (err, rows) => {
          if (err) {
            console.error("Error querying migrations:", err);
          } else {
            console.log("Last 5 migrations:");
            console.table(rows);
          }
        }
      );

      db.all("PRAGMA table_info(user)", (err, rows) => {
        if (err) {
          console.error("Error querying user columns:", err);
        } else {
          console.log("User table columns:");
          console.table(rows);
        }
      });
    });

    db.close();
  } catch (e2) {
    console.error("Failed to load sqlite drivers:", e2.message);
  }
}
