#!/usr/bin/env node
/**
 * n8n MCP Server - Smart Launcher v2
 * 
 * Improvements over v1:
 * - Auto-loads .env file
 * - Pre-flight connectivity checks
 * - Diagnostic mode (--check)
 * - Better error messages
 * - Graceful degradation status
 * 
 * Usage: 
 *   node start.js [--http] [--port=3001]
 *   node start.js --check    # Diagnose issues
 *   node start.js --setup    # Interactive setup
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  minNodeVersion: 18,
  distMain: path.join(__dirname, 'dist', 'main.js'),
  srcMain: path.join(__dirname, 'src', 'main.ts'),
  envFile: path.join(__dirname, '.env'),
  envExample: path.join(__dirname, '.env.example'),
  defaultEnv: {
    N8N_AUTO_SYNC: 'false',
    ALLOW_COMMUNITY_NODES: 'false',
    NODE_OPTIONS: '--max-old-space-size=4096',
  }
};

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const log = (msg) => console.log(msg);
const logStep = (step, msg) => log(`${colors.cyan}[${step}]${colors.reset} ${msg}`);
const logSuccess = (msg) => log(`${colors.green}  ✓${colors.reset} ${msg}`);
const logWarning = (msg) => log(`${colors.yellow}  ⚠${colors.reset} ${msg}`);
const logError = (msg) => log(`${colors.red}  ✗${colors.reset} ${msg}`);
const logInfo = (msg) => log(`${colors.dim}    ${msg}${colors.reset}`);

// ============================================================================
// ENVIRONMENT LOADING
// ============================================================================

function loadEnvFile() {
  // Try to load .env file manually (no dependency on dotenv)
  if (fs.existsSync(CONFIG.envFile)) {
    try {
      const envContent = fs.readFileSync(CONFIG.envFile, 'utf8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Don't override existing env vars
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function setDefaultEnv() {
  for (const [key, value] of Object.entries(CONFIG.defaultEnv)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ============================================================================
// PRE-FLIGHT CHECKS
// ============================================================================

function checkNodeVersion() {
  const version = parseInt(process.version.slice(1).split('.')[0]);
  if (version < CONFIG.minNodeVersion) {
    logError(`Node.js ${CONFIG.minNodeVersion}+ required (you have ${process.version})`);
    logInfo(`Download: https://nodejs.org/`);
    return false;
  }
  logSuccess(`Node.js ${process.version}`);
  return true;
}

function checkEnvFile() {
  if (fs.existsSync(CONFIG.envFile)) {
    logSuccess('.env file found');
    return true;
  } else if (fs.existsSync(CONFIG.envExample)) {
    logWarning('.env file not found');
    logInfo(`Copy .env.example to .env and configure it`);
    return false;
  } else {
    logWarning('No .env file (using defaults)');
    return false;
  }
}

function checkDependencies() {
  const nodeModules = path.join(__dirname, 'node_modules');
  
  if (!fs.existsSync(nodeModules)) {
    logWarning('Dependencies not installed');
    log('');
    logStep('INSTALL', 'Running npm install...');
    try {
      execSync('npm install', { 
        cwd: __dirname, 
        stdio: 'inherit',
        timeout: 300000
      });
      logSuccess('Dependencies installed');
      return true;
    } catch (e) {
      logError('npm install failed');
      logInfo('Try running: npm install');
      return false;
    }
  }
  
  logSuccess('Dependencies installed');
  return true;
}

function checkDistBuild() {
  if (fs.existsSync(CONFIG.distMain)) {
    const stats = fs.statSync(CONFIG.distMain);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    
    if (ageDays < 7) {
      logSuccess(`Pre-built distribution (${Math.round(ageDays * 24)}h old)`);
    } else {
      logWarning(`Pre-built distribution is ${Math.round(ageDays)} days old`);
    }
    return true;
  }
  
  logWarning('No pre-built distribution (will use ts-node)');
  return false;
}

function checkTsNode() {
  try {
    require.resolve('ts-node');
    logSuccess('ts-node available');
    return true;
  } catch (e) {
    logWarning('ts-node not available');
    return false;
  }
}

// ============================================================================
// CONNECTIVITY CHECKS
// ============================================================================

function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = client.get(url, { headers, timeout: 5000 }, (res) => {
        resolve({ ok: res.statusCode < 400, status: res.statusCode });
      });
      
      req.on('error', () => resolve({ ok: false, status: 0 }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0 });
      });
    } catch (e) {
      resolve({ ok: false, status: 0 });
    }
  });
}

async function checkN8nConnectivity() {
  const url = process.env.N8N_API_URL || 'http://localhost:5678';
  const apiKey = process.env.N8N_API_KEY || '';
  
  if (!apiKey) {
    logWarning(`n8n API key not set`);
    logInfo(`Set N8N_API_KEY in .env file`);
    return 'no-key';
  }
  
  try {
    const result = await httpGet(`${url}/api/v1/workflows?limit=1`, {
      'X-N8N-API-KEY': apiKey
    });
    
    if (result.status === 401 || result.status === 403) {
      logError(`n8n API key invalid`);
      logInfo(`Check N8N_API_KEY in .env file`);
      return 'invalid-key';
    }
    
    if (result.ok) {
      logSuccess(`n8n connected (${url})`);
      return 'connected';
    }
    
    logWarning(`n8n not reachable (${url})`);
    logInfo(`Make sure n8n is running`);
    return 'unreachable';
    
  } catch (e) {
    logWarning(`n8n not reachable (${url})`);
    return 'unreachable';
  }
}

async function checkOllamaConnectivity() {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  try {
    const result = await httpGet(`${url}/api/tags`);
    
    if (result.ok) {
      logSuccess(`Ollama connected (${url})`);
      return 'connected';
    }
    
    logWarning(`Ollama not available (LLM features disabled)`);
    logInfo(`Install from: https://ollama.ai`);
    return 'unreachable';
    
  } catch (e) {
    logWarning(`Ollama not available (LLM features disabled)`);
    return 'unreachable';
  }
}

// ============================================================================
// DIAGNOSTIC MODE
// ============================================================================

async function runDiagnostics() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}              ${colors.bright}n8n MCP Server - Diagnostics${colors.reset}                 ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  const results = {
    node: false,
    env: false,
    deps: false,
    build: false,
    tsNode: false,
    n8n: 'unknown',
    ollama: 'unknown'
  };
  
  // Basic checks
  logStep('SYSTEM', 'Checking system requirements...');
  console.log('');
  results.node = checkNodeVersion();
  results.env = checkEnvFile();
  loadEnvFile();
  results.deps = checkDependencies();
  results.build = checkDistBuild();
  results.tsNode = checkTsNode();
  
  // Connectivity checks
  console.log('');
  logStep('CONNECTIVITY', 'Checking external services...');
  console.log('');
  results.n8n = await checkN8nConnectivity();
  results.ollama = await checkOllamaConnectivity();
  
  // Summary
  console.log('');
  console.log(`${colors.cyan}────────────────────────────────────────────────────────────${colors.reset}`);
  console.log('');
  
  const canStart = results.node && results.deps && (results.build || results.tsNode);
  const hasN8n = results.n8n === 'connected';
  const hasOllama = results.ollama === 'connected';
  
  if (canStart && hasN8n) {
    logSuccess(`${colors.bright}Ready to start!${colors.reset}`);
    logInfo('Run: npm start');
  } else if (canStart && !hasN8n) {
    logWarning(`${colors.bright}Can start with limited functionality${colors.reset}`);
    logInfo('n8n connection required for full features');
    logInfo('Run: npm start');
  } else {
    logError(`${colors.bright}Cannot start - fix issues above${colors.reset}`);
  }
  
  if (!hasOllama) {
    logInfo('Ollama optional - LLM features will be disabled');
  }
  
  console.log('');
  
  // Return exit code
  return canStart ? 0 : 1;
}

// ============================================================================
// INTERACTIVE SETUP
// ============================================================================

async function runSetup() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));
  
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}              ${colors.bright}n8n MCP Server - Setup Wizard${colors.reset}                ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  try {
    const n8nUrl = await question(`n8n URL [http://localhost:5678]: `) || 'http://localhost:5678';
    const apiKey = await question(`n8n API Key: `);
    const ollamaUrl = await question(`Ollama URL [http://localhost:11434]: `) || 'http://localhost:11434';
    
    const envContent = `# n8n MCP Server Configuration
# Generated by setup wizard

# n8n Connection
N8N_API_URL=${n8nUrl}
N8N_API_KEY=${apiKey}

# Ollama (optional - for LLM features)
OLLAMA_URL=${ollamaUrl}

# Server settings
PORT=3001
LOG_LEVEL=info

# Safety settings
ALLOW_COMMUNITY_NODES=false
N8N_AUTO_SYNC=false
`;
    
    fs.writeFileSync(CONFIG.envFile, envContent);
    
    console.log('');
    logSuccess('.env file created!');
    logInfo('Run: npm start');
    console.log('');
    
    rl.close();
    return 0;
    
  } catch (e) {
    rl.close();
    logError('Setup failed');
    return 1;
  }
}

// ============================================================================
// STARTUP
// ============================================================================

function startWithDist(args) {
  logStep('START', 'Running from pre-built distribution...');
  console.log('');
  
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
  
  child.on('exit', (code) => process.exit(code || 0));
}

function startWithTsNode(args) {
  logStep('START', 'Running with ts-node...');
  console.log('');
  
  const tsNodeArgs = ['--transpile-only', CONFIG.srcMain, ...args];
  
  // Try to find ts-node
  let tsNodePath;
  try {
    tsNodePath = require.resolve('ts-node/dist/bin.js');
    const child = spawn('node', [tsNodePath, ...tsNodeArgs], {
      stdio: 'inherit',
      env: process.env,
      cwd: __dirname
    });
    child.on('exit', (code) => process.exit(code || 0));
  } catch (e) {
    // Fallback to npx
    const child = spawn('npx', ['ts-node', ...tsNodeArgs], {
      stdio: 'inherit',
      env: process.env,
      cwd: __dirname,
      shell: true
    });
    child.on('exit', (code) => process.exit(code || 0));
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Handle special modes
  if (args.includes('--check') || args.includes('-c')) {
    process.exit(await runDiagnostics());
  }
  
  if (args.includes('--setup') || args.includes('-s')) {
    process.exit(await runSetup());
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}n8n MCP Server${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node start.js [options]

${colors.cyan}Options:${colors.reset}
  --http         Start in HTTP mode (for Open WebUI)
  --port=PORT    Set HTTP port (default: 3001)
  --check, -c    Run diagnostics
  --setup, -s    Interactive setup wizard
  --help, -h     Show this help

${colors.cyan}Examples:${colors.reset}
  node start.js              # Start MCP server
  node start.js --http       # Start HTTP server
  node start.js --check      # Check configuration
  node start.js --setup      # Create .env file

${colors.cyan}Environment:${colors.reset}
  N8N_API_URL    n8n instance URL
  N8N_API_KEY    n8n API key
  OLLAMA_URL     Ollama URL (for LLM features)
`);
    process.exit(0);
  }
  
  // Normal startup
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}              ${colors.bright}n8n Co-Pilot MCP Server${colors.reset}                     ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  // Pre-flight checks
  logStep('CHECK', 'Pre-flight checks...');
  console.log('');
  
  if (!checkNodeVersion()) {
    process.exit(1);
  }
  
  const hasEnv = checkEnvFile();
  if (hasEnv) {
    loadEnvFile();
  }
  setDefaultEnv();
  
  if (!checkDependencies()) {
    process.exit(1);
  }
  
  const hasDist = checkDistBuild();
  const hasTsNode = checkTsNode();
  
  // Quick connectivity check (non-blocking)
  console.log('');
  logStep('CONNECT', 'Checking services...');
  console.log('');
  
  const n8nStatus = await checkN8nConnectivity();
  await checkOllamaConnectivity();
  
  console.log('');
  
  // Warn if n8n not available but continue
  if (n8nStatus !== 'connected') {
    console.log(`${colors.yellow}────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.yellow}  Starting with limited functionality (n8n not connected)${colors.reset}`);
    console.log(`${colors.yellow}────────────────────────────────────────────────────────────${colors.reset}`);
    console.log('');
  }
  
  // Start server
  if (hasDist) {
    startWithDist(args);
  } else if (hasTsNode) {
    startWithTsNode(args);
  } else {
    logError('Cannot start - no build and no ts-node');
    logInfo('Run: npm run build');
    process.exit(1);
  }
}

// Error handlers
process.on('uncaughtException', (err) => {
  logError(`Unexpected error: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logError(`Unexpected error: ${err}`);
  process.exit(1);
});

main();
