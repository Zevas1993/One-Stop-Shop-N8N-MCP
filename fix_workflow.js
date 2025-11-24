const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('current_workflow.json', 'utf8'));

console.log("=== FIXING WORKFLOW ===\n");

// Fix 1: Add output connection from Business Inquiry Agent to Update Email Categories
console.log("Fix 1: Adding output connection from Business Inquiry Agent");
if (!wf.connections['Business Inquiry Agent']) {
  wf.connections['Business Inquiry Agent'] = {};
}
if (!wf.connections['Business Inquiry Agent'].main) {
  wf.connections['Business Inquiry Agent'].main = [[]];
}

// Add connection to Update Email Categories
wf.connections['Business Inquiry Agent'].main[0] = [{
  "node": "Update Email Categories",
  "type": "main",
  "index": 0
}];
console.log("  ✓ Connected: Business Inquiry Agent -> Update Email Categories");

// Verify the fix
console.log("\n=== VERIFICATION ===");
console.log("Business Inquiry Agent connections:");
console.log(JSON.stringify(wf.connections['Business Inquiry Agent'], null, 2));

// Save the fixed workflow
fs.writeFileSync('fixed_workflow.json', JSON.stringify(wf, null, 2));
console.log("\n✓ Fixed workflow saved to fixed_workflow.json");

// Create API-ready payload (remove read-only fields)
const apiPayload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
  staticData: wf.staticData,
  tags: wf.tags
};

fs.writeFileSync('api_payload.json', JSON.stringify(apiPayload, null, 2));
console.log("✓ API payload saved to api_payload.json");
