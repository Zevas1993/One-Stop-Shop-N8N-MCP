#!/usr/bin/env node

/**
 * Interactive Setup for n8n MCP Server
 *
 * One command to configure everything:
 * - Detects operating system
 * - Installs dependencies
 * - Builds server and database
 * - Configures Claude Desktop automatically
 * - Tests connection
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const os = require('os');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Parse command line args
const args = process.argv.slice(2);
const forceMode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1];
const skipPrompts = args.includes('--yes') || args.includes('-y');

// Detect OS and Claude Desktop config path
function getClaudeConfigPath() {
  const platform = os.platform();

  if (platform === 'win32') {
    return path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(message) {
  console.log('');
  print(`═══════════════════════════════════════════════`, 'cyan');
  print(`  ${message}`, 'bright');
  print(`═══════════════════════════════════════════════`, 'cyan');
  console.log('');
}

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function confirm(message, defaultValue = true) {
  const suffix = defaultValue ? ' (Y/n)' : ' (y/N)';
  const answer = await question(`${colors.blue}❯${colors.reset} ${message}${suffix}: `);

  if (!answer) return defaultValue;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function prompt(message, defaultValue = '') {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await question(`${colors.blue}❯${colors.reset} ${message}${suffix}: `);
  return answer || defaultValue;
}

function select(message, options) {
  return new Promise(resolve => {
    console.log(`${colors.blue}❯${colors.reset} ${message}`);
    options.forEach((opt, i) => {
      const marker = i === 0 ? '›' : ' ';
      console.log(`  ${marker} ${opt.name}`);
    });

    rl.question(`${colors.blue}Select (1-${options.length}):${colors.reset} `, (answer) => {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index].value);
      } else {
        resolve(options[0].value);
      }
    });
  });
}

function exec(command, description) {
  print(`⏳ ${description}...`, 'yellow');
  try {
    execSync(command, { stdio: 'inherit', cwd: __dirname });
    print(`✓ ${description} complete`, 'green');
    return true;
  } catch (error) {
    print(`✗ ${description} failed`, 'red');
    console.error(error.message);
    return false;
  }
}

function execSilent(command) {
  try {
    return execSync(command, { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

async function main() {
  printHeader('🚀 n8n MCP Server Setup');

  print('Welcome! This wizard will configure your n8n MCP server in 3 minutes.', 'bright');
  console.log('');

  // Step 1: Choose deployment mode
  let mode = forceMode;

  if (!mode) {
    mode = await select('Where will you use this MCP server?', [
      { name: 'Claude Desktop (local stdio mode)', value: 'claude-desktop' },
      { name: 'Remote server (HTTP mode)', value: 'http' },
      { name: 'Docker container', value: 'docker' }
    ]);
  }

  // Step 2: n8n configuration
  let configureN8n = true;
  let n8nApiUrl = 'http://localhost:5678';
  let n8nApiKey = '';

  if (!skipPrompts) {
    configureN8n = await confirm('Do you want to enable n8n workflow management?', true);

    if (configureN8n) {
      n8nApiUrl = await prompt('n8n API URL', 'http://localhost:5678');
      n8nApiKey = await prompt('n8n API Key', '');

      if (!n8nApiKey) {
        print('⚠️  No API key provided. You can add it later in .env', 'yellow');
      }
    }
  }

  // Step 3: Installation
  printHeader('📦 Installing Dependencies');

  if (!exec('npm install', 'Installing npm packages')) {
    process.exit(1);
  }

  // Step 4: Build
  printHeader('🔨 Building Server');

  if (!exec('npm run build', 'Compiling TypeScript')) {
    process.exit(1);
  }

  // Step 5: Database
  printHeader('🗄️  Building Node Database');

  const dbExists = fs.existsSync(path.join(__dirname, 'data', 'nodes.db'));
  if (dbExists) {
    const rebuild = await confirm('Database already exists. Rebuild?', false);
    if (rebuild) {
      exec('npm run rebuild:local', 'Rebuilding node database');
    } else {
      print('✓ Using existing database', 'green');
    }
  } else {
    if (!exec('npm run rebuild:local', 'Building node database')) {
      print('⚠️  Database build failed, but we can continue', 'yellow');
    }
  }

  // Step 6: Configure for mode
  printHeader('⚙️  Configuring Server');

  if (mode === 'claude-desktop') {
    await configureClaudeDesktop(n8nApiUrl, n8nApiKey);
  } else if (mode === 'http') {
    await configureHttp(n8nApiUrl, n8nApiKey);
  } else if (mode === 'docker') {
    await configureDocker(n8nApiUrl, n8nApiKey);
  }

  // Step 7: Success!
  printHeader('✅ Setup Complete!');

  if (mode === 'claude-desktop') {
    print('Next steps:', 'bright');
    print('1. Restart Claude Desktop', 'cyan');
    print('2. Start a new conversation', 'cyan');
    print('3. Ask: "What n8n tools do you have?"', 'cyan');
    print('4. Start building workflows!', 'cyan');
    console.log('');
    print(`Configuration saved to: ${getClaudeConfigPath()}`, 'yellow');
  } else if (mode === 'http') {
    print('Start the server with:', 'bright');
    print('  npm run start:http', 'cyan');
    console.log('');
    print('Server will run on: http://localhost:3000', 'yellow');
    print('Health check: http://localhost:3000/health', 'yellow');
  } else if (mode === 'docker') {
    print('Build and start with:', 'bright');
    print('  docker-compose up -d', 'cyan');
    console.log('');
    print('Check logs: docker-compose logs -f', 'yellow');
  }

  console.log('');
  print('Happy automating! 🎉', 'green');

  rl.close();
}

async function configureClaudeDesktop(n8nApiUrl, n8nApiKey) {
  const configPath = getClaudeConfigPath();
  const serverPath = path.join(__dirname, 'dist', 'consolidated-server.js');

  // Create config directory if needed
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Load existing config or create new
  let config = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      print('⚠️  Could not parse existing config, creating new one', 'yellow');
    }
  }

  // Add/update n8n-mcp server
  config.mcpServers['n8n-mcp'] = {
    command: 'node',
    args: [serverPath],
    env: {},
    disabled: false,
    autoApprove: []
  };

  if (n8nApiUrl) {
    config.mcpServers['n8n-mcp'].env.N8N_API_URL = n8nApiUrl;
  }

  if (n8nApiKey) {
    config.mcpServers['n8n-mcp'].env.N8N_API_KEY = n8nApiKey;
  }

  // Save config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  print(`✓ Claude Desktop configured`, 'green');
}

async function configureHttp(n8nApiUrl, n8nApiKey) {
  const envPath = path.join(__dirname, '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    // Copy from example
    const examplePath = path.join(__dirname, '.env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf8');
    }
  }

  // Update env vars
  envContent = updateEnvVar(envContent, 'MCP_MODE', 'http');
  envContent = updateEnvVar(envContent, 'PORT', '3000');
  envContent = updateEnvVar(envContent, 'USE_FIXED_HTTP', 'true');

  // Generate AUTH_TOKEN if not set
  if (!envContent.includes('AUTH_TOKEN=') || envContent.includes('AUTH_TOKEN=your-secure-token-here')) {
    const token = execSilent('openssl rand -base64 32') || 'change-this-token-' + Date.now();
    envContent = updateEnvVar(envContent, 'AUTH_TOKEN', token);
    print(`✓ Generated AUTH_TOKEN: ${token.substring(0, 16)}...`, 'green');
  }

  if (n8nApiUrl) {
    envContent = updateEnvVar(envContent, 'N8N_API_URL', n8nApiUrl);
  }

  if (n8nApiKey) {
    envContent = updateEnvVar(envContent, 'N8N_API_KEY', n8nApiKey);
  }

  fs.writeFileSync(envPath, envContent);
  print(`✓ HTTP server configured in .env`, 'green');
}

async function configureDocker(n8nApiUrl, n8nApiKey) {
  const envPath = path.join(__dirname, '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    const examplePath = path.join(__dirname, '.env.example');
    if (fs.existsSync(examplePath)) {
      envContent = fs.readFileSync(examplePath, 'utf8');
    }
  }

  envContent = updateEnvVar(envContent, 'MCP_MODE', 'http');
  envContent = updateEnvVar(envContent, 'PORT', '3000');

  const token = execSilent('openssl rand -base64 32') || 'change-this-token-' + Date.now();
  envContent = updateEnvVar(envContent, 'AUTH_TOKEN', token);

  if (n8nApiUrl) {
    envContent = updateEnvVar(envContent, 'N8N_API_URL', n8nApiUrl);
  }

  if (n8nApiKey) {
    envContent = updateEnvVar(envContent, 'N8N_API_KEY', n8nApiKey);
  }

  fs.writeFileSync(envPath, envContent);
  print(`✓ Docker configuration saved to .env`, 'green');
}

function updateEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;

  if (regex.test(content)) {
    return content.replace(regex, line);
  } else {
    return content + `\n${line}`;
  }
}

// Run main
main().catch(error => {
  console.error('');
  print('Setup failed:', 'red');
  console.error(error);
  process.exit(1);
});
