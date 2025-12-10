# Project Cleanup Script for One-Stop-Shop-N8N-MCP
# Run with: .\scripts\cleanup-project.ps1
# Preview mode: .\scripts\cleanup-project.ps1 -WhatIf

[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== One-Stop-Shop-N8N-MCP Project Cleanup ===" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Gray

# Create archive directories
$archiveDirs = @(
    "docs/archive/session-docs",
    "docs/archive/graphrag",
    "docs/archive/outlook-teams",
    "docs/archive/nano-llm",
    "docs/archive/phase-docs",
    "docs/archive/debug-logs"
)

foreach ($dir in $archiveDirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        if ($PSCmdlet.ShouldProcess($fullPath, "Create directory")) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
            Write-Host "Created: $dir" -ForegroundColor Green
        }
    }
}

# ============================================
# 1. Move simulation output files to archive
# ============================================
Write-Host "`n[1/8] Moving simulation output files..." -ForegroundColor Yellow

$simulationFiles = Get-ChildItem -Path $ProjectRoot -Name "simulation_output*.txt" -File
foreach ($file in $simulationFiles) {
    $source = Join-Path $ProjectRoot $file
    $dest = Join-Path $ProjectRoot "docs/archive/debug-logs" $file
    if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
        Move-Item -Path $source -Destination $dest -Force
        Write-Host "  Moved: $file" -ForegroundColor Gray
    }
}

# ============================================
# 2. Move fix/debug logs to archive
# ============================================
Write-Host "`n[2/8] Moving debug/fix logs..." -ForegroundColor Yellow

$logFiles = @(
    "fix_log.txt",
    "fix_log_ai.txt",
    "fix_log_ai_v2.txt",
    "fix_log_ai_v3.txt",
    "fix_log_ai_v4.txt",
    "fix_log_ai_v5.txt",
    "review_log.txt",
    "inspection_log.txt",
    "agent_feedback_log.txt",
    "feedback_loop_log.txt",
    "debug.log"
)

foreach ($file in $logFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/debug-logs" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 3. Move GraphRAG documentation to archive
# ============================================
Write-Host "`n[3/8] Moving GraphRAG documentation..." -ForegroundColor Yellow

$graphragFiles = @(
    "GRAPHRAG_IMPLEMENTATION_PLAN.md",
    "GRAPHRAG_SPEC_WIP.md",
    "GRAPHRAG_NANO_LLM_RESEARCH_ANALYSIS.md",
    "GRAPHRAG_COMPLETE_SPECIFICATION.md",
    "GRAPHRAG_INTEGRATION_VERIFIED.md",
    "GRAPHRAG_RESEARCH_INDEX.md",
    "GRAPHRAG_NODE_FIXES.md",
    "GRAPHRAG_NODE_NAMING_COMPLETE.md",
    "AGENTIC_GRAPHRAG_INDEX.md",
    "AGENTIC_GRAPHRAG_INTEGRATION_AUDIT.md",
    "AGENTIC_GRAPHRAG_REAL_ISSUES.md",
    "AGENTIC_INTEGRATION_IMPLEMENTATION_ROADMAP.md",
    "VLLM_GRAPHRAG_INTEGRATION_GUIDE.md"
)

foreach ($file in $graphragFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/graphrag" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 4. Move Outlook/Teams documentation to archive
# ============================================
Write-Host "`n[4/8] Moving Outlook/Teams documentation..." -ForegroundColor Yellow

$outlookFiles = @(
    "OUTLOOK_TEAMS_AI_ASSISTANT_PLAN.md",
    "OUTLOOK_TEAMS_QUICK_REFERENCE.md",
    "OUTLOOK_AI_WORKFLOW_ANALYSIS.md",
    "TEAMS-OUTLOOK-WORKFLOW-ANALYSIS.md",
    "IMPLEMENTATION_GUIDE_OUTLOOK_TEAMS.md",
    "README_OUTLOOK_TEAMS_PROJECT.md",
    "PROJECT_INDEX.md"
)

foreach ($file in $outlookFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/outlook-teams" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 5. Move Nano LLM documentation to archive
# ============================================
Write-Host "`n[5/8] Moving Nano LLM documentation..." -ForegroundColor Yellow

$nanoFiles = @(
    "NANO_LLM_EMBEDDING_MODELS_RESEARCH_2025.md",
    "LOCAL_LLM_ANALYSIS.md",
    "LOCAL_LLM_IMPLEMENTATION_COMPLETE.md",
    "LOCAL_NANO_LLM_ARCHITECTURE.md",
    "NANO_LLM_IMPLEMENTATION_COMPLETE.md",
    "NANO_LLM_DEPLOYMENT_GUIDE.md",
    "NANO_LLM_LEARNING_SYSTEM.md",
    "NANO_LLM_INFERENCE_ACTIVATED.md",
    "NANO_AGENTS_GRAPHRAG_IMPLEMENTATION.md",
    "QUICK_START_NANO_DEPLOYMENT.md",
    "DEPLOYMENT_QWEN3_BEST_MODELS.md",
    "OLLAMA_DEPLOYMENT_COMPLETE.md",
    "README_NANO_LLM.md"
)

foreach ($file in $nanoFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/nano-llm" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 6. Move Phase/Session documentation to archive
# ============================================
Write-Host "`n[6/8] Moving Phase/Session documentation..." -ForegroundColor Yellow

$phaseFiles = @(
    "PHASE5_COMPLETE_IMPLEMENTATION_PLAN.md",
    "PHASE5_AGENTIC_GRAPHRAG_ARCHITECTURE.md",
    "PHASE5_2_AGENTIC_GRAPH_BUILDER.md",
    "PHASE5_STORAGE_LAYER_COMPLETE.md",
    "PHASE4_DOCUMENTATION_INDEX.md",
    "PHASE_MINUS_1_READY.md",
    "CODE_REVIEW_PHASE4.md",
    "IMPLEMENTATION_ROADMAP_PHASE5.md",
    "MASTER_SESSION_COMPLETION.md",
    "ANALYSIS_COMPLETE.md",
    "ANALYSIS_INDEX.md",
    "ASSESSMENT_INDEX.md",
    "DELIVERABLES_INDEX.md",
    "MASTER_STATUS_INDEX.md",
    "ISSUES_AND_FIXES_INDEX.md"
)

foreach ($file in $phaseFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/phase-docs" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 7. Move session-specific docs to archive
# ============================================
Write-Host "`n[7/8] Moving session-specific documentation..." -ForegroundColor Yellow

$sessionFiles = @(
    "HANDOFF_NOTE_FOR_GPT_CODEX.md",
    "GEMINI_3_PRO_REVIEW_PACKAGE.md",
    "CODEX_RESPONSE_TO_CLAUDE.md",
    "FINAL_STATUS_FOR_CODEX.md",
    "AWAITING_SPECIFICATION_APPROVAL.md",
    "HOW_TO_PROCEED.md",
    "START_IMPLEMENTATION_HERE.md",
    "START_HERE.md",
    "INVESTIGATION_PLAN.md",
    "ENHANCED-WORKFLOW-DIAGRAM.md",
    "ENHANCED-WORKFLOW-PLAN.md",
    "ENHANCEMENT-DELIVERY-README.md",
    "WORKFLOW-ENHANCEMENT-INDEX.md",
    "WORKFLOW-ENHANCEMENT-SUMMARY.md",
    "workflow-verification-report.md",
    "workflow-comparison.md",
    "detailed-rendering-report.md",
    "DIAGNOSTIC-REPORT.md",
    "DIAGNOSTIC-SUMMARY.md",
    "DIAGNOSTIC_FINDINGS.md",
    "FATAL_FLAW_FIXED.md",
    "FIXES_IMPLEMENTED.md",
    "QUICK_FIX_GUIDE.md",
    "NEXT_STEPS_FOR_PRODUCTION.md",
    "EXTERNAL_AGENT_INTEGRATION_COMPLETE.md",
    "EXTERNAL_AGENT_TEST_RESULTS.md",
    "EXTERNAL_AGENTS_SHARED_MEMORY.md",
    "INTEGRATION_CONFIGURATION_GUIDE.md",
    "INTEGRATION_TEST_RESULTS.md",
    "INTEGRATED_SYSTEM_IMPLEMENTATION_GUIDE.md",
    "SYSTEM_IMPLEMENTATION_GUIDE.md",
    "TIER1_INTEGRATION_IMPLEMENTATION.md",
    "TRACING_AND_VERIFICATION_GUIDE.md",
    "TESTING_AND_VERIFICATION_COMPLETE.md",
    "MCP_FATAL_FLAW_AND_RECOVERY_SOLUTION.md",
    "MCP_ISSUES_TRACKER.md",
    "MCP_RESPONSE_BEHAVIOR.md",
    "MCP_SCHEMA_INTEGRATION_BRIDGE.md",
    "MCP_SERVER_EFFICIENCY_AUDIT.md",
    "MCP_SERVER_EXTERNAL_AGENT_DEMO.md",
    "MCP_SERVER_FINALIZATION_PLAN.md",
    "MCP_SERVER_VALIDATION_FAILURE_ANALYSIS.md",
    "MCP_STDIO_TEST_RESULTS.md",
    "API_COMPLIANCE_FIXES.md",
    "API_SCHEMA_INTEGRATION.md",
    "API_VALIDATION_ISSUES.md",
    "COMPLETE_API_AUDIT_AND_FIXES.md",
    "CRITICAL_ARCHITECTURE_FIXES_NEEDED.md",
    "DATABASE_REBUILD_PROCESS.md",
    "IMPLEMENTATION_PRIORITY.md",
    "PRODUCTION_READINESS_AUDIT.md",
    "SCHEMA_VALIDATION_COMPLETE.md",
    "SEMANTIC_VALIDATION_DEMO.md",
    "VERSION_SYNC_ARCHITECTURE.md",
    "VERIFY_CURRENT_WORKFLOW.md",
    "WORKFLOW_FIX_REPORT_OLD.md",
    "WORKFLOW_UI_FIXES.md",
    "REAL_TEST_RESULTS.md",
    "TEST_RESULTS_AND_ISSUES.md",
    "TEST-RESULTS-v2.7.1.md",
    "TEST-RESULTS-v3.0.0.md",
    "EXECUTIVE_SUMMARY_FULL_AUDIT.md",
    "DOCUMENTS_TO_SHARE.md",
    "versioned-nodes.md"
)

foreach ($file in $sessionFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/session-docs" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# 8. Clean up miscellaneous files
# ============================================
Write-Host "`n[8/8] Cleaning up miscellaneous files..." -ForegroundColor Yellow

# Remove the 'nul' Windows artifact
$nulFile = Join-Path $ProjectRoot "nul"
if (Test-Path $nulFile) {
    if ($PSCmdlet.ShouldProcess("nul", "Delete Windows artifact")) {
        Remove-Item -Path $nulFile -Force
        Write-Host "  Deleted: nul (Windows artifact)" -ForegroundColor Gray
    }
}

# Remove debug scripts if not needed
$debugFiles = @("debug-db-v2.js", "fix-db.js")
foreach ($file in $debugFiles) {
    $source = Join-Path $ProjectRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $ProjectRoot "docs/archive/debug-logs" $file
        if ($PSCmdlet.ShouldProcess($file, "Move to archive")) {
            Move-Item -Path $source -Destination $dest -Force
            Write-Host "  Moved: $file" -ForegroundColor Gray
        }
    }
}

# ============================================
# Summary
# ============================================
Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Cyan

$remainingFiles = (Get-ChildItem -Path $ProjectRoot -File).Count
Write-Host "Remaining root files: $remainingFiles" -ForegroundColor Green

if ($WhatIfPreference) {
    Write-Host "`nThis was a dry run. Run without -WhatIf to apply changes." -ForegroundColor Yellow
}
