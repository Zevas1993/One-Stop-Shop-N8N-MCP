const fs = require('fs');
const path = require('path');
const { WorkflowValidator } = require('./dist/services/workflow-validator');
const { NodeDocumentationService } = require('./dist/services/node-documentation-service');

async function validateWorkflow() {
    try {
        console.log('Loading workflow from file...');
        const workflowPath = path.join(__dirname, 'current-workflow.json');
        const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

        console.log('\n=== WORKFLOW STRUCTURE ===');
        console.log(`Workflow Name: ${workflowData.name}`);
        console.log(`Total Nodes: ${workflowData.nodes.length}`);
        console.log(`Active: ${workflowData.active}`);

        console.log('\n=== ALL NODES ===');
        workflowData.nodes.forEach(node => {
            console.log(`- ${node.name} (${node.type}) [ID: ${node.id}]`);
        });

        console.log('\n=== ALL CONNECTIONS ===');
        Object.entries(workflowData.connections).forEach(([nodeName, outputs]) => {
            Object.entries(outputs).forEach(([outputType, connections]) => {
                connections.forEach((connArray, index) => {
                    if (connArray && connArray.length > 0) {
                        connArray.forEach(conn => {
                            console.log(`${nodeName} [${outputType}:${index}] -> ${conn.node} (${conn.type})`);
                        });
                    }
                });
            });
        });

        console.log('\n=== INITIALIZING NODE DOCUMENTATION SERVICE ===');
        const dbPath = path.join(__dirname, 'nodes.db');
        const nodeService = new NodeDocumentationService(dbPath);
        // Wait for async initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('\n=== VALIDATING WORKFLOW ===');
        const validator = new WorkflowValidator(nodeService);

        const result = await validator.validateWorkflow(workflowData, {
            validateConnections: true,
            validateExpressions: true,
            validateProperties: true,
            profile: 'comprehensive'
        });

        console.log('\n=== VALIDATION RESULTS ===');
        console.log(`Valid: ${result.valid}`);
        console.log(`Total Errors: ${result.errors.length}`);
        console.log(`Total Warnings: ${result.warnings.length}`);

        if (result.errors.length > 0) {
            console.log('\n=== ERRORS ===');
            result.errors.forEach((error, index) => {
                console.log(`\n${index + 1}. ${error.message}`);
                if (error.node) console.log(`   Node: ${error.node}`);
                if (error.field) console.log(`   Field: ${error.field}`);
                if (error.context) console.log(`   Context: ${JSON.stringify(error.context, null, 2)}`);
            });
        }

        if (result.warnings.length > 0) {
            console.log('\n=== WARNINGS ===');
            result.warnings.forEach((warning, index) => {
                console.log(`\n${index + 1}. ${warning.message}`);
                if (warning.node) console.log(`   Node: ${warning.node}`);
                if (warning.field) console.log(`   Field: ${warning.field}`);
            });
        }

        await nodeService.close();

    } catch (error) {
        console.error('\n=== ERROR DURING VALIDATION ===');
        console.error(error);
        process.exit(1);
    }
}

validateWorkflow();
