const fs = require('fs');
const path = require('path');

function analyzeWorkflow() {
    const workflowPath = path.join(__dirname, 'current-workflow.json');
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

    console.log('=== WORKFLOW ANALYSIS ===\n');
    console.log(`Name: ${workflow.name}`);
    console.log(`Total Nodes: ${workflow.nodes.length}`);
    console.log(`Active: ${workflow.active}\n`);

    // Check for nodes without positions
    console.log('=== NODE POSITIONS ===');
    const nodesWithoutPosition = workflow.nodes.filter(n => !n.position || !Array.isArray(n.position) || n.position.length !== 2);
    if (nodesWithoutPosition.length > 0) {
        console.log('❌ Nodes without proper position:');
        nodesWithoutPosition.forEach(n => console.log(`  - ${n.name} (${n.type})`));
    } else {
        console.log('✅ All nodes have valid positions');
    }

    // Check for duplicate node names
    console.log('\n=== DUPLICATE NODE NAMES ===');
    const nodeNames = workflow.nodes.map(n => n.name);
    const duplicates = nodeNames.filter((name, index) => nodeNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
        console.log('❌ Duplicate node names found:');
        duplicates.forEach(name => console.log(`  - ${name}`));
    } else {
        console.log('✅ No duplicate node names');
    }

    // Check for orphaned nodes (no connections)
    console.log('\n=== ORPHANED NODES ===');
    const connectedNodes = new Set();

    // Add nodes from connections object
    Object.keys(workflow.connections).forEach(sourceName => {
        connectedNodes.add(sourceName);
        const outputs = workflow.connections[sourceName];
        Object.values(outputs).forEach(outputArray => {
            outputArray.forEach(connArray => {
                if (connArray) {
                    connArray.forEach(conn => {
                        if (conn && conn.node) {
                            connectedNodes.add(conn.node);
                        }
                    });
                }
            });
        });
    });

    const orphanedNodes = workflow.nodes.filter(n => !connectedNodes.has(n.name));
    if (orphanedNodes.length > 0) {
        console.log('⚠️  Nodes not in any connection:');
        orphanedNodes.forEach(n => console.log(`  - ${n.name} (${n.type})`));
    } else {
        console.log('✅ All nodes are connected');
    }

    // Check for missing connection targets
    console.log('\n=== INVALID CONNECTIONS ===');
    const nodeNameSet = new Set(workflow.nodes.map(n => n.name));
    let invalidConnections = [];

    Object.entries(workflow.connections).forEach(([sourceName, outputs]) => {
        if (!nodeNameSet.has(sourceName)) {
            invalidConnections.push(`Source node "${sourceName}" doesn't exist`);
        }

        Object.entries(outputs).forEach(([outputType, connections]) => {
            connections.forEach((connArray, index) => {
                if (connArray) {
                    connArray.forEach(conn => {
                        if (conn && conn.node && !nodeNameSet.has(conn.node)) {
                            invalidConnections.push(`Target node "${conn.node}" from "${sourceName}" doesn't exist`);
                        }
                    });
                }
            });
        });
    });

    if (invalidConnections.length > 0) {
        console.log('❌ Invalid connections found:');
        invalidConnections.forEach(msg => console.log(`  - ${msg}`));
    } else {
        console.log('✅ All connections reference valid nodes');
    }

    // Check node type format
    console.log('\n=== NODE TYPE FORMAT ===');
    const invalidTypes = workflow.nodes.filter(n => !n.type || (!n.type.startsWith('n8n-nodes-base.') && !n.type.startsWith('@n8n/')));
    if (invalidTypes.length > 0) {
        console.log('⚠️  Nodes with potentially invalid type format:');
        invalidTypes.forEach(n => console.log(`  - ${n.name}: ${n.type}`));
    } else {
        console.log('✅ All node types have valid format');
    }

    // Check for missing required fields
    console.log('\n=== REQUIRED FIELDS ===');
    const missingFields = [];
    workflow.nodes.forEach(node => {
        if (!node.id) missingFields.push(`${node.name}: missing id`);
        if (!node.name) missingFields.push(`${node.type}: missing name`);
        if (!node.type) missingFields.push(`${node.name}: missing type`);
        if (!node.parameters) missingFields.push(`${node.name}: missing parameters`);
        if (!node.typeVersion) missingFields.push(`${node.name}: missing typeVersion`);
    });

    if (missingFields.length > 0) {
        console.log('❌ Nodes with missing required fields:');
        missingFields.forEach(msg => console.log(`  - ${msg}`));
    } else {
        console.log('✅ All nodes have required fields');
    }

    // Analyze connection structure
    console.log('\n=== CONNECTION STRUCTURE ===');
    console.log('Main workflow connections:');
    const mainConnections = [];
    Object.entries(workflow.connections).forEach(([sourceName, outputs]) => {
        if (outputs.main) {
            outputs.main.forEach((connArray, index) => {
                if (connArray && connArray.length > 0) {
                    connArray.forEach(conn => {
                        mainConnections.push(`${sourceName} [output:${index}] -> ${conn.node}`);
                    });
                }
            });
        }
    });
    mainConnections.forEach(conn => console.log(`  ${conn}`));

    console.log('\nAI connections (ai_languageModel, ai_tool, ai_memory):');
    const aiConnections = [];
    Object.entries(workflow.connections).forEach(([sourceName, outputs]) => {
        Object.entries(outputs).forEach(([outputType, connections]) => {
            if (outputType.startsWith('ai_')) {
                connections.forEach((connArray, index) => {
                    if (connArray && connArray.length > 0) {
                        connArray.forEach(conn => {
                            aiConnections.push(`${sourceName} [${outputType}:${index}] -> ${conn.node}`);
                        });
                    }
                });
            }
        });
    });
    aiConnections.forEach(conn => console.log(`  ${conn}`));

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total nodes: ${workflow.nodes.length}`);
    console.log(`Connected nodes: ${connectedNodes.size}`);
    console.log(`Orphaned nodes: ${orphanedNodes.length}`);
    console.log(`Main connections: ${mainConnections.length}`);
    console.log(`AI connections: ${aiConnections.length}`);
    console.log(`Total connections: ${mainConnections.length + aiConnections.length}`);
}

analyzeWorkflow();
