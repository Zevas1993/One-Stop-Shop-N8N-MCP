/**
 * External Agent Test: Semantic Validation System
 *
 * This script tests the MCP server's semantic validation by creating
 * a workflow with many Code nodes (should trigger warnings).
 */

const { spawn } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testSemanticValidation() {
    console.log('🧪 Starting Semantic Validation Test...\n');

    // Start MCP server
    const serverPath = 'C:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP';
    const serverProcess = spawn('node', ['dist/mcp/index.js'], {
        cwd: serverPath,
        env: {
            ...process.env,
            N8N_API_URL: 'http://localhost:5678',
            N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q',
            N8N_AUTO_SYNC: 'true',
            MCP_MODE: 'stdio'
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Capture server stderr for logging
    let serverStderr = '';
    serverProcess.stderr.on('data', (data) => {
        serverStderr += data.toString();
        console.log('[Server stderr]:', data.toString());
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        // Create MCP client
        const transport = new StdioClientTransport({
            command: 'node',
            args: ['dist/mcp/index.js'],
            env: {
                ...process.env,
                N8N_API_URL: 'http://localhost:5678',
                N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q',
                N8N_AUTO_SYNC: 'true',
                MCP_MODE: 'stdio'
            }
        });

        const client = new Client({
            name: 'semantic-validation-test',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);
        console.log('✅ Connected to MCP server\n');

        // List available tools
        console.log('📋 Listing available tools...');
        const tools = await client.listTools();
        console.log(`Found ${tools.tools.length} tools`);

        const createWorkflowTool = tools.tools.find(t => t.name === 'n8n_create_workflow');
        if (!createWorkflowTool) {
            console.error('❌ n8n_create_workflow tool not found!');
            console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
            return;
        }
        console.log('✅ Found n8n_create_workflow tool\n');

        // Create workflow with MANY Code nodes (should trigger semantic warnings)
        console.log('🔨 Creating workflow with multiple Code nodes...');
        console.log('Expected: Semantic validation should warn about too many Code nodes\n');

        const workflow = {
            name: 'Semantic Validation Test - Too Many Code Nodes',
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
                        jsCode: 'return items.map(item => ({ json: { message: "Code 1" } }));'
                    }
                },
                {
                    name: 'Code Node 2',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [650, 300],
                    parameters: {
                        mode: 'runOnceForAllItems',
                        jsCode: 'return items.map(item => ({ json: { message: "Code 2" } }));'
                    }
                },
                {
                    name: 'Code Node 3',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [850, 300],
                    parameters: {
                        mode: 'runOnceForAllItems',
                        jsCode: 'return items.map(item => ({ json: { message: "Code 3" } }));'
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

        const result = await client.callTool({
            name: 'n8n_create_workflow',
            arguments: {
                workflow: workflow
            }
        });

        console.log('\n📊 RESULTS:\n');
        console.log('='.repeat(80));

        if (result.content && result.content.length > 0) {
            const content = result.content[0];
            if (content.type === 'text') {
                console.log(content.text);
            }
        }

        console.log('='.repeat(80));

        // Check for semantic validation warnings
        const resultText = JSON.stringify(result, null, 2);

        console.log('\n🔍 SEMANTIC VALIDATION CHECK:\n');

        if (resultText.includes('semantic') || resultText.includes('Semantic')) {
            console.log('✅ Semantic validation detected in output!');
        } else {
            console.log('⚠️  No semantic validation warnings found in output');
        }

        if (resultText.includes('Code') && resultText.includes('warning')) {
            console.log('✅ Code node warnings detected!');
        } else {
            console.log('⚠️  No Code node warnings found');
        }

        if (resultText.includes('built-in') || resultText.includes('native')) {
            console.log('✅ Suggestions for built-in nodes detected!');
        } else {
            console.log('⚠️  No suggestions for built-in nodes found');
        }

        await client.close();
        console.log('\n✅ Test complete!');

    } catch (error) {
        console.error('\n❌ Error during test:', error);
        console.error('Error details:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        serverProcess.kill();
    }
}

// Run the test
testSemanticValidation().catch(console.error);
