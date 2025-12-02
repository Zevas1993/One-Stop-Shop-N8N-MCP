# Cleanup Script - Moves accumulated cruft to .archive folder
# Run from project root: .\scripts\cleanup-root.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$archiveRoot = Join-Path $projectRoot ".archive"

# Create archive subdirectories
$debugScriptsDir = Join-Path $archiveRoot "debug-scripts"
$workflowExperimentsDir = Join-Path $archiveRoot "workflow-experiments"
$sessionDocsDir = Join-Path $archiveRoot "session-docs"
$oldDocsDir = Join-Path $archiveRoot "old-docs"

New-Item -ItemType Directory -Force -Path $debugScriptsDir | Out-Null
New-Item -ItemType Directory -Force -Path $workflowExperimentsDir | Out-Null
New-Item -ItemType Directory -Force -Path $sessionDocsDir | Out-Null
New-Item -ItemType Directory -Force -Path $oldDocsDir | Out-Null

Write-Host "🧹 Cleaning up project root..." -ForegroundColor Cyan

# === DEBUG SCRIPTS (one-off JS files) ===
$debugScripts = @(
    "analyze-*.js",
    "check-*.js", 
    "compare-*.js",
    "deep-*.js",
    "deploy-*.js",
    "diagnose-*.js",
    "fetch-*.js",
    "find-*.js",
    "fix-*.js",
    "get-*.js",
    "investigate-*.js",
    "rebuild-*.js",
    "recreate-*.js",
    "replace-*.js",
    "test-*.js",
    "validate-*.js",
    "verify-*.js",
    "clone-*.js",
    "create-*.js",
    "interact-*.js",
    "simple-*.js",
    "workflow_map.js",
    "build-workflow-mcp.js",
    "direct-mcp-agent.js",
    "mcp-browser-server.mjs",
    "mcp-complete-server.mjs",
    "mcp-server-with-browser.mjs",
    "simple-docker-sync-mcp.mjs",
    "initialize-database.mjs",
    "validate-simple-auto.mjs",
    "verify-workflow.mjs"
)

foreach ($pattern in $debugScripts) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File | ForEach-Object {
        Move-Item $_.FullName -Destination $debugScriptsDir -Force
        Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
    }
}

# === WORKFLOW JSON EXPERIMENTS ===
$workflowFiles = @(
    "*workflow*.json",
    "*-workflow.json", 
    "ai-fix-*.json",
    "api_payload*.json",
    "broken*.json",
    "cleaned-*.json",
    "current-*.json",
    "final-fix-*.json",
    "fixed*.json",
    "formatted*.json",
    "fresh-*.json",
    "natural-language-*.json",
    "node-*.json",
    "outlook-*.json",
    "patch_response.json",
    "payload.json",
    "put_response*.json",
    "rebuild-results.json",
    "restored-*.json",
    "teams-outlook-*.json",
    "test-results.json",
    "validation-error-report.json",
    "verified*.json",
    "working*.json",
    "after-fix-*.json",
    "NEW-NODES-*.json",
    "error-diagnosis.json"
)

foreach ($pattern in $workflowFiles) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File | ForEach-Object {
        Move-Item $_.FullName -Destination $workflowExperimentsDir -Force
        Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
    }
}

# === SESSION DOCUMENTATION ===
$sessionDocs = @(
    "CLAUDE_*.md",
    "CODEX_*.md",
    "SESSION_*.md",
    "GROK_*.md",
    "GEMINI_*.md",
    "*_SUMMARY.md",
    "*_STATUS.md",
    "*_REPORT.md",
    "*_COMPLETE.md",
    "*_INDEX.md",
    "*_READY.md",
    "HANDOFF_*.md",
    "HOW_TO_PROCEED.md",
    "MASTER_*.md"
)

foreach ($pattern in $sessionDocs) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File | ForEach-Object {
        # Don't archive CLAUDE.md (the main instructions file)
        if ($_.Name -ne "CLAUDE.md") {
            Move-Item $_.FullName -Destination $sessionDocsDir -Force
            Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
        }
    }
}

# === OLD/DUPLICATE DOCS ===
$oldDocs = @(
    "*_FIXES*.md",
    "*_IMPLEMENTATION*.md",
    "*_INTEGRATION*.md",
    "*_ARCHITECTURE*.md",
    "*_FINDINGS*.md",
    "*_ISSUES*.md",
    "*_PLAN*.md",
    "*_PHASE*.md",
    "*_AUDIT*.md",
    "*_RESEARCH*.md",
    "*_GUIDE*.md",
    "*_CHECKLIST*.md",
    "*_ROADMAP*.md",
    "*_SPECIFICATION*.md",
    "*_SPEC*.md",
    "ANALYSIS_*.md",
    "API_*.md",
    "AGENTIC_*.md",
    "DATABASE_*.md",
    "DIAGNOSTIC*.md",
    "DISCOVERED_*.md",
    "DOCUMENTS_*.md",
    "DOCKER_*.md",
    "ENHANCEMENT*.md",
    "EXTERNAL_*.md",
    "FATAL_*.md",
    "GITHUB_*.md",
    "GRAPHRAG_*.md",
    "IMPLEMENTATION_*.md",
    "ISSUE_*.md",
    "LOCAL_*.md",
    "MCP_*.md",
    "NANO_*.md",
    "NEXT_*.md",
    "OLLAMA_*.md",
    "OPEN_*.md",
    "OUTLOOK_*.md",
    "PRODUCTION_*.md",
    "PROJECT_*.md",
    "REAL_*.md",
    "RESTORATION_*.md",
    "SCHEMA_*.md",
    "SECURITY*.md",
    "SEMANTIC_*.md",
    "START_*.md",
    "SYSTEM_*.md",
    "TEAMS_*.md",
    "TEST_*.md",
    "TESTING_*.md",
    "TIER*.md",
    "TRACING_*.md",
    "UPDATE_*.md",
    "VERSION_*.md",
    "VLLM_*.md",
    "VULNERABILITY*.md",
    "WORKFLOW_*.md",
    "AWAITING_*.md",
    "CODE_*.md",
    "COLLABORATION_*.md",
    "COMPREHENSIVE_*.md",
    "CONTAINER_*.md",
    "CRITICAL_*.md",
    "DEEP_*.md",
    "DELIVERABLES_*.md",
    "DEPLOYMENT_*.md"
)

foreach ($pattern in $oldDocs) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File | ForEach-Object {
        Move-Item $_.FullName -Destination $oldDocsDir -Force
        Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
    }
}

# === MISC CRUFT ===
$miscCruft = @(
    "*.log",
    "*.txt",
    "*.patch",
    "*.bak",
    "nul",
    "UsersChris*.json",
    "UsersChris*.sqlite",
    "debug.log",
    "mcp*.log",
    "verification_logs.txt",
    "build-output.txt",
    "fix-attempt-log.txt",
    "mcp-agent-log.txt",
    "mcp-fix-log.txt",
    "workflow-builder-interactive.txt",
    "workflow-fields.txt",
    "versioned-nodes.md"
)

foreach ($pattern in $miscCruft) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        Move-Item $_.FullName -Destination $archiveRoot -Force
        Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
    }
}

# === TypeScript debug files ===
$tsDebugFiles = @(
    "agent-fix-*.ts",
    "external-agent-*.ts",
    "live-external-agent-*.ts",
    "validation-fix.ts"
)

foreach ($pattern in $tsDebugFiles) {
    Get-ChildItem -Path $projectRoot -Filter $pattern -File | ForEach-Object {
        Move-Item $_.FullName -Destination $debugScriptsDir -Force
        Write-Host "  📦 Archived: $($_.Name)" -ForegroundColor DarkGray
    }
}

# Count what's left
$remainingFiles = (Get-ChildItem -Path $projectRoot -File | Where-Object { $_.Name -notmatch "^\." }).Count
$archivedFiles = (Get-ChildItem -Path $archiveRoot -Recurse -File).Count

Write-Host ""
Write-Host "✅ Cleanup complete!" -ForegroundColor Green
Write-Host "   📁 Archived: $archivedFiles files" -ForegroundColor Yellow
Write-Host "   📁 Remaining in root: $remainingFiles files" -ForegroundColor Cyan
Write-Host ""
Write-Host "To restore any files, check the .archive folder" -ForegroundColor DarkGray
