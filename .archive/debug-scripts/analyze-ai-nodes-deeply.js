const fs = require('fs');

// Read the workflow from our saved state
const workflow = JSON.parse(fs.readFileSync('current-workflow-state.json', 'utf8'));

console.log('═══════════════════════════════════════════════════════════');
console.log('DEEP ANALYSIS: AI NODES AND THEIR CONFIGURATIONS');
console.log('═══════════════════════════════════════════════════════════\n');

// Find all AI nodes
const aiNodeTypes = [
  'agent',
  'languageModel',
  'textClassifier',
  'openAi',
  'memoryBuffer',
  'vectorStore'
];

const aiNodes = workflow.nodes.filter(n =>
  aiNodeTypes.some(type => n.type.toLowerCase().includes(type))
);

console.log(`Found ${aiNodes.length} AI nodes:\n`);

aiNodes.forEach((node, idx) => {
  console.log(`[${idx}] ${node.name}`);
  console.log(`    Type: ${node.type}`);
  console.log(`    TypeVersion: ${node.typeVersion}`);

  if (!node.parameters) {
    console.log('    ⚠️  NO PARAMETERS CONFIGURED');
  } else {
    console.log(`    Parameters configured: ${Object.keys(node.parameters).length}`);

    // Check critical parameters for this node type
    const criticalParams = getCriticalParams(node.type);

    if (criticalParams && criticalParams.length > 0) {
      console.log(`    Critical params for this type: ${criticalParams.join(', ')}`);
      criticalParams.forEach(param => {
        const hasParam = param in node.parameters;
        const value = node.parameters[param];
        console.log(`      ├─ ${param}: ${hasParam ? '✅' : '❌'} ${hasParam ? JSON.stringify(value).substring(0, 50) : 'MISSING'}`);
      });
    }

    // Check for empty or null values
    const emptyParams = [];
    for (const [key, value] of Object.entries(node.parameters)) {
      if (value === null || value === undefined || value === '' || (typeof value === 'object' && Object.keys(value).length === 0)) {
        emptyParams.push(key);
      }
    }

    if (emptyParams.length > 0) {
      console.log(`    ⚠️  Empty/null parameters: ${emptyParams.join(', ')}`);
    }
  }

  console.log('');
});

// Now analyze connections to these AI nodes
console.log('\n═══════════════════════════════════════════════════════════');
console.log('AI NODE CONNECTIONS ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

const aiConnectionTypes = ['ai_tool', 'ai_languageModel', 'ai_memory'];

for (const [sourceName, connObj] of Object.entries(workflow.connections)) {
  const sourceNode = workflow.nodes.find(n => n.name === sourceName);
  if (!sourceNode) continue;

  let hasAiConnections = false;

  for (const connType of aiConnectionTypes) {
    if (connObj[connType] && Array.isArray(connObj[connType])) {
      if (!hasAiConnections) {
        console.log(`${sourceName} (${sourceNode.type}):`);
        hasAiConnections = true;
      }

      console.log(`  ${connType}:`);
      connObj[connType].forEach((conn, idx) => {
        console.log(`    [${idx}] → ${conn.node || 'UNNAMED'}`);

        // Verify target node exists
        const targetExists = workflow.nodes.find(n => n.name === (conn.node || ''));
        if (!targetExists) {
          console.log(`        ❌ ERROR: Target node does not exist!`);
        } else {
          console.log(`        ✅ Target exists`);
        }
      });
    }
  }

  if (hasAiConnections) {
    console.log('');
  }
}

// Check all normal connections for issues
console.log('\n═══════════════════════════════════════════════════════════');
console.log('NORMAL CONNECTIONS ANALYSIS (main output)');
console.log('═══════════════════════════════════════════════════════════\n');

let connectionIssues = [];

for (const [sourceName, connObj] of Object.entries(workflow.connections)) {
  if (!connObj.main) continue;

  connObj.main.forEach((outputArray, outputIdx) => {
    if (!Array.isArray(outputArray)) {
      connectionIssues.push(`${sourceName}.main[${outputIdx}] is not an array`);
      return;
    }

    if (outputArray.length === 0) {
      console.log(`${sourceName} - output[${outputIdx}]: [DISCONNECTED]`);
      return;
    }

    outputArray.forEach((conn, connIdx) => {
      const targetNode = workflow.nodes.find(n => n.name === conn.node);
      if (!targetNode) {
        connectionIssues.push(`${sourceName} → ${conn.node}: TARGET NODE MISSING!`);
        console.log(`${sourceName} → ${conn.node} [OUTPUT ${outputIdx}]: ❌ TARGET MISSING`);
      } else {
        console.log(`${sourceName} → ${conn.node} [OUTPUT ${outputIdx}]: ✅`);
      }
    });
  });
}

if (connectionIssues.length > 0) {
  console.log('\n⚠️  CONNECTION ISSUES:');
  connectionIssues.forEach(issue => console.log(`   ${issue}`));
}

// Analyze the Business Inquiry Agent specifically
console.log('\n═══════════════════════════════════════════════════════════');
console.log('BUSINESS INQUIRY AGENT - DETAILED ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

const baNode = workflow.nodes.find(n => n.name === 'Business Inquiry Agent');
if (baNode) {
  console.log(`Node: ${baNode.name}`);
  console.log(`Type: ${baNode.type}`);
  console.log(`TypeVersion: ${baNode.typeVersion}`);
  console.log(`Position: [${baNode.position}]`);
  console.log(`Parameters: ${JSON.stringify(baNode.parameters, null, 2)}`);

  // Check if it has output connections
  const baConnections = workflow.connections['Business Inquiry Agent'];
  if (!baConnections) {
    console.log('\n❌ CRITICAL: Business Inquiry Agent has NO connections!');
  } else {
    console.log('\nConnections:');
    console.log(JSON.stringify(baConnections, null, 2));
  }
} else {
  console.log('❌ Business Inquiry Agent NOT FOUND!');
}

function getCriticalParams(nodeType) {
  const criticalMap = {
    'agent': ['model', 'tools', 'sessionId'],
    'languageModel': ['model', 'nApiKey'],
    'textClassifier': ['categories', 'input'],
    'openAi': ['model', 'options'],
    'memoryBuffer': ['sessionId', 'windowSize'],
    'vectorStore': ['query']
  };

  for (const [typeKey, params] of Object.entries(criticalMap)) {
    if (nodeType.toLowerCase().includes(typeKey)) {
      return params;
    }
  }
  return [];
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('END OF ANALYSIS');
console.log('═══════════════════════════════════════════════════════════');
