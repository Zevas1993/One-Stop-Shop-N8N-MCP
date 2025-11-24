#!/usr/bin/env node

/**
 * External Agent Workflow Fix Test
 * Simulates an AI agent interacting with the MCP server
 * to understand and fix the Outlook AI Assistant workflow
 */

const readline = require('readline');
const net = require('net');

class ExternalAgent {
  constructor() {
    this.memories = {
      workflowAnalysis: [],
      nodeRecommendations: [],
      potentialIssues: [],
      fixStrategy: []
    };
  }

  async analyzeWorkflow() {
    console.log('\n=== EXTERNAL AGENT: OUTLOOK AI WORKFLOW ANALYSIS ===\n');
    console.log('[Agent] Starting analysis of "Ultimate Outlook AI Assistant" workflow...\n');

    // Step 1: Analyze what went wrong
    await this.step1_IdentifyIssues();

    // Step 2: Query MCP for available nodes
    await this.step2_DiscoverNodes();

    // Step 3: Check for patterns
    await this.step3_FindPatterns();

    // Step 4: Plan the fix
    await this.step4_PlanFix();

    // Step 5: Generate recommendations
    await this.step5_GenerateRecommendations();
  }

  async step1_IdentifyIssues() {
    console.log('[Agent] Step 1: Identifying Issues');
    console.log('  The workflow is named "Ultimate Outlook AI Assistant - Open WebUI (Updated via MCP)"');
    console.log('  It was recently updated via MCP, which means:');
    console.log('    ✓ MCP server successfully connected to n8n');
    console.log('    ✓ Changes were applied to the workflow');
    console.log('    ✓ But something is not working correctly\n');

    console.log('  Likely issues:');
    console.log('    • Node types might be incorrect');
    console.log('    • Connections might be broken');
    console.log('    • Required configuration missing');
    console.log('    • Version incompatibilities\n');

    this.memories.potentialIssues.push(
      'Node type validation',
      'Connection structure',
      'Configuration completeness',
      'Node versioning'
    );
  }

  async step2_DiscoverNodes() {
    console.log('[Agent] Step 2: Discovering Available Nodes for Outlook/AI Workflows');
    console.log('  Querying MCP database for relevant nodes...\n');

    const relevantNodes = {
      'Email/Outlook Operations': [
        'n8n-nodes-base.microsoftOutlook',
        'n8n-nodes-base.microsoftOutlookTrigger',
        'n8n-nodes-base.gmail',
        'n8n-nodes-base.emailReadImap',
        'n8n-nodes-base.emailSendSmtp'
      ],
      'AI/LLM Nodes': [
        '@n8n/n8n-nodes-langchain.agent',
        '@n8n/n8n-nodes-langchain.chainLlm',
        '@n8n/n8n-nodes-langchain.openaiAssistant',
        'n8n-nodes-base.openai',
        '@n8n/n8n-nodes-langchain.vectorStoreQaRetriever'
      ],
      'Triggers': [
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.microsoftOutlookTrigger',
        'n8n-nodes-base.manualTrigger'
      ],
      'Utility': [
        'n8n-nodes-base.set',
        'n8n-nodes-base.code',
        'n8n-nodes-base.merge',
        'n8n-nodes-base.respondToWebhook'
      ]
    };

    for (const [category, nodes] of Object.entries(relevantNodes)) {
      console.log(`  ${category}:`);
      nodes.forEach(n => console.log(`    ✓ ${n}`));
      console.log();
    }

    this.memories.nodeRecommendations = relevantNodes;
  }

  async step3_FindPatterns() {
    console.log('[Agent] Step 3: Understanding AI + Email Workflow Patterns');
    console.log('  Based on available nodes, optimal patterns for Outlook AI Assistant:\n');

    const patterns = {
      'Minimal Pattern (3 nodes)': {
        description: 'Trigger → AI Process → Respond',
        nodes: [
          'Webhook (receive email trigger)',
          'LangChain Agent (process with AI)',
          'Respond to Webhook (send response)'
        ],
        connections: [
          'Webhook → Agent',
          'Agent → Respond'
        ]
      },
      'Standard Pattern (5-6 nodes)': {
        description: 'Trigger → Prepare → AI Process → Format → Send → Respond',
        nodes: [
          'Outlook Trigger (email received)',
          'Set (extract/prepare data)',
          'LangChain Agent (AI processing)',
          'Microsoft Outlook (send response)',
          'Set (format response)',
          'Respond to Webhook (acknowledge)'
        ],
        connections: [
          'Outlook Trigger → Set 1',
          'Set 1 → Agent',
          'Agent → Outlook Send',
          'Outlook Send → Set 2',
          'Set 2 → Respond'
        ]
      },
      'Advanced Pattern (7+ nodes)': {
        description: 'With context memory and multiple AI chains',
        nodes: [
          'Outlook Trigger',
          'Code (extract context)',
          'Vector Store (retrieve context)',
          'LangChain Agent',
          'Code (format response)',
          'Microsoft Outlook',
          'MongoDB (save for history)',
          'Respond to Webhook'
        ]
      }
    };

    for (const [pattern, details] of Object.entries(patterns)) {
      console.log(`  ${pattern}`);
      console.log(`    Description: ${details.description}`);
      console.log(`    Nodes: ${details.nodes.length}`);
      details.nodes.slice(0, 3).forEach(n => console.log(`      • ${n}`));
      if (details.nodes.length > 3) console.log(`      ... and ${details.nodes.length - 3} more`);
      console.log();
    }

    this.memories.workflowAnalysis.push('Standard pattern most reliable for Outlook AI');
  }

  async step4_PlanFix() {
    console.log('[Agent] Step 4: Planning the Fix\n');

    const fixSteps = [
      {
        step: 1,
        action: 'Validate Node Types',
        details: [
          'Ensure all node types use full names with package prefix',
          'Check: Not "outlook" but "n8n-nodes-base.microsoftOutlook"',
          'Check: Not "webhook" but "n8n-nodes-base.webhook"'
        ]
      },
      {
        step: 2,
        action: 'Verify Connections',
        details: [
          'Ensure no empty connections object',
          'Verify connections use NODE NAMES not IDs',
          'Check format: connections: { "NodeName": { "main": [[{ "node": "TargetName", ... }]] } }'
        ]
      },
      {
        step: 3,
        action: 'Check typeVersion',
        details: [
          'Versioned nodes must specify typeVersion',
          'Outlook nodes typically use typeVersion 1 or 2',
          'LangChain nodes specify their version'
        ]
      },
      {
        step: 4,
        action: 'Validate Credentials',
        details: [
          'Outlook node needs credentials configured',
          'OpenAI/LLM nodes need API keys',
          'Webhook needs basic configuration'
        ]
      },
      {
        step: 5,
        action: 'Run MCP Validation',
        details: [
          'Use validate_workflow MCP tool',
          'Check workflow structure',
          'Check node compatibility'
        ]
      }
    ];

    fixSteps.forEach(s => {
      console.log(`  Step ${s.step}: ${s.action}`);
      s.details.forEach(d => console.log(`    • ${d}`));
      console.log();
    });

    this.memories.fixStrategy = fixSteps;
  }

  async step5_GenerateRecommendations() {
    console.log('[Agent] Step 5: Recommendations for Fixing the Workflow\n');

    console.log('📋 RECOMMENDED WORKFLOW STRUCTURE:\n');

    const recommendedWorkflow = {
      name: 'Ultimate Outlook AI Assistant - Open WebUI (Updated via MCP)',
      nodes: [
        {
          name: 'Email Trigger',
          type: 'n8n-nodes-base.microsoftOutlookTrigger',
          typeVersion: 1,
          description: 'Triggers when new email arrives in Outlook',
          config: {
            resource: 'message',
            operation: 'received',
            includeAttachments: true
          }
        },
        {
          name: 'Prepare Request',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          description: 'Extract and structure email data',
          config: {
            assignment: [
              { name: 'emailFrom', value: '={{ $json.from }}' },
              { name: 'emailSubject', value: '={{ $json.subject }}' },
              { name: 'emailBody', value: '={{ $json.bodyText }}' }
            ]
          }
        },
        {
          name: 'AI Assistant',
          type: '@n8n/n8n-nodes-langchain.agent',
          typeVersion: 1,
          description: 'Process email with AI/LLM',
          config: {
            model: 'gpt-4',
            prompt: 'You are an Outlook email assistant. Analyze this email and provide a helpful response.'
          }
        },
        {
          name: 'Send Response',
          type: 'n8n-nodes-base.microsoftOutlook',
          typeVersion: 1,
          operation: 'sendMessage',
          description: 'Send AI response back via Outlook',
          config: {
            to: '={{ $json.emailFrom }}',
            subject: '={{ $json.emailSubject }}'
          }
        },
        {
          name: 'Return Success',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1,
          description: 'Acknowledge to caller'
        }
      ],
      connections: {
        'Email Trigger': {
          main: [[{ node: 'Prepare Request', type: 'main', index: 0 }]]
        },
        'Prepare Request': {
          main: [[{ node: 'AI Assistant', type: 'main', index: 0 }]]
        },
        'AI Assistant': {
          main: [[{ node: 'Send Response', type: 'main', index: 0 }]]
        },
        'Send Response': {
          main: [[{ node: 'Return Success', type: 'main', index: 0 }]]
        }
      }
    };

    console.log('Workflow Structure:');
    console.log(`  Name: ${recommendedWorkflow.name}`);
    console.log(`  Nodes: ${recommendedWorkflow.nodes.length}`);
    recommendedWorkflow.nodes.forEach((n, i) => {
      console.log(`    ${i + 1}. ${n.name} (${n.type})`);
      console.log(`       └─ ${n.description}`);
    });

    console.log('\nConnections:');
    console.log('  Email Trigger → Prepare Request');
    console.log('  Prepare Request → AI Assistant');
    console.log('  AI Assistant → Send Response');
    console.log('  Send Response → Return Success');

    console.log('\n✅ NEXT STEPS TO FIX THE WORKFLOW:\n');
    console.log('1. Use the n8n_update_partial_workflow MCP tool');
    console.log('2. Fix node types using correct full names');
    console.log('3. Fix connections using node NAMES not IDs');
    console.log('4. Add missing typeVersion fields');
    console.log('5. Validate with validate_workflow MCP tool');
    console.log('6. Deploy and test');

    console.log('\n=== ANALYSIS COMPLETE ===\n');
  }

  printMemories() {
    console.log('\n[Agent Memory Summary]');
    console.log(`  Potential Issues Found: ${this.memories.potentialIssues.length}`);
    console.log(`  Node Recommendations: ${Object.keys(this.memories.nodeRecommendations).length} categories`);
    console.log(`  Fix Strategy Steps: ${this.memories.fixStrategy.length}`);
    console.log(`  Analysis Insights: ${this.memories.workflowAnalysis.length}\n`);
  }
}

// Run the agent
async function main() {
  const agent = new ExternalAgent();
  await agent.analyzeWorkflow();
  agent.printMemories();
}

main().catch(err => {
  console.error('Agent encountered error:', err);
  process.exit(1);
});
