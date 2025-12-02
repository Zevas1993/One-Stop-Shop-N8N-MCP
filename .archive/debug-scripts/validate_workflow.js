const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('current_workflow.json', 'utf8'));

console.log("=== COMPREHENSIVE WORKFLOW VALIDATION ===\n");

// 1. Check for nodes without incoming connections (except triggers)
console.log("1. ORPHANED NODES (no incoming connections):");
const triggerTypes = ['webhook', 'manualTrigger', 'trigger'];
wf.nodes.forEach(node => {
  const isTrigger = triggerTypes.some(t => node.type.toLowerCase().includes(t));
  const hasIncoming = Object.keys(wf.connections).some(sourceName => {
    const source = wf.connections[sourceName];
    return Object.keys(source).some(connectionType => {
      if (Array.isArray(source[connectionType])) {
        return source[connectionType].some(outputArray =>
          outputArray && outputArray.some(conn => conn.node === node.name)
        );
      }
      return false;
    });
  });

  if (!isTrigger && !hasIncoming) {
    console.log(`  ✗ ${node.name} (${node.type}) - NO INCOMING CONNECTIONS`);
  }
});

// 2. Check AI nodes for required connections
console.log("\n2. AI NODES VALIDATION:");

// Check agents
const agents = wf.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.agent');
agents.forEach(agent => {
  const lmConnections = Object.keys(wf.connections).filter(source =>
    wf.connections[source].ai_languageModel &&
    wf.connections[source].ai_languageModel[0].some(c => c.node === agent.name)
  );
  console.log(`  Agent: ${agent.name}`);
  console.log(`    Language Model: ${lmConnections.length > 0 ? '✓ ' + lmConnections.join(', ') : '✗ MISSING'}`);

  const toolConnections = Object.keys(wf.connections).filter(source =>
    wf.connections[source].ai_tool &&
    wf.connections[source].ai_tool[0].some(c => c.node === agent.name)
  );
  console.log(`    Tools: ${toolConnections.length > 0 ? '✓ ' + toolConnections.join(', ') : '⚠ None (optional)'}`);
});

// Check text classifier
const classifiers = wf.nodes.filter(n => n.type === '@n8n/n8n-nodes-langchain.textClassifier');
classifiers.forEach(classifier => {
  const lmConnections = Object.keys(wf.connections).filter(source =>
    wf.connections[source].ai_languageModel &&
    wf.connections[source].ai_languageModel[0].some(c => c.node === classifier.name)
  );
  console.log(`  Classifier: ${classifier.name}`);
  console.log(`    Language Model: ${lmConnections.length > 0 ? '✓ ' + lmConnections.join(', ') : '✗ MISSING'}`);
});

// 3. Check for broken connections
console.log("\n3. CONNECTION INTEGRITY:");
Object.keys(wf.connections).forEach(sourceName => {
  const sourceNode = wf.nodes.find(n => n.name === sourceName);
  if (!sourceNode) {
    console.log(`  ✗ Source node "${sourceName}" not found in workflow!`);
    return;
  }

  Object.keys(wf.connections[sourceName]).forEach(connectionType => {
    const outputs = wf.connections[sourceName][connectionType];
    if (Array.isArray(outputs)) {
      outputs.forEach((outputArray, idx) => {
        if (outputArray) {
          outputArray.forEach(conn => {
            const targetNode = wf.nodes.find(n => n.name === conn.node);
            if (!targetNode) {
              console.log(`  ✗ ${sourceName} -> ${conn.node}: Target node not found!`);
            }
          });
        }
      });
    }
  });
});

console.log("\n4. SUMMARY:");
console.log(`  Total nodes: ${wf.nodes.length}`);
console.log(`  AI Agents: ${agents.length}`);
console.log(`  Language Models: ${wf.nodes.filter(n => n.type.includes('lmChat')).length}`);
console.log(`  Tools: ${wf.nodes.filter(n => n.name.includes('Tool')).length}`);
