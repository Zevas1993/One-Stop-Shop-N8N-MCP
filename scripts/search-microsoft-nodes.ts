#!/usr/bin/env node
/**
 * Search for Microsoft Teams, Outlook, and Office 365 nodes
 */

import { NodeDocumentationService } from '../src/services/node-documentation-service';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'nodes.db');
const service = new NodeDocumentationService(dbPath);

async function main() {
  console.log('🔍 MICROSOFT NODES SEARCH\n');
  console.log('=' .repeat(80));

  // Search patterns
  const searchTerms = [
    'teams',
    'outlook',
    'microsoft',
    'office 365',
    'exchange',
    'calendar',
    'sharepoint'
  ];

  const allResults = new Map<string, any>();

  for (const term of searchTerms) {
    console.log(`\nSearching for: "${term}"...`);
    const results = await service.searchNodes({ query: term });
    results.forEach(node => {
      allResults.set(node.name, node);
    });
    console.log(`Found ${results.length} nodes`);
  }

  console.log('\n' + '=' .repeat(80));
  console.log(`TOTAL UNIQUE MICROSOFT-RELATED NODES: ${allResults.size}\n`);

  // Group by category
  const categories = {
    teams: [] as any[],
    outlook: [] as any[],
    sharepoint: [] as any[],
    calendar: [] as any[],
    office365: [] as any[],
    other: [] as any[]
  };

  allResults.forEach(node => {
    const nameLower = node.name.toLowerCase();
    const displayLower = node.displayName.toLowerCase();

    if (nameLower.includes('teams') || displayLower.includes('teams')) {
      categories.teams.push(node);
    } else if (nameLower.includes('outlook') || displayLower.includes('outlook')) {
      categories.outlook.push(node);
    } else if (nameLower.includes('sharepoint') || displayLower.includes('sharepoint')) {
      categories.sharepoint.push(node);
    } else if (nameLower.includes('calendar') || displayLower.includes('calendar')) {
      categories.calendar.push(node);
    } else if (nameLower.includes('office') || nameLower.includes('365')) {
      categories.office365.push(node);
    } else {
      categories.other.push(node);
    }
  });

  // Print categorized results
  Object.entries(categories).forEach(([category, nodes]) => {
    if (nodes.length > 0) {
      console.log(`\n📦 ${category.toUpperCase()} (${nodes.length} nodes)`);
      console.log('-' .repeat(80));
      nodes.forEach((node: any) => {
        console.log(`\n  ${node.displayName}`);
        console.log(`  ID: ${node.nodeType}`);
        console.log(`  Version: ${node.version}`);
        console.log(`  Package: ${node.packageName}`);
        if (node.description) {
          console.log(`  Description: ${node.description.substring(0, 100)}...`);
        }
      });
    }
  });

  // Get detailed info for key nodes
  console.log('\n\n' + '=' .repeat(80));
  console.log('DETAILED NODE INFORMATION');
  console.log('=' .repeat(80));

  const keyNodes = [
    'n8n-nodes-base.microsoftOutlook',
    'n8n-nodes-base.outlook',
    'n8n-nodes-base.microsoftTeams',
    'n8n-nodes-base.microsoftToDo',
    'n8n-nodes-base.microsoftOutlookTool'
  ];

  for (const nodeName of keyNodes) {
    try {
      const nodeInfo = await service.getNodeInfo(nodeName);
      if (nodeInfo) {
        console.log(`\n\n📋 ${nodeInfo.displayName} (${nodeInfo.nodeType})`);
        console.log('-' .repeat(80));
        console.log(`Version: ${nodeInfo.version}`);
        console.log(`Package: ${nodeInfo.packageName}`);
        console.log(`Description: ${nodeInfo.description}`);

        // Parse properties schema if available
        if (nodeInfo.propertiesSchema) {
          const props = JSON.parse(nodeInfo.propertiesSchema);
          console.log(`\nProperties: ${props.length} total`);

          // Show resources and operations
          const resourceProp = props.find((p: any) => p.name === 'resource');
          if (resourceProp && resourceProp.options) {
            console.log('\nAvailable Resources:');
            resourceProp.options.forEach((opt: any) => {
              console.log(`  - ${opt.name}: ${opt.value}`);
            });
          }

          const operationProp = props.find((p: any) => p.name === 'operation');
          if (operationProp && operationProp.options) {
            console.log('\nAvailable Operations:');
            operationProp.options.forEach((opt: any) => {
              console.log(`  - ${opt.name}: ${opt.value}`);
            });
          }
        }
      }
    } catch (error) {
      console.log(`\n⚠️  Node not found: ${nodeName}`);
    }
  }
}

main().catch(console.error);
