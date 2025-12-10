# 🧹 Master Cleanup Plan 2025

**Project:** One-Stop-Shop-N8N-MCP  
**Created:** December 3, 2025  
**Based On:** December 2024 Audit Findings + Root Directory Analysis  
**Status:** Ready for Implementation

---

## Executive Summary

The December 2024 codebase audit identified **18% of the codebase as dead or archival code**. Combined with root directory analysis revealing **150+ files at root level**, this plan provides a comprehensive roadmap to achieve a lean, maintainable codebase by end of 2025.

### Key Wins Already Achieved
- ✅ Audit Complete: All files analyzed
- ✅ Phase 1 Executed: 48 files archived (-18% file count)
- ✅ Dead Code Identified: 3 cache files + 1 legacy orchestrator ready for removal

### Target State
| Metric | Current | Target |
|--------|---------|--------|
| Root files | ~150+ | ~25 |
| src/ file count | ~220 | <200 |
| Dead code | Minimal | 0% |
| Test coverage | Unknown | >50% |
| Build time | OOM issues | <30s |

---

## Table of Contents

1. [Immediate Actions (Q4 2024)](#1-immediate-actions-q4-2024)
2. [Q1 2025: Cleanup & Organization](#2-q1-2025-cleanup--organization)
3. [Q2 2025: Deep Refactoring](#3-q2-2025-deep-refactoring)
4. [Q3 2025: Performance & Optimization](#4-q3-2025-performance--optimization)
5. [Maintenance Policy](#5-maintenance-policy)
6. [Risk Management](#6-risk-management)
7. [Success Metrics](#7-success-metrics)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Immediate Actions (Q4 2024)

These actions are "shovel-ready" and should be executed immediately.

### 1.1 Delete Dead Code (Priority: Critical)

**Goal:** Remove 3 completely unused cache implementations.

| File | Lines | Imports | Action |
|------|-------|---------|--------|
| `src/utils/enhanced-cache-manager.ts` | 429 | 0 | DELETE |
| `src/utils/query-cache.ts` | ~100 | 0 | DELETE |
| `src/services/cache-service.ts` | ~150 | 0 | DELETE |

**Impact:** -3 files, ~680 LOC

**Verification Steps (Required Before Deletion):**
```bash
# Verify no dynamic imports or string references
grep -r "enhanced-cache-manager" src/ --include="*.ts"
grep -r "query-cache" src/ --include="*.ts"
grep -r "cache-service" src/ --include="*.ts"
grep -r "EnhancedCacheManager" src/ --include="*.ts"
grep -r "QueryCache" src/ --include="*.ts"
grep -r "CacheService" src/ --include="*.ts"
```

**Rollback Plan:**
- Copy files to `.archive/dead-code/` before deletion
- Create git tag `pre-cache-cleanup` before deletion
- 2-week grace period before permanent archive removal

---

### 1.2 Migrate Legacy Orchestrator (Priority: High)

**Goal:** Unify on the modern `GraphRAGNanoOrchestrator`.

**Current State:**
- `src/ai/graphrag-orchestrator.ts` - Legacy (to be removed)
- `src/ai/graphrag-nano-orchestrator.ts` - Modern (keep)

**Migration Steps:**
| Step | Task | Status |
|------|------|--------|
| 1 | Audit all imports of `graphrag-orchestrator.ts` | ⬜ |
| 2 | Document API differences between old and new | ⬜ |
| 3 | Create adapter if APIs differ significantly | ⬜ |
| 4 | Update `src/mcp/tools-orchestration.ts` to use new orchestrator | ⬜ |
| 5 | Run integration tests for `orchestrate_workflow` tool | ⬜ |
| 6 | Deploy to staging, monitor for 1 week | ⬜ |
| 7 | Delete legacy `graphrag-orchestrator.ts` | ⬜ |

**Impact:** Removes technical debt and confusion between two orchestrators.

---

## 2. Q1 2025: Cleanup & Organization

**Focus:** Root directory cleanup, test organization, script consolidation.

### 2.1 Root Directory Cleanup (Priority: High)

**Goal:** Reduce root files from ~150 to ~25.

#### 2.1.1 Archive Development Artifacts

**Move to `.archive/logs/`:**

| File Pattern | Count | Notes |
|-------------|-------|-------|
| `simulation_output_*.txt` | 9 | Test simulation outputs |
| `fix_log*.txt` | 6 | AI fix attempt logs |
| `agent_feedback_log.txt` | 1 | Agent feedback |
| `feedback_loop_log.txt` | 1 | Feedback loop data |
| `inspection_log.txt` | 1 | Inspection results |
| `review_log.txt` | 1 | Review notes |
| `debug.log` | 1 | Debug output |
| `nul` | 1 | Empty/error file |

**Move to `.archive/debug/`:**

| File | Notes |
|------|-------|
| `debug-db-v2.js` | Database debugging script |
| `fix-db.js` | Database fix script |

#### 2.1.2 Archive Session Documentation

**Move to `.archive/session-docs/`:**

| Pattern | Example Files |
|---------|---------------|
| `*_COMPLETE.md` | `ANALYSIS_COMPLETE.md`, `FATAL_FLAW_FIXED.md`, `EXTERNAL_AGENT_INTEGRATION_COMPLETE.md` |
| `*_INDEX.md` | `ANALYSIS_INDEX.md`, `ASSESSMENT_INDEX.md`, `MASTER_STATUS_INDEX.md` |
| `*_READY.md` | `PHASE_MINUS_1_READY.md`, `DOCKER_DEPLOYMENT_READY.md` |
| `HANDOFF_*.md` | `HANDOFF_NOTE_FOR_GPT_CODEX.md` |
| `CODEX_*.md` | `CODEX_RESPONSE_TO_CLAUDE.md` |
| `*_FOR_*.md` | `FINAL_STATUS_FOR_CODEX.md`, `GEMINI_3_PRO_REVIEW_PACKAGE.md` |

**Estimated:** ~40 files

#### 2.1.3 Consolidate Quick Start Guides

**Current State:** 10+ overlapping quick start documents

| File | Action |
|------|--------|
| `QUICK-START-GUIDE.md` | ✅ KEEP as primary |
| `QUICK_ACTION_CARD.md` | 📦 Merge content, then archive |
| `QUICK_FIX_GUIDE.md` | 📦 Merge content, then archive |
| `QUICK_SETUP_CHECKLIST.md` | 📦 Merge content, then archive |
| `QUICK_START.md` | 📦 Archive (duplicate) |
| `QUICK_START_NANO_DEPLOYMENT.md` | 📁 Move to `docs/nano-llm/` |
| `GETTING-STARTED.md` | 📦 Merge content, then archive |
| `START-N8N.md` | 📦 Merge content, then archive |
| `START_HERE.md` | 📦 Archive |
| `START_IMPLEMENTATION_HERE.md` | 📦 Archive |

**Goal:** Single `QUICK-START-GUIDE.md` with links to specialized guides.

#### 2.1.4 Organize Technical Documentation

**Move to `docs/` subdirectories:**

| Category | Files | Target Directory |
|----------|-------|------------------|
| GraphRAG | `GRAPHRAG_*.md` (~10 files) | `docs/graphrag/` |
| Nano LLM | `NANO_*.md` (~7 files) | `docs/nano-llm/` |
| API | `API_*.md` (~4 files) | `docs/api/` |
| MCP | `MCP_*.md` (~9 files) | `docs/mcp/` |
| Docker | `DOCKER_*.md` (~4 files) | `docs/docker/` |
| Phase Docs | `PHASE*.md` (~6 files) | `docs/archive/phases/` |
| Security | `SECURITY*.md`, `VULNERABILITY*.md` | `docs/security/` |
| Integrations | `OUTLOOK_*.md`, `TEAMS_*.md` | `docs/integrations/` |

#### 2.1.5 Target Root File Structure

After cleanup, root should contain only:

```
# Configuration (~12 files)
.env, .env.example
.gitignore, .gitattributes, .npmrc, .dockerignore
package.json, package-lock.json
tsconfig.json, tsconfig.build.json
jest.config.cjs, babel.config.cjs

# Docker (~3 files)
Dockerfile, Dockerfile.simple, docker-compose.yml

# Documentation (~5 files)
README.md, CLAUDE.md, LICENSE, CONTRIBUTING.md, CODEOWNERS

# Other (~5 files)
renovate.json, smithery.yaml, n8n-openapi.yml, nodes.db, setup.js

# Total: ~25 files
```

---

### 2.2 Tests Directory Migration (Priority: Medium)

**Current State:** Tests scattered across `src/scripts/` and `src/tests/`

**Target Structure:**
```
tests/
├── unit/           # Unit tests (fast, isolated)
├── integration/    # Integration tests (multi-component)
├── e2e/            # End-to-end tests
└── fixtures/       # Test data and mocks
```

**Migration Actions:**

| Current Location | Files | Target |
|-----------------|-------|--------|
| `src/scripts/test-*.ts` | ~20 files | `tests/integration/` |
| `src/tests/` | All contents | `tests/unit/` or `tests/integration/` |
| `tests-examples/` | Examples | `tests/fixtures/examples/` |

---

### 2.3 Scripts Cleanup (Priority: Medium)

**Current State:** `src/scripts/` contains production tools, one-off scripts, and tests mixed together.

**Target State:** `src/scripts/` contains ONLY production-ready utility scripts.

**Script Placement Rules:**

| Script Type | Location | In Git? |
|------------|----------|---------|
| One-off debug | `scripts/debug/` | ❌ gitignored |
| Scratchpad/experiments | `scripts/scratchpad/` | ❌ gitignored |
| Test files | `tests/` | ✅ |
| Build tools | `scripts/build/` | ✅ |
| Maintenance utilities | `scripts/maintenance/` | ✅ |
| Production utils | `src/scripts/` | ✅ |

**Files to Move from `src/scripts/`:**

| File | Target |
|------|--------|
| `analyze-teams-workflow.ts` | `scripts/debug/` |
| `debug-workflow-generation.ts` | `scripts/debug/` |
| `diagnose-broken-workflow.ts` | `scripts/debug/` |
| `search-microsoft-nodes.ts` | `scripts/debug/` |
| `test-*.ts` (all) | `tests/integration/` |
| `quick-test.ts` | `scripts/debug/` |

---

## 3. Q2 2025: Deep Refactoring

**Focus:** Code quality, type safety, and architectural consistency.

### 3.1 Enable Strict TypeScript (Priority: High)

**Goal:** Enable `strict: true` in `tsconfig.json`

**Action Plan:**

| Step | Task | Estimated Errors |
|------|------|------------------|
| 1 | Enable `noImplicitAny` | ~50-100 |
| 2 | Enable `strictNullChecks` | ~100-200 |
| 3 | Enable `strictFunctionTypes` | ~20-50 |
| 4 | Enable full `strict` mode | Remaining |

**Tracking:**
- Run `tsc --noEmit` to count errors at each stage
- Document common patterns causing errors
- Create utility types for recurring issues

---

### 3.2 Consolidate MCP Handlers (Priority: Medium)

**Current State:** Multiple handler files with inconsistent patterns

**Current Files:**
- `handlers-agent-memory-query.ts`
- `handlers-nano-llm-pipeline.ts`
- `handlers-v3-tools.ts`
- `handlers-workflow-diff.ts`
- `handlers-n8n-manager.ts`
- `handler-shared-memory.ts`

**Target Structure:**
```
src/mcp/handlers/
├── index.ts                 # Re-exports all handlers
├── agent-handlers.ts        # Agent memory, GraphRAG
├── llm-handlers.ts          # Nano LLM pipeline
├── workflow-handlers.ts     # Workflow CRUD, diff
├── n8n-handlers.ts          # n8n API interactions
└── system-handlers.ts       # Health, routing, system
```

**Requirements:**
- All handlers follow consistent class-based pattern
- Each handler has corresponding unit tests
- Error handling standardized across all handlers

---

### 3.3 Refactor `server-modern.ts` (Priority: Medium)

**Current State:** ~800 lines monolithic file

**Target Structure:**
```
src/mcp/
├── server-modern.ts          # Core server setup (~150 lines)
├── tools/
│   ├── index.ts              # Tool registration coordinator
│   ├── node-tools.ts         # node_discovery, node_validation
│   ├── workflow-tools.ts     # workflow_manager, workflow_diff
│   ├── credentials-tools.ts  # credentials_manager
│   ├── execution-tools.ts    # workflow_execution
│   ├── template-tools.ts     # templates_and_guides
│   ├── agent-tools.ts        # Agent memory, GraphRAG tools
│   ├── llm-tools.ts          # nano_llm_query, routing
│   └── system-tools.ts       # n8n_system, health checks
```

---

### 3.4 Dependency Audit (Priority: Medium)

**Actions:**

| Task | Tool | Frequency |
|------|------|-----------|
| Security vulnerabilities | `npm audit` | Weekly |
| Unused dependencies | `depcheck` | Monthly |
| Outdated packages | `npm outdated` | Monthly |
| License compliance | `license-checker` | Quarterly |

**Cleanup Targets:**
- Remove unused dev dependencies
- Consolidate overlapping packages
- Document required vs optional dependencies

---

## 4. Q3 2025: Performance & Optimization

**Focus:** Build times, runtime efficiency, startup performance.

### 4.1 Build Optimization (Priority: High)

**Current Issue:** OOM errors with `tsc` on large builds

**Investigation Plan:**

| Step | Task | Tool |
|------|------|------|
| 1 | Profile `tsc` memory usage | `--generateTrace` |
| 2 | Identify heavy type computations | Trace analyzer |
| 3 | Test project references | `tsconfig.build.json` |
| 4 | Evaluate incremental builds | `tsc --incremental` |
| 5 | Benchmark alternatives | esbuild, swc |

**Target Benchmarks:**

| Metric | Current | Target |
|--------|---------|--------|
| Full build | OOM/slow | <30s |
| Incremental build | N/A | <5s |
| Memory usage | >4GB | <2GB |

**Alternative Build Tools to Evaluate:**

| Tool | Pros | Cons |
|------|------|------|
| esbuild | 10-100x faster | Less TS feature support |
| swc | Very fast, TS support | Newer, less mature |
| tsup | esbuild + dts | May need config |

---

### 4.2 Startup Time Optimization (Priority: Medium)

**Goal:** Reduce server startup time for better developer experience

**Actions:**

| Task | Approach |
|------|----------|
| Profile startup | Use `--inspect` and Chrome DevTools |
| Lazy-load LLM clients | Import only when first used |
| Lazy-load GraphRAG | Initialize on first query |
| Cache node catalog | Persist to file, reload on start |
| Parallelize init | Use `Promise.all` for independent inits |

---

### 4.3 Docker Optimization (Priority: Low)

**Current Wins Already Achieved:**
- ✅ Runtime-only dependencies (82% smaller images)
- ✅ No n8n in production image

**Further Optimizations:**

| Optimization | Expected Impact |
|-------------|-----------------|
| Multi-stage build cache | Faster CI builds |
| Layer ordering optimization | Better cache hits |
| Alpine base image evaluation | Smaller image (if compatible) |

---

## 5. Maintenance Policy

**Effective Immediately:** These rules prevent regression.

### 5.1 File Placement Rules

| File Type | Allowed Location | Review Required |
|-----------|-----------------|-----------------|
| One-off scripts | `scripts/debug/` (gitignored) | No |
| New tests | `tests/` | Yes |
| Build tooling | `scripts/build/` | Yes |
| Production code | `src/` | Yes |
| Documentation | `docs/` | Yes |
| Root directory | ONLY config files | Yes (strict) |

### 5.2 Zero Dead Code Policy

| Rule | Enforcement |
|------|-------------|
| 0 imports = deletion candidate | Monthly `ts-prune` scan |
| Unused exports = review | Quarterly audit |
| Exception: library entry points | Must be in `package.json` exports |

### 5.3 Standardized Patterns

| Concern | Standard | Do NOT Create |
|---------|----------|---------------|
| Caching | `SimpleCache` | New cache managers |
| LLM calls | `LLMAdapter` / `LLMRouter` | Direct API calls |
| Logging | `logger` utility | `console.log` |
| Config | Environment variables | Hardcoded values |
| Error handling | Custom error classes | Generic throws |

### 5.4 Documentation Standards

| Document Type | Location | Template Required |
|--------------|----------|-------------------|
| API docs | `docs/api/` | Yes |
| Feature guides | `docs/guides/` | Yes |
| Architecture | `docs/architecture/` | Yes |
| Session notes | `.archive/session-docs/` | No |

---

## 6. Risk Management

### 6.1 Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking hidden dependency | Medium | High | Grep verification + runtime testing before deletion |
| Build time regression | Low | Medium | Benchmark before/after each change |
| Team confusion during migration | Medium | Low | Update CLAUDE.md, communicate changes |
| Test coverage gaps | High | Medium | Add tests before refactoring |
| Type errors overwhelming | Medium | Medium | Enable strict mode incrementally |

### 6.2 Rollback Strategy

| Action Type | Rollback Method |
|------------|-----------------|
| File deletion | Restore from `.archive/` or git |
| Refactoring | Git revert to tagged commit |
| Config changes | Environment variable override |
| Dependency updates | `package-lock.json` restore |

**Tagging Convention:**
- `pre-cleanup-q1-2025` - Before Q1 cleanup
- `pre-strict-mode` - Before TypeScript strict
- `pre-refactor-{component}` - Before major refactors

---

## 7. Success Metrics

### 7.1 Quarterly Targets

| Metric | Current | Q1 2025 | Q2 2025 | Q3 2025 | EOY 2025 |
|--------|---------|---------|---------|---------|----------|
| Root files | ~150 | ~30 | ~25 | ~25 | ~25 |
| src/ files | ~220 | ~210 | ~200 | ~195 | <200 |
| Dead code files | 4 | 0 | 0 | 0 | 0 |
| Test coverage | Unknown | 20% | 35% | 45% | >50% |
| Build time (full) | OOM | <60s | <45s | <30s | <30s |
| TS strict errors | N/A | Audit | <100 | <20 | 0 |
| npm audit issues | Unknown | 0 critical | 0 high | 0 medium | 0 |

### 7.2 Health Checks

**Monthly Automated Checks:**
```bash
# Dead code detection
npx ts-prune | grep -v "used in module"

# Unused dependencies
npx depcheck

# Security audit
npm audit

# Type coverage
npx type-coverage
```

---

## 8. Implementation Checklist

### Immediate (Q4 2024)
- [ ] Verify cache files have 0 imports (grep check)
- [ ] Archive cache files to `.archive/dead-code/`
- [ ] Delete `src/utils/enhanced-cache-manager.ts`
- [ ] Delete `src/utils/query-cache.ts`
- [ ] Delete `src/services/cache-service.ts`
- [ ] Audit orchestrator usage
- [ ] Migrate to `GraphRAGNanoOrchestrator`
- [ ] Delete legacy `graphrag-orchestrator.ts`

### Q1 2025: Cleanup
- [ ] Run enhanced `cleanup-root.ps1`
- [ ] Archive log/output files
- [ ] Archive session documentation
- [ ] Consolidate Quick Start guides
- [ ] Organize technical docs into `docs/` subdirs
- [ ] Create `tests/` directory structure
- [ ] Migrate tests from `src/scripts/`
- [ ] Clean up `src/scripts/` (debug scripts out)
- [ ] Update `.gitignore` for new directories
- [ ] Update `CLAUDE.md` with new structure

### Q2 2025: Refactoring
- [ ] Run `ts-prune`, document findings
- [ ] Enable `noImplicitAny`, fix errors
- [ ] Enable `strictNullChecks`, fix errors
- [ ] Enable full `strict` mode
- [ ] Consolidate MCP handlers
- [ ] Refactor `server-modern.ts` into modules
- [ ] Run `depcheck`, remove unused deps
- [ ] Run `npm audit`, fix vulnerabilities

### Q3 2025: Performance
- [ ] Profile `tsc` with `--generateTrace`
- [ ] Evaluate esbuild/swc
- [ ] Implement chosen build solution
- [ ] Profile server startup
- [ ] Implement lazy loading for heavy deps
- [ ] Optimize Docker build layers
- [ ] Document performance baselines

### Ongoing
- [ ] Monthly `ts-prune` scan
- [ ] Monthly `depcheck` scan
- [ ] Weekly `npm audit`
- [ ] Enforce file placement rules in PR reviews

---

## Appendix A: Cleanup Script Enhancements

Add these patterns to `scripts/cleanup-root.ps1`:

```powershell
# Additional log patterns
$additionalLogs = @(
    "simulation_output_*.txt",
    "fix_log*.txt",
    "agent_feedback_log.txt",
    "feedback_loop_log.txt",
    "inspection_log.txt",
    "review_log.txt"
)

# Additional session doc patterns
$additionalSessionDocs = @(
    "*_COMPLETE.md",
    "*_READY.md",
    "*_INDEX.md",
    "*_TRACKER.md",
    "CODEX_*.md",
    "GEMINI_*.md",
    "GROK_*.md"
)

# Quick start consolidation
$quickStartDocs = @(
    "QUICK_ACTION_CARD.md",
    "QUICK_FIX_GUIDE.md",
    "QUICK_SETUP_CHECKLIST.md",
    "QUICK_START.md",
    "START-N8N.md",
    "START_HERE.md",
    "START_IMPLEMENTATION_HERE.md",
    "GETTING-STARTED.md"
)
```

---

## Appendix B: New Directory Structure

```
One-Stop-Shop-N8N-MCP/
├── .archive/                    # Archived files (gitignored)
│   ├── dead-code/
│   ├── debug-scripts/
│   ├── logs/
│   ├── session-docs/
│   └── workflow-experiments/
├── .claude/                     # Claude settings
├── .github/                     # GitHub workflows
├── docs/                        # Documentation
│   ├── api/
│   ├── architecture/
│   ├── archive/                 # Historical docs
│   ├── docker/
│   ├── graphrag/
│   ├── guides/
│   ├── integrations/
│   ├── mcp/
│   ├── nano-llm/
│   └── security/
├── scripts/                     # Build & maintenance scripts
│   ├── build/
│   ├── debug/                   # (gitignored)
│   ├── maintenance/
│   └── scratchpad/              # (gitignored)
├── src/                         # Source code
│   ├── ai/
│   ├── config/
│   ├── core/
│   ├── database/
│   ├── mcp/
│   │   ├── handlers/
│   │   └── tools/
│   ├── services/
│   └── utils/
├── tests/                       # All tests
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── README.md
├── CLAUDE.md
└── tsconfig.json
```

---

*This master plan consolidates the December 2024 audit findings with root directory analysis. Review quarterly and update as needed.*
