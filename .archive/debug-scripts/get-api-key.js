const Database = require('better-sqlite3');

try {
  const db = new Database('c:\Users\Chris Boyd\.n8n\database.sqlite');
  
  // Get API keys
  const keys = db.prepare('SELECT id, apiKey, createdAt FROM api_key').all();
  if (keys.length > 0) {
    console.log('✅ Found API Keys:');
    keys.forEach(k => {
      const masked = k.apiKey.substring(0, 10) + '...' + k.apiKey.substring(k.apiKey.length - 10);
      console.log(`   ID: ${k.id}, Key: ${masked}, Created: ${k.createdAt}`);
    });
    console.log('\nUsing first key: ' + keys[0].apiKey);
  } else {
    console.log('No API keys found in database');
  }
  
  db.close();
} catch (e) {
  console.error('Error:', e.message);
}
