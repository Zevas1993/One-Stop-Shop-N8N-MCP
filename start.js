#!/usr/bin/env node
/**
 * n8n MCP Server - Smart Launcher
 * 
 * This script automatically handles all the complexity:
 * - Checks Node.js version
 * - Validates environment
 * - Uses pre-built dist/ or falls back to ts-node
 * - Sets sensible defaults
 * - Provides clear error messages
 * 
 * Usage: node start.js [--http] [--port=3001]
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  minNodeVersion: 18,
  distMain: path.join(__dirname, 'dist', 'main.js'),
  srcMain: path.join(__dirname, 'src', 'main.ts'),
  defaultEnv: {
    N8N_AUTO_SYNC: 'false',
    ALLOW_COMMUNITY_NODES: 'false',
    NODE_OPTIONS: '--max-old-space-size=4096',
  }
};

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

// ============================================================================
// PRE-FLIGHT CHECKS
// ============================================================================

function checkNodeVersion() {
  const version = parseInt(process.version.slice(1).split('.')[0]);
  if (version < CONFIG.minNodeVersion) {
    logError(`Node.js ${CONFIG.minNodeVersion}+ required. You have ${process.version}`);
    logError(`Please upgrade: https://nodejs.org/`);
    process.exit(1);
  }
  logSuccess(`Node.js ${process.version}`);
}

function checkDistExists() {
  if (fs.existsSync(CONFIG.distMain)) {
    const stats = fs.statSync(CONFIG.distMain);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    
    if (ageHours < 24 * 7) { // Less than a week old
      logSuccess(`Pre-built distribution found (${Math.round(ageHours)}h old)`);
      return true;
    } else {
      logWarning(`Pre-built distribution is ${Math.round(ageHours / 24)} days old`);
      return true; // Still usable
    }
  }
  return false;
}

function checkTsNodeAvailable() {
  try {
    require.resolve('ts-node');
    logSuccess('ts-node available for fallback');
    return true;
  } catch (e) {
    return false;
  }
}

function checkDependencies() {
  const packageJson = path.join(__dirname, 'package.json');
  const nodeModules = path.join(__dirname, 'node_modules');
  
  if (!fs.existsSync(nodeModules)) {
    logWarning('node_modules not found - running npm install...');
    try {
      execSync('npm install', { 
        cwd: __dirname, 
        stdio: 'inherit',
        timeout: 300000 // 5 minutes
      });
      logSuccess('Dependencies installed');
    } catch (e) {
      logError('Failed to install dependencies. Run: npm install');
      process.exit(1);
    }
  } else {
    logSuccess('Dependencies installed');
  }
}

function setDefaultEnv() {
  for (const [key, value] of Object.entries(CONFIG.defaultEnv)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  
  // Log important settings
  if (!process.env.N8N_API_KEY) {
    logWarning('N8N_API_KEY not set - some features will be limited');
  }
}

// ============================================================================
// STARTUP STRATEGIES
// ============================================================================

function startWithDist(args) {
  logStep('START', 'Running from pre-built distribution...');
  
  const child = spawn('node', [CONFIG.distMain, ...args], {
    stdio: 'inherit',
    env: process.env,
    cwd: __dirname
  });
  
  child.on('error', (err) => {
    logError(`Failed to start: ${err.message}`);
    logWarning('Trying fallback to ts-node...');
    startWithTsNode(args);
  });
  
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function startWithTsNode(args) {
  logStep('START', 'Running with ts-node (transpile-only)...');
  
  const tsNodeArgs = [
    '--transpile-only',
    CONFIG.srcMain,
    ...args
  ];
  
  // Try to find ts-node
  let tsNodePath;
  try {
    tsNodePath = require.resolve('ts-node/dist/bin.js');
  } catch (e) {
    // Fallback to npx
    const child = spawn('npx', ['ts-node', ...tsNodeArgs], {
      stdio: 'inherit',
      env: process.env,
      cwd: __dirname,
      shell: true
    });
    
    child.on('exit', (code) => process.exit(code || 0));
    return;
  }
  
  const child = spawn('node', [tsNodePath, ...tsNodeArgs], {
    stdio: 'inherit',
    env: process.env,
    cwd: __dirname
  });
  
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}              ${colors.bright}n8n Co-Pilot MCP Server${colors.reset}                     ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}                    Smart Launcher                         ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  // Get args (skip node and script name)
  const args = process.argv.slice(2);
  
  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node start.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --http          Start in HTTP mode (for Open WebUI)');
    console.log('  --port=PORT     Set HTTP port (default: 3001)');
    console.log('  --help, -h      Show this help');
    console.log('');
    console.log('Environment Variables:');
    console.log('  N8N_API_URL     n8n instance URL (default: http://localhost:5678)');
    console.log('  N8N_API_KEY     n8n API key (required for most features)');
    console.log('  OLLAMA_URL      Ollama URL (default: http://localhost:11434)');
    console.log('  AUTH_TOKEN      Authentication token for HTTP mode');
    console.log('');
    process.exit(0);
  }
  
  // Pre-flight checks
  logStep('CHECK', 'Running pre-flight checks...');
  console.log('');
  
  checkNodeVersion();
  checkDependencies();
  setDefaultEnv();
  
  const hasDistBuild = checkDistExists();
  const hasTsNode = checkTsNodeAvailable();
  
  console.log('');
  
  // Decide startup strategy
  if (hasDistBuild) {
    startWithDist(args);
  } else if (hasTsNode) {
    logWarning('No pre-built distribution - using ts-node');
    startWithTsNode(args);
  } else {
    logError('No way to start the server!');
    logError('Please run: npm run build');
    process.exit(1);
  }
}

// Handle errors gracefully
process.on('uncaughtException', (err) => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logError(`Unexpected error: ${err}`);
  process.exit(1);
});

main();
