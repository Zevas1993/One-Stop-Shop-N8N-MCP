#!/usr/bin/env node
/**
 * Post-install script - attempts to pre-build the distribution
 * Falls back gracefully if build fails (ts-node will be used at runtime)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distMain = path.join(__dirname, 'dist', 'main.js');

// Skip if dist already exists and is recent
if (fs.existsSync(distMain)) {
  const stats = fs.statSync(distMain);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  
  if (ageHours < 24) {
    console.log('✓ Pre-built distribution is up to date');
    process.exit(0);
  }
}

console.log('Attempting to pre-build distribution...');

try {
  execSync('npm run build', { 
    stdio: 'pipe',
    timeout: 120000, // 2 minutes
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096'
    }
  });
  console.log('✓ Pre-build successful');
} catch (error) {
  console.log('⚠ Pre-build skipped (will use ts-node at runtime)');
  // Don't fail - ts-node will handle it at runtime
}
