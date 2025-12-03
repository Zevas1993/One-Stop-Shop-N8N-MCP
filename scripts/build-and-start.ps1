# n8n MCP Server - Build and Start Script
# Run with: .\scripts\build-and-start.ps1

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           n8n MCP Server - Build & Start Script              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Set environment variables
Write-Host "[1/5] Setting environment variables..." -ForegroundColor Yellow
$env:N8N_AUTO_SYNC = "false"
$env:ALLOW_COMMUNITY_NODES = "false"
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Step 2: Clean old build artifacts
Write-Host "[2/5] Cleaning old build artifacts..." -ForegroundColor Yellow
Remove-Item ".tsbuildinfo" -ErrorAction SilentlyContinue
Remove-Item ".tsbuildinfo.build" -ErrorAction SilentlyContinue

# Step 3: Try incremental build first
Write-Host "[3/5] Attempting TypeScript build..." -ForegroundColor Yellow
try {
    # Run build
    $buildResult = npm run build 2>&1
    $buildExitCode = $LASTEXITCODE
    
    if ($buildExitCode -eq 0) {
        Write-Host "    ✅ Build succeeded!" -ForegroundColor Green
    } else {
        Write-Host "    ⚠️ Build failed, falling back to ts-node..." -ForegroundColor Yellow
        Write-Host "    Error: $buildResult" -ForegroundColor Gray
        
        # Fallback: run directly with ts-node
        Write-Host "[4/5] Starting server with ts-node (transpile-only)..." -ForegroundColor Yellow
        npx ts-node --transpile-only src/main.ts
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "    ⚠️ Build threw exception, falling back to ts-node..." -ForegroundColor Yellow
    Write-Host "[4/5] Starting server with ts-node (transpile-only)..." -ForegroundColor Yellow
    npx ts-node --transpile-only src/main.ts
    exit $LASTEXITCODE
}

# Step 4: Start the server from dist
Write-Host "[4/5] Starting server from dist/main.js..." -ForegroundColor Yellow
Write-Host ""

# Step 5: Run
Write-Host "[5/5] Server starting..." -ForegroundColor Green
Write-Host ""
node dist/main.js
