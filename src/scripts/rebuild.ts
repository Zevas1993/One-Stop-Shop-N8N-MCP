#!/usr/bin/env node
/**
 * Copyright (c) 2024 AiAdvisors Romuald Czlonkowski
 * Licensed under the Sustainable Use License v1.0
 */
import { createDatabaseAdapter } from '../database/database-adapter';
import { NodeParser } from '../parsers/node-parser';
import { DocsMapper } from '../mappers/docs-mapper';
import { NodeRepository } from '../database/node-repository';
import { NodeSourceExtractor } from '../utils/node-source-extractor';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function rebuild() {
  console.log('🔄 Rebuilding n8n node database...\n');
  
  const db = await createDatabaseAdapter('./data/nodes.db');
  const parser = new NodeParser();
  const mapper = new DocsMapper();
  const repository = new NodeRepository(db);
  const extractor = new NodeSourceExtractor();
  
  // Initialize database
  const schema = fs.readFileSync(path.join(__dirname, '../../src/database/schema.sql'), 'utf8');
  db.exec(schema);
  
  // Clear existing data
  db.exec('DELETE FROM nodes');
  console.log('🗑️  Cleared existing data\n');
  
  // Check if we're running in Docker environment with mounted n8n container
  const dockerVolumePaths = [
    process.env.N8N_MODULES_PATH || '/n8n-modules',
    process.env.N8N_CUSTOM_PATH || '/n8n-custom',
  ];
  
  let useDockerExtraction = false;
  for (const volumePath of dockerVolumePaths) {
    try {
      fs.accessSync(volumePath);
      console.log(`✅ Found Docker volume: ${volumePath}`);
      useDockerExtraction = true;
      break;
    } catch (error) {
      console.log(`❌ Docker volume not accessible: ${volumePath}`);
    }
  }
  
  let nodes: Array<{packageName: string, nodeName: string, NodeClass: any}> = [];
  
  if (useDockerExtraction) {
    console.log('🐳 Using Docker extraction method...\n');
    nodes = await extractNodesFromDocker(extractor, dockerVolumePaths);
  } else {
    console.log('📦 Using local npm package extraction (fallback)...\n');
    // Fallback to npm package loading if Docker volumes not available
    const { N8nNodeLoader } = await import('../loaders/node-loader');
    const loader = new N8nNodeLoader();
    nodes = await loader.loadAllNodes();
  }
  
  console.log(`📦 Loaded ${nodes.length} nodes from ${useDockerExtraction ? 'Docker container' : 'local packages'}\n`);
  
  // Statistics
  const stats = {
    successful: 0,
    failed: 0,
    aiTools: 0,
    triggers: 0,
    webhooks: 0,
    withProperties: 0,
    withOperations: 0,
    withDocs: 0
  };
  
  // Process each node
  for (const { packageName, nodeName, NodeClass } of nodes) {
    try {
      // Parse node
      const parsed = parser.parse(NodeClass, packageName);
      
      // Validate parsed data
      if (!parsed.nodeType || !parsed.displayName) {
        throw new Error('Missing required fields');
      }
      
      // Get documentation
      const docs = await mapper.fetchDocumentation(parsed.nodeType);
      parsed.documentation = docs || undefined;
      
      // Save to database
      repository.saveNode(parsed);
      
      // Update statistics
      stats.successful++;
      if (parsed.isAITool) stats.aiTools++;
      if (parsed.isTrigger) stats.triggers++;
      if (parsed.isWebhook) stats.webhooks++;
      if (parsed.properties.length > 0) stats.withProperties++;
      if (parsed.operations.length > 0) stats.withOperations++;
      if (docs) stats.withDocs++;
      
      console.log(`✅ ${parsed.nodeType} [Props: ${parsed.properties.length}, Ops: ${parsed.operations.length}]`);
    } catch (error) {
      stats.failed++;
      console.error(`❌ Failed to process ${nodeName}: ${(error as Error).message}`);
    }
  }
  
  // Validation check
  console.log('\n🔍 Running validation checks...');
  const validationResults = validateDatabase(repository);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total nodes: ${nodes.length}`);
  console.log(`   Successful: ${stats.successful}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   AI Tools: ${stats.aiTools}`);
  console.log(`   Triggers: ${stats.triggers}`);
  console.log(`   Webhooks: ${stats.webhooks}`);
  console.log(`   With Properties: ${stats.withProperties}`);
  console.log(`   With Operations: ${stats.withOperations}`);
  console.log(`   With Documentation: ${stats.withDocs}`);
  
  if (!validationResults.passed) {
    console.log('\n⚠️  Validation Issues:');
    validationResults.issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  console.log('\n✨ Rebuild complete!');
  
  db.close();
}

async function extractNodesFromDocker(extractor: NodeSourceExtractor, dockerVolumePaths: string[]): Promise<Array<{packageName: string, nodeName: string, NodeClass: any}>> {
  const nodes: Array<{packageName: string, nodeName: string, NodeClass: any}> = [];
  
  // Known n8n packages to extract
  const n8nPackages = [
    'n8n-nodes-base',
    '@n8n/n8n-nodes-langchain',
  ];
  
  for (const packageName of n8nPackages) {
    console.log(`📦 Processing package: ${packageName}`);
    
    try {
      // Find package in Docker volumes
      let packagePath = null;
      
      for (const volumePath of dockerVolumePaths) {
        const possiblePaths = [
          path.join(volumePath, packageName),
          path.join(volumePath, 'node_modules', packageName),
          path.join(volumePath, '.pnpm', `${packageName}@*`, 'node_modules', packageName),
        ];
        
        for (const testPath of possiblePaths) {
          try {
            // Use glob pattern to find pnpm packages
            if (testPath.includes('*')) {
              const baseDir = path.dirname(testPath.split('*')[0]);
              try {
                const entries = fs.readdirSync(baseDir);
                for (const entry of entries) {
                  if (entry.includes(packageName.replace('/', '+'))) {
                    const fullPath = path.join(baseDir, entry, 'node_modules', packageName);
                    try {
                      fs.accessSync(fullPath);
                      packagePath = fullPath;
                      break;
                    } catch {}
                  }
                }
              } catch {}
            } else {
              fs.accessSync(testPath);
              packagePath = testPath;
              break;
            }
          } catch {}
        }
        
        if (packagePath) break;
      }
      
      if (!packagePath) {
        console.warn(`⚠️ Package ${packageName} not found in Docker volumes`);
        continue;
      }
      
      console.log(`✅ Found package at: ${packagePath}`);
      
      // Find nodes from package.json
      try {
        const packageJsonPath = path.join(packagePath, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        console.log(`📝 Package version: ${packageJson.version}`);
        
        const nodesList = packageJson.n8n?.nodes || [];
        
        if (Array.isArray(nodesList)) {
          for (const nodePath of nodesList) {
            try {
              const fullPath = path.join(packagePath, nodePath);
              
              // Extract node name from path
              const nodeNameMatch = nodePath.match(/\/([^\/]+)\.node\.(js|ts)$/);
              const nodeName = nodeNameMatch ? nodeNameMatch[1] : path.basename(nodePath, '.node.js');
              
              // Try to require the module to get the NodeClass
              try {
                const nodeModule = require(fullPath);
                const NodeClass = nodeModule.default || nodeModule[nodeName] || Object.values(nodeModule)[0];
                
                if (NodeClass) {
                  nodes.push({ packageName, nodeName, NodeClass });
                  console.log(`  ✓ Loaded ${nodeName} from ${packageName}`);
                } else {
                  // Create a mock NodeClass for nodes we can't load
                  const MockNodeClass = class {
                    description = { displayName: nodeName, name: nodeName };
                    static description = { displayName: nodeName, name: nodeName };
                  };
                  nodes.push({ packageName, nodeName, NodeClass: MockNodeClass });
                  console.log(`  📝 Created mock for ${nodeName} from ${packageName}`);
                }
              } catch (requireError) {
                // If we can't require it, create a basic mock node
                const MockNodeClass = class {
                  description = { displayName: nodeName, name: nodeName };
                  static description = { displayName: nodeName, name: nodeName };
                };
                nodes.push({ packageName, nodeName, NodeClass: MockNodeClass });
                console.log(`  📝 Created mock for ${nodeName} from ${packageName} (require failed)`);
              }
            } catch (error) {
              console.error(`  ✗ Failed to process node ${nodePath}:`, (error as Error).message);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to read package.json for ${packageName}:`, (error as Error).message);
      }
    } catch (error) {
      console.error(`Failed to process package ${packageName}:`, (error as Error).message);
    }
  }
  
  return nodes;
}

function validateDatabase(repository: NodeRepository): { passed: boolean; issues: string[] } {
  const issues = [];
  
  // Check critical nodes
  const criticalNodes = ['n8n-nodes-base.HttpRequest', 'n8n-nodes-base.Code', 'n8n-nodes-base.Webhook', 'n8n-nodes-base.Slack', 'n8n-nodes-base.MySQL', 'n8n-nodes-base.MongoDb'];
  
  for (const nodeType of criticalNodes) {
    const node = repository.getNode(nodeType);
    
    if (!node) {
      issues.push(`Critical node ${nodeType} not found`);
      continue;
    }
    
    if (node.properties.length === 0) {
      issues.push(`Node ${nodeType} has no properties`);
    }
  }
  
  // Check AI tools
  const aiTools = repository.getAITools();
  if (aiTools.length === 0) {
    issues.push('No AI tools found - check detection logic');
  }
  
  return {
    passed: issues.length === 0,
    issues
  };
}

// Run if called directly
if (require.main === module) {
  rebuild().catch(console.error);
}