# MCP Server Remediation Final Form

Retained record date: 2026-03-07

This document is the short, decision-complete execution record for the MCP server remediation. It is the retained final form derived from:

- `MCP_SERVER_REMEDIATION_BLUEPRINT.md`
- `FULL_WORKSPACE_LINE_AUDIT.json`

The long blueprint remains the evidence and audit record. This file is the implementation-facing summary.

## Summary

The supported product is:

- a unified MCP runtime
- a unified HTTP/API surface backed by that same runtime
- a secondary direct chat/OpenWebUI interface backed by that same MCP core
- embedded nano LLMs as an optional local-model backend
- one guided browser-based setup wizard for first-run configuration
- two supported delivery channels:
  - direct `npm` / `npx`
  - Docker Desktop

The supported product must be deterministic, API-faithful, built-in-first for workflow generation, and simple enough that an end user can configure it without hand-editing runtime files or guessing MCP client configuration.

## Supported Product and Non-Core Boundaries

Supported:

- unified stdio MCP
- unified HTTP/API
- direct chat/OpenWebUI using the same MCP core
- embedded nano LLMs
- one browser-based setup wizard backed by the real backend
- direct `npm` / `npx` setup and launch
- Docker Desktop setup and launch

Non-core:

- the old setup-dashboard product behavior
- beta installer and bundled GraphRAG packaging
- vendored `temp/n8n-docs` as a runtime subsystem
- workflow/reference corpora except sanitized fixtures/examples
- archive, logs, screenshots, coverage, and other generated operational artifacts

## Required Public Interfaces and Behavior

### Runtime entrypoints

- Canonical stdio MCP entrypoint: `dist/mcp/stdio-wrapper.js`
- Canonical HTTP/API and direct-chat backend: `SingleSessionHTTPServer`
- Supported direct local commands:
  - `n8n-mcp setup`
  - `n8n-mcp stdio`
  - `n8n-mcp http`
- Supported direct `npx` equivalents:
  - `npx n8n-mcp setup`
  - `npx n8n-mcp stdio`
  - `npx n8n-mcp http`
- Supported Docker Desktop path:
  - one canonical compose topology based on `docker-compose.desktop.yml`, revised to launch the same backend and guided setup flow

### Guided setup contract

The guided setup wizard is the canonical first-run experience for both supported delivery channels.

Wizard steps:

1. detect or confirm install channel
2. collect and validate `N8N_API_URL` and `N8N_API_KEY`
3. optionally validate `N8N_USERNAME` and `N8N_PASSWORD`
4. choose and validate local/direct-chat LLM backend
5. review and write the real runtime `.env`
6. configure external agents
7. show final startup instructions for the chosen channel

Setup API:

- `GET /api/setup/status`
- `POST /api/setup/validate/n8n`
- `POST /api/setup/validate/session-auth`
- `POST /api/setup/validate/llm-backend`
- `POST /api/setup/save-config`
- `POST /api/setup/register/claude`
- `GET /api/setup/snippets`
- `POST /api/setup/complete`

Setup rules:

- the wizard writes the real runtime `.env` directly after validation
- direct `npm` / `npx` installs store the writable `.env` in an OS-specific app config directory
- Docker Desktop stores the writable `.env` in a mounted config/data volume
- secrets must never be persisted in `data/setup-state.json`
- only non-sensitive setup metadata may be persisted outside the real runtime `.env`

### External-agent integration

- Claude Desktop gets optional automatic registration where the config file is discoverable and writable
- other MCP clients get validated config snippets, not automatic file writes
- generated snippets must match the real supported runtime contract for the chosen install channel

### Config precedence

The supported precedence order is:

1. explicit injected runtime configuration or process environment
2. setup-managed runtime `.env`
3. repo-local dev fallback only

Repo-local `.env` must never override caller-supplied runtime values in the supported product.

### Runtime floor

- Supported Node runtime floor: `>=20.19 <=24.x`
- Primary tested runtime target: Node 22.x

## Implementation Sequence

1. Lock the supported product matrix and non-core boundaries in code, docs, and launch metadata.
2. Remove checked-in secrets from supported surfaces and establish canonical config precedence.
3. Build the guided setup flow and setup API contract.
4. Fix deterministic MCP runtime behavior:
   - remove hidden workflow-create override
   - unify stdio/background init
   - fix dynamic import failures
5. Unify validation, discovery, and retrieval on one canonical stack.
6. Align direct chat/OpenWebUI to the same MCP tool core and validation path as external agents.
7. Align direct `npm` / `npx` and Docker Desktop packaging so both launch the same product.
8. Quarantine or archive historical setup, installer, and generated side surfaces.
9. Add live smoke and setup acceptance coverage across all supported modes.

## Primary Implementation Targets

Behavior-level changes required in the main codebase:

- `src/config/n8n-api.ts`
  - remove unsafe `.env` override behavior
  - add app-config-dir resolution for guided setup
- `src/http/routes-local-llm.ts`
  - split setup logic from legacy local-LLM-only behavior
  - add canonical setup validate, save, Claude registration, and snippet endpoints
  - remove secret persistence to `data/setup-state.json`
- `src/http-server-single-session.ts`
  - mount the supported guided setup routes on the real backend
  - keep direct chat/OpenWebUI on the same runtime/tool core
- `public/index.html` and `src/web-ui/index.html`
  - convert into the supported setup plus direct-chat UI
  - remove historical setup-dashboard assumptions
- `scripts/register-claude.ps1`
  - rewrite around the supported product identity and current stdio entrypoint
- `package.json`, `package.runtime.json`, and supported compose assets
  - publish the supported commands and runtime floor
  - align direct and Docker delivery channels to the same backend contract

## Acceptance and Test Record

The remediation is complete only when all of the following are true:

1. `workflow_manager create` never creates a different workflow than the caller sent.
2. `workflow_execution` no longer fails due to missing optional runtime imports.
3. `workflow_manager validate` distinguishes invalid workflows from internal server failures.
4. `node_discovery` returns consistent results for official nodes.
5. agents retrieve relevant live nodes in small ranked batches.
6. generated workflows strongly prefer built-in nodes over `Code`.
7. direct chat/OpenWebUI uses the same live MCP core and validation path as external agents.
8. first-run guided setup works for direct `npm` / `npx`.
9. first-run guided setup works for Docker Desktop.
10. the guided flow writes the real runtime `.env` to the correct supported location.
11. no supported setup path stores secrets in `data/setup-state.json`.
12. Claude Desktop registration uses the real current MCP entrypoint.
13. validated generic MCP snippets are generated for the chosen install channel.
14. one documented direct path and one documented Docker Desktop path both launch the same supported product.
15. no supported stdio launcher writes to stdout before MCP handshake.
16. historical setup and installer surfaces are explicitly archived or marked unsupported.
17. live smoke tests pass across:
  - stdio MCP
  - HTTP/API
  - direct chat/OpenWebUI
  - embedded nano-LLM initialization
  - direct `npm` / `npx` guided setup
  - Docker Desktop guided setup

Required test scenarios:

- first-run setup for direct `npm` / `npx`
- first-run setup for Docker Desktop
- edit/update of existing config
- valid and invalid n8n API connection
- optional session-auth success and failure
- LLM backend detection and fallback
- Claude Desktop registration
- generic snippet generation
- post-setup startup in all supported modes

## Retention Notes

This file is the retained final form for implementation and record retention.

The longer files remain useful for evidence and traceability:

- `MCP_SERVER_REMEDIATION_BLUEPRINT.md` is the exhaustive remediation and audit record
- `FULL_WORKSPACE_LINE_AUDIT.json` is the literal no-exceptions workspace scan artifact
