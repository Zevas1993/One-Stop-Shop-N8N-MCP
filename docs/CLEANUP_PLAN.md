# Project Cleanup Plan & Status

**Date**: December 3, 2025  
**Project**: One-Stop-Shop-N8N-MCP v3.0.0

## Problem Statement

The project root directory had **216 files** - the vast majority being session-specific documentation, debug logs, and archived materials that should not be at root level. This clutters the project and makes it difficult to find essential files.

## Target State

A clean root directory with only **~30 essential files**:
- Core config files (package.json, tsconfig.json, .env, etc.)
- Essential documentation (README.md, CLAUDE.md, CONTRIBUTING.md, etc.)
- Docker configuration files
- Entry point scripts

## Files Organized

### 1. Debug/Simulation Logs → `docs/archive/debug-logs/`
- `simulation_output*.txt` (15 files)
- `fix_log*.txt` (6 files)
- `debug.log`
- `review_log.txt`, `inspection_log.txt`
- `agent_feedback_log.txt`, `feedback_loop_log.txt`
- Debug scripts: `debug-db-v2.js`, `fix-db.js`

### 2. GraphRAG Documentation → `docs/archive/graphrag/`
- `GRAPHRAG_*.md` (9 files)
- `AGENTIC_GRAPHRAG_*.md` (4 files)
- `VLLM_GRAPHRAG_INTEGRATION_GUIDE.md`

### 3. Outlook/Teams Project → `docs/archive/outlook-teams/`
- `OUTLOOK_*.md` (4 files)
- `TEAMS-OUTLOOK-WORKFLOW-ANALYSIS.md`
- `IMPLEMENTATION_GUIDE_OUTLOOK_TEAMS.md`
- `README_OUTLOOK_TEAMS_PROJECT.md`
- `PROJECT_INDEX.md`

### 4. Nano LLM Documentation → `docs/archive/nano-llm/`
- `NANO_LLM_*.md` (8 files)
- `LOCAL_LLM_*.md` (2 files)
- `LOCAL_NANO_LLM_ARCHITECTURE.md`
- `OLLAMA_DEPLOYMENT_COMPLETE.md`
- `DEPLOYMENT_QWEN3_BEST_MODELS.md`
- `README_NANO_LLM.md`

### 5. Phase/Session Documentation → `docs/archive/phase-docs/`
- `PHASE*.md` (6 files)
- `CODE_REVIEW_PHASE4.md`
- `*_INDEX.md` (5 files)
- `MASTER_SESSION_COMPLETION.md`

### 6. Session-Specific Docs → `docs/archive/session-docs/`
- All handoff notes, investigation plans, diagnostic reports
- API compliance/audit docs
- Test results and fix reports
- MCP server audit docs
- Workflow enhancement docs

## Files Remaining at Root (Essential)

### Configuration Files
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.build.json`
- `.env`, `.env.example`, `.env.nano.example`
- `jest.config.cjs`, `babel.config.cjs`
- `.gitignore`, `.gitattributes`
- `renovate.json`, `smithery.yaml`

### Docker Configuration
- `Dockerfile`, `Dockerfile.simple`
- `docker-compose.yml`, `docker-compose.*.yml`
- `.dockerignore`

### Documentation (Essential)
- `README.md` - Main project readme
- `README-v3.0.0.md` - Version-specific readme
- `CLAUDE.md` - AI assistant instructions
- `CONTRIBUTING.md` - Contribution guidelines
- `ARCHITECTURE.md` - System architecture
- `LICENSE`, `ATTRIBUTION.md`, `CODEOWNERS`

### Entry Points & Scripts
- `start.js`, `setup.js`
- `*.bat`, `*.ps1` launcher scripts
- `database-schema.sql`, `database-setup.sql`

### Quick Start Guides (Keep at Root)
- `QUICK-START-GUIDE.md`
- `QUICK_START.md`
- `QUICK_SETUP_CHECKLIST.md`
- `QUICK_ACTION_CARD.md`
- `GETTING-STARTED.md`
- `START-N8N.md`

### Setup Guides (Keep at Root)
- `CLAUDE-DESKTOP-SETUP.md`
- `DOCKER_DESKTOP_SETUP.md`
- `DOCKER_DEPLOYMENT_CHECKLIST.md`
- `DOCKER_DEPLOYMENT_READY.md`
- `OPEN_WEBUI_SETUP.md`
- `GITHUB_INTEGRATION.md`

### Security Documentation
- `SECURITY-AUDIT-REPORT.md`
- `SECURITY-REVIEW-AND-IMPROVEMENTS.md`
- `SECURITY-UPDATE.md`
- `VULNERABILITY-BREAKDOWN.md`

## Archive Directory Structure

```
docs/archive/
├── debug-logs/           # All debug and simulation output
├── graphrag/             # GraphRAG implementation docs
├── nano-llm/             # Nano LLM/Ollama documentation
├── outlook-teams/        # Outlook/Teams workflow project
├── phase-docs/           # Phase completion reports
├── session-docs/         # Session-specific handoffs
├── development-reports/  # (existing)
└── phase-reports/        # (existing)
```

## How to Run Cleanup

```powershell
# Preview what will be moved (dry run)
.\scripts\cleanup-project.ps1 -WhatIf

# Actually run the cleanup
.\scripts\cleanup-project.ps1

# Force cleanup (no confirmations)
.\scripts\cleanup-project.ps1 -Force
```

## Ongoing Maintenance Guidelines

1. **New session documentation** should go directly to `docs/archive/session-docs/`
2. **Debug logs** should be written to `logs/` directory
3. **Feature documentation** should go to `docs/` with appropriate subdirectories
4. **Keep root clean** - only essential configuration and quick-start guides

## Files Deleted

- `nul` - Windows artifact (empty file)

## Notes

- The cleanup script is non-destructive - all files are moved to archive, not deleted
- Original file structure is preserved in archive directories
- Git history is maintained for all files
