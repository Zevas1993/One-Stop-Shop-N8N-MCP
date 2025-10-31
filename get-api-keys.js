const Database = require('better-sqlite3');
const path = require('path');

try {
  const dbPath = path.join('C:\\Users\\Chris Boyd\\.n8n', 'database.sqlite');
  const db = new Database(dbPath);

  // Get API keys
  const keys = db.prepare('SELECT id, apiKey, createdAt, updatedAt FROM user_api_keys').all();

  if (keys.length > 0) {
    console.log('✅ Found API Keys in database:\n');
    keys.forEach((k, i) => {
      const masked = k.apiKey.substring(0, 20) + '...' + k.apiKey.substring(k.apiKey.length - 20);
      console.log(`   Key ${i+1}:`);
      console.log(`     Full: ${k.apiKey}`);
      console.log(`     ID: ${k.id}`);
      console.log(`     Created: ${k.createdAt}`);
      console.log(`     Updated: ${k.updatedAt}\n`);
    });
  } else {
    console.log('❌ No API keys found in database');
  }

  db.close();
} catch (e) {
  console.error('❌ Error:', e.message);
}
