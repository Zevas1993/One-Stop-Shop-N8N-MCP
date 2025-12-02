const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(n8nUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path,
      method,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function analyzeWorkflow() {
  try {
    console.log('📥 Fetching workflow from n8n API...\n');
    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status !== 200) {
      console.error('❌ Failed to fetch workflow:', result.status);
      console.error(result.data);
      return;
    }

    // Handle both wrapped and unwrapped responses
    const workflow = result.data.data || result.data;
    console.log('✅ Workflow fetched successfully\n');

    // ============ ANALYSIS 1: NODE INTEGRITY CHECK ============
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 1: NODE INTEGRITY CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      console.error('❌ CRITICAL: nodes is not an array');
      return;
    }

    console.log(`Total nodes: ${workflow.nodes.length}\n`);

    let nodeIssues = [];
    workflow.nodes.forEach((node, idx) => {
      console.log(`[${idx}] ${node.name} (${node.type})`);

      // Check required fields
      if (!node.id) nodeIssues.push(`Node ${idx} (${node.name}): Missing id`);
      if (!node.type) nodeIssues.push(`Node ${idx}: Missing type`);
      if (!node.position || !Array.isArray(node.position)) {
        nodeIssues.push(`Node ${idx} (${node.name}): Invalid position`);
      }
      if (node.typeVersion === undefined) {
        nodeIssues.push(`Node ${idx} (${node.name}): Missing typeVersion`);
      }

      // Check parameters structure
      if (node.parameters && typeof node.parameters !== 'object') {
        nodeIssues.push(`Node ${idx} (${node.name}): parameters is not an object`);
      }

      // Check for suspicious parameter values
      if (node.parameters) {
        checkParameterIssues(node, nodeIssues);
      }

      console.log(`  └─ position: [${node.position?.[0]}, ${node.position?.[1]}], typeVersion: ${node.typeVersion}`);
    });

    if (nodeIssues.length > 0) {
      console.log('\n⚠️  NODE ISSUES FOUND:');
      nodeIssues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('\n✅ All nodes have valid structure');
    }

    // ============ ANALYSIS 2: CONNECTION INTEGRITY CHECK ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 2: CONNECTION INTEGRITY CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (!workflow.connections || typeof workflow.connections !== 'object') {
      console.error('❌ CRITICAL: connections is not an object');
      return;
    }

    const nodeNames = workflow.nodes.map(n => n.name);
    let connectionIssues = [];
    let totalConnections = 0;

    console.log(`Total connection objects: ${Object.keys(workflow.connections).length}\n`);

    for (const [sourceName, connObj] of Object.entries(workflow.connections)) {
      if (!nodeNames.includes(sourceName)) {
        connectionIssues.push(`Connection references non-existent node: "${sourceName}"`);
        continue;
      }

      console.log(`${sourceName}:`);

      if (connObj.main && Array.isArray(connObj.main)) {
        connObj.main.forEach((outputConnections, outputIdx) => {
          if (!Array.isArray(outputConnections)) {
            connectionIssues.push(`  ${sourceName}.main[${outputIdx}] is not an array`);
            return;
          }

          if (outputConnections.length === 0) {
            console.log(`  └─ main[${outputIdx}]: [] (empty - output disconnected)`);
            totalConnections++;
          } else {
            outputConnections.forEach((conn, connIdx) => {
              console.log(`  └─ main[${outputIdx}][${connIdx}]: → ${conn.node || 'UNNAMED'}`);

              if (!conn.node || typeof conn.node !== 'string') {
                connectionIssues.push(`  ${sourceName}.main[${outputIdx}][${connIdx}]: Invalid connection object (missing node name)`);
              }
              if (!nodeNames.includes(conn.node)) {
                connectionIssues.push(`  ${sourceName} → ${conn.node}: Target node does not exist`);
              }
              totalConnections++;
            });
          }
        });
      }

      if (connObj.ai_tool && Array.isArray(connObj.ai_tool)) {
        console.log(`  └─ ai_tool: ${connObj.ai_tool.length} tool(s)`);
        connObj.ai_tool.forEach((toolConn, idx) => {
          if (!toolConn.node) {
            connectionIssues.push(`  ${sourceName}.ai_tool[${idx}]: Missing node reference`);
          }
          totalConnections++;
        });
      }
      if (connObj.ai_languageModel && Array.isArray(connObj.ai_languageModel)) {
        console.log(`  └─ ai_languageModel: ${connObj.ai_languageModel.length}`);
        totalConnections++;
      }
      if (connObj.ai_memory && Array.isArray(connObj.ai_memory)) {
        console.log(`  └─ ai_memory: ${connObj.ai_memory.length}`);
        totalConnections++;
      }
    }

    console.log(`\nTotal connections mapped: ${totalConnections}`);

    if (connectionIssues.length > 0) {
      console.log('\n⚠️  CONNECTION ISSUES FOUND:');
      connectionIssues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('✅ All connections are valid');
    }

    // ============ ANALYSIS 3: WORKFLOW METADATA CHECK ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 3: WORKFLOW METADATA & FORBIDDEN FIELDS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const forbiddenFields = [
      'id', 'createdAt', 'updatedAt', 'active', 'tags',
      'versionId', 'triggerCount', 'shared', 'isArchived', 'meta'
    ];

    const presentForbidden = forbiddenFields.filter(field => field in workflow);
    if (presentForbidden.length > 0) {
      console.log('⚠️  FORBIDDEN FIELDS DETECTED:');
      presentForbidden.forEach(field => {
        console.log(`  • ${field}: ${JSON.stringify(workflow[field])}`);
      });
    } else {
      console.log('✅ No forbidden fields present');
    }

    console.log('\nWorkflow metadata:');
    console.log(`  • name: "${workflow.name}"`);
    console.log(`  • active: ${workflow.active || false}`);
    console.log(`  • versionId: ${workflow.versionId || 'N/A'}`);
    console.log(`  • updatedAt: ${workflow.updatedAt || 'N/A'}`);

    // ============ ANALYSIS 4: EXPRESSION SYNTAX CHECK ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 4: EXPRESSION SYNTAX CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    let expressionIssues = [];
    const invalidPatterns = [
      { pattern: /\$fromAI\(/, description: '$fromAI() - invalid syntax' },
      { pattern: /\$nodeInputData/, description: '$nodeInputData - deprecated syntax' },
      { pattern: /\bif\s*\(.*\)\s*\{/, description: 'Direct JavaScript - should use expression syntax' }
    ];

    workflow.nodes.forEach((node, idx) => {
      if (!node.parameters) return;
      checkExpressions(node.parameters, node.name, invalidPatterns, expressionIssues);
    });

    if (expressionIssues.length > 0) {
      console.log('⚠️  EXPRESSION ISSUES FOUND:');
      expressionIssues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('✅ No suspicious expression patterns found');
    }

    // ============ ANALYSIS 5: AI NODE CONFIGURATION ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 5: AI NODE CONFIGURATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const aiNodes = workflow.nodes.filter(n =>
      n.type.includes('agent') || n.type.includes('languageModel') ||
      n.type.includes('textClassifier') || n.type.includes('openAi')
    );

    console.log(`Found ${aiNodes.length} AI nodes:\n`);
    aiNodes.forEach(node => {
      console.log(`${node.name} (${node.type})`);

      // Check for resource/model configuration
      if (node.parameters && node.parameters.model) {
        console.log(`  └─ model: ${node.parameters.model}`);
      }
      if (node.parameters && node.parameters.resource) {
        console.log(`  └─ resource: ${node.parameters.resource}`);
      }
      if (node.parameters && node.parameters.nApiKey) {
        console.log(`  └─ API key configured: ${typeof node.parameters.nApiKey}`);
      }
    });

    // ============ ANALYSIS 6: SAVE WORKFLOW FOR INSPECTION ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ANALYSIS 6: SAVING DIAGNOSTIC FILES');
    console.log('═══════════════════════════════════════════════════════════\n');

    fs.writeFileSync(
      'deep-dive-workflow-complete.json',
      JSON.stringify(workflow, null, 2)
    );
    console.log('✅ Saved: deep-dive-workflow-complete.json');

    // Save a cleaned version
    const cleanedWorkflow = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      staticData: workflow.staticData || {}
    };
    fs.writeFileSync(
      'deep-dive-workflow-cleaned.json',
      JSON.stringify(cleanedWorkflow, null, 2)
    );
    console.log('✅ Saved: deep-dive-workflow-cleaned.json');

    // ============ FINAL SUMMARY ============
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('FINAL DIAGNOSIS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allIssues = [...nodeIssues, ...connectionIssues, ...expressionIssues];

    if (allIssues.length === 0 && presentForbidden.length === 0) {
      console.log('✅ WORKFLOW STRUCTURE IS VALID');
      console.log('');
      console.log('The workflow JSON is structurally sound with:');
      console.log(`  • ${workflow.nodes.length} nodes - all properly configured`);
      console.log(`  • ${Object.keys(workflow.connections).length} connection objects - all valid`);
      console.log('  • No invalid expressions or syntax');
      console.log('  • No forbidden fields');
      console.log('');
      console.log('⚠️  IF UI STILL NOT RENDERING:');
      console.log('  1. Check n8n browser console (F12) for JavaScript errors');
      console.log('  2. Check n8n server logs for parsing errors');
      console.log('  3. Try hard refresh (Ctrl+F5) in browser');
      console.log('  4. Verify n8n database has the latest workflow version');
    } else {
      console.log('❌ WORKFLOW HAS STRUCTURAL ISSUES');
      console.log(`\nTotal issues found: ${allIssues.length}`);
      if (presentForbidden.length > 0) {
        console.log(`Forbidden fields: ${presentForbidden.length}`);
      }
    }

  } catch (error) {
    console.error('Error during analysis:', error.message);
  }
}

function checkParameterIssues(params, nodeName, patterns, issues) {
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      patterns.forEach(p => {
        if (p.pattern.test(value)) {
          issues.push(`${nodeName}.${key}: ${p.description}`);
        }
      });
    } else if (value && typeof value === 'object') {
      checkParameterIssues(value, nodeName, patterns, issues);
    }
  }
}

function checkExpressions(params, nodeName, patterns, issues) {
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      patterns.forEach(p => {
        if (p.pattern.test(value)) {
          issues.push(`${nodeName}.${key}: ${p.description} - "${value.substring(0, 80)}..."`);
        }
      });
    } else if (value && typeof value === 'object') {
      checkExpressions(value, nodeName, patterns, issues);
    }
  }
}

analyzeWorkflow();
