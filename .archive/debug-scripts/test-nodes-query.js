const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'nodes.db');
const db = new Database(dbPath, { readonly: true });

// Query for Microsoft Teams node
console.log('\n=== MICROSOFT TEAMS NODE ===');
const teamsNode = db.prepare(`
  SELECT node_type, display_name, description, properties, operations
  FROM nodes
  WHERE node_type LIKE '%teams%' OR display_name LIKE '%Teams%'
  LIMIT 5
`).all();

teamsNode.forEach(node => {
  console.log(`\nNode Type: ${node.node_type}`);
  console.log(`Display Name: ${node.display_name}`);
  console.log(`Description: ${node.description}`);
  if (node.operations) {
    const ops = JSON.parse(node.operations);
    console.log(`Operations: ${ops.map(o => o.name).join(', ')}`);
  }
});

// Query for Outlook Calendar
console.log('\n\n=== OUTLOOK CALENDAR ===');
const outlookNode = db.prepare(`
  SELECT node_type, display_name, description, properties, operations
  FROM nodes
  WHERE node_type = 'n8n-nodes-base.microsoftOutlook'
`).get();

if (outlookNode && outlookNode.operations) {
  const ops = JSON.parse(outlookNode.operations);
  console.log(`\nOutlook Operations: ${ops.map(o => o.name).join(', ')}`);

  // Check for calendar resource
  if (outlookNode.properties) {
    const props = JSON.parse(outlookNode.properties);
    const resourceProp = props.find(p => p.name === 'resource');
    if (resourceProp && resourceProp.options) {
      console.log('\nOutlook Resources:');
      resourceProp.options.forEach(opt => {
        console.log(`  - ${opt.name}: ${opt.value}`);
      });
    }
  }
}

// Query for attachment handling
console.log('\n\n=== ATTACHMENT HANDLING NODES ===');
const attachmentNodes = db.prepare(`
  SELECT node_type, display_name, description
  FROM nodes
  WHERE node_type LIKE '%attachment%'
     OR display_name LIKE '%Attachment%'
     OR description LIKE '%attachment%'
  LIMIT 10
`).all();

attachmentNodes.forEach(node => {
  console.log(`\n${node.node_type} - ${node.display_name}`);
});

// Query for file handling
console.log('\n\n=== FILE HANDLING NODES ===');
const fileNodes = db.prepare(`
  SELECT node_type, display_name, description
  FROM nodes
  WHERE node_type LIKE '%file%'
     OR display_name LIKE '%File%'
  LIMIT 10
`).all();

fileNodes.forEach(node => {
  console.log(`\n${node.node_type} - ${node.display_name}`);
});

db.close();
