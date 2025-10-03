#!/usr/bin/env node

import { N8NDocumentationMCPServer } from './server';
import { SimpleConsolidatedMCPServer } from './server-simple-consolidated';
// Simple auto server removed - use main server instead
import { logger } from '../utils/logger';
// import { GitHubMonitor } from '../services/github-monitor';
// import { getGitHubConfig, isGitHubConfigured } from '../config/github-config';

// Add error details to stderr for Claude Desktop debugging
process.on('uncaughtException', (error) => {
  if (process.env.MCP_MODE !== 'stdio') {
    console.error('Uncaught Exception:', error);
  }
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (process.env.MCP_MODE !== 'stdio') {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

async function main() {
  let mode = process.env.MCP_MODE || 'consolidated';
  
  try {
    // Simple auto mode removed - use main server instead
    if (mode === 'simple-auto') {
      logger.info('[MCP] Simple auto mode deprecated - using main server');
      mode = 'stdio';
    }
    
    // Only show debug messages in HTTP mode to avoid corrupting stdio communication
    if (mode === 'http') {
      console.error(`Starting n8n Documentation MCP Server in ${mode} mode...`);
      console.error('Current directory:', process.cwd());
      console.error('Node version:', process.version);
    } else if (mode === 'consolidated') {
      // Removed console output to prevent JSON-RPC parsing errors
    }
    
    if (mode === 'http') {
      // Check if we should use the fixed implementation
      if (process.env.USE_FIXED_HTTP === 'true') {
        // Use the fixed HTTP implementation that bypasses StreamableHTTPServerTransport issues
        const { startFixedHTTPServer } = await import('../http-server');
        await startFixedHTTPServer();
      } else {
        // HTTP mode - for remote deployment with single-session architecture
        const { SingleSessionHTTPServer } = await import('../http-server-single-session');
        const server = new SingleSessionHTTPServer();
        
        // Graceful shutdown handlers
        const shutdown = async () => {
          await server.shutdown();
          process.exit(0);
        };
        
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        
        await server.start();
      }
    } else if (mode === 'consolidated') {
      // Consolidated mode - streamlined 8-tool interface
      const server = new SimpleConsolidatedMCPServer();
      await server.run();
    } else {
      // Stdio mode - for local Claude Desktop (legacy 60+ tools)
      const server = new N8NDocumentationMCPServer();
      await server.run();
    }
    
    // Initialize GitHub monitoring if configured
    // Temporarily disabled for build
    /*
    if (isGitHubConfigured()) {
      const githubConfig = getGitHubConfig();
      if (githubConfig.monitoring.enabled) {
        try {
          const monitor = new GitHubMonitor({
            token: githubConfig.token!,
            repository: githubConfig.repository,
            branch: githubConfig.branch,
            checkInterval: githubConfig.monitoring.checkInterval,
            enabled: true
          });
          
          monitor.start();
          
          if (mode === 'http') {
            console.error('✅ GitHub monitoring started');
            console.error(`   Repository: ${githubConfig.repository}`);
            console.error(`   Branch: ${githubConfig.branch}`);
            console.error(`   Check interval: ${githubConfig.monitoring.checkInterval}`);
          }
          
          logger.info('GitHub monitoring started', {
            repository: githubConfig.repository,
            branch: githubConfig.branch,
            interval: githubConfig.monitoring.checkInterval
          });
        } catch (error) {
          logger.error('Failed to start GitHub monitoring:', error);
        }
      }
    }
    */
  } catch (error) {
    // In stdio mode, we cannot output to console at all
    if (mode !== 'stdio') {
      console.error('Failed to start MCP server:', error);
      logger.error('Failed to start MCP server', error);
      
      // Provide helpful error messages
      if (error instanceof Error && error.message.includes('nodes.db not found')) {
        console.error('\nTo fix this issue:');
        console.error('1. cd to the n8n-mcp directory');
        console.error('2. Run: npm run build');
        console.error('3. Run: npm run rebuild');
      } else if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
        console.error('\nTo fix this Node.js version mismatch:');
        console.error('1. cd to the n8n-mcp directory');
        console.error('2. Run: npm rebuild better-sqlite3');
        console.error('3. If that doesn\'t work, try: rm -rf node_modules && npm install');
      }
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}