const Database = require('better-sqlite3');
const path = require('path');

try {
  const dbPath = path.join('C:\\Users\\Chris Boyd\\.n8n', 'database.sqlite');
  const db = new Database(dbPath);

  // List all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('📋 Available tables:');
  tables.forEach(t => console.log(`  - ${t.name}`));

  db.close();
} catch (e) {
  console.error('❌ Error:', e.message);
}
