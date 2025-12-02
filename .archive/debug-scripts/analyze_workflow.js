const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('current_workflow.json', 'utf8'));

console.log("=== ANALYZING WORKFLOW CONNECTIONS ===\n");

// Find all AI agent nodes
const agentNodes = wf.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.agent');
console.log("AI AGENT NODES:");
agentNodes.forEach(n => console.log(`  - ${n.name} (${n.id})`));

// Find all language model nodes
const lmNodes = wf.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi');
console.log("\nLANGUAGE MODEL NODES:");
lmNodes.forEach(n => console.log(`  - ${n.name} (${n.id})`));

// Find all tool nodes
const toolNodes = wf.nodes.filter(n => n.type.includes('Tool') || n.type.includes('tool'));
console.log("\nTOOL NODES:");
toolNodes.forEach(n => console.log(`  - ${n.name} (${n.id}) - ${n.type}`));

// Find text classifier (also needs LM)
const classifierNodes = wf.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.textClassifier');
console.log("\nTEXT CLASSIFIER NODES:");
classifierNodes.forEach(n => console.log(`  - ${n.name} (${n.id})`));

// Analyze existing connections
console.log("\n=== CURRENT AI CONNECTIONS ===");
if (wf.connections['OpenAI Chat Model']?.ai_languageModel) {
  console.log("Language Model Connections:");
  wf.connections['OpenAI Chat Model'].ai_languageModel[0].forEach(conn => {
    console.log(`  - Connected to: ${conn.node}`);
  });
}

if (wf.connections['Memory Buffer']?.ai_memory) {
  console.log("\nMemory Connections:");
  wf.connections['Memory Buffer'].ai_memory[0].forEach(conn => {
    console.log(`  - Connected to: ${conn.node}`);
  });
}

// Check for tool connections
console.log("\nTool Connections:");
Object.keys(wf.connections).forEach(nodeName => {
  if (wf.connections[nodeName].ai_tool) {
    console.log(`  ${nodeName}:`);
    wf.connections[nodeName].ai_tool[0].forEach(conn => {
      console.log(`    - Connected to: ${conn.node}`);
    });
  }
});

// Check which nodes are MISSING connections
console.log("\n=== MISSING CONNECTIONS ANALYSIS ===");
const lmConnectedNodes = wf.connections['OpenAI Chat Model']?.ai_languageModel?.[0]?.map(c => c.node) || [];
agentNodes.forEach(agent => {
  const hasLM = lmConnectedNodes.includes(agent.name);
  console.log(`${agent.name}: ${hasLM ? '✓ Has LM' : '✗ MISSING LM CONNECTION'}`);
});

classifierNodes.forEach(classifier => {
  const hasLM = lmConnectedNodes.includes(classifier.name);
  console.log(`${classifier.name}: ${hasLM ? '✓ Has LM' : '✗ MISSING LM CONNECTION'}`);
});
