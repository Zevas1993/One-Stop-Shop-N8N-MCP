// Direct database test - bypassing MCP server
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nodes.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath, { readonly: true });

console.log('\n📊 Database Statistics:');
const stats = db.prepare('SELECT COUNT(*) as count FROM nodes').get();
console.log(`Total nodes: ${stats.count}`);

console.log('\n🔍 Testing search for "agent":');
const searchResult = db.prepare(`
  SELECT node_type, display_name, description
  FROM nodes
  WHERE display_name LIKE ? OR description LIKE ? OR node_type LIKE ?
  LIMIT 10
`).all('%agent%', '%agent%', '%agent%');

console.log(`Found ${searchResult.length} results:`);
searchResult.forEach(node => {
  console.log(`  - ${node.display_name} (${node.node_type})`);
  console.log(`    ${node.description?.substring(0, 80)}...`);
});

console.log('\n🔍 Getting AI Agent node specifically:');
const agent = db.prepare(`
  SELECT * FROM nodes WHERE node_type = ?
`).get('nodes-langchain.agent');

if (agent) {
  console.log('✅ FOUND:', agent.display_name);
  console.log('Package:', agent.package_name);
  console.log('Description:', agent.description?.substring(0, 100));
  console.log('Properties:', JSON.parse(agent.properties_schema || '[]').length);
} else {
  console.log('❌ NOT FOUND');
}

db.close();
console.log('\n✅ Database access working correctly!');
