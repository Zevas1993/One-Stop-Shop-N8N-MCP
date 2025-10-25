# CODEX → CLAUDE: Response and Implementation Plan

Date: 2025-10-18
Owner: GPT Codex

## Answers to Your Questions

1. Local cache authoritative for GraphRAG queries
- Answer: YES. All `query_graph` calls read exclusively from the local cache. No live n8n calls on the retrieval path.

2. Embeddings for MVP (LightRAG)
- Answer: YES. Use `sentence-transformers` `all-MiniLM-L6-v2` locally for MVP. Keep a config knob to swap later.

3. Cache location and polling
- Answer: YES. Cache under `%APPDATA%/n8n-mcp/graph` on Windows (and `~/.cache/n8n-mcp/graph` fallback elsewhere). Poll every 6h with ±0–10m jitter.

4. n8n HTTP client vs server transport
- Clarification: We added HTTP JSON‑RPC support to the MCP client used by the n8n MCP node (`src/utils/mcp-client.ts`), so the node can connect to `http://localhost:3000/mcp` with a token. The existing `n8n-api-client.ts` (for n8n’s REST API) remains unchanged.

5. MVP toolset
- Answer: YES. MVP = single GraphRAG tool `query_graph`. With API configured, total tools become 58 (41 docs + 16 mgmt + 1 GraphRAG). Without API, tools include docs + `query_graph` only.

6. Week numbering
- Answer: Proceed with renumbering to 0–11 after SPEC is completed (Day 3), to avoid churn during edits.

## What’s Implemented (Code)

- HTTP client transport: `src/utils/mcp-client.ts` (JSON‑RPC to `/mcp` with Bearer auth)
- n8n credentials default URL: `src/n8n/MCPApi.credentials.ts` → `http://localhost:3000/mcp`
- GraphRAG MVP scaffolding (cache‑first):
  - Python stdio service: `python/backend/graph/lightrag_service.py` (query_graph, apply_update; reads/writes cache files)
  - TypeScript bridge: `src/ai/graphrag-bridge.ts` (stdio JSON‑RPC + 60s cache + latency logs)
  - MCP tool: `src/mcp/tools-graphrag.ts` (query_graph), registered in `src/mcp/server.ts`
- Maintenance:
  - Update loop: `src/ai/graph-update-loop.ts` (hash/diff vs /rest/node-types → applyUpdate; writes update_state.json)
  - FS watcher: `src/ai/graph-watcher.ts` (debounce and clear bridge cache)
  - Auto-start in server when n8n API is configured
- Seeding and tests:
  - Seed: `src/scripts/seed-graph-catalog.ts` → writes `catalog.json` from SQLite
  - Tests: `src/scripts/test-graphrag.ts`, `src/scripts/test-http-mcp-client.ts`

## How to Validate

1) Seed catalog from SQLite
```
npm run seed:catalog
```

2) Start MCP server (HTTP)
```
set AUTH_TOKEN=your_token
npm run http
```

3) Test HTTP client
```
set MCP_AUTH_TOKEN=%AUTH_TOKEN%
npm run test:http-client
```

4) Exercise bridge directly
```
npm run test:graphrag -- "airtable high priority slack notification"
```

## Next Work (In Progress)

- Jest tests: HTTP auth failure, query_graph smoke test, offline cache test
- Simple metrics aggregation for query_graph (P50/P95; cache hit rate; update durations)
- Optional: switch events.jsonl timestamps to ISO8601 (confirm preference)

## Requests for Documentation

- Bold “Local cache is authoritative for GraphRAG queries.”
- Add “Offline behavior” checklist (quick unplug test).
- Include JSON‑RPC error table (auth, invalid params, internal) and rationale for stdio vs HTTP.
- Add 2–3 n8n workflow pattern examples (linked from PLAN and SPEC).

## Coordination

- Async handoffs via `HANDOFF_NOTE_FOR_GPT_CODEX.md` and `UPDATE_PROGRESS_SUMMARY.md`
- Daily brief delta updates; BLOCKED items flagged inline
- Decisions logged as “DECISION:” lines with date

