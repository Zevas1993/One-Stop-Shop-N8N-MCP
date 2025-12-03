# Build & Runtime Fixes Applied

## Summary of Issues Fixed

### Issue 1: Out of Memory During `npm run build`
**Root Cause:** TypeScript compiler holding 120+ source files in memory with strict type checking

**Fixes Applied:**
1. Enabled incremental compilation in `tsconfig.build.json`
2. Added `skipLibCheck: true` to skip node_modules type checking
3. Expanded exclude list to skip tests, scripts, and archived files
4. Added `.tsbuildinfo.build` cache file for faster rebuilds

### Issue 2: Validation Warnings (Case Sensitivity)
**Root Cause:** `rebuild.ts` checking for `HttpRequest` but n8n uses `httpRequest`

**Fix Applied:** Updated `src/scripts/rebuild.ts` to use correct camelCase:
- `httpRequest` (not `HttpRequest`)
- `code` (not `Code`)
- `webhook` (not `Webhook`)
- `mySql` (not `MySQL`)
- `mongoDb` (not `MongoDb`)

### Issue 3: "No docs found" Messages
**Status:** Normal behavior - external documentation enrichment is optional

---

## Quick Start Options

### Option 1: Quick Start (Recommended for Development)
Skips the build entirely, runs directly with ts-node:

```powershell
.\scripts\quick-start.ps1
```

Or manually:
```powershell
$env:N8N_AUTO_SYNC="false"
$env:ALLOW_COMMUNITY_NODES="false"
npx ts-node --transpile-only src/main.ts
```

### Option 2: Build and Start
Attempts build first, falls back to ts-node if OOM:

```powershell
.\scripts\build-and-start.ps1
```

### Option 3: Full Build (If You Need dist/)
For production deployment:

```powershell
# Clear cache
Remove-Item .tsbuildinfo -ErrorAction SilentlyContinue
Remove-Item .tsbuildinfo.build -ErrorAction SilentlyContinue

# Build with more memory
$env:NODE_OPTIONS="--max-old-space-size=16384"
npm run build
```

### Option 4: Run Existing Build
If you have a working `dist/` folder:

```powershell
$env:N8N_AUTO_SYNC="false"
$env:ALLOW_COMMUNITY_NODES="false"
node dist/main.js
```

---

## Files Modified

| File | Change |
|------|--------|
| `tsconfig.build.json` | Added incremental compilation, skipLibCheck, expanded excludes |
| `tsconfig.json` | Added incremental compilation settings |
| `src/scripts/rebuild.ts` | Fixed case sensitivity in critical node validation |
| `scripts/build-and-start.ps1` | New: Build with fallback script |
| `scripts/quick-start.ps1` | New: Quick development start script |

---

## If Build Still Fails with OOM

1. **Use more memory:**
   ```powershell
   $env:NODE_OPTIONS="--max-old-space-size=16384"
   npm run build
   ```

2. **Use fast build (skips some checks):**
   ```powershell
   npm run build:fast
   ```

3. **Skip build entirely for development:**
   ```powershell
   npx ts-node --transpile-only src/main.ts
   ```

4. **Use the existing dist/ folder:**
   ```powershell
   node dist/main.js
   ```

---

## Expected Startup Output

```
╔════════════════════════════════════════════════════════════╗
║              n8n Co-Pilot MCP Server v3.0.0                ║
║                                                            ║
║  Stateless • Validated • Live Sync • LLM-Powered          ║
╚════════════════════════════════════════════════════════════╝

[Main] Starting in MCP mode...
[Main] n8n URL: http://localhost:5678
[Main] Ollama URL: http://localhost:11434
[Main] Node restrictions: Built-in Nodes Only
[Main] Step 1/2: Initializing AI system...
[Main] Step 2/2: Initializing core...
```

---

## Troubleshooting

### "Cannot find module" errors
Run `npm install` to ensure dependencies are installed.

### n8n connection errors
Make sure n8n is running at the configured URL (default: http://localhost:5678).

### Ollama not available warning
This is normal if Ollama isn't running - AI features will be disabled but core functionality works.
