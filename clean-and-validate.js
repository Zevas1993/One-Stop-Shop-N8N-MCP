const fs = require('fs');
const path = require('path');

function cleanWorkflowForUpdate(workflow) {
    // These fields are read-only and must be removed for updates
    const readOnlyFields = [
        'id', 'createdAt', 'updatedAt', 'versionId',
        'triggerCount', 'shared', 'tags', 'active', 'isArchived',
        'meta', 'pinData'
    ];

    const cleaned = { ...workflow };

    // Remove read-only fields
    readOnlyFields.forEach(field => {
        delete cleaned[field];
    });

    return cleaned;
}

async function cleanAndValidate() {
    try {
        console.log('Loading workflow...');
        const workflowPath = path.join(__dirname, 'current-workflow.json');
        const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

        console.log('\nCleaning workflow for update...');
        const cleaned = cleanWorkflowForUpdate(workflowData);

        console.log('\nCleaned workflow has these properties:');
        console.log(Object.keys(cleaned).join(', '));

        console.log('\nSaving cleaned workflow...');
        const cleanedPath = path.join(__dirname, 'cleaned-workflow.json');
        fs.writeFileSync(cleanedPath, JSON.stringify(cleaned, null, 2));
        console.log(`Saved to: ${cleanedPath}`);

        // Now validate the cleaned workflow
        console.log('\n=== VALIDATING CLEANED WORKFLOW ===');
        const { WorkflowValidator } = require('./dist/services/workflow-validator');
        const { NodeDocumentationService } = require('./dist/services/node-documentation-service');

        const dbPath = path.join(__dirname, 'nodes.db');
        const nodeService = new NodeDocumentationService(dbPath);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const validator = new WorkflowValidator(nodeService);
        const result = await validator.validateWorkflow(cleaned, {
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
            });
        }

        if (result.warnings.length > 0) {
            console.log('\n=== WARNINGS ===');
            result.warnings.forEach((warning, index) => {
                console.log(`\n${index + 1}. ${warning.message}`);
                if (warning.node) console.log(`   Node: ${warning.node}`);
            });
        }

        await nodeService.close();

        if (result.valid) {
            console.log('\n✅ Workflow is valid and ready for deployment!');
        } else {
            console.log('\n❌ Workflow has validation errors that need to be fixed');
        }

    } catch (error) {
        console.error('\n=== ERROR ===');
        console.error(error);
        process.exit(1);
    }
}

cleanAndValidate();
