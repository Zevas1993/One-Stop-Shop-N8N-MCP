const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('fixed_workflow.json', 'utf8'));

// Create API-ready payload (remove all read-only fields)
const apiPayload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
  staticData: wf.staticData || {}
  // Remove: tags, id, createdAt, updatedAt, versionId, shared, active, etc.
};

fs.writeFileSync('api_payload_clean.json', JSON.stringify(apiPayload, null, 2));
console.log("✓ Clean API payload created (removed read-only fields)");
