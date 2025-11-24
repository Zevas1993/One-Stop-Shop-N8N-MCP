const fs = require('fs');
const before = JSON.parse(fs.readFileSync('current_workflow.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('verified_workflow.json', 'utf8'));

console.log("=== WORKFLOW FIX VERIFICATION ===\n");

console.log("BEFORE:");
console.log(`  Updated: ${before.updatedAt}`);
console.log(`  Business Inquiry Agent connections:`, before.connections['Business Inquiry Agent'] || "NONE");

console.log("\nAFTER:");
console.log(`  Updated: ${after.updatedAt}`);
console.log(`  Business Inquiry Agent connections:`, JSON.stringify(after.connections['Business Inquiry Agent'], null, 2));

console.log("\n=== COMPLETE CONNECTION VERIFICATION ===");

// Verify all AI connections are still intact
const aiConnections = {
  'OpenAI Chat Model': after.connections['OpenAI Chat Model']?.ai_languageModel?.[0] || [],
  'Memory Buffer': after.connections['Memory Buffer']?.ai_memory?.[0] || [],
  'Create Draft Tool': after.connections['Create Draft Tool']?.ai_tool?.[0] || [],
  'Send Email Tool': after.connections['Send Email Tool']?.ai_tool?.[0] || [],
  'Search Emails Tool': after.connections['Search Emails Tool']?.ai_tool?.[0] || [],
  'Knowledge Search Tool': after.connections['Knowledge Search Tool']?.ai_tool?.[0] || []
};

console.log("\nAI Language Model Connections:");
aiConnections['OpenAI Chat Model'].forEach(conn => {
  console.log(`  ✓ ${conn.node}`);
});

console.log("\nAI Memory Connections:");
aiConnections['Memory Buffer'].forEach(conn => {
  console.log(`  ✓ ${conn.node}`);
});

console.log("\nAI Tool Connections:");
['Create Draft Tool', 'Send Email Tool', 'Search Emails Tool', 'Knowledge Search Tool'].forEach(tool => {
  if (aiConnections[tool].length > 0) {
    console.log(`  ${tool}:`);
    aiConnections[tool].forEach(conn => {
      console.log(`    ✓ ${conn.node}`);
    });
  }
});

console.log("\n=== FIX STATUS ===");
const businessAgentFixed = after.connections['Business Inquiry Agent']?.main?.[0]?.length > 0;
console.log(businessAgentFixed ? "✓ WORKFLOW SUCCESSFULLY FIXED!" : "✗ Fix failed");
console.log(`  Business Inquiry Agent now connects to: ${after.connections['Business Inquiry Agent']?.main?.[0]?.[0]?.node || 'NONE'}`);
