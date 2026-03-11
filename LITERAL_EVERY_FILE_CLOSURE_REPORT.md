# Literal Every-File Closure Report

- Generated: 2026-03-09T22:14:17.154912+00:00
- Root: `C:\Users\Chris Boyd\Documents\MCP-Servers\One-Stop-Shop-N8N-MCP`
- Verdict: **not clean**

## Scope and Method

- Boundary: literal all files under the repo root, including `node_modules`, `.git`, nested repos, generated outputs, runtime DBs, logs, coverage, and binaries.
- Text files were read in full and scanned line-by-line.
- Binary files were read in full and classified through byte/structure inspection.
- SQLite database files were read in full and inspected for schema/table metadata.

## Summary

- Total files: **133474**
- Text files: **129780**
- Binary files: **3689**
- Database files: **5**
- Unreadable files: **0**

### Dispositions

- fix: **14**
- update: **24**
- cleanup: **94**
- archive: **0**
- leave: **133342**

### Subsystems

- archives/history: **329**
- docs/examples: **291**
- generated/runtime state: **406**
- git internals: **2306**
- nested repos: **2017**
- packaging/install: **18**
- setup/UI: **3**
- supported runtime: **241**
- tests/verification: **260**
- vendor: **127603**

## Severity-Ranked Findings

### Critical

- Supported runtime, setup, and delivery entrypoints still have unresolved contract drift.
- Affected files: **10**
  - `Dockerfile`
  - `Dockerfile.simple`
  - `docker/docker-entrypoint.sh`
  - `docker/entrypoint-auto-rebuild.sh`
  - `docker/simple-entrypoint.sh`
  - `package-lock.json`
  - `src/http-server-single-session.ts`
  - `src/http/routes-local-llm.ts`
  - `src/main.ts`
  - `src/mcp/index.ts`

### High

- Active docs, packaging metadata, and setup UI still lag the supported product definition.
- Affected files: **18**
  - `QUICK-START-GUIDE.md`
  - `README.md`
  - `claude-desktop-config-example.json`
  - `docs/BUILD_FIXES.md`
  - `docs/END_USER_IMPROVEMENTS.md`
  - `docs/HTTP_DEPLOYMENT.md`
  - `docs/IMPROVEMENTS_REVIEW.md`
  - `docs/PROJECT-AUDIT.md`
  - `docs/README_CLAUDE_SETUP.md`
  - `docs/docker/DOCKER_DEPLOYMENT_READY.md`
  - `docs/docker/DOCKER_DESKTOP_SETUP.md`
  - `docs/graphrag/GRAPHRAG-DEVELOPER-SETUP.md`
  - `docs/graphrag/GRAPHRAG-INSTALLATION-LINUX-MACOS.md`
  - `docs/graphrag/GRAPHRAG-TROUBLESHOOTING.md`
  - `docs/guides/CLAUDE-DESKTOP-SETUP.md`
  - `package.json`
  - `public/index.html`
  - `src/web-ui/index.html`

### Medium

- Workspace still carries stale verification surfaces, generated operational state, and unresolved code markers.
- Affected files: **104**
  - `.claude/settings.local.json`
  - `.env.example`
  - `.vscode/launch.json`
  - `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db`
  - `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-shm`
  - `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-wal`
  - `coverage/lcov-report/ai/agents/base-agent.ts.html`
  - `coverage/lcov-report/ai/agents/graphrag-nano-orchestrator.ts.html`
  - `coverage/lcov-report/ai/agents/index.html`
  - `coverage/lcov-report/ai/agents/pattern-agent.ts.html`
  - `coverage/lcov-report/ai/agents/validator-agent.ts.html`
  - `coverage/lcov-report/ai/agents/workflow-agent.ts.html`
  - `coverage/lcov-report/ai/docker-model-runner-client.ts.html`
  - `coverage/lcov-report/ai/event-bus.ts.html`
  - `coverage/lcov-report/ai/graphrag-bridge.ts.html`
  - `coverage/lcov-report/ai/graphrag-orchestrator.ts.html`
  - `coverage/lcov-report/ai/hardware-detector.ts.html`
  - `coverage/lcov-report/ai/index.html`
  - `coverage/lcov-report/ai/knowledge/api-schema-loader.ts.html`
  - `coverage/lcov-report/ai/knowledge/index.html`
  - `coverage/lcov-report/ai/llm-adapter.ts.html`
  - `coverage/lcov-report/ai/llm-router.ts.html`
  - `coverage/lcov-report/ai/ollama-client.ts.html`
  - `coverage/lcov-report/ai/shared-memory.ts.html`
  - `coverage/lcov-report/ai/vllm-client.ts.html`
  - `coverage/lcov-report/auth.ts.html`
  - `coverage/lcov-report/base.css`
  - `coverage/lcov-report/block-navigation.js`
  - `coverage/lcov-report/bridge.ts.html`
  - `coverage/lcov-report/data/dynamic-node-registry.ts.html`
  - `coverage/lcov-report/data/index.html`
  - `coverage/lcov-report/data/node-registry.ts.html`
  - `coverage/lcov-report/error-handler.ts.html`
  - `coverage/lcov-report/favicon.png`
  - `coverage/lcov-report/helpers/index.html`
  - `coverage/lcov-report/helpers/node-discovery.ts.html`
  - `coverage/lcov-report/index.html`
  - `coverage/lcov-report/logger.ts.html`
  - `coverage/lcov-report/mcp/index.html`
  - `coverage/lcov-report/mcp/tools-orchestration.ts.html`
  - `coverage/lcov-report/monitoring/index.html`
  - `coverage/lcov-report/monitoring/performance-monitor.ts.html`
  - `coverage/lcov-report/prettify.css`
  - `coverage/lcov-report/prettify.js`
  - `coverage/lcov-report/prompts/embedding-model-system-prompt.ts.html`
  - `coverage/lcov-report/prompts/generation-model-system-prompt.ts.html`
  - `coverage/lcov-report/prompts/index.html`
  - `coverage/lcov-report/resource-formatter.ts.html`
  - `coverage/lcov-report/services/graphrag-learning-service.ts.html`
  - `coverage/lcov-report/services/index.html`
  - ... plus 54 more files in the manifest

## Exact Action List

The exact per-file action list is recorded in `LITERAL_EVERY_FILE_AUDIT_MANIFEST.json` under `files[]` where `disposition != "leave"`.

### Fix (14)

- `Dockerfile` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `Dockerfile.simple` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `package-lock.json` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `package.json` | packaging/install | Root runtime floor understates the installed dependency engine requirement.
- `docker/docker-entrypoint.sh` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `docker/entrypoint-auto-rebuild.sh` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `docker/simple-entrypoint.sh` | packaging/install | Supported delivery/runtime surface still references stale or split entrypoints.
- `src/http-server-single-session.ts` | supported runtime | Active runtime still allows repo-local .env to override caller-provided config.
- `src/main.ts` | supported runtime | Active runtime still allows repo-local .env to override caller-provided config.
- `src/core/llm-brain.ts` | supported runtime | Active supported code still contains unresolved TODO/FIXME/HACK/XXX markers.
- `src/http/routes-local-llm.ts` | setup/UI | Supported setup route still uses old completion flow and process-local env mutation instead of persistent config writes.
- `src/mcp/index.ts` | supported runtime | Active runtime still allows repo-local .env to override caller-provided config.
- `src/services/graph-population-service.ts` | supported runtime | Active supported code still contains unresolved TODO/FIXME/HACK/XXX markers.
- `src/services/node-parameter-validator.ts` | supported runtime | Active supported code still contains unresolved TODO/FIXME/HACK/XXX markers.

### Update (24)

- `.env.example` | packaging/install | Active supported surface still carries the legacy product identity.
- `QUICK-START-GUIDE.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `README.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `claude-desktop-config-example.json` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docker-compose.yml` | packaging/install | Active supported surface still carries the legacy product identity.
- `start.js` | packaging/install | Active supported surface still carries the legacy product identity.
- `docs/BUILD_FIXES.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/END_USER_IMPROVEMENTS.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/HTTP_DEPLOYMENT.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/IMPROVEMENTS_REVIEW.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/PROJECT-AUDIT.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/README_CLAUDE_SETUP.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/docker/DOCKER_DEPLOYMENT_READY.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/docker/DOCKER_DESKTOP_SETUP.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/graphrag/GRAPHRAG-DEVELOPER-SETUP.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/graphrag/GRAPHRAG-INSTALLATION-LINUX-MACOS.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/graphrag/GRAPHRAG-TROUBLESHOOTING.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `docs/guides/CLAUDE-DESKTOP-SETUP.md` | docs/examples | Active user-facing documentation/example still teaches the old product identity or stale startup path.
- `public/index.html` | setup/UI | Supported setup UI still targets the old setup route contract.
- `src/ai/index.ts` | supported runtime | Active supported surface still carries the legacy product identity.
- `src/core/index.ts` | supported runtime | Active supported surface still carries the legacy product identity.
- `src/interfaces/index.ts` | supported runtime | Active supported surface still carries the legacy product identity.
- `src/interfaces/mcp-interface.ts` | supported runtime | Active supported surface still carries the legacy product identity.
- `src/web-ui/index.html` | setup/UI | Supported setup UI still targets the old setup route contract.

### Cleanup (94)

- `debug.log` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `nodes.db` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `test-minimal-mcp.js` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `test-node-discovery.js` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `.claude/settings.local.json` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `.vscode/launch.json` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-shm` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-wal` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov.info` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/auth.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/base.css` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/block-navigation.js` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/bridge.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/error-handler.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/favicon.png` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/logger.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/prettify.css` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/prettify.js` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/resource-formatter.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/sort-arrow-sprite.png` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/sorter.js` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/docker-model-runner-client.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/event-bus.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/graphrag-bridge.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/graphrag-orchestrator.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/hardware-detector.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/llm-adapter.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/llm-router.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/ollama-client.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/shared-memory.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/vllm-client.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/base-agent.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/graphrag-nano-orchestrator.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/pattern-agent.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/validator-agent.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/agents/workflow-agent.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/knowledge/api-schema-loader.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/ai/knowledge/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/data/dynamic-node-registry.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/data/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/data/node-registry.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/helpers/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/helpers/node-discovery.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/mcp/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/mcp/tools-orchestration.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/monitoring/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/monitoring/performance-monitor.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/prompts/embedding-model-system-prompt.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/prompts/generation-model-system-prompt.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/prompts/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/services/graphrag-learning-service.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/services/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/config/environment.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/config/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/data/dynamic-node-registry.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/data/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/data/node-registry.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/errors/error-codes.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/errors/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/helpers/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/helpers/node-discovery.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/monitoring/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/monitoring/performance-monitor.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/utils/execution-formatter.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/utils/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/src/utils/resource-formatter.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/tests/mocks/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/tests/mocks/n8n-fixtures.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/auth.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/bridge.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/index.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/input-validator.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/logger.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/mcp-client.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `coverage/lcov-report/utils/query-cache.ts.html` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `data/nodes-v2.db` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `data/nodes.db` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `logs/application.log` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `logs/audit.log` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `logs/error.log` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `logs/mcp-server-2025-10-04.log` | generated/runtime state | Generated operational state is stored in the workspace and should be quarantined or regenerated.
- `scripts/build-and-start.ps1` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/install-linux.sh` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/install-macos.sh` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/populate-graphrag.js` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/archive/demo-optimization.sh` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/archive/tests/test-mcp-server.ts` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `scripts/debug/consult-graph-rag.ts` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `src/scripts/external-agent-mcp-client.ts` | tests/verification | Verification surface still targets legacy identity or stale runtime entrypoints.
- `temp/n8n-docs/.git/config` | nested repos | Nested repo is carried inside the workspace without clean parent submodule mapping.

## Supported Product Verdict

- The supported product is **not clean**. Active runtime, setup, packaging, documentation, and verification surfaces still need work.

## Notes

- This audit re-evaluated the current modified workspace as the live truth.
- Earlier audit-complete claims were not treated as authoritative.
- Vendor and git-internal files were reviewed and classified as operational surfaces unless a direct file-level repo action was identified.
