#!/usr/bin/env node
/**
 * Fast TypeScript build using esbuild
 *
 * This builds the MCP server WITHOUT needing the heavy n8n packages.
 * The n8n packages are only needed for:
 * - db:rebuild script (to extract node schemas from n8n)
 * - Type definitions during development
 *
 * For runtime, the MCP server does NOT import from n8n packages.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Get all TypeScript files from src/, excluding test files and n8n node files
function getEntryPoints(dir, exclude = []) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      // Skip excluded patterns
      if (exclude.some(pattern => {
        if (pattern.endsWith('/**/*')) {
          const baseDir = pattern.replace('/**/*', '');
          return relativePath.startsWith(baseDir);
        }
        return relativePath === pattern || relativePath.includes(pattern);
      })) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

async function build() {
  console.log('Building with esbuild...');

  const srcDir = path.join(__dirname, '..', 'src');
  const outDir = path.join(__dirname, '..', 'dist');

  // Files to exclude (these import from n8n packages)
  const exclude = [
    'n8n/**/*',           // n8n custom node definitions
    'utils/bridge.ts',    // imports from n8n-workflow
    'scripts/**/*',       // build scripts
    'tests/**/*',         // test files
  ];

  const entryPoints = getEntryPoints(srcDir, exclude);

  console.log(`Found ${entryPoints.length} TypeScript files to compile`);

  try {
    await esbuild.build({
      entryPoints,
      outdir: outDir,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      sourcemap: true,
      // Note: not bundling, so each file compiles separately like tsc
    });

    console.log(`Successfully compiled to ${outDir}`);
    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
