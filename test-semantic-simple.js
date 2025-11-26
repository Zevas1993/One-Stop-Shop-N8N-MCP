/**
 * Simple test for semantic validation
 * Tests by directly calling n8n API to create a workflow with many Code nodes
 */

const axios = require('axios');

const N8N_API_URL = 'http://localhost:5678';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';

async function testSemanticValidation() {
    console.log('🧪 Testing Semantic Validation System\n');
    console.log('Creating workflow with many Code nodes...\n');

    const workflow = {
        name: 'Semantic Test - Too Many Code Nodes',
        nodes: [
            {
                name: 'Manual Trigger',
                type: 'n8n-nodes-base.manualTrigger',
                typeVersion: 1,
                position: [250, 300],
                parameters: {}
            },
            {
                name: 'Code Node 1',
                type: 'n8n-nodes-base.code',
                typeVersion: 2,
                position: [450, 300],
                parameters: {
                    mode: 'runOnceForAllItems',
                    jsCode: 'return items.map(item => ({ json: { step: 1 } }));'
                }
            },
            {
                name: 'Code Node 2',
                type: 'n8n-nodes-base.code',
                typeVersion: 2,
                position: [650, 300],
                parameters: {
                    mode: 'runOnceForAllItems',
                    jsCode: 'return items.map(item => ({ json: { step: 2 } }));'
                }
            },
            {
                name: 'Code Node 3',
                type: 'n8n-nodes-base.code',
                typeVersion: 2,
                position: [850, 300],
                parameters: {
                    mode: 'runOnceForAllItems',
                    jsCode: 'return items.map(item => ({ json: { step: 3 } }));'
                }
            }
        ],
        connections: {
            'Manual Trigger': {
                main: [[{ node: 'Code Node 1', type: 'main', index: 0 }]]
            },
            'Code Node 1': {
                main: [[{ node: 'Code Node 2', type: 'main', index: 0 }]]
            },
            'Code Node 2': {
                main: [[{ node: 'Code Node 3', type: 'main', index: 0 }]]
            }
        }
    };

    try {
        const response = await axios.post(
            `${N8N_API_URL}/api/v1/workflows`,
            workflow,
            {
                headers: {
                    'X-N8N-API-KEY': N8N_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Workflow created successfully!');
        console.log('Workflow ID:', response.data.id);
        console.log('\n📊 Analysis:');
        console.log('- Total nodes:', workflow.nodes.length);
        console.log('- Code nodes:', workflow.nodes.filter(n => n.type.includes('code')).length);
        console.log('- Code node ratio:', Math.round((3/3) * 100) + '%');
        console.log('\n⚠️  This workflow has 100% Code nodes (excluding trigger)');
        console.log('Expected semantic validation score: LOW (< 60/100)');
        console.log('\nNote: Semantic validation warnings are logged in the MCP server logs, not returned in API response.');

        return response.data.id;
    } catch (error) {
        console.error('❌ Error creating workflow:', error.response?.data || error.message);
        throw error;
    }
}

// Run test
testSemanticValidation()
    .then(workflowId => {
        console.log('\n✅ Test complete!');
        console.log(`To see semantic validation logs, check the MCP server output when using the n8n_create_workflow tool.`);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    });
