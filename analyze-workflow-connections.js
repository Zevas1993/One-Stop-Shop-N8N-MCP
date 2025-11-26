const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║    ANALYZING WORKFLOW CONNECTIONS & PARAMETERS         ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
const workflow = JSON.parse(backupJson);

// Create a map of node names to nodes for quick lookup
const nodeMap = {};
workflow.nodes.forEach(node => {
  nodeMap[node.name] = node;
});

console.log('📋 Analyzing connections...\n');

// Check all connections
const issues = [];

for (const [sourceName, connObj] of Object.entries(workflow.connections)) {
  const sourceNode = nodeMap[sourceName];
  
  if (!sourceNode) {
    issues.push({
      type: 'MISSING_SOURCE_NODE',
      details: `Connection source "${sourceName}" not found in nodes`
    });
    continue;
  }

  // Check main connections
  if (connObj.main) {
    connObj.main.forEach((outputArray, outputIndex) => {
      outputArray.forEach(conn => {
        const targetNode = nodeMap[conn.node];
        if (!targetNode) {
          issues.push({
            type: 'MISSING_TARGET_NODE',
            source: sourceName,
            target: conn.node,
            details: `Connection targets non-existent node "${conn.node}"`
          });
        }
      });
    });
  }

  // Check AI connections
  for (const aiType of ['ai_tool', 'ai_languageModel', 'ai_memory']) {
    if (connObj[aiType]) {
      connObj[aiType].forEach(conn => {
        const targetNode = nodeMap[conn.node];
        if (!targetNode) {
          issues.push({
            type: 'MISSING_AI_TARGET',
            source: sourceName,
            aiType: aiType,
            target: conn.node,
            details: `AI connection (${aiType}) targets non-existent node "${conn.node}"`
          });
        }
      });
    }
  }
}

console.log('🔍 Checking node parameters for invalid references...\n');

// Check each node's parameters for references to missing nodes
workflow.nodes.forEach(node => {
  const paramStr = JSON.stringify(node.parameters || {});
  
  // Look for references like {{ $node.SomeName.* }} or [node.SomeName.*]
  const nodeRefs = paramStr.match(/\$node\.([a-zA-Z0-9\s\-_]+)\./g) || [];
  
  nodeRefs.forEach(ref => {
    const refNodeName = ref.replace('$node.', '').replace('.', '');
    if (!nodeMap[refNodeName]) {
      issues.push({
        type: 'INVALID_NODE_REFERENCE',
        node: node.name,
        reference: refNodeName,
        details: `Parameter references non-existent node "${refNodeName}"`
      });
    }
  });
});

console.log('🔍 Checking for problematic parameter patterns...\n');

// Check for known problematic patterns
workflow.nodes.forEach(node => {
  const params = JSON.stringify(node.parameters || {});
  
  // Check for unresolved placeholders
  if (params.includes('UNNAMED') || params.includes('undefined') || params.includes('null')) {
    issues.push({
      type: 'UNRESOLVED_PLACEHOLDER',
      node: node.name,
      details: 'Parameters contain unresolved placeholders or null values'
    });
  }
  
  // Check for invalid $fromAI syntax
  if (params.includes('$fromAI')) {
    issues.push({
      type: 'INVALID_SYNTAX',
      node: node.name,
      details: 'Parameters use invalid $fromAI() syntax (should use {{ }} expressions)'
    });
  }
});

console.log('═══════════════════════════════════════════════════════════');
console.log('ANALYSIS RESULTS');
console.log('═══════════════════════════════════════════════════════════\n');

if (issues.length === 0) {
  console.log('✅ NO ISSUES FOUND!');
  console.log('\nAll connections are valid.');
  console.log('All node references are correct.');
  console.log('All parameters appear properly formatted.');
} else {
  console.log(`❌ Found ${issues.length} issue(s):\n`);
  
  issues.forEach((issue, idx) => {
    console.log(`${idx + 1}. [${issue.type}]`);
    if (issue.node) console.log(`   Node: ${issue.node}`);
    if (issue.source) console.log(`   Source: ${issue.source}`);
    if (issue.target) console.log(`   Target: ${issue.target}`);
    if (issue.aiType) console.log(`   AI Type: ${issue.aiType}`);
    if (issue.reference) console.log(`   Reference: ${issue.reference}`);
    console.log(`   ${issue.details}`);
    console.log();
  });
}

fs.writeFileSync('workflow-analysis.json', JSON.stringify({
  totalNodes: workflow.nodes.length,
  totalConnections: Object.keys(workflow.connections).length,
  issuesFound: issues.length,
  issues: issues
}, null, 2));

console.log('✅ Analysis saved to workflow-analysis.json');
