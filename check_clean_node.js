const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('current_workflow.json', 'utf8'));

// Check the Clean Email Content node
const cleanNode = wf.nodes.find(n => n.id === 'clean-content');
console.log("=== CLEAN EMAIL CONTENT NODE ===");
console.log(JSON.stringify(cleanNode, null, 2));

// Check if it has any AI connections
console.log("\n=== CHECKING FOR MISSING AI CONNECTIONS ===");
const hasLMConnection = Object.keys(wf.connections).some(nodeName => {
  const node = wf.connections[nodeName];
  return node.ai_languageModel && node.ai_languageModel[0].some(c => c.node === cleanNode.name);
});

console.log(`Clean Email Content has LM connection: ${hasLMConnection ? 'YES' : 'NO - THIS IS THE PROBLEM!'}`);

// This node is using @n8n/n8n-nodes-langchain.openAi which is a standalone OpenAI node
// It should be replaced with an AI Agent or connected to a language model
console.log("\nNote: This node type '@n8n/n8n-nodes-langchain.openAi' is a standalone OpenAI node.");
console.log("It doesn't need an external language model connection - it has credentials built-in.");
console.log("However, it might need OpenAI credentials configured.");
