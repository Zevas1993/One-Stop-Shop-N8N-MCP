# MCP Server Remediation Blueprint

## Purpose

This document is the implementation blueprint for fixing the MCP server issues uncovered during live use against the connected n8n instance.

The supported product in scope is:

- the unified MCP runtime
- the unified HTTP/API surface backed by that same runtime
- a secondary direct chat/OpenWebUI path backed by that same MCP core
- embedded nano LLMs as an optional local-model backend for that supported product
- one guided browser-based setup wizard backed by the real supported backend
- two supported delivery channels for that product:
  - direct `npm` / `npx`
  - Docker Desktop

The goal is not just to make the server "work." The goal is to make the supported product:

- deterministic for agent callers
- faithful to the live n8n API
- capable of exposing all installed live nodes
- efficient enough that agents do not blow the context window
- biased toward built-in n8n nodes instead of `Code` / `toolCode`
- safe to validate, patch, and execute end to end
- consistent whether the caller is an external agent or the built-in direct chat surface
- simple enough for end users to configure without hand-editing runtime files or guessing agent-registration details

Historical setup-dashboard variants, installer/docs-mirror/product sidecars, and workflow-corpus surfaces are only in scope here to archive, quarantine, sanitize, or explicitly de-scope them from the supported product.

This blueprint is based on direct runtime testing of the unified stdio server, source review of the relevant implementation files, and the literal no-exceptions workspace audit captured in [FULL_WORKSPACE_LINE_AUDIT.json](FULL_WORKSPACE_LINE_AUDIT.json).

## Desired End State

When an external agent or end user uses this product:

1. The agent gets access to the full installed node catalog from the live n8n instance.
2. The agent is never forced to ingest the full node catalog in one response.
3. The MCP server retrieves small, ranked, task-relevant node subsets on demand.
4. Workflow creation is deterministic and never silently swaps in a different workflow.
5. Validation errors are real MCP errors, not success-shaped JSON with hidden failure payloads.
6. `patch`, `update`, `create`, `validate`, and `execute` behave consistently with the live n8n API.
7. `Code` nodes are strongly discouraged and automatically replaced with built-in alternatives when possible.
8. External-agent callers and the direct chat/OpenWebUI path both use the same live MCP core and tool contracts.
9. Embedded nano LLMs remain a supported secondary backend option, not a separate product/backend stack.
10. One browser-based setup wizard supports both direct `npm` / `npx` and Docker Desktop.
11. The guided setup validates n8n connectivity, writes the real runtime `.env`, configures embedded nano-LLM options, and helps connect external agents.
12. The supported startup matrix is explicit for stdio MCP, HTTP/API, and direct chat mode.
13. Direct `npm` / `npx` and Docker Desktop both launch the same supported MCP core and direct-chat stack.
14. The supported Node/runtime floor, package metadata, client configs, Docker assets, and launchers all agree.
15. The server is covered by live integration tests against a real n8n instance across all supported modes.

## Non-Core Surfaces

The following surfaces are not part of the supported MCP product boundary and should be archived, quarantined, or retained only as explicitly labeled examples/fixtures:

- the old browser-first setup-dashboard product assumptions and any launcher flow that depends on them
- the beta installer bundle and bundled GraphRAG packaging story
- the vendored `temp/n8n-docs` repo as a runtime product surface
- workflow/reference JSON corpora except for sanitized import-safe fixtures or examples
- archive/debug/generated operational artifacts such as `.archive`, checked-in logs, screenshots, coverage, and historical reports

## Root Causes

### 1. Hidden workflow mutation on create

File: `src/mcp/handlers-n8n-manager.ts`

Problem:

- `handleCreateWorkflow()` parses the caller's workflow input.
- It then checks `getAgentGeneratedWorkflow()`.
- If shared memory contains a workflow, it silently replaces the caller's workflow.

Impact:

- Agents cannot trust `workflow_manager create`.
- Retries can create the wrong workflow even when the caller sent correct JSON.

### 2. Stdio startup path skips warmup

Files:

- `src/mcp/stdio-wrapper.ts`
- `src/mcp/server-modern.ts`

Problem:

- `stdio-wrapper.ts` calls `server.connect(transport)`.
- `server.connect()` only attaches the transport.
- The important background initialization lives in `run()`, not `connect()`.
- That means node sync and nano-agent/orchestrator warmup may not happen on the stdio path agents actually use.

Impact:

- stale or partial node state
- inconsistent discovery results
- tool quality that changes based on startup path

### 3. Dynamic import failures in core tools

Files:

- `src/mcp/server-modern.ts`
- `src/services/mcp-tool-service.ts`
- `src/mcp/tools-nano-agents.ts`

Problems:

- `workflow_execution` imports `./handlers-v3-tools` before action branching
- local workflow validation imports `../utils/validation-cache` dynamically
- GraphRAG query imports `../ai/graphrag-bridge` dynamically

Impact:

- core tools fail at runtime due to missing dist/module resolution
- some failures surface as soft JSON error payloads instead of real MCP errors

### 4. Discovery contract drift

Files:

- `src/mcp/server-modern.ts`
- `src/services/mcp-tool-service.ts`
- `src/core/node-filter.ts`
- `src/database/node-repository.ts`

Problems:

- tool schema exposes `package`, handler reads `pkg`
- list behavior defaults to `trigger` category when the caller asked for "all nodes"
- policy layer allows `n8n-nodes-base.*`
- repository normalizes those to `nodes-base.*`

Impact:

- official built-in nodes can be omitted or appear blocked
- search/list/get-info behavior is inconsistent
- agents retry because the node map is incomplete

### 5. Patch path fidelity is weak

File: `src/mcp/handlers-n8n-manager.ts`

Problem:

- `setNestedValue()` only supports simple dot notation
- it does not support array paths such as `parameters.values[0].name`

Impact:

- patch operations can create the wrong object shape
- valid patch intents turn into invalid n8n payloads

### 6. Validation semantics are inconsistent

Files:

- `src/mcp/server-modern.ts`
- `src/services/mcp-tool-service.ts`
- `src/services/node-parameter-validator.ts`

Problems:

- validate uses one path for `mode === "remote"` and a different path for local modes
- local validation catches internal exceptions and returns `{ valid: false, error: ... }`
- the parameter validator only enforces a very small set of required fields

Impact:

- agents cannot tell "invalid workflow" from "server is broken"
- the validate tool is not trustworthy enough to drive automatic repair

### 7. Workflow generation policy is too permissive

Problem:

- the MCP server does not force a retrieval-first, built-in-first generation flow
- the agent is allowed to freehand workflow JSON from broad descriptions
- when uncertain, the model falls back to `Code` nodes

Impact:

- overuse of code nodes
- lower portability and maintainability
- unnecessary retries and corrections

## Fix Strategy

Implement the remediation in the following ordered tracks.

1. Lock the supported product boundary and explicitly mark non-core surfaces.
2. Fix secret handling and config precedence before deeper runtime refactors.
3. Add one guided end-user setup flow for both supported delivery channels.
4. Make the MCP runtime deterministic.
5. Unify validation semantics.
6. Unify live-node identity and discovery.
7. Convert discovery into retrieval instead of catalog dumps.
8. Align direct chat/OpenWebUI to the same MCP core and contract.
9. Enforce built-in-first workflow planning.
10. Make validation and patching API-faithful.
11. Improve the public tool surface for agents and direct chat.
12. Unify entrypoints, packaging, and the supported runtime floor.
13. Bring HTTP mode to feature parity with the real MCP server.
14. Replace hardcoded agent generation and legacy response guidance.
15. Repair shared-state and cache semantics.
16. Consolidate duplicate connector/catalog/validation stacks and quarantine historical/generated surfaces.
17. Add live integration and acceptance coverage across all supported modes.

## Phase 0: Define the Supported Product Boundary

This phase comes before runtime fixes because the later implementation work depends on a clear answer to what the product actually is.

### 0.1 Publish the supported product matrix

Supported surfaces:

- unified stdio MCP
- unified HTTP/API backed by the same runtime/tool layer
- direct end-user chat/OpenWebUI backed by the same MCP core
- embedded nano LLMs as an optional backend for the supported product
- one guided browser-based setup wizard backed by the same runtime
- direct `npm` / `npx` as a supported local installation and launch path
- Docker Desktop as a supported containerized installation and launch path

Non-core surfaces:

- old setup-dashboard product flows that bypass the supported backend contract
- browser-first launchers that depend on historical setup-only behavior instead of the supported backend directly
- beta installer/bundled GraphRAG packaging
- vendored docs repo as a runtime subsystem
- workflow/reference corpora except sanitized fixtures/examples

Required change:

- update docs, package metadata, launchers, and UI surfaces so each exposed surface is explicitly labeled either `supported` or `non-core`
- stop leaving "historical but still present" surfaces in an ambiguous middle state

Acceptance criteria:

- every published entrypoint and UI surface falls cleanly into `supported` or `non-core`
- direct chat/OpenWebUI is documented as a secondary interface to the same MCP core, not a separate backend
- the guided setup wizard is documented as the canonical first-run experience for both supported delivery channels
- direct `npm` / `npx` and Docker Desktop are both documented as first-class supported ways to run the same product
- workflow/example assets are no longer treated as part of the core supported product

### 0.2 Demote workflow and showcase corpora out of the critical path

Required change:

- keep workflow/reference JSON assets only as sanitized examples or fixtures if they are still useful
- remove workflow-asset cleanup from the critical path for fixing the MCP server itself

Acceptance criteria:

- no core remediation milestone depends on expanding or cleaning showcase workflow packs
- any retained examples are clearly labeled `fixture`, `example`, or `showcase`, not `core product`

## Phase 0A: Fix Secret and Config Hygiene Before Runtime Refactors

The full audit proved that secret/config drift is not a side issue. It is part of the main remediation path.

### 0A.1 Remove checked-in live secret material from supported surfaces

Current issue:

- active and historical helper surfaces still contain JWT-like n8n API keys, plaintext secret state, and duplicate ad hoc config loaders
- these exposures are especially dangerous because they reinforce stale runtime assumptions as well as leaking credentials

Required change:

- remove hardcoded JWT/API-key material from all supported surfaces first
- quarantine or scrub archived/local/debug secret-bearing files instead of letting them remain normal developer context
- rotate any credentials proven to have been exposed in tracked files

Acceptance criteria:

- no supported runtime, client example, or verification helper contains hardcoded JWT/API keys
- supported tooling no longer prints live auth configuration or mirrors secrets into ad hoc local files
- archive/local secret-bearing material is clearly quarantined or removed from normal workflows

### 0A.2 Establish explicit config precedence

Primary file to change:

- `src/config/n8n-api.ts`

Required change:

- explicit runtime configuration or injected environment must win over repo-local `.env`
- `.env` may only fill missing values for local development
- remove stale global-config behavior that keeps long-lived processes on outdated URLs or credentials

Recommended implementation direction:

```ts
// src/config/n8n-api.ts

dotenv.config({ override: false });

function readConfig(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

// Precedence: injected runtime config/process env first, .env only as fallback.
```

Acceptance criteria:

- repo-local `.env` never overrides caller-supplied environment or injected runtime config
- config reload/reset behavior exists for tests and long-lived processes
- supported docs and examples describe one canonical secret/config path

## Phase 0B: Add a Guided End-User Setup Flow

This phase defines the supported first-run experience for real users. It is part of the product, not a side utility.

### 0B.1 Use one browser wizard for both supported delivery channels

Required decisions:

- one browser-based setup wizard serves both direct `npm` / `npx` and Docker Desktop
- the wizard is backed by the real supported backend, not a separate setup-only product
- the wizard writes the real runtime `.env` automatically after validation
- direct `npm` / `npx` stores the writable `.env` in an OS-specific app config directory
- Docker Desktop stores the writable `.env` in a mounted config/data volume

Acceptance criteria:

- the same setup UX works for both supported delivery channels
- setup state is derived from the real runtime config and backend health
- first-run users do not have to hand-edit `.env` to get started

### 0B.2 Define the guided setup flow

Required wizard steps:

1. detect or confirm the install channel
2. collect and validate `N8N_API_URL` and `N8N_API_KEY`
3. optionally validate session-auth enhancement
4. choose and validate local/direct-chat LLM backend
5. review and write the real runtime `.env`
6. configure external agents
7. show final startup instructions for the chosen channel

External-agent behavior:

- Claude Desktop gets optional automatic integration where the config file is discoverable and writable
- other external agents get validated MCP config snippets, not automatic file writes

Acceptance criteria:

- the wizard can complete the full supported setup without switching to manual docs
- setup guidance differs by delivery channel only where filesystem/runtime paths differ
- the post-setup instructions reference only supported entrypoints

### 0B.3 Define the setup API contract

Supported endpoints:

- `GET /api/setup/status`
- `POST /api/setup/validate/n8n`
- `POST /api/setup/validate/session-auth`
- `POST /api/setup/validate/llm-backend`
- `POST /api/setup/save-config`
- `POST /api/setup/register/claude`
- `GET /api/setup/snippets`
- `POST /api/setup/complete`

Required rules:

- secrets must not be persisted in `data/setup-state.json`
- only non-sensitive setup metadata may be persisted separately from secrets
- the real runtime `.env` is the source of truth for setup-produced configuration

Acceptance criteria:

- setup APIs are narrow, explicit, and backed by the real runtime
- secret-bearing state is stored only in the supported config location
- generated agent snippets match the actual current runtime contract

## Phase 1: Make Workflow Operations Deterministic

### 1.1 Remove implicit SharedMemory override from create

File to change:

- `src/mcp/handlers-n8n-manager.ts`

Current issue:

- `handleCreateWorkflow()` silently replaces the input workflow when shared memory contains `generated-workflow`.

Required change:

- The create path must use the caller's workflow by default.
- SharedMemory workflow usage must be explicit and opt-in.

Recommended implementation:

```ts
// src/mcp/handlers-n8n-manager.ts

const createWorkflowSchema = z.object({
  name: z.string().optional(),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
  settings: z.record(z.any()).optional(),
  staticData: z.record(z.any()).optional(),
  pinData: z.record(z.any()).optional(),
  useAgentGeneratedWorkflow: z.boolean().optional().default(false),
});

export async function handleCreateWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  const input = createWorkflowSchema.parse(args);

  let workflowInput: any = input;

  if (input.useAgentGeneratedWorkflow) {
    const agentWorkflow = await getAgentGeneratedWorkflow();
    if (!agentWorkflow) {
      return createErrorResponse(
        "No agent-generated workflow found in shared memory",
        "AGENT_WORKFLOW_NOT_FOUND"
      );
    }
    workflowInput = agentWorkflow;
  }

  // Continue with validation and create using workflowInput
}
```

Acceptance criteria:

- A caller-supplied workflow is never replaced unless the caller explicitly opts in.
- `workflow_manager create` becomes deterministic across retries.

### 1.2 Add a deterministic startup initializer shared by `run()` and `connect()`

Files to change:

- `src/mcp/server-modern.ts`
- `src/mcp/stdio-wrapper.ts`

Required change:

- Move warmup logic into a reusable method.
- Both `run()` and `connect()` must call it.
- Warmup must run once only.

Recommended implementation:

```ts
// src/mcp/server-modern.ts

export class UnifiedMCPServer {
  private backgroundInitPromise: Promise<void> | null = null;

  private ensureBackgroundInitializationStarted(): Promise<void> {
    if (this.backgroundInitPromise) {
      return this.backgroundInitPromise;
    }

    this.backgroundInitPromise = (async () => {
      const tasks: Promise<unknown>[] = [];

      if (process.env.N8N_AUTO_SYNC !== "false" && isN8nApiConfigured()) {
        tasks.push(
          this.syncN8nNodes().catch((error) => {
            logger.warn(
              "[Server] Node sync failed (continuing with existing database):",
              error instanceof Error ? error.message : String(error)
            );
          })
        );
      }

      tasks.push(
        this.initializeNanoAgentOrchestrator().catch((error) => {
          logger.warn(
            "[Server] Failed to initialize nano agent orchestrator:",
            error instanceof Error ? error.message : String(error)
          );
        })
      );

      await Promise.allSettled(tasks);
    })();

    return this.backgroundInitPromise;
  }

  async run(): Promise<void> {
    this.ensureBackgroundInitializationStarted();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Unified MCP Server running on stdio");
  }

  async connect(transport: any): Promise<void> {
    this.ensureBackgroundInitializationStarted();
    await this.server.connect(transport);
    logger.info("Unified MCP Server connected to transport");
  }
}
```

Then simplify the wrapper:

```ts
// src/mcp/stdio-wrapper.ts

async function main() {
  try {
    const server = await createUnifiedMCPServer();
    await server.run();
  } catch (error) {
    originalConsoleError("Fatal error:", error);
    process.exit(1);
  }
}
```

Acceptance criteria:

- stdio and direct-run paths initialize the same live node state
- node sync and orchestrator initialization are no longer transport-path dependent

### 1.3 Fix `workflow_execution` import behavior

File to change:

- `src/mcp/server-modern.ts`

Current issue:

- `workflow_execution` imports `./handlers-v3-tools` before the action switch.

Required change:

- Move imports inside the specific branches that actually need them.
- If the handler is optional, guard the import and return a real MCP error.

Recommended implementation:

```ts
// src/mcp/server-modern.ts

async (args) => {
  this.ensureN8nConfigured();
  const {
    action,
    webhookUrl,
    httpMethod,
    data,
    headers,
    id,
    filters,
    waitForResponse,
    loadWorkflow,
    workflowId,
    includeStats,
    limit,
  } = args as any;

  try {
    switch (action) {
      case "run":
        if (!workflowId && !id) throw new Error("workflowId required");
        return this.formatResponse(
          await n8nHandlers.handleRunWorkflow({ id: workflowId || id, data })
        );

      case "list_mcp": {
        const v3Handlers = await import("./handlers-v3-tools.js");
        return this.formatResponse(
          await v3Handlers.handleListExecutions({
            filters,
            limit,
            includeStats,
          })
        );
      }

      default:
        throw new Error(`Unsupported workflow_execution action: ${action}`);
    }
  } catch (error) {
    return this.formatErrorResponse(error, "workflow_execution");
  }
}
```

Notes:

- In the compiled build, extensionless dynamic import may be part of the issue. Prefer explicit `.js` in runtime-only dynamic imports if the build target is CommonJS plus transpiled dist execution.

## Phase 2: Unify Validation Semantics

### 2.1 Stop swallowing internal validation failures

Files to change:

- `src/services/mcp-tool-service.ts`
- `src/mcp/server-modern.ts`

Current issue:

- local validation catches internal exceptions and returns `{ valid: false, error: ... }`
- this is semantically different from "workflow invalid"

Required change:

- validation code should throw on internal failures
- only real workflow validation failures should return `valid: false`

Recommended implementation:

```ts
// src/services/mcp-tool-service.ts

import { validationCache } from "../utils/validation-cache";

private async validateWorkflow(workflow: any, options?: any): Promise<any> {
  const validator = new WorkflowValidator(
    this.repository,
    EnhancedConfigValidator
  );

  const result = await validator.validateWorkflow(workflow, options);

  let cacheHash: string | undefined;
  try {
    cacheHash = validationCache.recordValidation(workflow, result);
  } catch (error) {
    logger.warn("Failed to record validation cache entry", error);
  }

  const response: any = {
    valid: result.valid,
    validationCached: !!cacheHash,
    cacheHash,
    summary: {
      totalNodes: result.statistics.totalNodes,
      enabledNodes: result.statistics.enabledNodes,
      triggerNodes: result.statistics.triggerNodes,
      validConnections: result.statistics.validConnections,
      invalidConnections: result.statistics.invalidConnections,
      expressionsValidated: result.statistics.expressionsValidated,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
    },
  };

  if (result.errors.length > 0) {
    response.errors = result.errors.map((e) => ({
      node: e.nodeName || "workflow",
      message: e.message,
      details: e.details,
    }));
  }

  if (result.warnings.length > 0) {
    response.warnings = result.warnings.map((w) => ({
      node: w.nodeName || "workflow",
      message: w.message,
      details: w.details,
    }));
  }

  if (result.suggestions.length > 0) {
    response.suggestions = result.suggestions;
  }

  return response;
}
```

If `validation-cache` is optional, implement:

```ts
let validationCache: { recordValidation: (workflow: any, result: any) => string } | null = null;

try {
  ({ validationCache } = await import("../utils/validation-cache.js"));
} catch {
  validationCache = null;
}
```

But do not treat missing cache infrastructure as a workflow validation failure.

### 2.2 Make `workflow_manager validate` explicit about local vs remote modes

File to change:

- `src/mcp/server-modern.ts`

Current issue:

- `validate` defaults to the local validation path even when the user may expect live n8n validation.

Required change:

- expose `mode: "local" | "remote" | "full"` clearly
- document exact behavior
- for agent use, default to `full` but make `full` deterministic

Recommended implementation:

```ts
// src/mcp/server-modern.ts

mode: z.enum(["local", "remote", "full"]).optional().default("full")
  .describe("local=database/schema validation, remote=live n8n validation, full=both")
```

And in the tool service:

```ts
async validateWorkflowUnified(args: any): Promise<any> {
  const { workflow, workflowId, mode = "full", options = {} } = args;

  if (mode === "remote") {
    if (!workflowId) {
      throw new Error("workflowId is required for remote validation");
    }
    return n8nHandlers.handleValidateWorkflow({ id: workflowId, options }, this.repository);
  }

  if (!workflow) {
    throw new Error("workflow is required for local/full validation");
  }

  const localResult = await this.validateWorkflow(workflow, options);

  if (mode === "local") {
    return { mode: "local", ...localResult };
  }

  const remoteResult = workflowId
    ? await n8nHandlers.handleValidateWorkflow({ id: workflowId, options }, this.repository)
    : null;

  return {
    mode: "full",
    local: localResult,
    remote: remoteResult,
  };
}
```

Acceptance criteria:

- internal infrastructure faults raise MCP errors
- invalid workflows return `valid: false`
- callers can distinguish schema problems from server failures

## Phase 3: Canonicalize Node Identity Across the Entire Server

### 3.1 Add one node-type normalization helper and use it everywhere

New file:

- `src/core/node-type-normalizer.ts`

Recommended implementation:

```ts
// src/core/node-type-normalizer.ts

export function normalizeNodeType(nodeType: string): string {
  const value = nodeType.trim();

  if (value.startsWith("n8n-nodes-base.")) {
    return value.replace("n8n-nodes-base.", "nodes-base.");
  }

  if (value.startsWith("@n8n/n8n-nodes-base.")) {
    return value.replace("@n8n/n8n-nodes-base.", "nodes-base.");
  }

  if (value.startsWith("@n8n/n8n-nodes-langchain.")) {
    return value.replace("@n8n/n8n-nodes-langchain.", "nodes-langchain.");
  }

  if (value.startsWith("n8n-nodes-langchain.")) {
    return value.replace("n8n-nodes-langchain.", "nodes-langchain.");
  }

  return value;
}

export function getNodeTypeAliases(nodeType: string): string[] {
  const canonical = normalizeNodeType(nodeType);

  if (canonical.startsWith("nodes-base.")) {
    const suffix = canonical.substring("nodes-base.".length);
    return [
      canonical,
      `n8n-nodes-base.${suffix}`,
      `@n8n/n8n-nodes-base.${suffix}`,
    ];
  }

  if (canonical.startsWith("nodes-langchain.")) {
    const suffix = canonical.substring("nodes-langchain.".length);
    return [
      canonical,
      `n8n-nodes-langchain.${suffix}`,
      `@n8n/n8n-nodes-langchain.${suffix}`,
    ];
  }

  return [canonical];
}
```

### 3.2 Update `NodeFilter` to operate on canonical node types

File to change:

- `src/core/node-filter.ts`

Recommended implementation:

```ts
import { normalizeNodeType } from "./node-type-normalizer";

public isNodeAllowed(nodeType: string): boolean {
  const canonical = normalizeNodeType(nodeType);

  if (canonical.startsWith("nodes-base.")) {
    return true;
  }

  if (canonical.startsWith("nodes-langchain.")) {
    return true;
  }

  if (this.allowCommunityNodes) {
    return true;
  }

  if (this.communityNodeWhitelist.has(canonical) || this.communityNodeWhitelist.has(nodeType)) {
    return true;
  }

  return false;
}
```

### 3.3 Update repository lookups to use the same normalizer

File to change:

- `src/database/node-repository.ts`

Recommended implementation:

```ts
import { normalizeNodeType, getNodeTypeAliases } from "../core/node-type-normalizer";

getNodeByType(nodeType: string, typeVersion?: number): any {
  const aliases = getNodeTypeAliases(nodeType);

  for (const alias of aliases) {
    const row = this.db
      .prepare("SELECT * FROM nodes WHERE node_type = ?")
      .get(normalizeNodeType(alias)) as any;

    if (row) {
      return this.hydrateNodeRow(row, typeVersion);
    }
  }

  return null;
}
```

Acceptance criteria:

- `search`, `list`, `get_info`, and workflow validation all agree on the same node identity
- official built-in nodes are never blocked due to alias mismatch

## Phase 4: Convert Discovery into Retrieval

This is the key to giving agents access to all live nodes without blowing the context window.

### 4.1 Fix the current `node_discovery` contract

File to change:

- `src/mcp/server-modern.ts`

Required changes:

- use `package`, not `pkg`
- do not default list behavior to `trigger`
- support compact and detailed response modes

Recommended implementation:

```ts
// src/mcp/server-modern.ts

const {
  action,
  query,
  category,
  package: packageName,
  limit,
  nodeType,
  includeDocumentation,
  includeDetails,
} = args as any;

case "list":
  return this.formatResponse(
    await this.toolService!.listNodesOptimized({
      category,
      package: packageName,
      limit,
      includeDetails,
    })
  );
```

Update the service default:

```ts
// src/services/mcp-tool-service.ts

async listNodesOptimized(filters: any = {}): Promise<any> {
  const optimizedFilters = {
    ...filters,
    limit: filters.limit || 50,
  };

  if (filters.category === "all") {
    delete optimizedFilters.category;
  }

  // Remove the current default-to-trigger behavior
}
```

### 4.2 Add a capability index

New file:

- `src/services/node-capability-index.ts`

Purpose:

- maintain a compact, searchable representation of the live installed node set
- avoid returning giant node catalogs

Recommended implementation outline:

```ts
export interface NodeCapabilityDocument {
  nodeType: string;
  displayName: string;
  description: string;
  package: string;
  category: string;
  operations: string[];
  capabilities: string[];
  requiresCredential: boolean;
  isAITool: boolean;
}

export class NodeCapabilityIndex {
  private docs = new Map<string, NodeCapabilityDocument>();

  build(nodes: any[]): void {
    this.docs.clear();
    for (const node of nodes) {
      const doc = this.toDocument(node);
      this.docs.set(doc.nodeType, doc);
    }
  }

  recommendForGoal(goal: string, limit = 8): NodeCapabilityDocument[] {
    const tokens = this.tokenize(goal);
    return Array.from(this.docs.values())
      .map((doc) => ({ doc, score: this.score(doc, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.doc);
  }

  private toDocument(node: any): NodeCapabilityDocument {
    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      description: node.description || "",
      package: node.package || "",
      category: node.category || "",
      operations: this.extractOperations(node),
      capabilities: this.extractCapabilities(node),
      requiresCredential: this.detectCredentialRequirement(node),
      isAITool: !!node.isAITool,
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  private score(doc: NodeCapabilityDocument, tokens: string[]): number {
    let score = 0;

    for (const token of tokens) {
      if (doc.displayName.toLowerCase().includes(token)) score += 5;
      if (doc.description.toLowerCase().includes(token)) score += 3;
      if (doc.operations.some((op) => op.includes(token))) score += 4;
      if (doc.capabilities.some((cap) => cap.includes(token))) score += 6;
      if (doc.category.toLowerCase().includes(token)) score += 2;
    }

    return score;
  }
}
```

### 4.3 Add retrieval-oriented MCP actions

File to change:

- `src/mcp/server-modern.ts`

Add actions to `node_discovery`:

- `recommend_for_goal`
- `get_essentials`
- `get_examples`

Example schema:

```ts
action: z.enum([
  "search",
  "list",
  "list_installed",
  "get_info",
  "get_documentation",
  "search_properties",
  "recommend_for_goal",
  "get_essentials",
  "get_examples",
]),
goal: z.string().optional(),
verbosity: z.enum(["compact", "standard", "full"]).optional().default("compact"),
```

Example handler:

```ts
case "recommend_for_goal":
  if (!args.goal) throw new Error("goal required");
  return this.formatResponse(
    await this.toolService!.recommendNodesForGoal({
      goal: args.goal,
      limit: limit || 8,
      verbosity: args.verbosity || "compact",
    })
  );
```

Response shape should be compact by default:

```json
{
  "goal": "When webhook received, classify revenue signal and notify Slack",
  "recommendations": [
    {
      "nodeType": "nodes-base.webhook",
      "displayName": "Webhook",
      "whyRelevant": "Receives external revenue events",
      "commonOperations": ["webhook"],
      "requiresCredential": false,
      "betterThanCodeFor": ["HTTP intake", "payload capture"]
    }
  ]
}
```

Acceptance criteria:

- the agent can access all live nodes through retrieval
- responses stay small enough for multi-step planning

## Phase 5: Enforce Built-In-First Workflow Generation

This is the phase that reduces `Code` nodes.

### 5.1 Add a workflow planning tool

File to add:

- `src/services/workflow-planner.ts`

Purpose:

- turn broad business requirements into a step plan before JSON generation

Recommended interface:

```ts
export interface WorkflowPlanStep {
  id: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  requiredCapabilities: string[];
}

export interface WorkflowPlan {
  goal: string;
  steps: WorkflowPlanStep[];
  constraints: string[];
}

export class WorkflowPlanner {
  createPlan(goal: string, constraints: string[] = []): WorkflowPlan {
    // deterministic heuristic planner
    // no raw workflow JSON here
    return {
      goal,
      constraints,
      steps: [
        {
          id: "trigger",
          purpose: "Receive or start the workflow",
          inputs: [],
          outputs: ["payload"],
          requiredCapabilities: ["trigger"],
        },
      ],
    };
  }
}
```

Expose it as a tool or action:

- `workflow_manager action=plan`
- or a new tool: `workflow_planner`

### 5.2 Add a built-in alternatives critic

New file:

- `src/services/workflow-builtins-critic.ts`

Purpose:

- inspect a workflow candidate
- if it contains `Code` or `toolCode`, propose built-in replacements from the live capability index

Recommended implementation:

```ts
export class WorkflowBuiltinsCritic {
  constructor(private capabilityIndex: NodeCapabilityIndex) {}

  critique(workflow: any): {
    passed: boolean;
    violations: Array<{
      nodeName: string;
      nodeType: string;
      reason: string;
      alternatives: string[];
    }>;
  } {
    const violations: Array<{
      nodeName: string;
      nodeType: string;
      reason: string;
      alternatives: string[];
    }> = [];

    for (const node of workflow.nodes || []) {
      if (node.type === "n8n-nodes-base.code" || node.type === "n8n-nodes-base.toolCode") {
        const alternatives = this.findAlternatives(node);
        violations.push({
          nodeName: node.name,
          nodeType: node.type,
          reason: "Built-in alternative required before allowing code node",
          alternatives,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  private findAlternatives(node: any): string[] {
    const prompt = JSON.stringify(node.parameters || {});
    return this.capabilityIndex
      .recommendForGoal(prompt, 5)
      .map((doc) => doc.nodeType);
  }
}
```

### 5.3 Integrate the critic into create/validate

Files to change:

- `src/mcp/handlers-n8n-manager.ts`
- `src/services/mcp-tool-service.ts`

Required behavior:

- if a built-in alternative exists, reject or warn on code nodes
- permit code nodes only with explicit caller intent or no viable alternative

Suggested policy:

- default policy: `built-in-first`
- override option: `allowCodeNodes: true`

Example schema addition:

```ts
allowCodeNodes: z.boolean().optional().default(false),
```

Example enforcement:

```ts
if (!input.allowCodeNodes) {
  const critique = builtinsCritic.critique(workflowInput);
  if (!critique.passed) {
    return createErrorResponse(
      "Workflow uses code nodes where built-in alternatives are available",
      "BUILTIN_ALTERNATIVE_REQUIRED",
      { violations: critique.violations }
    );
  }
}
```

Acceptance criteria:

- agent-generated workflows use built-in nodes by default
- code nodes appear only when explicitly allowed or genuinely necessary

## Phase 6: Make Patch and Update API-Faithful

### 6.1 Replace `setNestedValue()` with an array-aware setter

File to change:

- `src/mcp/handlers-n8n-manager.ts`

Recommended implementation:

```ts
function parsePath(path: string): Array<string | number> {
  const parts: Array<string | number> = [];
  const regex = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1]);
    } else if (match[2] !== undefined) {
      parts.push(Number(match[2]));
    }
  }

  return parts;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const segments = parsePath(path);
  let current = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const nextKey = segments[i + 1];

    if (current[key] === undefined || current[key] === null) {
      current[key] = typeof nextKey === "number" ? [] : {};
    }

    current = current[key];
  }

  current[segments[segments.length - 1]] = value;
}
```

### 6.2 Normalize create/update/patch through one workflow payload builder

New file:

- `src/services/workflow-payload-builder.ts`

Purpose:

- one canonical path for clean API-safe workflow payloads

Recommended interface:

```ts
export function buildWorkflowApiPayload(workflow: any, mode: "create" | "update") {
  return mode === "create"
    ? cleanAndFixWorkflowForCreate(workflow).cleaned
    : cleanAndFixWorkflowForUpdate(workflow).cleaned;
}
```

Use it in:

- `handleCreateWorkflow`
- `handleUpdateWorkflow`
- `handlePatchWorkflow`
- `n8n-api-client.ts`
- optionally `n8n-connector.ts`

Acceptance criteria:

- `create`, `update`, and `patch` all emit the same legal payload shape
- patch no longer fails due to shape drift between handlers

## Phase 7: Improve Tool Surface for Agent Use

The current umbrella tools are too broad. Keep them if needed for backward compatibility, but add narrower, agent-friendly entry points.

Recommended additions:

- `recommend_nodes_for_goal`
- `plan_workflow`
- `critique_workflow`
- `create_workflow`
- `validate_workflow`
- `patch_workflow_parameter`

If backward compatibility matters, implement them as thin wrappers over the current service layer.

Recommended tool behavior:

### `recommend_nodes_for_goal`

Input:

```json
{
  "goal": "Build a webhook-driven renewal risk workflow that updates HubSpot and notifies Slack",
  "limit": 8
}
```

Output:

```json
{
  "goal": "Build a webhook-driven renewal risk workflow that updates HubSpot and notifies Slack",
  "recommendations": [
    {
      "nodeType": "nodes-base.webhook",
      "displayName": "Webhook",
      "whyRelevant": "Receives external CRM or billing events",
      "requiresCredential": false
    },
    {
      "nodeType": "nodes-base.hubspot",
      "displayName": "HubSpot",
      "whyRelevant": "Update renewal or account records directly in CRM",
      "requiresCredential": true
    },
    {
      "nodeType": "nodes-base.slack",
      "displayName": "Slack",
      "whyRelevant": "Send account-risk alerts to revenue teams",
      "requiresCredential": true
    }
  ]
}
```

### `plan_workflow`

Input:

```json
{
  "goal": "Classify inbound revenue events and route renewal risks to Slack and HubSpot"
}
```

Output:

```json
{
  "goal": "Classify inbound revenue events and route renewal risks to Slack and HubSpot",
  "steps": [
    {
      "id": "trigger",
      "purpose": "Receive the revenue event",
      "requiredCapabilities": ["trigger", "webhook"]
    },
    {
      "id": "normalize",
      "purpose": "Normalize account fields",
      "requiredCapabilities": ["transform"]
    },
    {
      "id": "classify",
      "purpose": "Classify event severity and type",
      "requiredCapabilities": ["ai", "classifier"]
    },
    {
      "id": "act",
      "purpose": "Write updates to downstream systems",
      "requiredCapabilities": ["crm", "messaging"]
    }
  ]
}
```

### `critique_workflow`

Output should include:

- code-node violations
- missing credentials
- unavailable live nodes
- missing required parameters
- overly large context-producing nodes

## Phase 7A: Align Direct Chat and OpenWebUI to the Same MCP Core

The direct end-user chat path is in scope, but it must not become a second backend with its own stale tool contract.

Required change:

- make direct chat/OpenWebUI a thin interface over the same live MCP tool core used by external agents
- remove assumptions that the chat UI can depend on historical setup-wizard endpoints or authless side contracts
- expose nano-LLM readiness, supported tools, and runtime health through the same canonical backend surface

Primary files to align:

- `src/interfaces/openwebui-interface.ts`
- `public/index.html`
- `src/web-ui/index.html`
- `src/http-server-single-session.ts`

Acceptance criteria:

- direct chat/OpenWebUI calls the same live tool/validation path as external agents
- no supported chat path depends on deprecated `/api/setup/*` or historical side-product endpoints
- embedded nano LLM status and tool availability are surfaced from the real supported backend

## Phase 8: Add Live Integration Tests

This is mandatory. Unit tests are not enough for this server.

### 8.1 Add a live MCP smoke suite

New tests:

- `tests/integration/mcp/live-node-discovery.test.ts`
- `tests/integration/mcp/live-workflow-crud.test.ts`
- `tests/integration/mcp/live-patch.test.ts`
- `tests/integration/mcp/live-builtins-policy.test.ts`
- `tests/integration/setup/guided-setup-npm.test.ts`
- `tests/integration/setup/guided-setup-docker-desktop.test.ts`
- `tests/integration/setup/guided-setup-agent-snippets.test.ts`

Test matrix:

1. startup
   - connect via stdio
   - confirm background initialization started
2. node discovery
   - search built-in nodes
   - get info using all official aliases
   - verify canonical resolution
3. workflow CRUD
   - create workflow with sticky notes
   - create workflow with AI nodes
   - get workflow
   - update workflow
   - validate workflow
4. patch
   - patch scalar parameter
   - patch nested object
   - patch array path
5. built-in policy
   - submit code-node workflow where built-in alternative exists
   - assert rejection or rewrite directive
6. remote integrations
   - list credentials
   - list tags
   - list workflows

### 8.2 Add guided setup acceptance coverage

Test matrix:

1. first-run setup for direct `npm` / `npx`
   - launch the guided setup flow
   - validate `N8N_API_URL` and `N8N_API_KEY`
   - write the real `.env` to the app config dir
   - verify post-setup startup succeeds
2. first-run setup for Docker Desktop
   - launch the same guided setup flow
   - validate the same n8n connection path
   - write the real `.env` to the mounted config/data volume
   - verify restart preserves config and startup succeeds
3. config editing
   - load existing config into the wizard
   - update one setting
   - verify the persisted runtime config is updated cleanly
4. agent integration
   - validate Claude Desktop registration output
   - validate generated generic MCP snippets for the chosen setup channel
5. secret handling
   - confirm `data/setup-state.json` contains no secrets
   - confirm the real runtime `.env` is the source of truth for guided setup configuration

### 8.3 Add regression fixtures

Recommended fixtures:

- sticky note workflow
- agent workflow with model, memory, and toolWorkflow nodes
- text classifier + information extractor workflow
- webhook + switch + slack workflow

## Phase 9: Unify Entrypoints, Packaging, Runtime Baseline, and Supported Setup Channels

This repo currently has multiple incompatible startup surfaces.

Observed problems:

- `src/main.ts` starts the legacy MCP interface in stdio mode
- `.mcp.json` points to `dist/main.js`, which follows that legacy path
- `smithery.yaml` points to `build/index.js`, which does not exist
- `README.md` and several setup docs still instruct users to run `npm run go`, which does not exist
- the root `package.json` engine range is looser than the real lower bound imposed by the installed `n8n` dependency stack

These are not cosmetic issues. They guarantee that different clients hit different servers.

### 9.0 Support two verified setup channels for the same product

Required change:

- support direct `npm` / `npx` usage as a first-class local install/launch path
- support Docker Desktop as a first-class containerized install/launch path
- require both channels to boot the same unified MCP core, the same HTTP/API layer, the same supported direct-chat/OpenWebUI path, and the same guided setup flow
- do not let either supported channel depend on the historical setup-dashboard product behavior

Acceptance criteria:

- the direct `npm` / `npx` path and the Docker Desktop path are both documented, built, and smoke-tested
- both setup channels expose the same supported product behavior, not parallel feature sets
- no setup channel routes users through legacy launchers or unsupported side-product flows

### 9.1 Lock one supported Node/runtime floor

Required change:

- declare one supported runtime floor based on the real dependency chain
- use `Node >=20.19 <=24.x` as the supported baseline unless the dependency audit changes
- choose one primary tested runtime target, with Node 22.x LTS as the default operational target

Acceptance criteria:

- root package metadata, client examples, CI, and packaging docs all publish the same supported runtime floor
- supported launchers fail clearly when the runtime does not meet that floor

### 9.2 Make the unified stdio wrapper the only published MCP entrypoint

Files to change:

- `.mcp.json`
- `package.json`
- `src/main.ts`
- `README.md`
- `smithery.yaml`

Recommended implementation:

```json
// .mcp.json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["dist/mcp/stdio-wrapper.js"],
      "cwd": "c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP"
    }
  }
}
```

```json
// package.json
{
  "main": "dist/mcp/stdio-wrapper.js",
  "bin": {
    "n8n-mcp": "./dist/mcp/stdio-wrapper.js"
  }
}
```

If `src/main.ts` is retained, it should be an HTTP/bootstrap entrypoint only:

```ts
// src/main.ts

if (config.mode === "http") {
  const httpServer = new SingleSessionHTTPServer();
  await httpServer.start();
} else {
  const { createUnifiedMCPServer } = await import("./mcp/server-modern");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = await createUnifiedMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 9.3 Publish direct `npm` / `npx` and Docker Desktop from the same runtime description

Required changes:

- `package.json` and `package.runtime.json` must publish the supported direct `npm` / `npx` contract
- Dockerfiles and the supported compose topology must launch the same runtime and direct-chat stack
- one documented direct setup command must launch the guided setup wizard for local installs
- one documented Docker Desktop path must launch the same guided setup wizard for container installs
- `start.sh`, `start.bat`, and Docker quick-start assets must stop routing users into legacy setup-dashboard flows

Acceptance criteria:

- one documented direct `npm` / `npx` command path launches the supported product
- one documented Docker Desktop path launches the same supported product
- both paths reference the same executable/runtime contract in docs and packaging metadata

### 9.4 Fix release metadata and startup documentation

Required changes:

- delete references to `npm run go` unless that script is restored
- delete references to `dist/consolidated-server.js` unless that artifact is restored
- point Smithery to the real executable

Recommended implementation:

```yaml
# smithery.yaml
version: 1
start:
  command: ["node", "dist/mcp/stdio-wrapper.js"]
  port: 8000
```

Acceptance criteria:

- every client-facing config points to the same unified MCP server
- docs describe commands that actually exist

### 9.5 Standardize the module and build strategy

Observed problem:

- source is compiled with `module: "commonjs"`
- emitted `dist` still contains extensionless dynamic `import()` calls
- runtime failures occur even when the target files exist in `dist`

Required change:

- choose one module strategy and enforce it consistently
- if keeping CommonJS output, avoid extensionless runtime `import()` for internal files
- add a post-build smoke test that loads the key runtime paths

Recommended options:

Option A: keep CommonJS and convert internal dynamic imports to safe forms:

```ts
// Prefer static import when the dependency is required
import * as v3Handlers from "./handlers-v3-tools";

// Or, if it must stay dynamic, use the emitted .js path explicitly
const v3Handlers = await import("./handlers-v3-tools.js");
```

Option B: move the project to `NodeNext` / ESM and update the compiler config deliberately:

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

Add a build smoke script:

```json
// package.json
{
  "scripts": {
    "build:smoke": "node -e \"require('./dist/mcp/server-modern.js'); require('./dist/mcp/tools-nano-agents.js'); require('./dist/services/mcp-tool-service.js')\""
  }
}
```

If TypeScript memory remains a problem, explicitly raise the heap or use the existing esbuild path for production packaging:

```json
// package.json
{
  "scripts": {
    "build": "node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -p tsconfig.build.json",
    "build:package": "node scripts/build-esbuild.js"
  }
}
```

Acceptance criteria:

- compiled runtime can import all optional modules it references
- build output is smoke-tested before release

## Phase 10: Bring HTTP Mode to Feature Parity

Observed problems in `src/http-server-single-session.ts`:

- `/api/status` returns hardcoded capability data
- `/api/patterns` returns static sample patterns
- `/api/nodes` returns three sample nodes
- `/api/graph/insights` returns fabricated counts and insights
- `/api/orchestrate` returns a placeholder workflow that includes a `Code` node
- constructor requires `AUTH_TOKEN`, while docs and Docker config treat it as optional

### 10.1 Replace placeholder endpoints with real service-backed responses

File to change:

- `src/http-server-single-session.ts`

Recommended implementation outline:

```ts
app.get("/api/status", async (req, res) => {
  const status = await this.session?.server.executeTool("n8n_system", {
    action: "health",
  });

  res.json({
    mode: "full",
    timestamp: new Date().toISOString(),
    status,
  });
});

app.get("/api/nodes", async (req, res) => {
  const query = typeof req.query.search === "string" ? req.query.search : undefined;

  const result = await this.session?.server.executeTool("node_discovery", {
    action: query ? "search" : "list",
    query,
    category: "all",
    limit: 25,
  });

  res.json(result);
});

app.post("/api/orchestrate", async (req, res) => {
  const { goal } = req.body;

  const plan = await this.session?.server.executeTool("workflow_manager", {
    action: "plan",
    goal,
  });

  res.json(plan);
});
```

If the HTTP UI needs a friendly aggregated response, build it from real MCP tool calls. Do not maintain a separate fake contract.

### 10.2 Make HTTP auth behavior consistent

Recommended policy:

- MCP-over-HTTP endpoints require auth in production
- local development may disable auth explicitly with `AUTH_DISABLED=true`
- docs and Docker samples must match the constructor behavior

Recommended implementation:

```ts
private validateEnvironment(): void {
  const authDisabled = process.env.AUTH_DISABLED === "true";

  if (!authDisabled && !process.env.AUTH_TOKEN) {
    throw new Error("AUTH_TOKEN is required unless AUTH_DISABLED=true");
  }

  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.length < 32) {
    logger.warn("AUTH_TOKEN should be at least 32 characters for security");
  }
}
```

Acceptance criteria:

- HTTP mode returns real system state
- HTTP orchestration no longer emits fake workflows or `Code` node placeholders
- auth policy is consistent across code, docs, and Docker

## Phase 11: Replace Hardcoded Agent Generation and Legacy Response Guidance

Observed problems:

- `PatternAgent` accepts single-keyword matches with confidence `0.2`
- `PatternAgent` uses overlapping keywords such as `message` and `send`, which cross-contaminate Slack and email patterns
- `WorkflowAgent` uses a tiny hardcoded node registry instead of the live installed node set
- `WorkflowAgent` defaults many templates to `Manual Trigger`
- `ContextIntelligenceEngine` and `AdaptiveResponseBuilder` still recommend legacy tool names

### 11.1 Tighten pattern matching and remove ambiguous keyword inflation

Files to change:

- `src/ai/agents/pattern-agent.ts`

Recommended changes:

- raise the minimum keyword-only threshold
- reduce or eliminate generic keywords such as `message`, `send`, `workflow`
- prefer semantic similarity plus capability-based ranking over raw keyword boosts

Example adjustment:

```ts
// src/ai/agents/pattern-agent.ts

// Before returning keyword matches
return Array.from(matches.values()).filter((m) => m.confidence >= 0.45);
```

Replace overly generic keyword sets:

```ts
{
  id: "slack-notification",
  keywords: ["slack", "channel", "workspace", "alert"],
}

{
  id: "email-workflow",
  keywords: ["email", "mail", "inbox", "smtp"],
}
```

### 11.2 Replace the hardcoded workflow-agent node registry with live retrieval

Files to change:

- `src/ai/agents/workflow-agent.ts`
- `src/ai/agents/graphrag-nano-orchestrator.ts`

Current issue:

- `WorkflowAgent` initializes a tiny in-memory registry of a few node templates
- it cannot see most nodes installed in the live instance

Required change:

- inject the live capability index or node recommendation service into `WorkflowAgent`
- select triggers from the goal, not from hardcoded `Manual Trigger` defaults

Recommended implementation outline:

```ts
export class WorkflowAgent extends BaseAgent {
  constructor(
    sharedMemory: SharedMemory,
    private capabilityIndex: NodeCapabilityIndex,
    llmAdapter?: LLMAdapterInterface
  ) {
    super(config, sharedMemory, llmAdapter);
  }

  async initialize(): Promise<void> {
    await super.initialize();
  }

  private recommendNodes(goal: string): NodeCapabilityDocument[] {
    return this.capabilityIndex.recommendForGoal(goal, 10);
  }
}
```

Then in the orchestrator:

```ts
this.workflowAgent = new WorkflowAgent(
  this.sharedMemory,
  capabilityIndex,
  adapter
);
```

### 11.3 Derive response hints from the current tool surface

Files to change:

- `src/intelligent/context-intelligence-engine.ts`
- `src/intelligent/adaptive-response-builder.ts`

Current issue:

- these files still recommend legacy tool names such as `get_workflow`, `validate_workflow`, `n8n_retry_execution`

Required change:

- replace hardcoded old names with current tool/action guidance
- ideally derive hints from a single registry so they cannot drift again

Recommended implementation:

```ts
const NEXT_TOOL_MAP = {
  workflow_manager: {
    create: ["workflow_manager.validate", "workflow_execution.run"],
    get: ["workflow_execution.list", "workflow_diff.diff"],
  },
  node_discovery: {
    search: ["node_discovery.get_info", "node_validation.validate_node_minimal"],
  },
};
```

Or better, centralize this in:

- `src/mcp/tool-registry.ts`

and have the intelligence layer consume the registry instead of duplicating tool names in prose.

Acceptance criteria:

- pattern selection is materially less ambiguous
- workflow generation uses live nodes, not a fixed hand-built template list
- response guidance recommends current tools only

## Phase 12: Repair Shared-State and Cache Semantics

Observed problems:

- agents and handlers communicate through global shared-memory keys such as `generated-workflow`, `selected-pattern`, and `graph-insights`
- these keys are not scoped by request, session, workflow draft, or caller
- `handleCreateWorkflow()` already proved how dangerous that is: a stale generated workflow can override a caller's explicit input
- `UnifiedValidationSystem.generateCacheKey()` uses a weak structural summary instead of a true content hash
- `UnifiedValidationSystem.clearCache()` is effectively a no-op
- handler error aggregation has correctness bugs such as the non-incrementing `recent-errors.errorCount`

### 12.1 Namespace shared-memory entries by execution context

Files to change:

- `src/ai/shared-memory.ts`
- `src/mcp/handler-shared-memory.ts`
- `src/ai/agents/graphrag-nano-orchestrator.ts`
- `src/ai/agents/pattern-agent.ts`
- `src/ai/agents/workflow-agent.ts`
- `src/ai/agents/validator-agent.ts`

Required change:

- replace global keys with scoped keys tied to a pipeline run or request ID

Recommended key shape:

```ts
const scope = {
  sessionId,
  requestId,
  pipelineId,
};

const key = `pipeline:${scope.pipelineId}:generated-workflow`;
```

Recommended helper:

```ts
export function buildScopedMemoryKey(
  scope: { sessionId?: string; requestId?: string; pipelineId?: string },
  key: string
): string {
  const prefix = [
    scope.sessionId ? `session:${scope.sessionId}` : null,
    scope.requestId ? `request:${scope.requestId}` : null,
    scope.pipelineId ? `pipeline:${scope.pipelineId}` : null,
  ]
    .filter(Boolean)
    .join(":");

  return prefix ? `${prefix}:${key}` : key;
}
```

Then replace:

- `generated-workflow`
- `selected-pattern`
- `graph-insights`
- `validation-results`
- `pattern-matches:${goal}`

with scoped equivalents.

### 12.2 Replace weak validation cache keys with stable workflow hashes

File to change:

- `src/mcp/unified-validation.ts`

Current issue:

- current cache key uses node count, connection count, top-level key length, and node types
- two materially different workflows can collide

Recommended implementation:

```ts
import { createHash } from "crypto";
import { buildWorkflowApiPayload } from "../services/workflow-payload-builder";

private generateCacheKey(workflow: any, profile: string): string {
  const canonical = buildWorkflowApiPayload(workflow, "create");
  const serialized = JSON.stringify(canonical);

  return createHash("sha256")
    .update(profile)
    .update(":")
    .update(serialized)
    .digest("hex");
}
```

### 12.3 Make cache clearing real

Required change:

- SharedMemory needs either:
  - bulk delete by pattern, or
  - scoped versioning so a namespace can be invalidated cheaply

Recommended API:

```ts
// src/ai/shared-memory.ts

async deleteByPattern(pattern: string, agentId?: string): Promise<number> {
  if (!this.initialized || !this.db) {
    throw new Error("Shared memory not initialized");
  }

  let sql = "DELETE FROM memory WHERE key LIKE ?";
  const params: any[] = [pattern];

  if (agentId) {
    sql += " AND agentId = ?";
    params.push(agentId);
  }

  const stmt = this.db.prepare(sql);
  const result = stmt.run(...params);
  return result.changes as number;
}
```

Then `UnifiedValidationSystem.clearCache()` can actually clear `validation-cache:%`.

### 12.4 Fix summary counters and history accuracy

File to change:

- `src/mcp/handler-shared-memory.ts`

Current issue:

- `errorCount: (await memory.get('recent-errors'))?.errorCount || 0 + 1` does not increment properly

Correct implementation:

```ts
const existing = await memory.get<{ errorCount?: number }>("recent-errors");
const nextErrorCount = (existing?.errorCount ?? 0) + 1;
```

Acceptance criteria:

- shared-memory state is scoped to a caller/request/pipeline
- validation cache collisions are eliminated
- cache invalidation is real
- handlers no longer consume stale agent output from unrelated runs

## Phase 13: Consolidate Duplicate Connector/Catalog/Validation Stacks

Observed problems:

- the repo contains both:
  - a repository-based stack centered on `NodeRepository`, `N8nApiClient`, `WorkflowValidator`, and `N8nNodeSync`
  - a live-catalog stack centered on `NodeCatalog`, `ValidationGateway`, and `N8nConnector`
- the legacy MCP interface and parts of `core/` still use the older live-catalog stack
- the unified MCP server mostly uses the repository-based stack
- these stacks do not share a single node identity model, payload cleaner, or validation policy

### 13.1 Choose one canonical runtime stack

Recommended choice:

- keep the repository-based unified MCP stack as the source of truth
- retire the `core/NodeCatalog/ValidationGateway/N8nConnector` stack from runtime-critical paths

Reason:

- the newer stack already has `NodeRepository`, `N8nApiClient`, `N8nNodeSync`, `WorkflowValidator`, and the unified MCP handlers
- trying to keep both stacks "in sync" will continue to create drift

### 13.2 Reduce the older stack to compatibility wrappers or remove it

Files to change:

- `src/core/n8n-connector.ts`
- `src/core/node-catalog.ts`
- `src/core/validation-gateway.ts`
- `src/core/index.ts`
- `src/interfaces/mcp-interface.ts`
- `src/interfaces/openwebui-interface.ts`

Recommended direction:

- if these files are still needed, turn them into wrappers around:
  - `N8nApiClient`
  - `NodeRepository`
  - `N8nNodeSync`
  - `WorkflowValidator`
- otherwise, deprecate them and remove them from startup/config paths

### 13.3 Remove or quarantine workflow-extraction node discovery fallback

Files to change:

- `src/core/node-catalog.ts`
- `src/services/n8n-node-sync.ts`

Current issue:

- fallback discovery extracts node types by scanning every workflow and then fetching each workflow individually
- this is N+1 API behavior
- it yields only partial node information with empty properties
- using it as a validation/discovery source can poison later decisions

Recommended policy:

- use workflow extraction only as a last-resort diagnostic signal
- never treat it as authoritative schema data

Recommended implementation:

```ts
return {
  availableNodeTypes: Array.from(usedNodeTypes),
  authority: "workflow-scan-fallback",
  schemaComplete: false,
};
```

Do not feed those entries into full validation as if they were real node definitions.

Acceptance criteria:

- there is one canonical runtime path for node discovery and workflow validation
- older stacks no longer diverge silently
- workflow-scan fallback is clearly marked as incomplete and non-authoritative

## Phase 14: Clean Up Unsafe or Misleading Input-Normalization Utilities

Observed problem:

- `src/utils/input-validator.ts` mixes HTML escaping with identifier and URL validation
- it escapes `/`, which corrupts valid scoped node types and URLs before validation
- it then treats `/` as path traversal in node types, which conflicts with valid official scoped node names
- it appears to be mostly unused in production code, which makes it even more dangerous as a false sense of safety

### 14.1 Separate escaping from validation

Recommended rule:

- validation functions should validate raw values
- HTML escaping should happen only at render/output boundaries, not in core identifiers

Recommended replacement:

```ts
static validateNodeType(nodeType: unknown): string {
  if (typeof nodeType !== "string") {
    throw new Error("Input must be a string");
  }

  const value = nodeType.replace(/\0/g, "").trim();

  const validPattern = /^(@[a-zA-Z0-9-_]+\/)?[a-zA-Z0-9-_.]+$/;
  if (!validPattern.test(value)) {
    throw new Error(`Invalid node type format: ${value}`);
  }

  if (value.includes("..")) {
    throw new Error(`Potential path traversal in node type: ${value}`);
  }

  return value;
}
```

And URL validation should validate the raw string via `new URL(value)` without escaping it first.

### 14.2 Decide whether to wire it in correctly or remove it

Because this validator is currently mostly exercised by tests rather than runtime code, make a deliberate choice:

- either integrate a corrected version into actual handler boundaries
- or remove/deprecate it so the codebase does not pretend to have protections it is not actually using

Acceptance criteria:

- node-type and URL validation no longer mutates valid inputs
- the codebase has one clear input-validation story instead of an unused pseudo-safety layer

## Recommended Order of Implementation

Implement in this order:

1. lock the supported product matrix and explicitly mark non-core surfaces
2. remove checked-in secrets from supported surfaces and define canonical config precedence
3. design and implement the guided setup flow and setup API contract
4. remove hidden create override
5. unify startup init in `run()` and `connect()`
6. fix runtime imports in `workflow_execution`, validation, and GraphRAG tools
7. choose the canonical validation/discovery/retrieval stack
8. add node-type normalization and fix `package` handling plus discovery defaults
9. add capability index and compact recommendation actions
10. replace hardcoded workflow-agent registry with live retrieval and built-in-first critique
11. align direct chat/OpenWebUI to the same MCP core and remove historical setup-dashboard assumptions from the supported path
12. replace patch setter with array-aware path parsing and unify workflow payload building
13. replace placeholder HTTP endpoints with real MCP-backed responses
14. align package metadata, supported Node/runtime floor, direct `npm` / `npx`, Docker Desktop, setup commands, compose files, and client examples
15. namespace shared-memory state and replace weak validation-cache keys with real hashes
16. quarantine/archive duplicate legacy stacks, historical setup surfaces, generated corpora, and non-core examples
17. repair or quarantine dead tests and add live smoke plus setup acceptance coverage

## Concrete File-by-File Change List

### `src/config/n8n-api.ts`

- remove `dotenv.config({ override: true })`
- establish explicit precedence where caller/injected runtime config beats repo-local `.env`
- provide config reset/reload behavior for tests and long-lived processes
- add app-config-dir support for the real writable `.env` used by guided setup

### `src/http/routes-local-llm.ts`

- split guided setup concerns from legacy local-LLM-only behavior
- stop storing secrets in `data/setup-state.json`
- add canonical setup validate/write/register/snippet actions
- keep only non-sensitive setup metadata separate from the real `.env`

### `src/interfaces/openwebui-interface.ts`

- align the direct-chat/OpenWebUI contract with the unified MCP tool layer
- remove or quarantine any authless or legacy-tool assumptions that make it a parallel backend

### `src/mcp/handlers-n8n-manager.ts`

- remove implicit SharedMemory override
- add `useAgentGeneratedWorkflow`
- add `allowCodeNodes`
- use built-in critic before create/update
- replace `setNestedValue()` with array-aware implementation
- route create/update/patch through one payload builder

### `src/mcp/server-modern.ts`

- fix `node_discovery` schema/handler mismatch for `package`
- remove default discovery bias toward triggers
- lazy-load optional handler modules only inside required actions
- share background initialization between `run()` and `connect()`
- expose narrower retrieval-oriented actions

### `src/main.ts`

- stop routing stdio mode to the legacy interface
- make the stdio path use the unified server or limit this file to HTTP/bootstrap responsibilities

### `src/http-server-single-session.ts`

- replace placeholder `/api/status`, `/api/patterns`, `/api/nodes`, `/api/graph/insights`, and `/api/orchestrate`
- align auth requirements with docs and Docker
- build friendly HTTP responses from real MCP tool calls instead of maintaining a fake parallel contract
- make supported direct-chat/OpenWebUI routes call the same live MCP core rather than a setup-wizard side contract
- mount the supported guided setup routes as part of the real backend

### `src/services/mcp-tool-service.ts`

- stop converting internal exceptions into validation-shaped payloads
- implement canonical local/full/remote validation semantics
- add `recommendNodesForGoal()`
- add compact node essentials and examples paths

### `src/ai/agents/pattern-agent.ts`

- tighten keyword thresholds
- remove ambiguous generic keywords
- prefer semantic and capability-aware ranking over single-keyword matches

### `src/ai/agents/workflow-agent.ts`

- remove the hardcoded mini node registry as the source of truth
- inject live node retrieval or capability index
- stop defaulting business workflows to `Manual Trigger` unless the goal explicitly calls for it

### `src/ai/agents/graphrag-nano-orchestrator.ts`

- pass the live capability index or recommendation service into the workflow agent
- make the pipeline retrieval-first instead of pattern-template-first

### `src/intelligent/context-intelligence-engine.ts`

- replace legacy next-tool recommendations with current tool/action guidance

### `src/intelligent/adaptive-response-builder.ts`

- stop emitting hints for deleted or renamed tools
- source expansion hints from a single canonical registry

### `src/core/node-filter.ts`

- normalize node types before policy checks
- keep whitelist/policy data in canonical form

### `src/database/node-repository.ts`

- use one normalization helper for all alias resolution
- return canonical node identities consistently

### `src/services/n8n-validation.ts`

- keep it focused on API-safe payload cleanup
- do not let it become a second, conflicting policy engine

### `src/services/node-parameter-validator.ts`

- either expand it to genuine schema-aware validation
- or explicitly narrow its purpose to "UI survivability checks"
- do not present it as full required-parameter validation if it only enforces a small known set

### `src/mcp/handler-shared-memory.ts`

- stop using global unscoped keys for workflow and validation artifacts
- fix summary-counter logic such as `recent-errors.errorCount`
- move to request/session/pipeline-scoped keys

### `src/mcp/unified-validation.ts`

- replace weak cache keys with stable hashes of canonical workflow payloads
- make cache invalidation real
- keep validation cache scoped to the correct runtime context

### `src/ai/shared-memory.ts`

- add scoped key helpers or pattern deletion
- support real namespace invalidation for caches and pipeline artifacts

### `src/core/n8n-connector.ts`

- retire from runtime-critical paths or reduce to compatibility wrapper

### `src/core/node-catalog.ts`

- stop acting as a second source of truth for node schemas
- mark workflow-scan fallback as non-authoritative diagnostic data only

### `src/core/validation-gateway.ts`

- retire from the active MCP path or wrap the canonical validator instead of maintaining parallel rules

### `.mcp.json`

- point MCP clients to `dist/mcp/stdio-wrapper.js`

### `public/index.html` and `src/web-ui/index.html`

- convert them into the supported guided setup plus direct-chat UI over the real backend
- keep one browser wizard for both direct `npm` / `npx` and Docker Desktop
- remove stale assumptions about historical setup-dashboard behavior
- surface only supported setup, chat, health, and model-readiness capabilities

### `package.json`, `package.runtime.json`, and client/compose examples

- declare one supported runtime floor matching the real dependency chain
- define supported setup commands for the guided browser wizard
- publish one supported direct `npm` / `npx` contract and one supported Docker Desktop contract
- point all supported entrypoints to the same unified MCP core and direct-chat stack
- move setup-wizard, installer, and beta packaging narratives behind non-core or archived boundaries

### `Dockerfile`, supported compose files, `start.sh`, and `start.bat`

- make Docker Desktop a supported setup path only when it launches the same backend/runtime contract as direct `npm` / `npx`
- launch the same guided setup wizard and backend contract as the direct setup path
- remove historical setup-dashboard-only startup assumptions from supported Docker launchers
- keep one supported compose topology for Docker Desktop and archive or clearly mark historical variants

### `scripts/register-claude.ps1`

- rewrite around the supported runtime entrypoint and current product identity
- make it callable from the guided setup flow instead of maintaining a stale parallel registration path

### `docs/setup/*`

- document the guided setup wizard as the canonical setup path
- document direct `npm` / `npx` and Docker Desktop as the two supported delivery channels
- document Claude Desktop auto-registration and generic MCP snippet generation

### `smithery.yaml`

- point Smithery to the real unified executable

### `package.json`

- align `main` and `bin` with the published MCP entrypoint
- remove or restore scripts referenced in docs

### `README.md` and setup guides

- remove stale startup instructions
- remove stale artifact references
- document the unified MCP entrypoint and HTTP mode accurately

### `src/utils/input-validator.ts`

- stop escaping identifiers and URLs before validation
- either wire in a corrected version at real boundaries or deprecate/remove it

### `tests/**/*`

- repair imports that reference deleted modules
- delete or quarantine stale suites that target removed orchestration files
- add live smoke coverage for the actual unified server surface

### New files to add

- `src/core/node-type-normalizer.ts`
- `src/services/node-capability-index.ts`
- `src/services/workflow-planner.ts`
- `src/services/workflow-builtins-critic.ts`
- `src/services/workflow-payload-builder.ts`
- `src/mcp/tool-registry.ts`

## Deep Audit Addendum

The following issues were uncovered by continuing the audit into the rebuild/version-sync stack, session-auth paths, LLM bridge edges, packaging scripts, and verification tooling. These are not cosmetic. Several of them silently disable functionality or cause the system to reason from inferred state instead of actual live state.

### 15. Rebuild and Version Detection Are Not Authoritative

#### Findings

- `src/scripts/rebuild.ts` rebuilds the node database by attempting to `require()` node modules and, on failure, creates mock node classes with only name/display metadata. That means the rebuild can succeed while persisting incomplete schema data.
- `src/scripts/rebuild.ts` clears the `nodes` table and reloads `src/database/schema.sql`, but there is also a divergent `src/database/schema-optimized.sql`. The repo currently has two database schema stories.
- `src/scripts/rebuild.ts` validates "critical nodes" against `n8n-nodes-base.*` names while other runtime paths normalize to `nodes-base.*`. The rebuild validator is not aligned with runtime lookup.
- `src/services/n8n-node-sync.ts` uses version matching and rebuild triggering, not true live node enumeration, as the main synchronization strategy.
- `src/ai/change-detector.ts` infers the "current node catalog" from nodes found inside existing workflows, which means unused but installed nodes are invisible to change detection.
- `src/ai/n8n-version-monitor.ts` and `src/services/n8n-version-monitor.ts` both define version monitors with different responsibilities and different APIs. That duplication is a drift source.

#### Required changes

- declare one canonical node-catalog source of truth:
  - session/internal live node schema endpoints if available
  - otherwise validated extracted catalog from installed packages
  - never workflow-scan inference for authoritative availability
- make rebuild fail hard if schema extraction degrades to mocks for official nodes
- pick one database schema file and delete or archive the other
- retire or quarantine `src/ai/change-detector.ts` and `src/ai/n8n-version-monitor.ts` unless they are rewritten to consume the canonical live catalog
- keep `src/services/n8n-version-monitor.ts` only if the product requirement is "watch local installed packages and rebuild local DB"
- stop presenting version-match as equivalent to live-node-sync

#### Code direction

```ts
interface CatalogBuildResult {
  source: "session-live" | "package-extract";
  authoritative: boolean;
  nodes: ParsedNode[];
  extractionWarnings: string[];
}

if (!result.authoritative) {
  throw new Error(
    `Node catalog rebuild produced non-authoritative data: ${result.extractionWarnings.join("; ")}`
  );
}
```

### 16. Session-Authenticated Live Catalog Access Is Too Implicit

#### Findings

- `src/core/node-catalog.ts` claims live sync from n8n, but full-schema access depends on `N8N_USERNAME` and `N8N_PASSWORD` for session login to `/types/nodes.json`.
- public API-key access is insufficient for the full internal catalog in many installs, so "live node access" currently depends on a second auth mechanism that is easy to miss.
- `src/services/n8n-session-manager.ts` re-authenticates through `/rest/login`, stores the `n8n-auth` cookie, and refreshes on a timer. That is useful, but it is a separate authentication regime from the public REST API and needs to be treated explicitly.
- `src/utils/http-security.ts` contains a second in-memory rate limiter unrelated to `src/utils/rate-limiter.ts`. The codebase currently has duplicate throttling logic in addition to duplicate validation and catalog logic.
- `src/utils/console-manager.ts` only silences console output in HTTP mode. It does nothing for stdio-mode launch paths that still emit output through other startup routes.

#### Required changes

- expose live catalog mode explicitly in system status:
  - `public-api-only`
  - `session-authenticated`
  - `database-fallback`
- make node discovery/tool recommendations include the catalog source so agents know whether results are authoritative
- centralize rate-limiting and request-throttling into one implementation
- keep session auth optional, but treat missing session auth as a degraded mode with warnings rather than silently falling through

#### Code direction

```ts
type CatalogAuthority = "authoritative" | "degraded";

interface CatalogStatus {
  source: "session-live" | "public-api" | "database";
  authority: CatalogAuthority;
  reason?: string;
}
```

### 17. Local LLM Orchestrator Can Silently Disable the Nano-Agent Pipeline

#### Findings

- `src/ai/local-llm-orchestrator.ts` constructs `GraphRAGNanoOrchestrator` with a plain object `{ embedding, generation }` as the second constructor argument.
- `src/ai/agents/graphrag-nano-orchestrator.ts` expects an `LLMAdapterInterface` and immediately calls `adapter.isAvailable()`.
- because the passed object does not implement `isAvailable()`, orchestrator construction can throw and get swallowed by `LocalLLMOrchestrator`, leaving `nanoAgentOrchestrator = null`.
- this means one of the system’s most important workflow-generation paths can fail during initialization and degrade silently.

#### Required changes

- never pass raw transport clients where an `LLMAdapterInterface` is expected
- add a composite adapter that wraps embedding and generation clients behind the actual adapter contract
- if nano-agent initialization fails, surface that in status and tool output instead of quietly continuing as if the orchestrator exists

#### Code direction

```ts
class CompositeLLMAdapter implements LLMAdapterInterface {
  constructor(
    private embedding?: VLLMClient,
    private generation?: VLLMClient
  ) {}

  isAvailable(): boolean {
    return !!this.embedding || !!this.generation;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.generation) throw new Error("Generation client unavailable");
    return this.generation.generate(prompt);
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedding) throw new Error("Embedding client unavailable");
    return this.embedding.embed(text);
  }

  async chat(messages: any[]): Promise<string> {
    return this.generate(messages.map((m) => m.content).join("\n"));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
```

### 18. Packaging and Entrypoints Still Describe Multiple Different Products

#### Findings

- `package.runtime.json` declares `main: "dist/index.js"` while the shipped package uses `dist/main.js` and other tooling uses `dist/mcp/index.js` or `dist/mcp/stdio-wrapper.js`.
- `Dockerfile`, `Dockerfile.simple`, `docker/docker-entrypoint.sh`, `docker/simple-entrypoint.sh`, `.mcp.json`, installer scripts, and setup docs do not all launch the same executable.
- `docker/simple-entrypoint.sh` prints status text to stdout before launching stdio mode. That would corrupt JSON-RPC framing if used for Claude/Desktop-style MCP.
- `scripts/register-claude.ps1` still registers `dist/mcp/index.js`, while `.mcp.json` points to `dist/main.js` and the audited clean runtime path is `dist/mcp/stdio-wrapper.js`.
- `scripts/build-esbuild.js` compiles files individually without fixing the dynamic-import/runtime-resolution problem that caused live failures in `workflow_execution`, `validation-cache`, and `graphrag-bridge`.

#### Required changes

- choose one supported stdio executable and one supported HTTP executable, then point every package/script/doc to those exact files
- reject any entrypoint that prints to stdout before MCP handshake when running in stdio mode
- align `package.json`, `package.runtime.json`, `.mcp.json`, Dockerfiles, installer scripts, and setup docs with the same shipping artifacts
- fix build output/runtime module resolution rather than relying on alternate build scripts

### 19. Verification Scripts Overstate Health and Often Do Not Test the Real Surface

#### Findings

- `scripts/test-complete-mcp-workflow.ts` and `scripts/test-mcp-external-client.ts` simulate an "external agent" by instantiating `LocalLLMOrchestrator` directly. They do not actually speak MCP to the current server surface.
- both of those scripts claim success conditions like "production-ready" even though they are not exercising the real stdio wrapper, live tool schemas, or live n8n contract.
- `test-all-tools.js` targets legacy tool names via `dist/main.js`, not the current unified tool surface.
- `scripts/test-v3-runtime.js` validates module presence and internal utility behavior, not actual end-to-end MCP behavior.

#### Required changes

- demote these scripts from "verification" to "diagnostic" unless they are rewritten to test the actual unified MCP server
- add one canonical live smoke suite that:
  - launches `dist/mcp/stdio-wrapper.js`
  - performs MCP initialize/list-tools/call cycles
  - validates unified tool schemas and actual outputs
  - hits live n8n for create/update/diff/patch/run scenarios
- fail CI or release validation on that live smoke suite, not on simulated orchestrator tests

### 20. Python GraphRAG Service Contract Is Much Thinner Than the TypeScript Side Implies

#### Findings

- `python/backend/graph/lightrag_service.py` is a thin JSON-RPC loop with only `ping`, `query_graph`, `apply_update`, and `invalidate_cache`.
- `query_graph_impl()` currently returns nodes and an empty `edges` array with a simple summary string.
- `invalidate_cache` checks `hasattr(sync_engine, "clear_cache")`, but `SyncSearchEngine` does not define `clear_cache`, so cache invalidation is effectively a no-op.
- `apply_update_impl()` only performs simple node/embedding upserts and deletions. It does not expose the richer storage/graph semantics suggested by the storage layer.
- the Python storage layer is richer than the exposed service contract, which means TypeScript-side assumptions about GraphRAG depth can easily outrun the actual service behavior.

#### Required changes

- either:
  - narrow TypeScript-side claims and tool descriptions to match the thin Python service, or
  - expand the Python RPC surface to expose actual graph traversal, edge retrieval, and cache control
- if GraphRAG is optional or degraded, make that explicit in tool outputs and system status
- do not let routing/search layers assume rich graph semantics when only shallow node retrieval is available

### Additional files to touch from this deep pass

- `src/scripts/rebuild.ts`
- `src/services/n8n-node-sync.ts`
- `src/services/n8n-version-monitor.ts`
- `src/ai/change-detector.ts`
- `src/ai/n8n-version-monitor.ts`
- `src/core/node-catalog.ts`
- `src/services/n8n-session-manager.ts`
- `src/utils/http-security.ts`
- `src/utils/rate-limiter.ts`
- `src/utils/console-manager.ts`
- `src/ai/local-llm-orchestrator.ts`
- `src/ai/llm-adapter.ts`
- `src/ai/search-router-integration.ts`
- `package.runtime.json`
- `docker/simple-entrypoint.sh`
- `docker/docker-entrypoint.sh`
- `Dockerfile.simple`
- `scripts/register-claude.ps1`
- `scripts/test-complete-mcp-workflow.ts`
- `scripts/test-mcp-external-client.ts`
- `test-all-tools.js`
- `python/backend/graph/lightrag_service.py`

## Deep Audit Addendum II

This pass focused on GraphRAG population/optimization, lazy initialization, template indexing, enhanced execution tooling, semantic validation, and optional credential/event subsystems.

### 21. GraphRAG Population and Optimization Are Mostly Placeholder Logic

#### Findings

- `src/services/graph-population-service.ts` uses `NodeDocumentationService`, not the main runtime node repository. That means graph ingestion is fed from a second documentation database rather than the canonical MCP node catalog.
- `src/services/graph-population-service.ts` has `filterChangedNodes()` as a stub that always returns all nodes, so "incremental" population is not actually incremental.
- `src/services/graph-population-service.ts` sends all ingested entities through `applyUpdate()` as simple adds, even though the Python side only performs shallow node/embedding upserts.
- `src/services/graph-optimization-service.ts` selects optimization targets by querying the graph for `"microsoft"` and then picking a random returned node. That is placeholder behavior, not optimization policy.
- `src/mcp/tools-graphrag.ts` and `src/mcp/tools-nano-agents.ts` describe graph-aware reasoning and node relationships more richly than the actual bridge/backend currently provide.

#### Required changes

- stop treating GraphRAG population as authoritative until it consumes the same canonical node source as the MCP runtime
- replace placeholder optimization selection with deterministic criteria:
  - stale nodes
  - frequently queried nodes
  - low-confidence nodes
  - nodes implicated in workflow failures
- align GraphRAG tool descriptions with the actual backend contract until richer graph features are implemented

### 22. Documentation Ingestion Uses a Separate Database With Weak Parsing

#### Findings

- `src/services/node-documentation-service.ts` writes to `data/nodes-v2.db`, while the main MCP runtime uses `data/nodes.db`.
- `src/services/node-documentation-service.ts` hardcodes node types as `n8n-nodes-base.${node.name}` during rebuild, which is not a safe assumption for non-base packages or normalized names.
- `src/services/node-documentation-service.ts` uses regex-based parsing in `parseNodeDefinition()` and explicitly leaves property extraction effectively empty in many cases.
- `src/services/node-documentation-service.ts` emits extensive `console.error()` rebuild output, which is fine for batch maintenance but should not be confused with production-grade runtime indexing.

#### Required changes

- decide whether documentation enrichment is:
  - a maintenance pipeline that enriches the canonical DB, or
  - a separate offline artifact store
- if it remains separate, never let it masquerade as the authoritative node catalog
- stop hardcoding `n8n-nodes-base.*` when extracting node identity
- replace regex-only parsing with schema-aware extraction or mark the resulting fields as partial/untrusted

### 23. Template Indexing Is Corrupted by Using Node Names Instead of Node Types

#### Findings

- `src/templates/template-repository.ts` stores `workflow.nodes.map(n => n.name)` into `nodes_used`.
- `src/templates/template-service.ts` and MCP template lookup expect template matching by node types.
- that means template search by nodes is only as good as template node labels from the API payload, not actual node type identifiers.

#### Required changes

- store actual node type identifiers from template workflow JSON, not template node display names
- backfill or rebuild template indexes after the fix
- normalize stored node types through the same canonical node-type normalizer used elsewhere

#### Code direction

```ts
const nodeTypes = detail.workflow.nodes
  .map((n: any) => n.type)
  .filter(Boolean)
  .map(normalizeNodeType);
```

### 24. Built-In-First Semantic Validation Has a Real Implementation Bug

#### Findings

- `src/services/workflow-semantic-validator.ts` shadows the outer `suggestions` array inside the Code-node analysis loop:
  - it calls `const suggestions = await this.analyzeCodeNode(codeNode)`
  - then does `suggestions.push(...suggestions)`
- this means the outer result accumulator never receives the detected replacement suggestions correctly.
- this validator is invoked from `src/mcp/handlers-n8n-manager.ts`, so the built-in-first policy is currently weaker than intended even before broader architectural fixes.

#### Required changes

- fix the accumulator bug immediately
- add regression coverage specifically for:
  - Code node replacement suggestions
  - built-in-first score penalties
  - mixed built-in/Code workflows

#### Code direction

```ts
for (const codeNode of analysis.codeNodes) {
  const nodeSuggestions = await this.analyzeCodeNode(codeNode);
  if (nodeSuggestions.length > 0) {
    score -= 10 * nodeSuggestions.length;
    warnings.push({
      severity: "warning",
      message: `Node "${codeNode.name}" might be replaceable with built-in nodes`,
      nodeId: codeNode.id,
      nodeName: codeNode.name,
      nodeType: codeNode.type,
    });
  }
  suggestions.push(...nodeSuggestions);
}
```

### 25. Live Validation and Workflow Cleaning Still Mutate or Side-Effect Workflows

#### Findings

- `src/services/n8n-live-validator.ts` `validateWorkflow()` validates by creating a temporary workflow and deleting it afterward. This creates real side effects and has already been acknowledged elsewhere in the code as creating ghost workflows.
- `src/services/n8n-live-validator.ts` `validateWorkflowStructure()` does not actually validate against live n8n semantics; it only performs local structural checks despite the class name.
- `src/services/n8n-validation.ts` hardcodes node-specific mutations for `httpRequest` and `switch`, forces package-prefix rewrites, injects missing `typeVersion`, and strips credentials aggressively.
- these mutations can be useful as compatibility repairs, but they currently happen inside general-purpose cleaning paths instead of an explicit repair layer.

#### Required changes

- split workflow processing into:
  - `cleanForApi()`
  - `repairCommonMistakes()`
  - `validateAgainstN8n()`
- never make live validation depend on creating throwaway workflows unless explicitly running a dry-run path
- rename `validateWorkflowStructure()` or document it as structural-only
- keep mutation logs explicit so agents/users know when the server has changed the payload they sent

### 26. Enhanced Execution Tooling Overstates Capability Detection

#### Findings

- `src/live-integration/enhanced-n8n-client.ts` is written as if it is targeting n8n `1.113.3+`, but several "capability" methods are heuristics rather than verified feature detection.
- `getRunningExecutions()` treats `!finished && status === waiting` as "running", which is only a heuristic layered on top of the current type model.
- `getMcpWorkflows()` identifies MCP workflows by tag/name heuristics and optional `settings.mcpMetadata`, not by a verified server-side MCP contract.
- `getApiCapabilities()` returns `supportsRetry: true`, `supportsRunningFilter: true`, and `supportsMcpMetadata: true` even when capability detection fails.

#### Required changes

- distinguish:
  - `verified capabilities`
  - `heuristic capabilities`
  - `assumed capabilities`
- never report assumed capabilities as verified
- downgrade tool messaging for v3 execution features until capability checks are real

### 27. Event Bus and Optional Subsystems Bypass the Runtime Compatibility Layer

#### Findings

- `src/ai/event-bus.ts` imports `better-sqlite3` directly instead of using the adapter abstraction that the rest of the runtime uses for compatibility.
- that bypass means the event system can fail in environments where the project otherwise falls back to `sql.js`.
- `src/services/credential-service.ts` stores encrypted browser credentials and sessions inside the main `nodes.db` database.
- `src/services/credential-service.ts` uses a default encryption key string when `CREDENTIAL_ENCRYPTION_KEY` is not set. That is not acceptable for real secret storage.

#### Required changes

- move event-bus persistence behind the database adapter or clearly mark it as requiring native SQLite support
- separate browser/session secret storage from the node catalog DB
- hard-fail credential storage if `CREDENTIAL_ENCRYPTION_KEY` is unset or default
- document browser/session tooling as optional and security-sensitive

### 28. Node Type Prefix Drift Still Poisons the Helper Stack

#### Findings

- `src/services/property-filter.ts` keys all curated essentials under `nodes-base.*`, not `n8n-nodes-base.*`.
- `src/services/example-generator.ts` and `src/services/task-templates.ts` do the same for examples and task guidance.
- `src/services/enhanced-config-validator.ts` only runs node-specific validation branches for `nodes-base.*` values.
- at the same time, `src/core/node-filter.ts` and `src/services/n8n-validation.ts` insist on `n8n-nodes-base.*` as the official format.
- `src/database/node-repository.ts` normalizes official runtime types down to `nodes-base.*` for DB lookup, which keeps reads working but leaves the surrounding guidance/validation stack split between two identities.

#### Impact

- curated essentials, examples, task templates, and node-specific validation can silently degrade into generic fallback behavior depending on which node-type form reaches the helper
- agents receive mixed guidance:
  - discovery and API validators prefer `n8n-nodes-base.*`
  - examples/templates/validators often emit `nodes-base.*`
- this directly increases workflow rewrite churn and first-pass validation failure

#### Required changes

- create one canonical node-type normalizer and use it everywhere:
  - repository lookups
  - helper registries
  - validators
  - examples
  - task templates
- decide one public agent-facing format:
  - recommended: `n8n-nodes-base.*` and scoped `@n8n/...` forms
- let helper registries normalize keys internally instead of hardcoding shortened names

#### Code direction

```ts
export function normalizeNodeType(nodeType: string): string {
  if (nodeType.startsWith("nodes-base.")) {
    return `n8n-${nodeType}`;
  }
  if (nodeType.startsWith("nodes-langchain.")) {
    return `@n8n/n8n-${nodeType}`;
  }
  return nodeType;
}

const key = normalizeNodeType(nodeType);
const config = ESSENTIAL_PROPERTIES[key];
```

### 29. Response-Intelligence Is Still Wired to a Dead Tool Surface

#### Findings

- `src/intelligent/context-intelligence-engine.ts` computes `intent` in `analyzeToolCall()` but never writes it back to `this.state.detectedIntent`.
- the same file still recommends legacy tool names such as `list_workflows`, `get_workflow`, `validate_workflow`, `get_execution`, and `n8n_list_executions`.
- `src/intelligent/adaptive-response-builder.ts` still embeds expansion hints for legacy tools like `get_workflow`, `get_execution`, `get_node_info`, and `get_node_essentials`.
- `src/mcp/handlers-v3-tools.ts` still consumes this layer for retry/monitor/MCP-workflow responses, so the stale guidance is not just archival code.

#### Impact

- response hints and next-step suggestions actively steer agents toward removed or renamed tools
- intent-aware branches like create/debug/monitor help often never fire because `detectedIntent` is never persisted
- the server spends tokens generating guidance that is both stale and operationally misleading

#### Required changes

- persist `detectedIntent` into conversation state during `analyzeToolCall()`
- remove hardcoded tool names from response builders
- generate hints from the currently registered MCP tool registry instead of string literals
- add an assertion test that every recommended next tool exists in the live server manifest

#### Code direction

```ts
analyzeToolCall(toolName: string, params: Record<string, any>): ResponseContext {
  this.updateState(toolName);

  const intent = this.detectIntent(toolName, params);
  this.state.detectedIntent = intent;

  return {
    tool: toolName,
    intent,
    itemCount: this.estimateItemCount(toolName, params),
    explicitFull: this.detectExplicitFullRequest(params),
  };
}
```

### 30. Search and Routing Overclaim Semantic Inference

#### Findings

- `src/ai/query_router.ts` accepts and stores `embeddingClient`, but never actually uses it after construction.
- `src/ai/query_intent_classifier.ts` starts `initializeIntentEmbeddings()` asynchronously in the constructor without awaiting readiness, so early classification calls fall straight through to pattern matching.
- `src/ai/search-router-integration.ts` advertises "real embedding-based semantic search via GraphRAG", but its stats still report `databaseSize: 0` and several result paths assume metadata fields like `properties` that the current graph path does not robustly index.
- `src/ai/local-llm-orchestrator.ts` and other AI layers then market these paths as agent-ready even though readiness is partly opportunistic.

#### Impact

- the router can claim semantic/embedding-based behavior while actually operating as pattern/keyword routing
- search confidence and routing confidence look more authoritative than they are
- agent planning can over-trust recommendation/search quality and make poor node choices earlier in the loop

#### Required changes

- give the classifier and search integration an explicit async `initialize()` phase and block semantic claims until it completes
- downgrade log messages and tool descriptions when the system is in fallback mode
- stop claiming embedding-aware routing in `QueryRouter` until that class actually uses embeddings or remove the unused dependency entirely
- surface router readiness and backend readiness in MCP responses when search/routing features are invoked

### 31. API Schema Knowledge Is Host-Specific and Internally Contradictory

#### Findings

- `src/ai/knowledge/api-schema-loader.ts` loads schema from a hardcoded local path: `C:\\Users\\Chris Boyd\\Downloads\\api-1.json`.
- its fallback schema still reports `createdAt` and `updatedAt` as required workflow fields, while the same file also marks them as system-managed read-only fields.
- `src/ai/agents/base-agent.ts` loads this knowledge into every agent, which means contradictory schema guidance can enter agent prompts and reasoning.
- `src/mcp/handlers/validation-handlers.ts` loads the schema loader but then separately hardcodes a second schema policy, including its own system-managed field list and node-type rules instead of using a single parsed contract.

#### Impact

- agent-facing "official API knowledge" depends on one machine-specific file path
- when that file is absent, the fallback guidance can tell agents to include fields that later validators or cleaners reject
- schema validation is duplicated and can drift in multiple places at once

#### Required changes

- vendor the API schema into the repository or make its location a real config input
- reconcile required fields vs. read-only/system-managed fields in one authoritative schema object
- make validation handlers consume the loaded schema contract instead of maintaining a second handwritten version
- add a unit test that asserts no field is simultaneously listed as required user input and system-managed

### 32. Local LLM Setup Stores Secrets in Plaintext and Creates Another Config Path

#### Findings

- `src/http/routes-local-llm.ts` writes setup credentials to `data/setup-state.json`.
- that file contains `n8nApiKey`, `n8nUsername`, and `n8nPassword` in plain JSON.
- the same route then mirrors those secrets into `process.env.N8N_API_KEY` and `process.env.N8N_PASSWORD`.
- this creates another runtime configuration path separate from `.env`, MCP config, and existing API config utilities.

#### Impact

- plaintext secret persistence is an avoidable security liability
- HTTP setup and MCP runtime can drift because they are not reading from one canonical config source
- debugging auth problems becomes harder because there are now multiple places a key can come from

#### Required changes

- remove plaintext password/API-key persistence from `setup-state.json`
- store setup completion metadata separately from secrets
- route all runtime auth through one config service:
  - `.env`
  - secure secret store
  - or injected environment only
- make setup endpoints update that canonical source rather than mutating ad hoc local state

### 33. “Strict” Input Schema Enforcement Is Not Actually Strict

#### Findings

- `src/utils/input-schema-validator.ts` claims "strict parsing mode - reject unknown fields", but it only calls `schema.parse(input)`.
- none of the object schemas in that file are made strict with `.strict()`.
- in Zod, that means extra fields are not rejected by default; they are typically stripped or tolerated depending on schema type.
- this helper is actually used by the MCP input-validation path, so the mismatch is live, not theoretical.

#### Impact

- the server tells agents it rejected malformed payloads more strictly than it really did
- unsupported or misspelled fields can slip through validation and fail later in less obvious ways
- this weakens confidence in tool-contract enforcement and makes debugging harder

#### Required changes

- convert all MCP object schemas that require strict contracts to `.strict()`
- make the validation helper assert it only accepts strict object schemas for MCP tool inputs
- add regression tests with extra unknown fields for create/update/execute operations

#### Code direction

```ts
const createWorkflowSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(z.any()).min(1),
  connections: z.record(z.any()),
  settings: z.object({}).passthrough().optional(),
}).strict();
```

### 34. Smart Routing Is Mostly Advisory and Barely Adaptive

#### Findings

- `src/mcp/smart-router.ts` hard-routes `goal` input to the agent path and `workflow` input to the handler path; history is only consulted when both are present.
- the same file stores metrics globally under `execution-metrics:*`, with no request/session scoping.
- `src/mcp/router-integration.ts` provides `withRouterTracking()` and `recordExecution()`, but search usage shows those tracking hooks are not actually wrapped around the main execution flows.
- that means `getRoutingRecommendation()` can talk about success-rate-based adaptation while the underlying history is often empty or too weak to matter.

#### Impact

- "adaptive routing" is overstated
- routing statistics can remain near-zero or cross-contaminate across unrelated sessions
- agents may be told a path was selected by history when the system is effectively operating on defaults

#### Required changes

- wire execution tracking into the real workflow create/update/execute paths or stop claiming adaptive routing
- scope routing metrics by session/request class if they are used for agent-facing recommendations
- treat history-based confidence as unavailable until sufficient, scoped telemetry actually exists
- consider deleting the adaptive language entirely if the router remains a deterministic input classifier

### 35. Legacy Core Validation Still Calls Itself “Bulletproof” While Allowing Major Gaps

#### Findings

- `src/core/validation-gateway.ts` uses broad `.passthrough()` Zod schemas for nodes, connections, settings, and the top-level workflow object.
- the same gateway skips node-existence enforcement entirely when the live catalog is not ready, returning only a `CATALOG_NOT_READY` warning.
- semantic validation failures are also downgraded to warnings, so the "all layers must pass" story is softer than the docs suggest.
- Layer 6 dry run still validates by creating and deleting a real workflow in n8n.

#### Impact

- the legacy core path markets hard guarantees that it does not actually enforce
- extra fields can slip through schema validation
- if the live catalog is empty or degraded, workflows can still pass "validation" without a real node-existence check
- dry-run validation can leave ghost workflows when cleanup fails

#### Required changes

- stop calling this path bulletproof until schemas are strict and all critical layers are truly blocking
- make node-existence validation fail closed or explicitly switch to a degraded mode that callers can see
- collapse core dry-run validation into the same remediation track as the modern live-validator path

### 36. Open WebUI Bridge Is Stale, Unmounted, and Insecure by Default

#### Findings

- `src/interfaces/openwebui-interface.ts` defines a full Open WebUI bridge, but repo-wide search shows `createOpenWebUIRouter()` is not mounted from `src/main.ts` or `src/http-server-single-session.ts`.
- the bridge exposes old tool names like `list_workflows`, `get_workflow`, `create_workflow`, and `validate_workflow`.
- its manifest advertises `auth: { type: 'none' }`, placeholder contact/legal URLs, and hardcoded localhost examples.
- `POST /openwebui/execute` and `POST /openwebui/chat` do not implement any auth or caller verification inside this module.

#### Impact

- the Open WebUI bridge is another stale product surface, not the current HTTP runtime
- if it were mounted as-is, it would expose unauthenticated workflow operations behind an obsolete contract
- the presence of this file overstates actual Open WebUI support in the live server

#### Required changes

- either delete/archive this bridge or re-platform it onto the current HTTP/unified MCP contract
- if retained, require real authentication and remove placeholder metadata
- generate Open WebUI tool definitions from the live tool registry instead of maintaining a parallel handwritten list

### 37. Legacy LLM Suggestion Paths Still Overload Context With Raw Node Lists

#### Findings

- `src/interfaces/openwebui-interface.ts` `suggest_workflow` collects `catalog.getAllNodes().map(n => n.name)` and feeds that into `LLMBrain.recommendNodes()`.
- `src/core/llm-brain.ts` then truncates that raw list to the first 50 node names and prompts the model with the sample.
- there is no ranked retrieval, capability filtering, or node-essential expansion in this old suggestion path.

#### Impact

- node recommendations depend on catalog ordering instead of relevance
- built-in-first behavior is not enforced
- the old assistant path recreates the same context-window problem the remediation plan is trying to eliminate

#### Required changes

- replace this with the same progressive retrieval contract proposed for the MCP server:
  - goal -> plan
  - plan step -> ranked node recommendations
  - node -> essentials/examples on demand
- do not pass raw unranked node-name samples into LLM prompts

### 38. Workflow Simplifier Can Collapse Unknown Nodes Into Base Nodes

#### Findings

- `src/services/workflow-simplifier.ts` resolves fuzzy types by calling `nodeParser.searchNodes(type)`, then blindly returning `n8n-nodes-base.${results[0].name}`.
- if search returns nothing, it still falls back to `n8n-nodes-base.${type}`.
- `src/services/mcp-tool-service.ts` constructs `new NodeParser()` for the simplifier but never initializes its cache/index.
- there are also two different `NodeParser` implementations in the repo:
  - `src/services/node-parser.ts`
  - `src/parsers/node-parser.ts`

#### Impact

- simplified workflow expansion can silently mis-resolve agentic, LangChain, or non-base nodes as built-in base nodes
- because the parser cache may never be initialized, the fallback path can trigger more often than intended
- duplicate parser implementations increase drift in rebuild vs. runtime parsing behavior

#### Required changes

- do not use the file-cache parser as the runtime source of truth for workflow expansion
- resolve simplified node types through the live repository/index used by the active MCP server
- delete or clearly separate duplicate parser roles:
  - runtime lookup
  - rebuild-time source extraction
- fail explicitly when a simplified type cannot be resolved confidently instead of auto-prefixing it as a base node

### 39. Legacy Docs OAuth Persists Tokens to Plaintext Files

#### Findings

- `src/interfaces/mcp-interface.ts` stores kapa OAuth tokens in `.kapa-tokens.json` and client metadata in `.kapa-client.json`.
- both are written with `fs.writeFileSync(JSON.stringify(...))` and no additional protection.
- this is part of the old MCP interface surface, not the current unified wrapper, but it is still shipped in the repo and used by the legacy entrypoint.

#### Impact

- external-doc access depends on plaintext local token files
- legacy doc integration creates another secret-bearing persistence path outside the main runtime config model

#### Required changes

- if kapa integration remains, move tokens behind the same secret-handling policy as other credentials
- if the legacy interface is being retired, remove this path entirely rather than carrying dormant plaintext token storage forward

### 40. Lazy Initialization Still Builds Unused Parallel Handler Infrastructure

#### Findings

- `src/mcp/lazy-initialization-manager.ts` constructs a `HandlerRegistry` during background init.
- repo-wide usage shows the modern server primarily waits for initialization and then constructs `MCPToolService`; the `HandlerRegistry` path itself is not the primary live tool execution path.
- this means startup still pays complexity for an older registry-based handler layer that is not the canonical runtime.

#### Impact

- there is yet another parallel service stack kept warm during startup
- maintenance cost rises because init code implies support for handlers that the main execution path does not actually use

#### Required changes

- remove `HandlerRegistry` from lazy init if the unified server is not going to use it
- or promote it to the canonical tool dispatch path and delete the competing service stack
- avoid background-initializing dead subsystems

### 41. Launcher and Claude Entrypoints Still Point at Different Products

#### Findings

- `.mcp.json` still launches `dist/main.js`, which routes stdio mode into the legacy `startMCPInterface()` path instead of the unified stdio wrapper.
- `start.js` prints banners, diagnostics, and setup text to stdout throughout normal startup, so it is not safe to use as a Claude Desktop stdio entrypoint even though multiple docs recommend it.
- `src/mcp/index.ts` is the unified stdio entrypoint and logs to stderr, while `src/mcp/stdio-wrapper.ts` goes even further and suppresses all console output before imports.
- `scripts/quick-start.ps1` still launches `src/main.ts`, which preserves the old interface surface.
- docs under `docs/guides/CLAUDE-DESKTOP-SETUP.md` and `docs/README_CLAUDE_SETUP.md` recommend a mix of nonexistent `dist/consolidated-server.js`, `dist/mcp/index.js`, and `start.js`.

#### Impact

- different clients can connect to materially different MCP products depending on which setup guide they followed
- stdio framing can be broken by launchers that print to stdout before the server starts
- audit and support work is harder because "the MCP server" does not refer to one canonical shipping entrypoint

#### Required changes

- pick one canonical Claude/Desktop stdio entrypoint and make every launcher and guide use it
- do not recommend `start.js` for stdio clients unless it is rewritten to be stdout-clean
- retire `dist/main.js` for stdio MCP clients or explicitly label it as the legacy interface surface
- align `.mcp.json`, setup docs, wrapper scripts, and installer outputs on the same executable path

### 42. Support Scripts Contain Broken Relative Paths and Hardcoded Old Install Locations

#### Findings

- `scripts/postinstall.js` checks `path.join(__dirname, 'dist', 'main.js')`, which resolves to `scripts/dist/main.js` instead of the real repo `dist/main.js`.
- `scripts/maintenance/Start-MCP-Server.bat`, `Start-HTTP-Server.bat`, and `Check-Configuration.bat` `cd` into `scripts/maintenance` and then run `node start.js`, which means they look for `start.js` in the wrong directory.
- `scripts/maintenance/start-n8n-server.ps1` hardcodes `C:\Users\Chris Boyd\Documents\MCP-Servers\n8n-mcp-server`, which does not match this repository path.
- `scripts/maintenance/start-n8n-mcp-server.bat` also hardcodes the old `n8n-mcp-server` directory.
- `scripts/build-verification.mjs` assumes `src/data/nodes` and `src/discovery/enhanced-discovery.ts` exist, but neither path exists in the current tree.

#### Impact

- local helpers and maintenance launchers can fail before they even reach the runtime
- postinstall behavior is misleading because it never checks the actual built artifact
- support scripts overstate the health of the current repository by validating dead paths

#### Required changes

- fix all script-relative paths to resolve from the repo root rather than the script directory
- remove hardcoded old install directories from Windows helper scripts
- delete or archive dead verification utilities that target files no longer present
- add a small shared helper for "resolve project root" instead of hand-rolling paths in every script

### 43. Packaged Docker and Installer Paths Are Still Not Internally Consistent

#### Findings

- `Dockerfile.simple` installs production dependencies only and then runs `npm run build`, even though TypeScript and build tooling live in devDependencies.
- `Dockerfile.simple` starts `dist/mcp/index.js`, while the main `Dockerfile` starts `dist/main.js`, so the two images do not ship the same product surface.
- `docker/simple-entrypoint.sh` prints multiple startup banners to stdout before `exec node /app/dist/mcp/index.js`, which would break stdio framing if reused for Claude-style MCP transport.
- `scripts/post-install.ps1`, `scripts/register-claude.ps1`, `scripts/install-linux.sh`, and `scripts/install-macos.sh` all assume `dist/mcp/index.js` is the installed artifact, while `.mcp.json` and `package.json` center `dist/main.js`.
- `package.runtime.json` still declares `main: "dist/index.js"`, creating a third packaging story.

#### Impact

- different packaged distributions can expose different behavior and failure modes
- at least one published Docker path is structurally unable to build reliably
- install and runtime support cannot be trusted because the shipped artifact depends on which packaging path was used

#### Required changes

- standardize on one runtime entrypoint for packaged stdio mode and one for HTTP mode
- fix `Dockerfile.simple` to install build dependencies in the builder stage or remove it
- keep entrypoint scripts stdout-clean when used with stdio transports
- align `package.json`, `package.runtime.json`, Dockerfiles, install scripts, and generated configs with the same output files

### 44. Verification Scripts Still Simulate Success Against Missing or Legacy Artifacts

#### Findings

- `scripts/test-v3-runtime.js` requires `../dist/mcp/tools-consolidated`, but `dist/mcp/tools-consolidated.js` does not exist.
- the same script validates old intent names like `list_workflows` and uses success criteria that do not reflect the current unified tool contract.
- `scripts/test-complete-mcp-workflow.ts` and `scripts/test-mcp-external-client.ts` never connect to the live MCP server; they instantiate `LocalLLMOrchestrator` directly and still print "production-ready" conclusions.
- `tests/test_all_tools.sh` and `tests/test_remaining_tools.sh` target legacy tool names and a fixed `http://localhost:3000/mcp` endpoint rather than the current action-based unified tool surface.
- large parts of the docs and status files still quote "ALL TESTS PASSED" and "production-ready" based on these stale or simulated harnesses.

#### Impact

- the repo advertises confidence from test harnesses that are not exercising the real product
- regressions in the unified runtime can ship while legacy/simulated validation scripts still pass
- debugging time increases because reported health and actual runtime behavior diverge

#### Required changes

- replace these scripts with live smoke tests against the actual unified stdio and HTTP entrypoints
- fail tests when required artifacts are missing instead of silently skipping into simulated success
- stop printing production-readiness claims from non-authoritative harnesses
- make current smoke tests cover create, update, validate, diff, patch, execute, docs, and node discovery against a real n8n instance

### 45. HTTP Deployment Documentation Still Depends on Missing Bridge Scripts and Obsolete Modes

#### Findings

- `docs/HTTP_DEPLOYMENT.md` repeatedly references `scripts/http-bridge.js`, but that file does not exist in the current tree.
- `docs/README_CLAUDE_SETUP.md` references `scripts/mcp-http-client.js`, which is also missing.
- the same HTTP docs still center `USE_FIXED_HTTP=true`, an older split-mode concept that is not part of the current `src/http-server-single-session.ts` runtime.
- docs and examples mix `dist/mcp/index.js`, `dist/main.js`, and legacy HTTP bridge assumptions.

#### Impact

- remote/HTTP client setup instructions are not executable as written
- users can spend time debugging nonexistent helper scripts instead of the actual HTTP server
- the docs preserve obsolete architectural concepts that no longer map cleanly to the shipped code

#### Required changes

- rewrite HTTP deployment docs around the current single-session HTTP runtime only
- remove references to missing bridge scripts unless they are reintroduced and tested
- delete `USE_FIXED_HTTP` guidance if there is no longer a dual HTTP implementation to choose from
- keep remote-client examples tied to scripts and endpoints that actually ship

### 46. The Database Adapter Fallback Layer Is Only Partially Compatible and Writes Too Aggressively

#### Findings

- `src/database/database-adapter.ts` decides "build mode" by scanning `process.argv` for substrings like `build` and `rebuild`, which is brittle and can misclassify commands.
- `SQLJSAdapter.prepare()` schedules a database save even for read-only statement preparation, so routine reads can still trigger disk writes after inactivity.
- the sql.js adapter reports `changes: 0`, `lastInsertRowid: 0`, `columns(): []`, and `inTransaction = false`, even when callers may reasonably expect better-sqlite3 semantics.
- the event/shared-memory side of the repo still imports `better-sqlite3` directly, so the adapter abstraction does not fully protect compatibility anyway.

#### Impact

- runtime behavior can differ depending on adapter choice in ways the rest of the code does not always acknowledge
- save scheduling on reads adds avoidable write amplification and noisy persistence behavior
- callers can make incorrect decisions based on placeholder metadata from the fallback adapter

#### Required changes

- make adapter selection explicit from configuration/context, not argv substring heuristics
- only schedule persistence on actual write operations
- either harden the sql.js compatibility layer or narrow the interface to what it can truly guarantee
- move remaining direct `better-sqlite3` consumers behind the same adapter strategy

### Additional files to touch from this pass

- `src/services/graph-population-service.ts`
- `src/services/graph-optimization-service.ts`
- `src/ai/graphrag-bridge.ts`
- `src/mcp/tools-graphrag.ts`
- `src/mcp/tools-nano-agents.ts`
- `src/services/node-documentation-service.ts`
- `src/templates/template-repository.ts`
- `src/templates/template-service.ts`
- `src/services/workflow-semantic-validator.ts`
- `src/services/n8n-live-validator.ts`
- `src/services/n8n-validation.ts`
- `src/live-integration/enhanced-n8n-client.ts`
- `src/ai/event-bus.ts`
- `src/services/credential-service.ts`
- `src/services/property-filter.ts`
- `src/services/example-generator.ts`
- `src/services/task-templates.ts`
- `src/services/enhanced-config-validator.ts`
- `src/intelligent/adaptive-response-builder.ts`
- `src/intelligent/context-intelligence-engine.ts`
- `src/mcp/handlers-v3-tools.ts`
- `src/ai/query_router.ts`
- `src/ai/query_intent_classifier.ts`
- `src/ai/search-router-integration.ts`
- `src/ai/knowledge/api-schema-loader.ts`
- `src/ai/agents/base-agent.ts`
- `src/mcp/handlers/validation-handlers.ts`
- `src/http/routes-local-llm.ts`
- `src/utils/input-schema-validator.ts`
- `src/mcp/smart-router.ts`
- `src/mcp/router-integration.ts`
- `src/core/validation-gateway.ts`
- `src/core/n8n-connector.ts`
- `src/core/node-catalog.ts`
- `src/core/llm-brain.ts`
- `src/interfaces/openwebui-interface.ts`
- `src/services/workflow-simplifier.ts`
- `src/services/node-parser.ts`
- `src/parsers/node-parser.ts`
- `src/interfaces/mcp-interface.ts`
- `src/mcp/lazy-initialization-manager.ts`
- `src/mcp/handlers/handler-registry.ts`
- `.mcp.json`
- `start.js`
- `src/mcp/index.ts`
- `src/mcp/stdio-wrapper.ts`
- `src/database/database-adapter.ts`
- `package.runtime.json`
- `Dockerfile.simple`
- `docker/simple-entrypoint.sh`
- `scripts/postinstall.js`
- `scripts/post-install.ps1`
- `scripts/register-claude.ps1`
- `scripts/install-linux.sh`
- `scripts/install-macos.sh`
- `scripts/quick-start.ps1`
- `scripts/maintenance/Start-MCP-Server.bat`
- `scripts/maintenance/Start-HTTP-Server.bat`
- `scripts/maintenance/Check-Configuration.bat`
- `scripts/maintenance/start-n8n-mcp-server.bat`
- `scripts/maintenance/start-n8n-server.ps1`
- `scripts/build-verification.mjs`
- `scripts/test-complete-mcp-workflow.ts`
- `scripts/test-mcp-external-client.ts`
- `scripts/test-v3-runtime.js`
- `scripts/test-v3-implementation.ts`
- `tests/test_all_tools.sh`
- `tests/test_remaining_tools.sh`
- `docs/guides/CLAUDE-DESKTOP-SETUP.md`
- `docs/README_CLAUDE_SETUP.md`
- `docs/HTTP_DEPLOYMENT.md`

## 47. The Python LightRAG Service Still Returns Success-Shaped Empty or Placeholder Results

The Python GraphRAG runtime under `python/backend/graph` is not just defensive. It still contains placeholder behavior that can surface as "valid but weak" responses to the TypeScript side.

Confirmed problems:

- [python/backend/graph/lightrag_service.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/lightrag_service.py) always returns `edges: []` and only formats nodes; there is no real subgraph traversal in the JSON-RPC surface.
- [python/backend/graph/lightrag_service.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/lightrag_service.py) encodes query failures into a normal-looking result object with `summary: "Error: ..."`, which mirrors the same soft-failure pattern seen elsewhere in the TypeScript server.
- [python/backend/graph/lightrag_service.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/lightrag_service.py) advertises cache invalidation, but the service does not actually rebuild graph state and `SyncSearchEngine` does not implement `clear_cache()`.
- [python/backend/graph/core/semantic_search.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/semantic_search.py) just loops through `db.get_nodes()` and `db.get_embedding()` in Python; there is no vector index or real retrieval acceleration.
- [python/backend/graph/storage/database.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/storage/database.py) returns empty collections or `None` on most failures, which turns backend problems into silent "no results" behavior.

Remediation:

- make `query_graph` return real graph neighborhoods or explicitly document that it is node-only retrieval
- return JSON-RPC errors for backend failures instead of burying them in `summary`
- implement real cache invalidation and rebuild semantics or remove the RPC
- add backend health/status endpoints so the TypeScript bridge can distinguish "empty graph" from "broken graph"

## 48. The Python Graph Build and Query Stack Still Contains Synthetic Data Paths

The graph builder and query engine still fall back to synthetic or stubbed behavior that can pollute the graph or overstate capability.

Confirmed problems:

- [python/backend/graph/core/graph_builder.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/graph_builder.py) initializes `AgenticEntityExtractor("/tmp/nodes.db")`, which is a Linux-specific placeholder path that is only corrected later.
- [python/backend/graph/core/graph_builder.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/graph_builder.py) generates random embeddings when `sentence-transformers` is missing, then stores them as if they were real semantic vectors.
- [python/backend/graph/core/query_engine.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/query_engine.py) handles `VALIDATE` queries by always returning a success-shaped response with `{"status": "valid"}`.
- [python/backend/graph/core/graph_traversal.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/graph_traversal.py) computes path strength with a hardcoded `0.95` multiplier instead of real edge strength retrieval.

Remediation:

- fail graph builds if real embeddings are unavailable in production mode
- separate "demo/test graph build" from the production graph builder
- remove stub validation responses from the Python query engine
- use real edge weights when computing traversal confidence

## 49. The Alternate Documentation Pipeline Is Another Non-Canonical Truth Source

The `NodeDocumentationService` stack is effectively a second node-catalog/documentation system with its own storage, parsing, and logging behavior.

Confirmed problems:

- [src/services/node-documentation-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/node-documentation-service.ts) creates and maintains its own `nodes-v2.db`, separate from the main node repository and GraphRAG storage.
- [src/services/node-documentation-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/node-documentation-service.ts) rebuilds by assuming every discovered node can be addressed as `n8n-nodes-base.${node.name}`, which is wrong for community nodes and langchain nodes.
- [src/services/node-documentation-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/node-documentation-service.ts) emits heavy `console.error` progress logs during rebuild and logs full node payloads during `storeNode()`.
- [src/utils/enhanced-documentation-fetcher.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/enhanced-documentation-fetcher.ts) clones or pulls `n8n-docs` at runtime with `execSync`, creating another environment-dependent side effect path.
- [src/utils/enhanced-documentation-fetcher.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/enhanced-documentation-fetcher.ts) uses a simplistic frontmatter/parser approach that is too weak to be treated as authoritative documentation metadata.
- [src/utils/node-source-extractor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/node-source-extractor.ts) scans wide installation paths recursively, emits `console.error` logs, and guesses package layouts instead of consuming a canonical installed-node manifest.
- [src/mappers/docs-mapper.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mappers/docs-mapper.ts) is another narrower docs lookup path with direct `console.log` usage and hardcoded path heuristics.

Remediation:

- choose one canonical node knowledge source for runtime use
- move rebuild/ingest/update tooling into offline maintenance flows only
- remove raw `console.*` output from rebuild/documentation utilities
- normalize package-aware node identity before any documentation lookup

## 50. Several Support Utilities Are Dead or Stale and Should Not Shape Runtime Design

There is still a layer of support code that looks production-ready but is not actually wired into the current runtime.

Confirmed examples:

- [src/services/config-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/config-service.ts) is unused and still defaults to `n8n-documentation-mcp`, version `1.0.0`, and port `3000`.
- [src/utils/http-security.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/http-security.ts) is unused and implements a parallel CORS/rate-limit/auth stack.
- [src/utils/auth.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/auth.ts) appears to be test-only.
- [src/utils/rate-limiter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/rate-limiter.ts) exposes a more sophisticated rate limiter than the one used by HTTP mode, but it is not integrated into the main server path.
- [src/utils/version-compatibility-detector.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/version-compatibility-detector.ts) is unused and still hardcodes compatibility around `1.97.1`.
- [src/utils/cache-warmer.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/cache-warmer.ts) is not runtime-integrated and still warms `nodes-base.*` identifiers, which conflicts with the stricter workflow validator.

Remediation:

- either wire these utilities into the real runtime or remove them from the supported surface
- do not let dead support modules become the basis for future fixes
- document explicitly which helper stacks are canonical and which are maintenance-only

## 51. The Library Export Surface Still Points at the HTTP Wrapper, Not the Unified MCP Runtime

There is still another product-shape split in the published TypeScript surface.

Confirmed problems:

- [src/index.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/index.ts) exports `N8NMCPEngine` as the default library surface.
- [src/mcp-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp-engine.ts) wraps [src/http-server-single-session.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/http-server-single-session.ts), not the unified stdio MCP server.
- [src/http-server-single-session.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/http-server-single-session.ts) is already known to serve placeholder state on several routes.

Remediation:

- decide whether the package is primarily a library wrapper, an MCP server, or both
- if both are supported, make the package exports and docs distinguish those products clearly
- do not default library consumers into the placeholder/HTTP wrapper if the unified server is the real product

## 52. The Custom n8n Node and Bridge Layer Still Reflect an Older MCP Product Shape

The community-node integration under `src/n8n` is another place where stale assumptions can persist.

Confirmed problems:

- [src/n8n/MCPApi.credentials.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/n8n/MCPApi.credentials.ts) still defaults to `http://localhost:3000/mcp`.
- [src/n8n/MCPNode.node.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/n8n/MCPNode.node.ts) exposes `http`, `websocket`, and `stdio` connection types, but the current repo’s real supported transport story is more fragmented than that simple selector implies.
- [src/utils/bridge.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/bridge.ts) converts workflow objects including fields like `description`, `createdAt`, `updatedAt`, and `active`, which are exactly the kinds of fields the stricter workflow validation path rejects elsewhere.

Remediation:

- update the n8n node defaults and docs to match the current supported runtime surface
- keep the bridge’s workflow shape consistent with the canonical create/update validator
- verify the n8n community node against the real unified MCP server, not just unit tests

## 53. The Rebuild and Introspection Utilities Still Emit Raw Console Noise

There are still several low-level tools that write directly to stdout/stderr instead of going through the central logger with stdio-aware suppression.

Confirmed examples:

- [src/loaders/node-loader.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/loaders/node-loader.ts)
- [src/mappers/docs-mapper.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mappers/docs-mapper.ts)
- [src/utils/node-source-extractor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/node-source-extractor.ts)
- [src/services/node-documentation-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/node-documentation-service.ts)

These are mostly rebuild or maintenance flows, but they still reinforce the repo-wide habit of bypassing the logging contract.

Remediation:

- route all diagnostic output through the logger
- tag maintenance-only logs clearly
- ensure anything callable from a server process remains stdout-safe

## 54. The Workflow Cleaning and Node Discovery Helpers Still Contradict the Canonical API Story

Some of the lower-level "compliance" helpers still disagree with the rest of the runtime about what is allowed and where authority comes from.

Confirmed problems:

- [src/services/workflow-field-cleaner.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-field-cleaner.ts) declares `active` as a read-only field, then copies it back into `optionalFields`, so the cleaner contradicts its own API contract.
- [src/services/workflow-field-cleaner.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-field-cleaner.ts) claims it can remove `description` in `cleanWorkflowForAPIOperation()`, but `description` is never copied into the cleaned object in the first place.
- [src/services/n8n-api-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/n8n-api-client.ts) uses the internal `/rest/node-types` endpoint when available, but falls back to inferring node types from the npm registry package manifest for `n8n-nodes-base`.
- [src/services/n8n-api-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/n8n-api-client.ts) treats that npm-registry fallback as "authoritative", even though it is not the same thing as the live installed node set.

Remediation:

- align the field cleaner with the canonical workflow create/update rules
- remove contradictory comments and dead branches from compliance helpers
- treat npm-registry node discovery as maintenance metadata, not live runtime truth
- keep one explicit priority order for node authority: live instance -> synced local repository -> offline maintenance data

## 55. Timeout and Performance Helpers Still Encode an Older Tool Surface

There is another layer of agent-facing helper code that still names old operations and appears mostly unintegrated.

Confirmed problems:

- [src/utils/operation-timeout-config.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/operation-timeout-config.ts) is built around legacy operation names like `n8n_create_workflow`, `n8n_validate_workflow`, and `list_nodes`.
- [src/utils/operation-timeout-config.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/operation-timeout-config.ts) does not appear to be wired into the main unified MCP execution path.
- [src/utils/memory-guard.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/memory-guard.ts) still writes directly to `console.error` under debug mode.
- [src/services/performance-monitor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/performance-monitor.ts) mostly feeds cache instrumentation rather than the real MCP execution/reporting path.

Remediation:

- either integrate timeout/performance helpers into the unified server or downgrade them to internal-only utilities
- rename any agent-facing timeout configuration to the actual current tool names
- remove direct console output from helper instrumentation

## 56. CI and Automation Workflows Still Overstate Validation

The GitHub automation layer still presents a healthier picture than the repo actually supports.

Confirmed problems:

- [\.github/workflows/release-package.yml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/workflows/release-package.yml) still runs `npm run build` with a placeholder comment, even though the current build path is already a known risk area.
- [\.github/workflows/update-n8n-deps.yml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/workflows/update-n8n-deps.yml) inserts PR checklist claims like "Database rebuilt successfully" and "All tests passed" without actually performing those validations in the workflow.
- [scripts/update-n8n-deps.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/update-n8n-deps.js) uses `console.error` and npm CLI scraping, reinforcing the maintenance-path drift.

Remediation:

- make CI claim only what it actually verifies
- gate release/update automation on authoritative unified MCP smoke tests
- remove placeholder checklist language from PR automation

## 57. The Auto-Update and Graph Refresh Subsystems Still Use Weak or Non-Authoritative Signals

The repository contains multiple background update loops for GraphRAG and node synchronization, and several of them are still built on weak signals.

Confirmed problems:

- [src/ai/change-detector.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/change-detector.ts) infers the "current node catalog" by scanning nodes used in existing workflows, not the installed node set.
- [src/ai/auto-update-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/auto-update-service.ts) then turns those inferred changes into GraphRAG updates, which means the graph can be updated from usage snapshots rather than authoritative node metadata.
- [src/ai/n8n-version-monitor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/n8n-version-monitor.ts) falls back to using a workflow `versionId` as if it were the n8n instance version.
- [src/ai/n8n-version-monitor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/n8n-version-monitor.ts) hardcodes a tiny list of "known breaking changes", which is not a durable strategy.
- [src/ai/graph-update-loop.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/graph-update-loop.ts) independently polls `/rest/node-types`, writes `update_state.json` under the graph directory, uses randomized scheduling jitter, and emits raw `console.error` debug output.
- [src/ai/graph-watcher.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/graph-watcher.ts) also writes directly to `console.error` in debug mode.

Remediation:

- consolidate all background graph-refresh logic into one canonical updater
- use one authoritative source for installed node state
- remove workflow-derived node-catalog inference from the production refresh path
- keep update state in a canonical store with explicit schema/versioning
- route all updater diagnostics through the central logger

## 58. External-Agent and STDIO Review Tooling Is Still Mixing Demo Behavior with Real Verification

Several files that look like agent-facing verification tools are not actually exercising the live MCP server in a reliable way.

Confirmed problems:

- [src/tools/stdio-agent-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tools/stdio-agent-client.ts) is not a real MCP stdio client at all; it instantiates services directly and its `main()` still constructs `mockRepo`, `mockTemplateService`, `mockN8nClient`, and `mockGraphRAGBridge`.
- [src/tools/stdio-agent-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tools/stdio-agent-client.ts) ends with success language like "MCP server is working correctly and ready for use", even though it is not verifying the live tool contract.
- [src/scripts/external-agent-mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/scripts/external-agent-mcp-client.ts) spawns `dist/mcp/index.js` separately, then also connects via `StdioClientTransport`, creating an unnecessary duplicate startup path.
- [src/scripts/external-agent-mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/scripts/external-agent-mcp-client.ts) uses broad "Looks good" heuristics rather than authoritative validation and emits large amounts of raw console output.

Remediation:

- either make these tools real MCP clients or clearly mark them as demos
- remove mock-based "success" narratives from agent-facing review tools
- keep one standard external-client verification script for unified MCP

## 59. Several Verification Scripts Still Simulate or Declare Health Without Exercising the Real Unified Surface

The repo still contains major verification scripts that report readiness from orchestrator-local tests or old tool names.

Confirmed problems:

- [scripts/test-complete-mcp-workflow.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-complete-mcp-workflow.ts) instantiates `LocalLLMOrchestrator` directly, then prints "MCP Server Fully Operational", "Ready for production use", and "production-ready" style conclusions.
- [scripts/test-mcp-external-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-mcp-external-client.ts) explicitly says the connection is "simulated" and still declares the system operational.
- [test-all-tools.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-all-tools.js) targets the legacy `dist/main.js` stdio path and old tool names like `n8n_search_nodes`, `n8n_create_workflow`, and `n8n_validate_workflow`.
- [test-all-tools.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-all-tools.js) manually parses `.env`, injects debug flags, and treats stderr chatter from the server as normal verification noise.

Remediation:

- retire or quarantine scripts that do not test the current unified MCP surface
- build one canonical end-to-end test harness around `dist/mcp/stdio-wrapper.js`
- ban "production-ready" conclusions from scripts unless they run real live smoke tests against the connected n8n instance

## 60. Docker Publish and Quick-Start Automation Still Points Users at Potentially Wrong Launch Paths

Some of the remaining publishing automation still points users at launch flows that have already drifted from the audited runtime.

Confirmed problems:

- [\.github/workflows/docker-publish.yml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/workflows/docker-publish.yml) publishes a quick-start summary that tells users to fetch `docker-compose.desktop.yml` and `start.sh`.
- [start.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/start.js) has already been confirmed to be unsuitable as a strict stdio MCP entrypoint because it prints banners and diagnostics to stdout.
- The publish flow does not validate that the promoted Docker image actually launches the same audited unified server surface.

Remediation:

- make publish-time quick-start output reference only the supported audited entrypoints
- verify container startup against the unified MCP runtime before publishing
- remove any quick-start step that relies on stdout-noisy launcher scripts for stdio usage

### Additional files to touch from this pass

- `python/backend/graph/lightrag_service.py`
- `python/backend/graph/core/graph_builder.py`
- `python/backend/graph/core/query_engine.py`
- `python/backend/graph/core/graph_traversal.py`
- `python/backend/graph/core/semantic_search.py`
- `python/backend/graph/core/catalog_builder.py`
- `python/backend/graph/storage/database.py`
- `python/backend/graph/storage/models.py`
- `src/services/config-service.ts`
- `src/utils/http-security.ts`
- `src/utils/auth.ts`
- `src/utils/rate-limiter.ts`
- `src/utils/cache-warmer.ts`
- `src/utils/version-compatibility-detector.ts`
- `src/services/node-documentation-service.ts`
- `src/utils/enhanced-documentation-fetcher.ts`
- `src/utils/node-source-extractor.ts`
- `src/mappers/docs-mapper.ts`
- `src/loaders/node-loader.ts`
- `src/index.ts`
- `src/mcp-engine.ts`
- `src/n8n/MCPNode.node.ts`
- `src/n8n/MCPApi.credentials.ts`
- `src/utils/bridge.ts`
- `src/services/workflow-field-cleaner.ts`
- `src/services/n8n-api-client.ts`
- `src/utils/operation-timeout-config.ts`
- `src/utils/memory-guard.ts`
- `src/services/performance-monitor.ts`
- `.github/workflows/release-package.yml`
- `.github/workflows/update-n8n-deps.yml`
- `scripts/update-n8n-deps.js`
- `src/ai/change-detector.ts`
- `src/ai/auto-update-service.ts`
- `src/ai/auto-update-loop.ts`
- `src/ai/n8n-version-monitor.ts`
- `src/ai/graph-update-loop.ts`
- `src/ai/graph-watcher.ts`
- `src/tools/stdio-agent-client.ts`
- `src/scripts/external-agent-mcp-client.ts`
- `scripts/test-complete-mcp-workflow.ts`
- `scripts/test-mcp-external-client.ts`
- `test-all-tools.js`
- `.github/workflows/docker-publish.yml`

## Success Metrics

The remediation is complete when all of the following are true:

1. `workflow_manager create` never creates a different workflow than the caller sent.
2. `workflow_execution` no longer fails due to missing optional runtime imports.
3. `workflow_manager validate` distinguishes invalid workflows from internal server failures.
4. `node_discovery search/list/get_info` return consistent results for official nodes.
5. agents can retrieve relevant live nodes in small ranked batches.
6. at least 80 percent of generated workflows for common business scenarios use zero code nodes.
7. `patch_workflow` supports nested arrays and no longer produces malformed payloads.
8. all supported entrypoints launch the same unified MCP core instead of a legacy or parallel surface.
9. HTTP mode returns real system state rather than placeholders.
10. direct chat/OpenWebUI uses the same live MCP tool core and validation path as external agents.
11. response hints reference current tools only.
12. shared-memory artifacts are scoped and no longer bleed across unrelated requests.
13. there is one canonical runtime validation/discovery stack.
14. no supported runtime surface, example config, or verification helper contains hardcoded live JWT/API-key material.
15. explicit runtime configuration beats repo-local `.env` in the supported config model.
16. one canonical supported Node/runtime floor is published across package metadata, compose files, and client examples.
17. first-run guided setup works for direct `npm` / `npx`.
18. first-run guided setup works for Docker Desktop.
19. the guided flow writes the real runtime `.env` to the correct supported location for the chosen channel.
20. no supported setup path stores secrets in `data/setup-state.json`.
21. Claude Desktop registration uses the real current MCP entrypoint.
22. validated generic MCP snippets are generated for the chosen install channel.
23. one documented direct `npm` / `npx` path and one documented Docker Desktop path both launch the same supported product.
24. no supported stdio launcher writes to stdout before MCP handshake.
25. non-core historical/setup/installer surfaces are explicitly archived or marked unsupported.
26. live integration smoke tests pass across stdio MCP, HTTP/API, direct chat, embedded nano-LLM initialization, and both supported setup channels.

## Implementation Notes for Agent-Facing Behavior

The correct pattern is:

1. agent asks for a workflow plan
2. MCP server returns a small step plan
3. agent asks for node recommendations for each step
4. MCP server returns top ranked built-in live nodes
5. agent assembles workflow
6. MCP server critiques the workflow for built-in alternatives
7. MCP server validates locally and remotely
8. MCP server creates the workflow

That pattern gives the agent full access to the live node universe without forcing the entire universe into the model context.

The same pattern must back both external-agent callers and the supported direct chat/OpenWebUI path.

## Final Recommendation

Do not start by tweaking prompts.

Do not start by cleaning workflow corpora, polishing historical setup-dashboard paths, or widening the supported surface beyond the guided setup that is explicitly in scope.

The main problems are architectural and contractual:

- unclear supported-product boundary
- secret/config drift
- nondeterministic create behavior
- inconsistent node identity
- weak retrieval design
- soft failure semantics
- no built-in-first enforcement

Fix those first. Prompting quality will improve automatically once the MCP surface becomes deterministic, retrieval-driven, API-faithful, and shared consistently by both external-agent and direct-chat callers.

## 61. The Nano-LLM Quality Pipeline Still Forces an Answer Through Even After Filtering Rejects Everything

The result-quality layer is wired into the live nano-LLM MCP path, but part of it is still optimized to return something plausible instead of something correct.

Confirmed problems:

- [src/mcp/handlers-nano-llm-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/handlers-nano-llm-pipeline.ts) instantiates and uses [src/ai/quality-check-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-check-pipeline.ts) in the live handler path.
- [src/ai/quality-check-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-check-pipeline.ts) explicitly returns the single top-scoring original result when all results fail filtering, instead of surfacing a no-good-results condition.
- [src/ai/quality-check-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-check-pipeline.ts) computes `qualityPassed` but does not use that signal to block or downgrade the final pipeline output.

Remediation:

- stop returning a fallback result when all candidates fail validation or policy filters
- surface an explicit `no_reliable_results` outcome to the MCP caller
- make the handler differentiate between `results found`, `results weak`, and `results rejected`

## 62. The Search Quality Scorer Uses Weak or Misleading Heuristics

The quality scorer currently looks rigorous, but several checks are weak enough to overstate result quality.

Confirmed problems:

- [src/ai/quality-checker.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-checker.ts) treats coverage as diversity of `nodeName` or `nodeId`, which is not the same thing as coverage of relevant capabilities or answer completeness.
- [src/ai/quality-checker.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-checker.ts) treats diversity as score-bucket spread, so wildly inconsistent relevance can still improve the diversity score.
- [src/ai/quality-checker.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-checker.ts) computes `requiredFieldsPresent` in the metadata check but never uses it to fail or downgrade the result set.
- [src/ai/quality-checker.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/quality-checker.ts) defaults to an encouraging recommendation when no checks fail, even if the result set is only barely above thresholds.

Remediation:

- replace score-spread heuristics with retrieval-accuracy heuristics tied to node type, capability, and answer intent
- remove dead metadata checks or make them part of the actual pass/fail decision
- add a hard low-confidence band where the caller is told to refine or retrieve more data rather than trust the result

## 63. The Result Validator Is Mostly Structural and Cannot Catch Semantic Wrongness

The per-result validator checks shape and length, but not whether the answer is actually useful or truthful.

Confirmed problems:

- [src/ai/result-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/result-validator.ts) validates score range, content length, and metadata shape, but does not verify that the result matches the query intent.
- [src/ai/result-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/result-validator.ts) treats missing `nodeName`, `nodeId`, and `metadata` as warnings, so structurally weak results still flow downstream.
- [src/ai/result-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/result-validator.ts) computes a validation score by subtracting issue counts, which means semantically wrong but well-formed content can still score well.

Remediation:

- introduce semantic validation checks against intent, node capability, and live node identity
- make missing node identity a hard failure for node-recommendation flows
- separate `well-formed` from `trustworthy` in the result contract

## 64. Query Refinement Is Still Non-Deterministic and Can Change Outcome Quality Randomly

The refinement loop is introducing randomness into search behavior that should be reproducible.

Confirmed problems:

- [src/ai/refinement-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/refinement-engine.ts) appends a random diversity term from `alternative`, `different`, `another`, `related`, `similar`.
- [src/ai/refinement-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/refinement-engine.ts) appends a random contextual term from `workflow`, `integration`, `automation`, `process`, `task`.
- [src/ai/refinement-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/refinement-engine.ts) predicts `qualityAfter` by simply adding `expectedImprovement`, not by measuring a real improvement after re-search.

Remediation:

- remove randomness from refinement and use deterministic rewrite rules or ranked alternative rewrites
- store actual before/after refinement outcomes rather than predicted ones
- make refinement idempotent for the same query, context, and retrieval state

## 65. The Nano-LLM Handler Overclaims Real Learning and Observability Integration

The nano-LLM handler constructs many advanced subsystems but does not actually use most of them during query handling.

Confirmed problems:

- [src/mcp/handlers-nano-llm-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/handlers-nano-llm-pipeline.ts) constructs `TraceCollector`, `AIREngine`, `CreditAssignmentEngine`, `NodeValueCalculator`, and `RefinementEngine`.
- [src/mcp/handlers-nano-llm-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/handlers-nano-llm-pipeline.ts) does not actually record traces, compute AIR rewards, assign credits, update node values, or apply refinement in `handleQuery()`.
- [src/mcp/handlers-nano-llm-pipeline.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/handlers-nano-llm-pipeline.ts) returns a message claiming the pipeline is operational with all components initialized, which overstates the effective runtime behavior.

Remediation:

- either wire the learning and tracing components into the real request flow or remove them from the runtime claims
- make observability output reflect what actually executed in the request
- treat unused advanced subsystems as experimental until end-to-end traces prove they are active

## 66. The Intent Classification and Routing Layer Still Depends on Small Hardcoded Knowledge and Async Warmup Drift

The routing layer is presented as embedding-based and adaptive, but it still depends heavily on fixed heuristics and incomplete initialization.

Confirmed problems:

- [src/ai/query_intent_classifier.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/query_intent_classifier.ts) initializes intent embeddings asynchronously without a readiness gate, so early classifications can silently fall back to pattern logic.
- [src/ai/query_intent_classifier.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/query_intent_classifier.ts) uses a tiny hardcoded set of known nodes and services instead of the live installed node universe.
- [src/ai/query_router.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/query_router.ts) accepts an embedding client but never uses it in routing decisions.
- [src/ai/search-router-integration.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/search-router-integration.ts) still claims real embedding-based search even though it ultimately depends on the thin GraphRAG bridge already audited elsewhere.

Remediation:

- add an explicit readiness state for embedding-backed classification
- replace hardcoded node/service vocabularies with a live capability index built from the connected n8n instance
- stop advertising embedding-aware routing unless embeddings materially participate in the decision

## 67. The Reward, Credit, and Node-Value Learning Stack Is Largely Placeholder Math

The learning stack currently computes numbers, but many of those numbers are not grounded in real action sequences or result attribution.

Confirmed problems:

- [src/ai/air-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/air-engine.ts) never updates `avgReward` in `actionHistory`, so action statistics are incomplete.
- [src/ai/air-engine.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/air-engine.ts) awards an implicit metadata bonus using a constant expression instead of actual metadata coverage.
- [src/ai/credit-assignment.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/credit-assignment.ts) uses the same state key for current and next state, collapsing TD learning into a one-state approximation.
- [src/ai/credit-assignment.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/credit-assignment.ts) attributes node credit from query-mentioned nodes rather than from the actual nodes returned or selected.
- [src/ai/node-value-calculator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/node-value-calculator.ts) ignores the `intent` argument in `getRecommendedNodes()`.
- [src/ai/node-value-calculator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/node-value-calculator.ts) never updates `creditVariance`, and `decayHistory()` trims raw history without recomputing aggregate metrics.

Remediation:

- do not let this stack influence ranking or workflow generation until credits are tied to real selected nodes and real outcomes
- rebuild credit assignment around actual multi-step traces rather than single-step approximations
- remove or quarantine intent-aware recommendation claims until intent materially affects ranking

## 68. The Trace and Telemetry Subsystems Still Lose or Distort State

The trace stack is another place where the repo claims richer observability than the code currently provides.

Confirmed problems:

- [src/ai/trace-collector.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/trace-collector.ts) `startTrace()` does not store a partial trace object, and `recordAction()` / `recordResult()` only log rather than mutate persistent state.
- [src/ai/trace-collector.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/trace-collector.ts) `clearTraces(sessionId)` removes the session list but leaves matching items in the global `traces` map.
- [src/ai/trace-collector.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/trace-collector.ts) enforces per-session limits before adding a completed trace, so the declared limit is not reliably enforced.
- [src/ai/telemetry.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/telemetry.ts) uses random sampling and random IDs, which is acceptable for telemetry but makes deterministic debugging harder when the rest of the stack already lacks stable replay.
- [src/ai/trace-processor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/trace-processor.ts) exports RL training data but cannot compensate for the incomplete or weak traces feeding it.

Remediation:

- persist trace lifecycle state from `startTrace` onward
- clear trace indices consistently across both per-session and global stores
- make training/export layers depend on a verified complete trace contract

## 69. Several Support Utilities Still Encode Legacy Names or Unsafe Global Behavior

There are still lower-level support utilities that can quietly distort runtime behavior even if the headline MCP handlers are fixed.

Confirmed problems:

- [src/utils/operation-timeout-config.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/operation-timeout-config.ts) is keyed mostly to legacy tool names like `n8n_create_workflow`, `n8n_update_full_workflow`, and `n8n_validate_workflow`, not the current unified tool surface.
- [src/utils/console-manager.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/console-manager.ts) silences global `console.*` methods process-wide, which is unsafe under concurrent HTTP requests and can hide logs from unrelated operations.
- [src/utils/enhanced-cache.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/enhanced-cache.ts) does not subtract the previous entry size when overwriting an existing key, so `currentMemoryMB` can drift upward inaccurately.
- [src/utils/enhanced-cache.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/enhanced-cache.ts) computes hit rate from entry hits plus entry count, which is only an approximation and can mislead tuning decisions.
- [src/utils/rate-limiter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/rate-limiter.ts) advertises fair request queuing, but `waitingQueue` is never used.
- [src/services/performance-monitor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/performance-monitor.ts) is a singleton that reports approximate in-memory counters only, yet is used by cache logic as if it were authoritative monitoring.
- [src/services/config-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/config-validator.ts) still keys node-specific validation on `nodes-base.*` values, reinforcing the repo-wide node identity split.

Remediation:

- align timeout configuration with current unified tool IDs
- replace global console monkey-patching with request-scoped transport-safe logging
- fix cache accounting before using cache memory pressure as a runtime decision signal
- either implement real queueing in the rate limiter or remove that claim from the design
- normalize support validators to the canonical node identity format

## 70. The Workflow Intelligence Layer Still Returns Placeholder-Like Analysis Outputs

The higher-level workflow analysis service looks rich, but its public output is still partially stubbed.

Confirmed problems:

- [src/services/workflow-intelligence.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-intelligence.ts) initializes `recommendations` to an empty array and `maintainabilityScore` to `0`.
- [src/services/workflow-intelligence.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-intelligence.ts) then overwrites those with `[]` and `100` in `analyzeWorkflow()` instead of calling its own `generateRecommendations()` and `calculateMaintainabilityScore()` helpers.
- [src/services/workflow-intelligence.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-intelligence.ts) leaves `findTypeMismatches()` and `findMissingMappings()` as effectively empty placeholder analyzers.
- [src/services/workflow-intelligence.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-intelligence.ts) relies on broad type-name substring heuristics like `includes('transform')`, `includes('database')`, and `includes('file')`, which are too weak to be treated as authoritative workflow analysis.

Remediation:

- wire the public analysis result to the existing recommendation and score calculators
- mark incomplete analyzers as unsupported until they produce real findings
- base workflow pattern and risk detection on canonical node metadata rather than substring heuristics

## 71. The Main Workflow Validator Still Uses Hardcoded Guidance That Conflicts With the Desired Built-In-First Policy

The primary workflow validator has useful checks, but part of its guidance is still steering agents in the wrong direction.

Confirmed problems:

- [src/services/workflow-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-validator.ts) generates a suggestion to use a `Code` node when it sees more than five expressions in a node, which conflicts with the desired built-in-first generation policy.
- [src/services/workflow-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-validator.ts) uses `findSimilarNodeTypes()` backed by a hardcoded common-node map instead of a live installed-node lookup.
- [src/services/workflow-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-validator.ts) mixes canonical `n8n-nodes-base.*` expectations with suggestion strings based on `nodes-base.*`, reinforcing the repo-wide node identity drift.
- [src/services/workflow-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-validator.ts) validates expressions through [src/services/expression-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/expression-validator.ts) using a context object that does not populate fields like `hasInputData`, increasing the chance of noisy or misleading warnings.

Remediation:

- remove default validator guidance that nudges agents toward `Code` nodes
- generate node suggestions from the synchronized live catalog, not a hardcoded map
- normalize all validator messaging to the canonical node identity format used by the rest of the remediated system

## 72. The Enhanced Config Validator and Simplifier Still Carry Hidden Drift

The enhanced config validator is meant to reduce false positives for agents, but it still has logic gaps and node-identity problems.

Confirmed problems:

- [src/services/enhanced-config-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/enhanced-config-validator.ts) only dispatches node-specific validation for a small fixed set of `nodes-base.*` types, not the broader current live node universe.
- [src/services/enhanced-config-validator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/enhanced-config-validator.ts) has unreachable code in `applyProfileFilters()` after `break`, so some intended suggestions for the `minimal` profile can never run.
- [src/services/workflow-simplifier.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-simplifier.ts) returns any type containing `.` unchanged, so invalid identities like `nodes-base.httpRequest` bypass normalization.
- [src/services/workflow-simplifier.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/workflow-simplifier.ts) resolves fuzzy node types with a parser-backed guess and then falls back to `n8n-nodes-base.${type}` without verifying the resolved node exists in the live instance.
- [src/services/node-parser.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/node-parser.ts) and [src/parsers/node-parser.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/parsers/node-parser.ts) remain two separate parser implementations with different assumptions and output quality.

Remediation:

- consolidate config validation and simplification around the synchronized live node repository
- eliminate unreachable validator branches and add tests for all validation profiles
- reject unresolved or non-live node identities instead of normalizing them optimistically
- retire one of the parser stacks and keep a single canonical parser path

## 73. Configuration Loading Still Overrides Caller-Provided Runtime State

The configuration layer is still too eager to read and overwrite environment state, which is dangerous for packaged deployments, tests, and MCP clients that intentionally inject runtime configuration.

Confirmed problems:

- [src/config/n8n-api.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/config/n8n-api.ts) calls `dotenv.config({ override: true })`, so repo-local `.env` values can overwrite environment variables already supplied by the caller.
- [src/config/n8n-api.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/config/n8n-api.ts) caches the resolved config globally, which means tests or long-lived processes can continue using stale credentials or URLs after the environment changes.
- [verify-stdio.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/verify-stdio.js) bypasses configuration entirely and injects a hardcoded API key into the spawned process.

Remediation:

- stop using `override: true` for normal runtime config loading
- establish a clear precedence order: explicit process env, injected secrets/runtime config, then `.env` only as local fallback
- expose a safe config reset or scoped config factory for tests instead of relying on a sticky global singleton
- remove hardcoded credentials from verification tooling entirely

## 74. The Database Adapter Still Emulates SQLite Too Loosely To Be a Safe Drop-In

The database abstraction is trying to hide multiple backends, but the `sql.js` path does not preserve enough SQLite semantics to be trusted by higher layers.

Confirmed problems:

- [src/database/database-adapter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/database/database-adapter.ts) chooses the backend partly from `process.argv` heuristics like `includes('build') && !includes('dist')`, which is brittle and unrelated to actual runtime capabilities.
- [src/database/database-adapter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/database/database-adapter.ts) schedules persistence on every `prepare()` call for the `sql.js` adapter, not only on writes.
- [src/database/database-adapter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/database/database-adapter.ts) uses synchronous `writeFileSync` during saves, which can block the event loop under load.
- [src/database/database-adapter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/database/database-adapter.ts) returns fake statement metadata like `changes: 0`, `lastInsertRowid: 0`, `columns(): []`, and `inTransaction = false`, which can silently distort calling logic.

Remediation:

- replace argv-based backend inference with explicit configuration and capability checks
- only trigger persistence on actual mutating statements
- return truthful statement metadata or narrow the adapter contract so callers cannot assume full SQLite behavior
- treat the `sql.js` backend as a constrained fallback, not as a transparent equivalent to `better-sqlite3`

## 75. Several “External Client” and Verification Surfaces Are Not Actually Exercising the Live MCP Product

The repo includes multiple scripts and helper clients that claim to verify external-agent behavior, but several of them do not actually talk to the real current MCP contract.

Confirmed problems:

- [src/utils/mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/mcp-client.ts) splits stdio commands on spaces, which breaks Windows paths and quoted arguments.
- [src/utils/mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/mcp-client.ts) bypasses the MCP SDK entirely for HTTP mode and assumes a raw JSON-RPC shape.
- [src/scripts/external-agent-mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/scripts/external-agent-mcp-client.ts) spawns one server process manually and then creates a second `StdioClientTransport` process, so it is not even using a single controlled MCP server instance.
- [src/tools/stdio-agent-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tools/stdio-agent-client.ts) is named like a stdio client but directly instantiates services with mock placeholders and never performs a real MCP protocol handshake.
- [scripts/test-complete-mcp-workflow.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-complete-mcp-workflow.ts) and [scripts/test-mcp-external-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-mcp-external-client.ts) instantiate [src/ai/local-llm-orchestrator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/local-llm-orchestrator.ts) directly and then report the MCP server as “production-ready.”

Remediation:

- reduce all external-client verification to one canonical SDK-based harness for stdio and one canonical harness for HTTP
- make every verification path hit the same entrypoint and tool surface that real agents use
- remove or rename simulated helper scripts so they are not mistaken for authoritative integration tests
- stop reporting production-readiness from scripts that never touch the live MCP protocol surface

## 76. Legacy Verification Scripts Still Target Removed Tool Names, Old Entrypoints, and Even Checked-In Secrets

Some repo-level verification scripts are now active sources of confusion and risk, not just stale utilities.

Confirmed problems:

- [test-all-tools.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-all-tools.js) starts `dist/main.js`, not the current unified stdio wrapper, and calls legacy tools like `n8n_search_nodes`, `n8n_create_workflow`, and `n8n_validate_workflow`.
- [verify-stdio.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/verify-stdio.js) also starts `dist/main.js`, prints raw stdout/stderr for protocol debugging, and contains a hardcoded n8n API key.
- [test-all-tools.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-all-tools.js) manually parses `.env` instead of using the shared config layer, creating yet another config path.
- [scripts/test-v3-runtime.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-v3-runtime.js) reports v3 runtime success by checking for artifacts like `dist/mcp/handlers-v3-tools` and `dist/mcp/tools-consolidated`, even though the repo has already drifted again.

Remediation:

- delete checked-in secrets from verification scripts and rotate any exposed credentials
- retire legacy verification scripts that target removed tool names or removed entrypoints
- make one canonical validation script prove the real current runtime: startup, `initialize`, `tools/list`, and representative live tool calls
- ensure protocol-debug logging is opt-in and safe for stdio framing

## 77. The Test Corpus Still Includes Large Stale Regions That Reference Missing Modules and Removed Architectures

The repo’s test surface is still giving a false sense of coverage because a meaningful portion of it targets code that no longer exists.

Confirmed problems:

- [tests/integration/mcp-tools.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/mcp-tools.test.ts) imports `src/mcp/tools-orchestration`, which is not present in the current source tree.
- [tests/integration/multi-agent-pipeline.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/multi-agent-pipeline.test.ts) imports `src/ai/graphrag-orchestrator`, which is also not present in the current source tree.
- [src/tests/utils/error-handling.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/utils/error-handling.test.ts), [src/tests/utils/memory-manager.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/utils/memory-manager.test.ts), [src/tests/auto-update/secure-hybrid-loader.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/auto-update/secure-hybrid-loader.test.ts), and [src/tests/auto-update/secure-webhook-service.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/auto-update/secure-webhook-service.test.ts) all reference missing modules like `error-handling`, `memory-manager`, `secure-hybrid-loader`, `github-sync`, and `secure-github-webhook-service`.
- [src/tests/external-agent-verification.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/external-agent-verification.ts) is mostly a mock-driven service-level demo, not a real external MCP integration test.

Remediation:

- split tests into `current-runtime`, `legacy-archived`, and `to-delete` buckets
- remove or archive suites that import files not present in the live codebase
- rebuild integration coverage around the current unified MCP server and live n8n instance
- treat mock-driven demos separately from authoritative integration tests

## 78. The Python Test Harnesses Also Overstate Their Authority and Contain Their Own Structural Drift

The Python GraphRAG side does have tests, but some of them are custom runners or toy harnesses rather than robust package-level verification.

Confirmed problems:

- [python/backend/graph/core/test_query_engine.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/test_query_engine.py) imports local modules like `semantic_search` and `query_engine` directly, which is fragile outside a very specific working directory.
- [python/backend/graph/core/test_query_engine.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/core/test_query_engine.py) includes a manual async runner that tries to access `test_func.__self__` on test functions, which is not reliable for standalone execution.
- [python/backend/graph/storage/test_storage.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/storage/test_storage.py) is structured more like a logging script returning booleans than a normal pytest suite with isolated fixtures and assertions.
- [python/backend/graph/storage/test_storage.py](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/python/backend/graph/storage/test_storage.py) hardcodes `/tmp/test_graphrag.db`, which is a portability issue and another sign that the harness was not built as a rigorous cross-platform test surface.

Remediation:

- convert Python verification into standard pytest suites with package-safe imports and temp fixtures
- remove manual runner logic that bypasses pytest behavior
- make storage tests use temporary directories and real assertions, not ad hoc boolean returns and log output
- align Python test claims with the thinner actual GraphRAG runtime currently implemented

## 79. The Prompt and Demo Surface Still Encodes a More Advanced Dual-LLM Learning Product Than the Runtime Delivers

The repo still ships prompts and demos that describe a rich dual-model learning system with strict promotion thresholds and real graph updates, but that contract is not enforced by the live runtime audited elsewhere in this document.

Confirmed problems:

- [src/prompts/embedding-model-system-prompt.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/prompts/embedding-model-system-prompt.ts) describes a deterministic “Neural Graph Semanticist” role with embedding normalization, conflict detection, cluster stability, and sub-second guarantees that are not verified by the current runtime.
- [src/prompts/generation-model-system-prompt.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/prompts/generation-model-system-prompt.ts) describes strict promotion criteria, conflict resolution, and graph update operations that are not consistently implemented in the live TypeScript and Python paths.
- [scripts/test-complete-mcp-workflow.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-complete-mcp-workflow.ts) and [scripts/test-mcp-external-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/test-mcp-external-client.ts) repeat that advanced-story framing while validating only a much thinner orchestrator path.

Remediation:

- either bring the runtime up to the prompt contract or reduce the prompt and demo claims to the behavior the system actually enforces today
- treat performance guarantees and promotion thresholds as tested requirements, not narrative guidance
- stop using demo scripts as evidence that the full dual-LLM learning system is operational

## 80. Packaging and Registration Still Point Different Clients at Different Products

The install and registration layer still has multiple competing ideas of what the executable product is.

Confirmed problems:

- [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json) sets `main` and `bin` to `dist/main.js`.
- [.mcp.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.mcp.json) also points MCP clients at `dist/main.js`.
- [package.runtime.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.runtime.json) instead points its runtime entry to `dist/index.js`.
- [scripts/register-claude.ps1](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/register-claude.ps1) registers `dist/mcp/index.js` under the name `n8n-graphrag`, not the same product shape described elsewhere.
- [scripts/postinstall.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/postinstall.js) checks for `dist/main.js`, tries a full build, and then claims runtime will fall back to `ts-node`, even though that is not a stable packaged-runtime contract.

Remediation:

- pick one canonical executable entrypoint for stdio and one for HTTP, then align `package.json`, `package.runtime.json`, `.mcp.json`, Docker, and registration scripts around that choice
- stop advertising `ts-node` fallback as a runtime guarantee for packaged installs
- make install scripts validate the same real entrypoint that production clients use
- keep the registered server name and path consistent across Claude/Desktop, Smithery-style metadata, and local MCP config

## 81. Secret and Credential Helper Scripts Still Encourage Unsafe Operational Patterns

There are still root scripts that either expose secrets directly or teach the wrong operational model for credential handling.

Confirmed problems:

- [verify-stdio.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/verify-stdio.js) contains a hardcoded n8n API key and prints raw stdout/stderr protocol traffic.
- [scripts/generate-api-key.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/generate-api-key.js) logs the raw created API key to stdout and instructs users to paste it into `.env`.
- [scripts/generate-api-key.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/generate-api-key.js) reads `N8N_API_URL` but then hardcodes `localhost:5678` in the actual request options, which is another contract mismatch.
- [test-all-tools.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-all-tools.js) manually parses `.env` itself, creating another informal secret-loading path outside the main config layer.

Remediation:

- remove checked-in secrets and rotate any credentials exposed by helper scripts
- stop printing raw long-lived tokens in helper output by default
- make helper scripts honor the shared runtime config instead of hardcoding hosts or duplicating env parsing
- document a safe secret-handling path for local development versus packaged deployment

## 82. Some Unit and Config Tests Are Not Hermetic and Operate on the Real Workspace Layout

Part of the remaining test surface is risky because it manipulates the live repo layout or depends on files that are no longer present.

Confirmed problems:

- [tests/unit/config/environment.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/config/environment.test.ts) imports `src/config/environment`, but [src/config](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/config) only contains `n8n-api.ts`.
- [tests/unit/config/environment.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/config/environment.test.ts) renames the real project `.env` file in place during the test, which is not hermetic and is dangerous in a shared working tree.
- [tests/error-handler.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/error-handler.test.ts) imports `src/utils/error-handler`, which is not present in the current source tree.
- [tests/unit/http/mcp-client-http.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/http/mcp-client-http.test.ts) and [tests/unit/http/mcp-client-jsonrpc.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/http/mcp-client-jsonrpc.test.ts) validate the bespoke HTTP assumptions in [src/utils/mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/mcp-client.ts), which is itself not aligned with the SDK transport model.

Remediation:

- make config tests fully hermetic with temp files and injected env state rather than renaming the workspace `.env`
- archive or delete unit suites that import modules no longer present in the live tree
- stop treating bespoke helper-client tests as authoritative MCP conformance
- ensure the test harness only targets code that is actually part of the supported runtime

## 83. The Bridge Layer Still Encodes an Older, Lossy MCP-to-n8n Data Contract

The custom bridge utilities are not necessarily in the main execution path, but they still encode simplifications that can hide information loss or flatten the MCP contract too aggressively.

Confirmed problems:

- [src/utils/bridge.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/bridge.ts) collapses text responses into `{ result: text }`, which loses richer MCP semantics and typed content structure.
- [src/utils/bridge.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/bridge.ts) converts MCP workflows back into n8n format with default `executionOrder: 'v1'`, `staticData: null`, and empty `pinData`, regardless of the source workflow’s actual state.
- [tests/bridge.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/bridge.test.ts) reinforces that flattened contract rather than checking fidelity to the real current runtime behavior.

Remediation:

- either retire the bridge layer if it is no longer canonical or tighten it to preserve the real MCP content structure and workflow fidelity
- stop inventing default workflow fields during conversion unless the caller explicitly requested normalization
- align any remaining bridge tests with the real current MCP server payloads rather than an older simplified contract

## 84. Maintenance Ingestion Scripts Still Depend on Guesses, Destructive Resets, and Machine-Specific Inputs

Some of the repo’s maintenance utilities are still useful as one-off tools, but they are not safe to treat as canonical ingestion pipelines.

Confirmed problems:

- [scripts/maintenance/ingest-official-docs.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/maintenance/ingest-official-docs.ts) guesses node IDs as `n8n-nodes-base.${nodeName}` from markdown filenames and inserts placeholders when a node is not already in the database.
- [scripts/maintenance/ingest-official-docs.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/maintenance/ingest-official-docs.ts) stores placeholder `source_content` and docs URLs without proving the guessed node identity matches the live synced node set.
- [scripts/maintenance/extract-n8n-schema.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/maintenance/extract-n8n-schema.ts) hardcodes a local Windows Downloads HTML export path and then attempts to regex/DOM-scrape rendered Swagger UI.
- [scripts/maintenance/fetch-templates.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/maintenance/fetch-templates.ts) drops the `templates` tables before repopulating them, which is a destructive reset rather than an incremental sync.

Remediation:

- rebuild maintenance ingestion around authoritative machine-readable sources, not filename guesses or rendered HTML scraping
- never create placeholder node records from documentation filenames unless a canonical live-node identity match is proven
- make maintenance scripts idempotent and incremental instead of table-dropping by default
- move machine-specific local paths into explicit CLI parameters or configuration, then fail clearly when they are missing

## 85. Several Remaining Integration Files Are Really Ad Hoc Scripts, Not Trustworthy Automated Tests

There are still top-level integration files that look like tests, but they are not robust test artifacts and in some cases are not even syntactically aligned with the current codebase.

Confirmed problems:

- [tests/integration/test-ai-node-validation.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-ai-node-validation.ts), [tests/integration/test-community-node-validation.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-community-node-validation.ts), and [tests/integration/test-node-restrictions.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-node-restrictions.ts) are structured like standalone scripts with console logging, not normal assertion-driven test suites, and they contain broken import quotes.
- [tests/integration/test-ai-agent-extraction.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-ai-agent-extraction.ts) starts `dist/index.js` and looks for legacy tool names like `get_node_source_code` and `list_available_nodes`, which are not the current unified MCP surface.
- [tests/integration/performance-profiling.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/performance-profiling.test.ts) imports `src/ai/graphrag-orchestrator`, which is not present in the current tree, and then enforces strict latency/token targets against a pipeline that is already known to be partly placeholder.

Remediation:

- separate script-style exploratory files from actual automated tests
- make integration tests target the current built runtime and current tool names only
- delete or archive syntactically broken test files rather than leaving them in the active suite
- only keep performance assertions that map to a real, live, current execution path

## 86. Root Documentation and Launch Metadata Still Describe a Product That No Longer Matches the Current Runtime

The root docs are still one of the main ways users and external agents understand the project, and they remain substantially out of sync with what actually ships.

Confirmed problems:

- [README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/README.md) still tells users to run `npm run go`, but [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json) has no `go` script.
- [README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/README.md) still documents the legacy `n8n_*` tool surface rather than the current unified tools exposed by the live server.
- [README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/README.md) still describes the architecture in terms of `core/` plus `interfaces/` as if that were the current canonical runtime, even though the repo now has multiple competing layers around `server-modern.ts`, `mcp-tool-service.ts`, and the stdio wrapper.
- [QUICK-START-GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/QUICK-START-GUIDE.md) routes users into downstream docs that are themselves affected by the same drift.
- [smithery.yaml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/smithery.yaml) still points to `build/index.js`, which does not match the current build output layout.

Remediation:

- rewrite the root docs around the actual current executable surfaces, tool names, and supported modes
- remove references to commands and files that do not exist
- make launch metadata (`smithery.yaml`, `.mcp.json`, package entrypoints) derive from the same canonical runtime description
- treat documentation drift as a release-blocking issue because it directly affects agent behavior and operator setup

## 87. Startup, Docker, and Helper Scripts Still Launch Conflicting Entrypoints and Promise Unsupported Fallbacks

The repo’s operational scripts still encode multiple incompatible assumptions about how this server starts.

Confirmed problems:

- [Dockerfile](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/Dockerfile) starts `dist/main.js`.
- [Dockerfile.simple](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/Dockerfile.simple) starts `dist/mcp/index.js`.
- [start.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/start.js) prefers `dist/main.js`, falls back to `ts-node`, and still advertises setup paths like `--setup-kapa` and runtime “graceful degradation” that are not tightly aligned with the current MCP product boundary.
- [setup.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/setup.js) configures Claude Desktop with `dist/consolidated-server.js`, which is not part of the current runtime tree, and tells users to run `npm run rebuild:local`, which is not in [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json).
- [docker-compose.simple.yml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docker-compose.simple.yml) uses `MCP_MODE=full`, while [src/main.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/main.ts) only meaningfully distinguishes `http` and stdio behavior.

Remediation:

- choose one supported startup contract for each mode and delete the rest
- stop promising `ts-node` fallback and missing rebuild paths in install/setup helpers
- make Docker and local startup scripts launch the exact same production runtime wherever possible
- validate every documented mode against the real code before keeping it in supported docs

## 88. Root Helper Scripts Still Duplicate Configuration Parsing and Reinforce the Legacy Tool Surface

Several remaining root scripts are effectively fossilized operator workflows and should not be mistaken for supported tooling.

Confirmed problems:

- [list-workflows.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/list-workflows.js) and [review-workflows.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/review-workflows.js) parse `.env` manually rather than using the shared config layer.
- [review-workflows.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/review-workflows.js), [test-node-discovery.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-node-discovery.js), and [test-minimal-mcp.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-minimal-mcp.js) all target either the legacy `dist/main.js` surface or an intentionally minimal fake MCP server.
- [test-session-auth.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/test-session-auth.js) is another ad hoc auth probe that bypasses the main client and service abstractions entirely.

Remediation:

- reduce the root helper surface to a small set of supported operator scripts
- route all supported scripts through the shared config loader
- archive or clearly mark demo/debug-only scripts so they are not confused with supported validation or operational tooling
- remove scripts that only validate the legacy or synthetic MCP surface

## 89. The Repo’s Workflow and Example Assets Carry Live-Like Credential, Webhook, and Instance Metadata

The checked-in workflow JSON files are useful as examples, but several are carrying details that make them look portable when they are not.

Confirmed problems:

- [workflows/Billing_RAG_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/Billing_RAG_Agent.json), [workflows/Fraud_Classifier_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/Fraud_Classifier_Agent.json), [workflows/High_Priority_RAG_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/High_Priority_RAG_Agent.json), and [reference_workflows/From Zero to Inbox Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/reference_workflows/From%20Zero%20to%20Inbox%20Agent.json) include concrete credential IDs and names.
- [reference_workflows/From Zero to Inbox Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/reference_workflows/From%20Zero%20to%20Inbox%20Agent.json) also includes webhook IDs, a workflow ID, a version ID, and instance metadata.
- These assets therefore function partly as environment-specific exports rather than clean portable examples.

Remediation:

- sanitize checked-in workflow examples to remove credential IDs, webhook IDs, instance IDs, and other environment-specific metadata
- distinguish between `portable example workflows` and `real exported workflows` in repo structure and naming
- ensure example assets reflect the built-in-first design goals instead of carrying hidden environment coupling

## 90. The Remaining E2E and Demo Surface Is Not Testing This Product at All

The last uncovered artifact layer confirms that parts of the repo are still carrying stock scaffolding rather than meaningful product coverage.

Confirmed problems:

- [e2e/example.spec.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/e2e/example.spec.ts) is just the default Playwright demo against `https://playwright.dev/`, not an end-to-end test of this server.
- [examples/enhanced-documentation-demo.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/examples/enhanced-documentation-demo.js) depends on `dist/utils/documentation-fetcher` and demonstrates a side subsystem rather than the current MCP runtime.
- [n8n-research.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/n8n-research.md) is extensive and informative, but it is a broad research compendium, not a validated contract for the current server implementation.

Remediation:

- replace stock E2E scaffolding with real end-to-end coverage of the supported server modes
- keep demos only if they are wired to current build artifacts and clearly labeled as demos
- treat research documents as background knowledge, not implementation proof

## 91. The Installer and Setup Surface Still Packages a Different Product Than the Current Runtime

The Windows installer and interactive setup flow are still built around older assumptions and missing artifacts.

Confirmed problems:

- [installer/n8n-mcp-installer.iss](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/installer/n8n-mcp-installer.iss) hardcodes source paths, versions, and assets like `installer\\task.xml`, `setup.ico`, and `n8n-mcp.exe` assumptions that do not line up cleanly with the current repo layout.
- [installer/n8n-mcp-installer.iss](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/installer/n8n-mcp-installer.iss) still writes a `.env` geared toward a GraphRAG/Windows-bundled runtime with `GRAPH_PYTHON`, `N8N_AUTODISCOVER`, and memory settings, not the actual current supported launch contract.
- [setup.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/setup.js) still points Claude Desktop at `dist/consolidated-server.js` and instructs users to run `npm run rebuild:local`, neither of which matches the current repo.
- [public/index.html](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/public/index.html) ships a large setup wizard and local chat UI that assumes HTTP endpoints like `/api/setup/*`, `/api/local-llm/*`, and a broader configuration product surface than the current MCP server reliably exposes.

Remediation:

- either fully support the installer/setup/UI product shape or remove it from the supported surface
- eliminate installer references to missing files, commands, and runtime artifacts
- make the setup wizard derive its available features from the actual running backend instead of assuming historical endpoints
- keep one authoritative install/config path per supported platform

## 92. The Docker Entrypoint Layer Still Has Mixed Quality and Some Paths Still Break MCP Expectations

The raw Docker entrypoint scripts still reveal multiple generations of operational behavior.

Confirmed problems:

- [docker/simple-entrypoint.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docker/simple-entrypoint.sh) prints multiple banner lines to stdout before starting stdio mode, which breaks MCP framing.
- [docker/entrypoint-auto-rebuild.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docker/entrypoint-auto-rebuild.sh) still starts `dist/mcp/index.js`, advertises the dual nano-LLM/GraphRAG architecture, and runs `npm run rebuild`, which does not match the current script names in [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json).
- [docker/docker-entrypoint.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docker/docker-entrypoint.sh) is the most careful of the three, but it still falls back to `dist/mcp/index.js` when the stdio wrapper is missing and couples database initialization to `dist/scripts/rebuild.js`, which is another separate runtime assumption.

Remediation:

- remove any stdout output before stdio server start, everywhere
- consolidate Docker entrypoints so every supported image follows the same startup contract
- stop keeping “smart fallback” branches that launch different server products depending on what happens to exist in `dist/`
- verify every Docker mode against the same real integration harness used outside containers

## 93. The Documentation Corpus Still Preserves Multiple Historical Product Narratives Simultaneously

The docs directory is not just stale in isolated places; it currently contains several different overlapping product stories that are all presented as current.

Confirmed problems:

- [docs/ARCHITECTURE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/ARCHITECTURE.md) describes a complete dual nano-LLM architecture with intent-driven search, reinforcement learning, distributed observability, and strict performance claims that are not backed by the current audited runtime.
- [docs/INSTALLATION.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/INSTALLATION.md) still references commands like `npm run rebuild`, `npm run validate`, and `npm run typecheck` that do not all exist in the current package scripts, and points to repo URLs under `czlonkowski/n8n-mcp`.
- [docs/HTTP_DEPLOYMENT.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/HTTP_DEPLOYMENT.md) still documents `USE_FIXED_HTTP`, `http-bridge.js`, `dist/mcp/index.js`, and a `v2.3.2`/`v2.7.2` product narrative that no longer matches the present codebase.
- [docs/README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/README.md) links to files like `DOCKER_README.md`, `RELEASE_GUIDE.md`, `TROUBLESHOOTING.md`, `HTTP_SERVER_FINAL_FIX.md`, `DOCKER_OPTIMIZATION_GUIDE.md`, and `SECURITY-AUDIT-REPORT.md` that are not all present in the repo root/docs layout.
- [docs/guides/CLAUDE-DESKTOP-SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/CLAUDE-DESKTOP-SETUP.md) still describes `dist/consolidated-server.js`, `npm run rebuild:local`, and a split “consolidated vs legacy” product.
- [docs/guides/OPEN_WEBUI_SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/OPEN_WEBUI_SETUP.md) assumes `docker-compose.open-webui.yml`, local setup endpoints, and a WebUI/backend pairing that needs verification against the actual current code and compose files.

Remediation:

- classify docs into `current-supported`, `historical-archive`, and `design-notes`
- remove or archive documents that describe older products as if they are current
- make the supported docs derive command names, entrypoints, and tool names from the real package/runtime metadata
- stop shipping operational docs that reference missing files or commands

## 94. The API Reference Docs Still Describe a Resource-and-Tool Product That the Current Unified Server Does Not Expose

The docs under `docs/api/` are teaching clients to integrate with a product surface that does not line up with the current live MCP runtime.

Confirmed problems:

- [docs/api/index.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/api/index.md) frames the product as a classic `tools + resources` server with workflow/execution CRUD and URI resources as the primary contract.
- [docs/api/workflow-tools.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/api/workflow-tools.md) documents `workflow_list`, `workflow_get`, `workflow_create`, `workflow_update`, `workflow_delete`, `workflow_activate`, and `workflow_deactivate`, which do not match the current umbrella-tool contract the unified runtime actually presents.
- [docs/api/execution-tools.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/api/execution-tools.md) documents `execution_run`, `execution_get`, `execution_list`, `execution_delete`, and `execution_stop`, again as if they are first-class current MCP tools.
- [docs/api/dynamic-resources.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/api/dynamic-resources.md) and [docs/api/static-resources.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/api/static-resources.md) document `n8n://...` workflow/execution resources and pagination/health semantics that are not the authoritative current retrieval contract for the audited server.

Remediation:

- regenerate the API docs from the current unified tool registry instead of maintaining handwritten tool names
- document the actual current tool surface, including action-based tools where they still exist
- remove or archive resource-template docs unless the current runtime truly exposes and supports them
- tie every documented tool and resource example to an executable smoke test against the live runtime

## 95. The Setup and Configuration Docs Still Point Users at Wrong Package Names, Repo URLs, and Runtime Assumptions

The setup docs are still instructing users to install, configure, and register several different historical products.

Confirmed problems:

- [docs/setup/index.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/setup/index.md) tells users to `npm install -g @leonardsellem/n8n-mcp-server` and run `n8n-mcp-server`, which does not reflect the current repo identity or verified launch path.
- [docs/setup/installation.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/setup/installation.md) uses `npm install -g n8n-mcp-server`, points to `https://github.com/yourusername/n8n-mcp-server.git`, and promises a `--version` CLI path that needs validation against the actual built artifacts.
- [docs/setup/configuration.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/setup/configuration.md) mixes old installer guidance, GraphRAG-specific commands like `npm run seed:catalog` and `npm run metrics:snapshot`, and generic MCP installer instructions without grounding them in the currently supported runtime.
- [docs/setup/troubleshooting.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/setup/troubleshooting.md) routes users to placeholder GitHub URLs under `yourusername/n8n-mcp-server` and assumes the published setup paths are current and supported.

Remediation:

- collapse setup docs to one verified installation path per supported distribution channel
- remove placeholder repo/package names entirely
- verify each documented command against [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json) and the actual shipped binaries before documenting it
- keep GraphRAG-specific setup in a clearly separate advanced section only if the backend is truly supported and tested end to end

## 96. The Security Docs Overstate Fixed State and Cite Missing or Contradictory Runtime Components

The security documentation is not just stale; it actively claims fixes and modules that do not line up with the current tree and audited behavior.

Confirmed problems:

- [docs/security/SECURITY-AUDIT-REPORT.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/security/SECURITY-AUDIT-REPORT.md) presents a confident current-state audit while citing files like `src/utils/error-handler.ts` that are not present in the current source tree and rating the codebase as effectively production-ready after narrow fixes.
- [docs/security/SECURITY-REVIEW-AND-IMPROVEMENTS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/security/SECURITY-REVIEW-AND-IMPROVEMENTS.md) describes “critical vulnerabilities found and fixed” in secure hybrid loaders, webhook services, and memory-management systems that do not map cleanly onto the currently available runtime modules.
- [docs/security/SECURITY-UPDATE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/security/SECURITY-UPDATE.md) states that `vm2` was only used in tests and removed cleanly, but the broader repo still carries extensive historical references to secure-execution and auto-update machinery that are not part of a clean supported surface.
- [docs/security/VULNERABILITY-BREAKDOWN.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/security/VULNERABILITY-BREAKDOWN.md) claims “0 vulnerabilities in our own code” and a broadly settled security posture, which is too strong given the current presence of hardcoded secret handling, plaintext setup-state writes, stale auth surfaces, and conflicting runtime entrypoints elsewhere in the repo.

Remediation:

- downgrade security docs from “fixed/current state” to “audited findings with validation date” unless backed by current test evidence
- remove references to missing files and subsystems from current security guidance
- publish a current security posture doc derived from the actual audited runtime, not from historical intended architecture
- require every claimed security fix to link to the live file path and a passing verification step

## 97. The Docker Docs Describe At Least Three Different Deployment Products as if They Are One

The Docker documentation is now its own source of product drift and can easily send operators to unsupported launch paths.

Confirmed problems:

- [docs/docker/DOCKER_README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/docker/DOCKER_README.md) describes an HTTP-focused `ghcr.io/czlonkowski/n8n-mcp` deployment with `USE_FIXED_HTTP`, `dist/mcp/index.js`, and a stable image product that does not cleanly match the audited local runtime.
- [docs/docker/DOCKER_COMPOSE_SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/docker/DOCKER_COMPOSE_SETUP.md) documents a four-service stack of `n8n + MCP + Ollama + Open WebUI`, legacy `n8n_*` workflow tools, and an auto-rebuild product narrative that is broader than the currently verified server contract.
- [docs/docker/DOCKER_DEPLOYMENT_READY.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/docker/DOCKER_DEPLOYMENT_READY.md) describes a container-safe hardware-detection and Ollama product that centers on `dist/mcp/index.js` and claims readiness based on subsystems the current audit found to be partly placeholder or drifted.
- [docs/docker/DOCKER_DEPLOYMENT_CHECKLIST.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/docker/DOCKER_DEPLOYMENT_CHECKLIST.md) documents a four-process container (`api`, `ui`, `tools`, `python`) on ports `8000/3000/5678`, which is a different product shape again.
- [docs/docker/DOCKER_DESKTOP_SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/docker/DOCKER_DESKTOP_SETUP.md) layers on a setup wizard, Docker Model Runner/vLLM support, `docker-compose.desktop.yml`, and an HTTP UI product that also needs to be treated as separate historical scope unless verified as current.

Remediation:

- split Docker docs by supported product shape and archive every unsupported path
- document one canonical container entrypoint per supported mode and image
- stop mixing stdio MCP, HTTP MCP, Web UI, Open WebUI, Ollama, and setup-wizard narratives in one “quick start”
- require container docs to be validated against the actual checked-in Dockerfiles, compose files, and live smoke tests

## 98. The Development Docs Still Describe a Code Layout and Test Surface That No Longer Exists

The development docs are currently onboarding contributors into the wrong source tree.

Confirmed problems:

- [docs/development/index.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/development/index.md) describes `src/api`, `src/resources`, `src/tools`, `src/errors`, and a `build/` directory as the current modular layout, but the audited runtime has moved into a different mix of `src/mcp`, `src/services`, legacy interfaces, and supporting AI/GraphRAG layers.
- [docs/development/architecture.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/development/architecture.md) points to files like `src/config/environment.ts`, `src/api/n8n-client.ts`, `src/resources/static/workflows.ts`, and `src/tools/workflow/handler.ts`, which are not the authoritative current runtime structure and in some cases do not exist.
- [docs/development/extending.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/development/extending.md) teaches contributors to add tools/resources through older handler patterns and a `createServer()` style entrypoint rather than the current unified server/service contract.
- [docs/development/testing.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/development/testing.md) documents a Jest-driven mirrored source tree with clean unit/integration/e2e coverage that does not reflect the current stale, fragmented, and partially broken test suite.

Remediation:

- regenerate contributor docs from the actual runtime architecture and current directory structure
- stop referencing non-existent source files as extension points
- document the real tool registration path, validation path, and smoke-test harness used today
- make the development docs explicit about which folders are legacy, experimental, archived, or authoritative

## 99. The MCP, AI-Agent, Workflow-Enhancement, and GraphRAG Guides Still Teach Removed or Unverified Capabilities

The remaining guide layer is still instructing users and agents to depend on tooling and capabilities that are not part of the current verified contract.

Confirmed problems:

- [docs/mcp/MCP_ESSENTIALS_README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/mcp/MCP_ESSENTIALS_README.md) and [docs/mcp/MCP_QUICK_START_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/mcp/MCP_QUICK_START_GUIDE.md) teach `get_node_essentials`, `search_node_properties`, `get_node_for_task`, and `src/mcp/server.ts` implementation steps that do not represent the current live unified server surface.
- [docs/guides/AI-AGENT-GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/AI-AGENT-GUIDE.md) documents node discovery commands like `discover_nodes`, `suggest_nodes`, `validate_node`, `create_workflow`, and `execute_workflow` as if they are current first-class supported tools.
- [docs/guides/WORKFLOW_ENHANCEMENT_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/WORKFLOW_ENHANCEMENT_GUIDE.md) is a detailed workflow-ops playbook for a specific Outlook/Teams workflow, but it depends on sidecar files and operational assets like `NEW-NODES-CONFIGURATIONS.json` that need to be clearly labeled as project-specific artifacts rather than MCP-server contract docs.
- [docs/graphrag/GRAPHRAG-CONFIGURATION.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/graphrag/GRAPHRAG-CONFIGURATION.md) still describes a polished `3.0.0-beta` GraphRAG deployment story with commands such as `npm run graphrag:validate-config`, `npm run graphrag:test-n8n`, and `npm run graphrag:backup` that need verification against the real scripts and live backend behavior.

Remediation:

- move speculative or historical guide content into archived design docs unless the live runtime supports it
- separate `project workflow playbooks` from `MCP server product documentation`
- make guide pages declare whether they describe a shipped capability, an experimental path, or an implementation proposal
- back every agent-facing guide with a current integration test or remove it from the supported docs set

## 100. The GraphRAG Installation and Troubleshooting Docs Still Describe a Fully Packaged Product With Missing Scripts, Counts, and Support Paths

The GraphRAG docs are still written like a polished shipped distribution with installers, scheduled tasks, and a stable command surface, but those assumptions need to be revalidated against the current repo.

Confirmed problems:

- [docs/graphrag/GRAPHRAG-INSTALLATION-WINDOWS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/graphrag/GRAPHRAG-INSTALLATION-WINDOWS.md) documents a bundled Windows installer, portable Python/Node packaging, `npm run graphrag:setup`, scheduled-task automation, and `dist/mcp/index.js` Claude registration as if these are current, supported, and reproducible from the present tree.
- [docs/graphrag/GRAPHRAG-INSTALLATION-DOCKER.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/graphrag/GRAPHRAG-INSTALLATION-DOCKER.md) continues the `ghcr.io/czlonkowski/n8n-mcp` image story, HTTP health contract, Docker/Kubernetes deployment shape, and direct JSON-RPC examples as if the GraphRAG runtime is a clean standalone product.
- [docs/graphrag/GRAPHRAG-TROUBLESHOOTING.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/graphrag/GRAPHRAG-TROUBLESHOOTING.md) references installation paths like `~/.local/share/n8n-mcp/dist/mcp/index.js`, tool counts like “62+ tools”, scripts such as `npm run test:mcp-tools`, `npm run graphrag:health`, `npm run graphrag:show-tools`, and a GitHub issue tracker under `n8n-io/n8n-mcp`, all of which need direct confirmation against the current repository and live runtime.
- These docs also speak about graph size, catalog entity counts, auto-updater behavior, and cache directories as if the GraphRAG pipeline is authoritative and complete, while the live audited Python backend still returns placeholder-like or success-shaped sparse results in key paths.

Remediation:

- treat GraphRAG installation docs as a separate product line and verify every command, file path, and binary before keeping it in the supported set
- stop publishing exact tool counts, entity counts, or install claims unless generated from the current build and runtime
- align GraphRAG troubleshooting to the actual scripts and directories present today, or archive it as historical documentation
- do not document GraphRAG as a required or default operator path unless it passes end-to-end smoke tests with the current server

## 101. The Nano-LLM Docs Still Present a Production-Ready Dual-Model Learning System That the Current Runtime Audit Does Not Fully Support

The nano-LLM documentation layer is still overstating maturity and verification.

Confirmed problems:

- [docs/nano-llm/NANO_LLM_SUMMARY.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/nano-llm/NANO_LLM_SUMMARY.md) describes a tuned embedding/generation stack, migration plan, and measurable quality improvements as if the dual-model learning pipeline is the settled current architecture.
- [docs/nano-llm/NANO_LLM_IMPLEMENTATION_COMPLETE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/nano-llm/NANO_LLM_IMPLEMENTATION_COMPLETE.md) explicitly marks the system as “PRODUCTION READY”, cites exact commits, scripts, models, pass rates, and performance numbers, and describes `src/scripts/verify-graphrag-flow.ts`, `src/scripts/test-full-system.ts`, and a `GraphRAGLearningService` integration story that must be reconciled with the present runtime, current service boundaries, and the placeholder-heavy learning stack identified elsewhere in this audit.
- The nano-LLM docs speak in terms of real learning, pattern promotion, and reliable end-to-end workflow feedback loops, while the current audited reward, credit-assignment, trace, and quality pipeline files still contain placeholder math, heuristic routing, and forced-answer behavior.

Remediation:

- downgrade nano-LLM docs from “production ready” to dated implementation notes unless the current runtime reproduces those claims
- verify every referenced script, model path, and benchmark against the present code and environment before keeping them in supported docs
- clearly separate `local experimentation / research` from `supported agent path`
- require live regression tests for any doc that claims a dual-model learning pipeline is fully operational

## 102. The Integration Guides Still Describe Large Side-Product Capabilities That Need to Be Separated From the Supported MCP Surface

Several remaining integration guides are effectively product extensions or solution playbooks rather than accurate documentation of the current supported server.

Confirmed problems:

- [docs/integrations/PLAYWRIGHT_INTEGRATION_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/integrations/PLAYWRIGHT_INTEGRATION_GUIDE.md) documents a “full Playwright integration” with browser session tools, credential storage, automated login, and screenshot verification as if these are stable first-class MCP tools of the current server.
- [docs/integrations/MULTI-SOURCE-EMAIL-GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/integrations/MULTI-SOURCE-EMAIL-GUIDE.md) documents a broad business-email ingestion product with Gmail, Outlook, IMAP, POP3, and custom HTTP APIs, specific workflow imports, environment variables, SQL queries, and AI-response logic that goes far beyond the core MCP server contract.
- Both guides blend product documentation with solution-architecture and business-process guidance, making it unclear which parts are supported server behavior versus project-specific workflows or aspirational integration patterns.

Remediation:

- separate `core MCP product docs` from `solution playbooks` and `experimental integrations`
- only document browser or email-integration tooling as supported if those tools are present, tested, and wired into the current runtime
- move workflow-specific business guides into examples or archives with clear disclaimers
- make supported integrations derive their published tool names from the actual current tool registry

## 103. The Example Docs Still Teach the Legacy `workflow_*` and `execution_*` Tool Contract as if It Is Current

The examples pages are still training users and downstream wrappers to call an outdated MCP surface.

Confirmed problems:

- [docs/examples/basic-examples.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/examples/basic-examples.md) uses `useMcpTool(..., 'workflow_list' | 'workflow_get' | 'workflow_create' | 'workflow_deactivate' | 'execution_run' | 'execution_get')` as if those are the current tool names and idioms.
- [docs/examples/advanced-scenarios.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/examples/advanced-scenarios.md) continues the same legacy tool/resource contract and builds advanced orchestration examples on top of it, including heavy Code/Function-node patterns that cut against the desired built-in-first guidance.
- These pages therefore do more than confuse documentation; they actively teach wrappers and agents to rely on a stale interface and to generate code-heavy workflows.

Remediation:

- rewrite examples to use the current supported tool names and payloads
- bias examples toward built-in nodes and deterministic MCP workflow operations rather than Function/Code-node heavy patterns
- validate every example against the live runtime before publishing it
- archive the legacy examples if they are only useful as historical references

## 104. The GitHub Actions Status Doc Still Claims Stability Through Disabled Automation Rather Than Verified Current CI

The repository status doc itself is another drift signal.

Confirmed problems:

- [.github/ACTIONS_STATUS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/ACTIONS_STATUS.md) presents a reassuring state where disabled workflows avoid failing builds and “core MCP server functionality” is unaffected, but this is not a substitute for current verified CI coverage of the real unified runtime.
- The file normalizes disabled automation as acceptable steady state instead of highlighting the absence of trustworthy continuous validation for the actual current server.
- This matters because the repo already has major test and packaging drift, so a status doc that frames disabled CI as “reliability” can mask the lack of authoritative build and integration signals.

Remediation:

- replace the status note with a current CI matrix that shows which real validations are active, which are intentionally disabled, and why
- do not describe the product as healthy based on disabled workflows alone
- ensure at least one authoritative CI path builds the actual supported runtime and runs live MCP smoke tests
- treat documentation about disabled automation as temporary incident context, not steady-state product documentation

## 105. The Internal Audit, Review, and Cleanup Docs Frequently Declare Convergence Before the Runtime Actually Matches

Several remaining review/planning docs are useful historical context, but they also function as internal sources of false confidence.

Confirmed problems:

- [docs/PROJECT-AUDIT.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/PROJECT-AUDIT.md) describes a production-grade architecture built around files like `src/mcp/index.ts`, `src/mcp/server.ts`, `src/http-server.ts`, and `src/consolidated-server.ts`, and a GraphRAG roadmap that does not match the current authoritative runtime layout.
- [docs/CODE_REVIEW_FINAL.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/CODE_REVIEW_FINAL.md) states “ALL FIXES COMPLETE” for areas that still show drift or placeholder behavior elsewhere in the current tree.
- [docs/IMPROVEMENTS_REVIEW.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/IMPROVEMENTS_REVIEW.md) assumes a simpler, more coherent launcher and script surface than the current repository actually presents.
- [docs/MASTER_CLEANUP_PLAN_2025.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/MASTER_CLEANUP_PLAN_2025.md) includes cleanup assumptions such as deleting or migrating files that are already absent, moved, or superseded, which shows how easily internal cleanup narratives can lag behind or run ahead of the tree.

Remediation:

- treat internal review docs as dated snapshots, not current truth sources
- add visible status metadata to these documents: `historical snapshot`, `superseded`, or `current`
- stop using planning or review docs as evidence that runtime defects are fixed unless verified against the current source and tests
- keep one current engineering status document derived from live repo state and validation runs

## 106. The GitHub Repository Marketing/About Surface Still Advertises the Older Product Promise

Even the repository metadata is still marketing a cleaner and more capable product than the audited runtime consistently supports.

Confirmed problems:

- [.github/ABOUT.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/ABOUT.md) claims deep understanding of “525+ nodes,” dramatic first-try workflow success, “Essential Properties,” “Task Templates,” and universal compatibility as if these are all current, coherent, and fully delivered product features.
- The same file promotes `docker run -it ghcr.io/czlonkowski/n8n-mcp:latest` as a quick start, which again ties repo identity and onboarding to an external image/product story that needs to match the actual supported runtime.

Remediation:

- align repository metadata and marketing copy with the current supported capability set
- remove hard performance/coverage claims unless backed by current benchmarks and smoke tests
- ensure every public-facing quick start in metadata points to the same supported entrypoint as the main docs

## 107. The Verification, Migration, and Feature-Improvement Docs Still Assert File Moves and Tool Improvements That the Current Tree Contradicts

Another remaining document cluster is still presenting earlier cleanup and feature work as completed current fact.

Confirmed problems:

- [docs/VERIFICATION_WALKTHROUGH_Q4_2024.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/VERIFICATION_WALKTHROUGH_Q4_2024.md) states that files like `src/utils/query-cache.ts` and `src/ai/graphrag-orchestrator.ts` were removed or archived and that runtime smoke tests passed against a coherent `3.0.0` product, but the current repository still shows broader drift around those exact areas.
- [docs/validation-improvements-v2.4.2.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/validation-improvements-v2.4.2.md) documents a `validate_node_operation` tool and polished validation behavior that must be reconciled with the current tool surface and the validator fragmentation already found elsewhere in the audit.
- [docs/transactional-updates-implementation.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/transactional-updates-implementation.md) and [docs/transactional-updates-example.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/transactional-updates-example.md) document `n8n_update_partial_workflow` as if that is still the supported current partial-update contract rather than a historical tool-surface generation.
- [docs/ORCHESTRATOR_MIGRATION.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/ORCHESTRATOR_MIGRATION.md) lays out a migration around `tools-orchestration.ts` and `graphrag-orchestrator.ts`, both of which are already known drift points or absent from the current authoritative runtime.

Remediation:

- mark these docs as historical implementation notes unless the referenced files and tools still exist and pass current tests
- stop treating prior cleanup verification as current health evidence
- connect each “completed” migration doc to the current file tree and remove it from supported docs if the referenced target no longer exists
- require versioned docs like these to include a clear `superseded by` marker when the runtime evolves

## 108. The Comprehensive Business-Assistant Docs Describe a Separate Solution Product That Should Not Be Confused With the MCP Server Itself

Some of the largest remaining docs are describing a full business-assistant solution, not the MCP server product boundary.

Confirmed problems:

- [docs/COMPREHENSIVE-BUSINESS-ASSISTANT-SYSTEM.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/COMPREHENSIVE-BUSINESS-ASSISTANT-SYSTEM.md) documents a four-workflow email/document/Teams/SQLite/OpenAI business assistant system with production deployment steps, database schemas, parser libraries, roadmap phases, and separate operational behaviors that far exceed the core MCP server contract.
- The document reads like a turnkey product manual and can easily be mistaken for the MCP server’s current supported capability set, even though it is really a higher-level workflow solution built on top of multiple services and project-specific assumptions.

Remediation:

- move solution-level workflow systems into a clearly separate `solutions` or `examples` area
- document the dependency boundary explicitly: what belongs to the MCP server, what belongs to external workflows, and what is custom business logic
- do not let large solution manuals stand in for current product documentation of the server itself

## 109. The AI-Assistant Setup and Improvements Docs Still Describe a Solution Stack Built on Custom Workflows Rather Than the Current MCP Product Boundary

There is still a separate family of AI email/business-assistant documents that need to be classified away from the MCP server’s core product docs.

Confirmed problems:

- [docs/AI-EMAIL-AGENT-SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/AI-EMAIL-AGENT-SETUP.md) documents a full Outlook + Teams + OpenAI workflow product, with direct workflow imports, Teams bot commands, OpenAI prompt tuning, and credential/setup steps that are solution-specific rather than MCP-server-specific.
- [docs/AI-ASSISTANT-IMPROVEMENTS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/AI-ASSISTANT-IMPROVEMENTS.md) is an extensive roadmap for that separate business-assistant solution, including calendar, CRM, task management, voice, and analytics features.
- These docs are valuable as solution notes, but they currently live alongside server docs without a clear product boundary.

Remediation:

- move these documents into a dedicated `solutions` or `workflow-systems` area
- add explicit labels showing they are built-on-top workflow solutions, not the MCP server runtime contract
- keep the MCP server docs focused on transport, tools, validation, and live n8n interaction rather than full business-assistant solutions

## 110. The Changelog Still Preserves an Older Tool/Entrypoint History Without Mapping It to the Current Unified Runtime

The changelog is another place where old tool names and product epochs remain presented without reconciliation to the current contract.

Confirmed problems:

- [docs/CHANGELOG.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/CHANGELOG.md) records historical additions like `n8n_create_workflow`, `n8n_update_partial_workflow`, `validate_node_operation`, `get_node_essentials`, and multiple renamed server files as if they form a straightforward lineage to the current product.
- The same file references historical repos and version comparisons under `czlonkowski/n8n-mcp`, which further blurs current product identity.
- Without an explicit `current-runtime mapping`, the changelog can mislead maintainers into assuming those tool names or file paths still define the present supported surface.

Remediation:

- add a changelog preface that distinguishes historical version history from the current supported tool/runtime contract
- link each major product-era change to the replacement runtime surface where applicable
- avoid using the changelog as the source of truth for current tool names or entrypoints

## 111. The Build and End-User Improvement Docs Still Normalize the Smart-Launcher/Fallback Product That Needs Revalidation

The remaining launcher-focused docs continue to present the “smart launcher” era as the definitive user experience.

Confirmed problems:

- [docs/END_USER_IMPROVEMENTS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/END_USER_IMPROVEMENTS.md) presents `npm run go`, `Start-MCP-Server.bat`, `Start-HTTP-Server.bat`, `ts-node` fallback, and `dist/main.js` as the polished end-user experience.
- [docs/BUILD_FIXES.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/BUILD_FIXES.md) similarly teaches `start.js`, `dist/main.js`, `quick-start.ps1`, `build-and-start.ps1`, and a branded “n8n Co-Pilot MCP Server v3.0.0” startup contract.
- These docs are still actively defining what “normal startup” looks like, even though the audited runtime has conflicting entrypoints and the current MCP wrapper path is different.

Remediation:

- document one current supported launcher path and archive the rest
- stop presenting `ts-node` fallback and legacy `dist/main.js` startup as default end-user behavior unless it is still officially supported
- make build/runtime docs derive directly from the current package scripts and validated start path

## 112. The Browser-Automation and Open-WebUI Guides Still Present Side-Subsystems as Stable First-Class Product Features

The remaining browser/UI guides continue to package large optional subsystems as if they are part of the current supported core surface.

Confirmed problems:

- [docs/guides/BROWSER_AUTOMATION_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/BROWSER_AUTOMATION_GUIDE.md) documents a comprehensive Playwright/browser automation surface with credential storage, session restore, JavaScript execution, and n8n UI verification as if those browser tools are a stable primary MCP capability.
- [docs/guides/OPEN_WEBUI_SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/OPEN_WEBUI_SETUP.md) describes a containerized Open WebUI + backend + Ollama product, `docker-compose.open-webui.yml`, learning progress APIs, and a broader orchestration stack that needs to be clearly separated from the core server contract.
- Both guides continue the pattern of bundling optional or experimental interfaces into the main product story without clear support boundaries.

Remediation:

- classify browser automation and Open WebUI as optional integrations or experimental surfaces unless they are actively supported and tested
- separate those docs from the core MCP server setup docs
- require a current smoke test for each documented side-subsystem before treating it as supported

## 113. The GitHub Integration Docs Still Describe a Live Sync Subsystem Backed by Missing Runtime Files

The GitHub integration documentation is a concrete example of documentation referencing functionality that the current source tree no longer fully contains.

Confirmed problems:

- [docs/guides/GITHUB_INTEGRATION.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/GITHUB_INTEGRATION.md) documents a real-time GitHub sync/monitoring system and specifically points contributors to [src/services/github-sync.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/github-sync.ts), [src/services/github-monitor.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/github-monitor.ts), and [src/loaders/remote-node-discovery.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/loaders/remote-node-discovery.ts), which are not present in the current tree.
- The same doc still promises commands such as `npm run rebuild:github`, `npm run rebuild:local`, and `npm run test:github`, which need to be grounded in the current package scripts before being treated as supported.

Remediation:

- remove or archive GitHub-integration docs until the referenced implementation files and scripts exist in the supported runtime again
- do not document missing subsystems as active features
- validate all script names in the guide against the current [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json) before publishing them

## 114. The Dashboard and Health-Monitoring Docs Still Point to a Monitoring Surface That Is Only Partially Real in the Current Tree

The monitoring docs are another case where the documented implementation and the actual source tree are out of sync.

Confirmed problems:

- [docs/dashboard.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/dashboard.md) documents `npm run dashboard`, `npm run dashboard:dev`, a dashboard server on port 3001, and [src/dashboard/dashboard-server.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/dashboard/dashboard-server.ts) as the implementation, but that file is not present in the current source tree.
- [docs/health-monitoring.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/health-monitoring.md) points to [src/services/health-check.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/health-check.ts), which is also not present, while [src/services/metrics-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/metrics-service.ts) does exist.
- That leaves the monitoring story half-real and half-historical, which is dangerous for operators relying on health/readiness/metrics documentation.

Remediation:

- rebuild the monitoring docs from the current implementation files that actually exist
- remove references to missing dashboard/health-check modules
- treat monitoring docs as unsupported until the actual endpoints and startup commands are verified live

## 115. The Claude Desktop Setup Docs Still Reinforce the Consolidated-vs-Legacy Split and Older Repo Identity

The Claude Desktop setup surface is still split across multiple historical product narratives.

Confirmed problems:

- [docs/guides/CLAUDE-DESKTOP-SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/guides/CLAUDE-DESKTOP-SETUP.md) still presents a `consolidated server` versus `legacy server` choice, points to `dist/consolidated-server.js`, and uses commands like `npm run rebuild:local`.
- [docs/README_CLAUDE_SETUP.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/README_CLAUDE_SETUP.md) continues the older `ghcr.io/czlonkowski/n8n-mcp` repo identity, old tool names like `list_nodes` and `get_node_essentials`, and a `v2.5.1` style product contract.
- These guides are especially important because they directly shape how external AI clients connect to the server.

Remediation:

- publish one canonical Claude Desktop setup guide for the current supported runtime only
- remove the obsolete consolidated/legacy split unless both entrypoints are still intentionally supported and tested
- ensure Claude setup docs derive tool names, paths, and env vars from the current runtime, not historical product eras

## 116. The Root README Still Defines the Product as the Old Co-Pilot Contract Rather Than the Audited Unified Runtime

The repo root README is still one of the strongest sources of user expectation, and it is materially out of sync with the audited server.

Confirmed problems:

- [README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/README.md) still brands the project as `n8n Co-Pilot MCP Server`, points users to `npm run go`, and references the `Zevas1993/One-Stop-Shop-N8N-MCP` repo identity as the canonical source of truth.
- The same README still documents legacy `n8n_create_workflow`, `n8n_search_nodes`, `n8n_status`, and related tool names rather than the current umbrella-tool surface that the audited live runtime exposes.
- Its architecture section still presents the `core/` plus `interfaces/` era as the definitive structure, with `mcp-interface.ts` and `openwebui-interface.ts` framed as the primary dual-interface product, even though the current audited execution path is centered on the unified MCP runtime.
- The README also continues to promise a `stateless` design while the audited runtime still uses shared memory and mutable intermediate state in ways that contradict that promise.

Remediation:

- rebuild the root README from the current supported runtime, not the historical v3.0 product narrative
- replace obsolete tool names, package scripts, startup commands, and architecture diagrams with the audited current surface
- do not claim statelessness unless the shared-memory and hidden-mutation issues are actually removed from the implementation

## 117. The Remaining Quick-Start Guides Still Funnel Users Into Historical or Side-Product Workflows

The quick-start surfaces are still routing users into old or adjacent products instead of the current MCP server boundary.

Confirmed problems:

- [QUICK-START-GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/QUICK-START-GUIDE.md) simply routes users back into the root README and the old workflow-enhancement and business-assistant documentation, rather than into a verified unified-runtime setup flow.
- [docs/QUICK-START-GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/QUICK-START-GUIDE.md) is not a quick start for the MCP server at all; it is a setup guide for a separate four-workflow Outlook/Teams business assistant solution.
- That means a new reader can still be pushed from the root of the repo into solution-specific workflow imports and Teams setup instead of into the actual MCP server they are trying to run.

Remediation:

- define one actual quick-start document for the current MCP server runtime only
- move solution-specific workflow quick starts into a clearly labeled examples or solutions area
- stop using quick-start entrypoints to bridge unrelated products under the same setup story

## 118. The Docs Index Still Links to Missing Files and Incorrect Paths, So the Documentation Tree Cannot Be Trusted As a Navigation Layer

The main docs index is itself broken, which makes the broader documentation set even less reliable.

Confirmed problems:

- [docs/README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/README.md) links to [docs/RELEASE_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/RELEASE_GUIDE.md), [docs/benchmarking.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/benchmarking.md), [docs/TROUBLESHOOTING.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/TROUBLESHOOTING.md), [docs/HTTP_SERVER_FINAL_FIX.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/HTTP_SERVER_FINAL_FIX.md), and [docs/DOCKER_OPTIMIZATION_GUIDE.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/DOCKER_OPTIMIZATION_GUIDE.md), and those files are not present in the current tree.
- The same docs index links to [docs/CONTRIBUTING.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/CONTRIBUTING.md), which is also missing; the actual contribution guide lives at the repo root.
- It also references the security report through `../SECURITY-AUDIT-REPORT.md`, which does not match the current docs/security layout.

Remediation:

- repair the docs index before treating the documentation tree as a product surface
- require every index link to resolve against the current repository during CI or docs validation
- collapse or archive dead index entries instead of leaving them as broken navigation promises

## 119. The Dependency-Update Guide Still Documents Unsupported Scripts and an Automation Story That the Current Package Surface Does Not Expose

The dependency-update story is partially real in the repo, but the guide is still presenting a stronger and cleaner automation contract than the current package surface supports.

Confirmed problems:

- [docs/DEPENDENCY_UPDATES.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/DEPENDENCY_UPDATES.md) tells users to run `npm run update:n8n:check`, `npm run update:n8n`, `npm run rebuild`, and `npm run validate`, but those scripts are not defined in the current [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json).
- The same guide frames the GitHub Action as a scheduled weekly updater, but [.github/workflows/update-n8n-deps.yml](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/.github/workflows/update-n8n-deps.yml) has the schedule commented out and currently runs only via manual dispatch.
- That leaves the underlying script and workflow present, but the documented operational contract is still overstated relative to the current package and CI surface.

Remediation:

- either add the documented package scripts back or remove them from the dependency-update guide
- document the update workflow as manually triggered unless the schedule is actually re-enabled
- make dependency-maintenance docs derive from the current package scripts and CI definitions, not from intended future automation

## 120. The Plugin Development Guide Documents a Plugin Subsystem That Is Not Present in the Current Source Tree

The plugin guide is currently describing a product capability that the audited repo does not materially contain.

Confirmed problems:

- [docs/PLUGIN_DEVELOPMENT.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/PLUGIN_DEVELOPMENT.md) documents `plugins/`, `src/plugins/example-plugin.ts`, `plugin-config.json`, `PLUGINS_ENABLED`, `PLUGIN_DIR`, `PLUGIN_WATCH`, lifecycle hooks such as `beforeToolExecution` and `afterToolExecution`, and an installable plugin flow.
- There is no `plugins/` directory in the current repo, no `src/plugins/` tree, no `src/plugins/example-plugin.ts`, and no corresponding plugin env vars or hook system surfaced in the audited source or package configuration.
- That makes the plugin guide a fictional extension surface from the perspective of the current codebase.

Remediation:

- archive the plugin guide unless a real plugin runtime is restored and tested
- do not document extension hooks that have no current implementation path
- if plugin support is intended, add a minimal real plugin subsystem first and then regenerate the guide from code

## 121. The Integration-Plan Docs Still Declare Convergence Even Where the Live Runtime Audit Found Breakage and Drift

The integration-plan layer continues the pattern of claiming that key architectural tasks are already complete, even when the live runtime still shows defects in those same areas.

Confirmed problems:

- [docs/INTEGRATION_PLAN.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/INTEGRATION_PLAN.md) marks the LLMRouter, event bus, node restriction system, initialization flow, and MCP filtering work as `complete` and presents them as a clean finished migration.
- [docs/REMAINING_INTEGRATION_TASKS.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/docs/REMAINING_INTEGRATION_TASKS.md) goes further and declares `ALL TASKS COMPLETE`, including event-driven learning, 4-layer protection, and unified LLM access.
- The live runtime audit still found concrete defects in the same neighborhood: partial node-discovery correctness, stale or broken event semantics, inconsistent node identity handling, runtime import failures, and agent-generation quality issues.

Remediation:

- treat the integration-plan docs as historical implementation notes, not evidence that the current runtime is healthy
- add a rule that “complete” status in design docs must be backed by current integration tests against the supported runtime
- stop letting historical completion docs stand in for live validation

## 122. The Testing README Still Describes a Clean Hierarchical Test System That the Actual Test Tree and Results No Longer Match

The testing README is another high-leverage doc because it shapes how contributors interpret the safety net, and it is now overstating order and health.

Confirmed problems:

- [tests/README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/README.md) describes a tidy hierarchy including `tests/unit/errors`, `tests/unit/resources/static`, `tests/unit/tools/execution`, and `tests/e2e`, but those locations are not present in the current tree.
- The same README presents the suite as an organized architecture-aligned system, while the live audit has already established that many current tests target missing modules, removed contracts, or stale tool names.
- That means the README is still presenting the tests as a coherent maintained safety net when the actual tree is fragmented and only partially aligned with the current implementation.

Remediation:

- rewrite the testing README to reflect the current test tree and current confidence level honestly
- separate maintained current-runtime tests from archival or historical tests
- enforce a policy that test docs are derived from the actual test inventory and current CI results, not intended structure

## 123. The Templates README Mixes a Real Template Subsystem With Missing Scripts and a Historical Tool Surface

The templates area is not entirely dead, but its README still mixes partially real implementation with stale activation and tool-contract guidance.

Confirmed problems:

- [src/templates/README.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/templates/README.md) documents `npm run fetch:templates` and `npm run test:templates`, but those scripts are not present in the current [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json).
- The same README still documents MCP tools like `list_node_templates`, `search_templates`, and `get_templates_for_task`, which do still appear in the current code, but they belong to the older handler/tool contract stratum and need to be reconciled with the current supported MCP surface rather than treated as self-evidently stable.
- That leaves the templates subsystem in an ambiguous state: partly implemented, partly historical, and not cleanly surfaced through the current package/runtime story.

Remediation:

- either restore the documented template scripts or remove them from the templates README
- explicitly document whether the template tools are first-class current MCP tools or legacy compatibility surfaces
- tie the templates README to the current supported runtime and package scripts before treating it as operational guidance

## 124. The Shell-Based Tool Test Harnesses Still Exercise the Legacy HTTP JSON-RPC Surface and Old Tool Names

The top-level shell test harnesses are not testing the current supported MCP runtime; they are testing an older HTTP-facing contract.

Confirmed problems:

- [tests/test_all_tools.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test_all_tools.sh) and [tests/test_remaining_tools.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test_remaining_tools.sh) both target `http://localhost:3000/mcp` with a bearer token and JSON-RPC payloads, which is not the same path as the currently audited unified stdio runtime.
- Those harnesses still test legacy or older-surface tools such as `get_workflow_guide`, `find_nodes`, `list_nodes`, `search_nodes`, `get_node_essentials`, `get_property_dependencies`, `validate_workflow_connections`, `n8n_list_workflows`, and similar names that are not the same contract the current live unified MCP server exposes.
- The scripts therefore overstate coverage while actually testing a historical interface layer that has already drifted from the current production path.

Remediation:

- replace the shell harnesses with a real smoke suite against the current supported MCP entrypoint and tool contract
- clearly mark legacy HTTP/JSON-RPC harnesses as archival compatibility tests if they must remain
- stop using historical shell scripts as evidence that the current MCP tool surface is healthy

## 125. The Remaining Integration and E2E Test Harnesses Are Either Stale Against Missing Modules or Pure Boilerplate

The next layer down in the test tree confirms that a meaningful slice of integration coverage is no longer connected to the current implementation.

Confirmed problems:

- [tests/integration/mcp-tools.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/mcp-tools.test.ts) still imports [src/mcp/tools-orchestration.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/tools-orchestration.ts), which is not present in the current tree.
- Several other integration/unit tests still import [src/ai/graphrag-orchestrator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/graphrag-orchestrator.ts), [src/utils/error-handler.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/error-handler.ts), [src/utils/query-cache.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/query-cache.ts), [src/utils/resource-formatter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/resource-formatter.ts), [src/utils/execution-formatter.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/execution-formatter.ts), and [src/config/environment.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/config/environment.ts), all of which are absent.
- [e2e/example.spec.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/e2e/example.spec.ts) is just the default Playwright sample hitting `https://playwright.dev/`, so the repo’s only visible e2e spec is not testing this project at all.

Remediation:

- delete or archive boilerplate and missing-module tests instead of counting them as live coverage
- build a small current-runtime integration suite around the unified MCP server, live n8n auth, and the supported tool contract
- keep any historical compatibility tests in a clearly isolated legacy test area

## 126. The Checked-In Workflow JSON Assets Are Valuable Built-In-First Agent Patterns, but They Are Orphaned and Contain Credential References

The workflow assets under `workflows/` are one of the few repo surfaces that actually model built-in-first agentic patterns, but they are not being treated safely or systematically.

Confirmed problems:

- [workflows/Billing_RAG_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/Billing_RAG_Agent.json), [workflows/Fraud_Classifier_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/Fraud_Classifier_Agent.json), and [workflows/High_Priority_RAG_Agent.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/workflows/High_Priority_RAG_Agent.json) are all agentic workflow examples built from n8n built-in and LangChain nodes, with no `Code` nodes.
- Those same workflow files embed credential references such as `OpenAi account` and `Postgres account` IDs and names, which should not be committed as reusable reference assets without sanitization.
- The files also appear to be effectively orphaned: repo-wide references are dominated by docs pointing to other missing workflow files, not to these actual checked-in assets.

Remediation:

- sanitize checked-in workflow assets so credential IDs and names are not preserved in reusable examples
- promote these workflows into a curated pattern library or template source for the built-in-first generation system
- stop leaving useful workflow assets disconnected from the planner/template/pattern surfaces while docs point to different nonexistent workflow files

## 127. The Root n8n Research Compendium Is Useful Background but Should Be Treated as a Dated Research Snapshot, Not as Implementation Truth

The large research dump at the repo root can be useful context, but it is also a potential source of silent drift because it mixes external product facts, market stats, version claims, and ecosystem counts into one local document.

Confirmed problems:

- [n8n-research.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/n8n-research.md) compiles large amounts of external information, including release history, pricing, ecosystem counts, GitHub metrics, and feature descriptions that are inherently time-sensitive.
- Because it sits at the repo root and reads like a canonical internal knowledge base, it can easily be mistaken for current implementation truth rather than dated external research.
- Its role should be clearly separated from the MCP server’s actual supported runtime, supported tool contract, and verified node/runtime behaviors.

Remediation:

- move the research compendium into a clearly labeled reference or research area with an explicit as-of date
- do not treat external product research as a substitute for live runtime validation or source-level truth
- keep implementation docs derived from the actual codebase and verified runtime, not from broad ecosystem research notes

## 128. The src/tests Tree Preserves a Second, Staler Test Layer With Missing Modules and Standalone Pseudo-Runners

There is a separate `src/tests` layer in the repo that is even less aligned with the current implementation than the main `tests/` tree.

Confirmed problems:

- [src/tests/auto-update/secure-hybrid-loader.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/auto-update/secure-hybrid-loader.test.ts) targets [src/loaders/secure-hybrid-loader.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/loaders/secure-hybrid-loader.ts) and [src/services/github-sync.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/github-sync.ts), both of which are missing.
- [src/tests/auto-update/secure-webhook-service.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/auto-update/secure-webhook-service.test.ts) targets [src/services/secure-github-webhook-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/secure-github-webhook-service.ts), which is also missing.
- [src/tests/utils/error-handling.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/utils/error-handling.test.ts) and [src/tests/utils/memory-manager.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/utils/memory-manager.test.ts) target [src/utils/error-handling.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/error-handling.ts) and [src/utils/memory-manager.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/memory-manager.ts), which are missing as well.
- [src/tests/auto-update-test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/auto-update-test.ts) and [src/tests/external-agent-verification.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tests/external-agent-verification.ts) go beyond normal Jest usage and embed their own `require.main === module` pseudo-runners, which makes them ambiguous as both tests and ad hoc demos.

Remediation:

- remove or archive the `src/tests` files that target missing modules instead of treating them as latent coverage
- migrate any still-useful scenarios into the maintained top-level test suite and current runtime contract
- avoid keeping pseudo-test scripts in a place that implies they participate in the real automated safety net

## 129. The Manual and Example Verification Scripts Still Point to Removed Orchestration Paths or Older Build-Era Demos

The manual/demo layer is still mixing useful intent with stale implementation assumptions.

Confirmed problems:

- [tests/manual/test-n8n-instance.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/manual/test-n8n-instance.ts) still imports [src/ai/graphrag-orchestrator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/graphrag-orchestrator.ts), which is not present in the current tree.
- [examples/enhanced-documentation-demo.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/examples/enhanced-documentation-demo.js) is tied to a built `dist/utils/documentation-fetcher` path rather than a maintained current example contract, so it depends on a successful build and an older demo model of the docs subsystem.
- Both files continue the pattern of presenting demonstration scripts as validation assets even when they are not guaranteed to run against the current supported runtime.

Remediation:

- archive or repair manual/example scripts that reference removed orchestration paths
- treat examples as supported only if they are exercised by current CI or smoke tests
- avoid using demo scripts as evidence of current server correctness unless they run against the same entrypoints and contracts the product supports

## 130. The Contributing Guide Still Teaches a Nonexistent Script Surface, Plugin Tree, and Consolidated-vs-Legacy Runtime Split

The contributor guide is currently one of the strongest amplifiers of stale architecture in the repo.

Confirmed problems:

- [CONTRIBUTING.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/CONTRIBUTING.md) still tells contributors to run `npm run rebuild:local`, `npm run start:consolidated`, `npm run start:legacy`, `npm run typecheck`, `npm run benchmark`, `npm run test:essentials`, `npm run test:workflow-validation`, `npm run test:n8n-manager`, `npm run test:templates`, and `npm run test:single-session`, but those scripts are not defined in the current [package.json](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/package.json).
- The same guide still documents a `plugins/` subsystem and project structure entries such as [src/mcp/server.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/server.ts), [src/mcp/server-simple-consolidated.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/server-simple-consolidated.ts), [src/mcp/tools.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/tools.ts), [src/mcp/tools-consolidated.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/mcp/tools-consolidated.ts), [src/scripts/validate.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/scripts/validate.ts), and [src/scripts/benchmark.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/scripts/benchmark.js), none of which are present.
- It also points contributors to [GETTING-STARTED.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/GETTING-STARTED.md) and [CHANGELOG.md](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/CHANGELOG.md) at the repo root, which are missing.

Remediation:

- rebuild the contributing guide from the current package scripts and current tree only
- stop teaching contributors a plugin/consolidated/legacy architecture unless those products are actively restored and supported
- validate contributor-facing setup and file-reference docs in CI the same way API/docs indexes should be validated

## 131. The Stdio Agent Client Is Not a Real MCP Stdio Client and Misrepresents End-to-End Validation

There is a file in the tree that looks like a genuine external-client verifier, but it is not actually exercising the server the way a real stdio client would.

Confirmed problems:

- [src/tools/stdio-agent-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/tools/stdio-agent-client.ts) does not speak MCP over stdio; instead it constructs [src/services/mcp-tool-service.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/services/mcp-tool-service.ts) directly in-process and drives service methods.
- The file’s `main()` path then instantiates the client with empty mock objects cast as `any`, which means the top-level demo path is not a meaningful real verification harness.
- That makes the file actively misleading as a representation of external-agent behavior, because it bypasses the transport layer, server wiring, request/response framing, auth, and actual tool registration surface.

Remediation:

- rename or relocate this file so it is not mistaken for a real stdio MCP integration test
- replace it with a true stdio client smoke test that launches the supported server and talks MCP over transport
- avoid direct-service demos being labeled as external-agent verification unless they are explicitly framed as internal service-level demos

## 132. Several Remaining AI and Node-Restriction Integration Files Are Not Real Maintained Tests at All

The remaining `tests/integration` surface contains a mix of stale Jest files and direct script-style files that are either malformed or no longer aligned with the runtime.

Confirmed problems:

- [tests/integration/performance-profiling.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/performance-profiling.test.ts) still imports [src/ai/graphrag-orchestrator.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/ai/graphrag-orchestrator.ts), which is missing, so the headline performance suite is not targeting a present implementation.
- [tests/integration/test-ai-node-validation.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-ai-node-validation.ts), [tests/integration/test-community-node-validation.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-community-node-validation.ts), and [tests/integration/test-node-restrictions.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-node-restrictions.ts) are not structured as maintained Jest tests; they are direct top-level scripts, and some of them contain malformed import strings.
- [tests/integration/test-node-restrictions.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-node-restrictions.ts) also bakes in node-identity assumptions like `n8n-nodes-langchain.chain` without the `@n8n/` prefix, which mirrors the broader node-type normalization drift found in the runtime.
- [tests/integration/test-ai-agent-extraction.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/integration/test-ai-agent-extraction.ts) still expects tools like `get_node_source_code` and `list_available_nodes`, plus a `nodes://source/...` resource contract, which belong to an older product/tool stratum.

Remediation:

- convert script-style integration files into either real automated tests or archive them as manual experiments
- remove malformed and missing-module integration files instead of leaving them in the active tree
- ensure node-restriction and AI integration tests use the same canonical node-type normalization and tool/resource contract as the supported runtime

## 133. A Material Portion of the “Passing” Unit Test Surface Uses Toy Helpers Instead of the Actual Implementation

Some of the remaining unit tests only stay green because they avoid the real code paths entirely.

Confirmed problems:

- [tests/unit/resources/dynamic/workflow.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/resources/dynamic/workflow.test.ts) tests local helper functions that hardcode the `n8n://workflows/{id}` URI pattern instead of importing or validating the real resource implementation.
- [tests/unit/api/simple-client.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/api/simple-client.test.ts) defines its own `SimpleHttpClient` inline rather than exercising the actual n8n client or MCP client code.
- [tests/unit/tools/workflow/simple-tool.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/tools/workflow/simple-tool.test.ts) similarly defines a local mock tool definition and filter helper instead of testing the real workflow tool surface.
- Even the more concrete HTTP client tests, [tests/unit/http/mcp-client-http.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/http/mcp-client-http.test.ts) and [tests/unit/http/mcp-client-jsonrpc.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/http/mcp-client-jsonrpc.test.ts), are still pinned to the historical `http://localhost:3000/mcp` JSON-RPC surface.

Remediation:

- replace toy helper tests with tests that import the real implementation modules
- stop counting hand-written stand-in classes and hardcoded contracts as meaningful project coverage
- keep protocol/client tests aligned to the current supported transport and entrypoint, not the older HTTP JSON-RPC endpoint by default

## 134. The AI Unit Tests Are Reinforcing the Same Heuristic and Shared-State Assumptions That the Runtime Audit Flagged as Risky

The AI-oriented unit tests are not just verifying behavior; they are codifying several of the same fragile assumptions the runtime audit already identified.

Confirmed problems:

- [tests/unit/ai/pattern-agent.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/ai/pattern-agent.test.ts) expects deterministic success and specific pattern IDs for a wide range of natural-language goals, even though the live runtime already showed pattern-matching ambiguity and misclassification.
- [tests/unit/ai/workflow-agent.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/ai/workflow-agent.test.ts) expects generated node types to match `^n8n-nodes-base\\.` universally, which is too narrow for a system that also uses valid `@n8n/n8n-nodes-langchain.*` nodes in real workflows.
- The same workflow/validator/pattern tests all rely on global shared-memory keys such as `selected-pattern`, `generated-workflow`, and `workflow-validation-result`, which mirrors the cross-request and cross-test contamination risk already found in the runtime design.
- [tests/unit/ai/graphrag-bridge.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/ai/graphrag-bridge.test.ts) explicitly skips backend failures outside CI, while [tests/unit/ai/graphrag-offline-cache.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/ai/graphrag-offline-cache.test.ts) seeds offline catalog IDs like `nodes-base.slack`, which continues the broader prefix-normalization inconsistency.
- [tests/unit/ai/shared-memory-load.test.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/unit/ai/shared-memory-load.test.ts) stress-tests the shared-memory singleton directly with persistent global keys, which can amplify state bleed unless the storage is isolated and reset between runs.

Remediation:

- rewrite AI unit tests around stable contracts and invariant properties instead of overfitting to current heuristic outputs
- scope shared-memory keys per test run and reset state explicitly between tests
- allow valid AI/LangChain node prefixes in workflow tests instead of assuming only `n8n-nodes-base.*`
- make GraphRAG tests use the same canonical node identity rules as the runtime and fail honestly when required backends are unsupported

## 135. The Custom n8n MCP Node and Client Utilities Still Default to the Older HTTP MCP Contract

The custom n8n-node integration layer is still teaching consumers to connect to the older HTTP JSON-RPC MCP surface by default.

Confirmed problems:

- [src/n8n/MCPApi.credentials.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/n8n/MCPApi.credentials.ts) defaults `serverUrl` to `http://localhost:3000/mcp` and defaults `connectionType` to `http`, which is not the same supported path as the currently audited unified stdio runtime.
- [src/n8n/MCPNode.node.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/n8n/MCPNode.node.ts) builds its behavior around [src/utils/mcp-client.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/mcp-client.ts), whose HTTP mode assumes raw JSON-RPC POSTs to the configured URL and whose stdio mode treats `serverUrl` as a shell command string.
- [src/utils/bridge.ts](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/src/utils/bridge.ts) emits resource URIs like `execution://{id}`, while the broader docs/tests surface heavily documents `n8n://...` resource schemes, which is another concrete contract split.

Remediation:

- align the n8n credential defaults and connection guidance to the currently supported MCP server entrypoint
- separate real stdio-client configuration from HTTP endpoint configuration instead of overloading one `serverUrl` field
- standardize the resource URI scheme across source, tests, docs, and the custom n8n node before treating the integration layer as stable

## 136. The Standalone Root Test Scripts Still Target an Older Extraction-and-Documentation Product Built Around dist/mcp/server

There is a substantial layer of root-level test/demo scripts that belong to an older node-extraction and enhanced-documentation product narrative rather than the current supported MCP runtime.

Confirmed problems:

- [tests/comprehensive-extraction-test.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/comprehensive-extraction-test.js) requires [dist/mcp/server](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/mcp/server) and [dist/utils/node-source-extractor](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/utils/node-source-extractor), and frames the server around `list_available_nodes` and `get_node_source_code`.
- [tests/test-enhanced-integration.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test-enhanced-integration.js), [tests/test-mcp-tools-integration.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test-mcp-tools-integration.js), and [tests/test-small-rebuild.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test-small-rebuild.js) all continue that same extraction/documentation/database-storage story against built `dist` artifacts and older tool names.
- [tests/test-github-auto-update.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/tests/test-github-auto-update.sh) still documents a live GitHub-driven node-update system that downloads, caches, and updates the database automatically, even though the wider audit found the corresponding runtime components incomplete or missing.

Remediation:

- split extraction/documentation experiments into a clearly archived or experimental area instead of leaving them in the active root test surface
- stop treating `dist`-artifact demo scripts as authoritative tests for the current MCP server
- define which of these subsystems are still intended products, and either restore them properly or archive their scripts and docs together

## 137. The Benchmark and Installer Scripts Still Package a Larger GraphRAG Product With Missing Builder Scripts and Obsolete Commands

The install/benchmark layer continues to define a product boundary that is broader and older than the current supported MCP runtime.

Confirmed problems:

- [scripts/benchmark.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/benchmark.js) benchmarks [dist/services/node-documentation-service.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/services/node-documentation-service.js) and [dist/mcp-engine.js](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/mcp-engine.js), and still frames the tool surface around `n8n_system` and `n8n_workflow`.
- [scripts/build-and-start.ps1](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/build-and-start.ps1) still centers the product on `dist/main.js` with a `ts-node` fallback, which is part of the broader entrypoint split already found elsewhere in the repo.
- [scripts/install-linux.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/install-linux.sh), [scripts/install-macos.sh](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/install-macos.sh), and [scripts/post-install.ps1](/c:/Users/Chris%20Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/scripts/post-install.ps1) all provision a GraphRAG-heavy packaged install with auto-update, cron/launchd, and Python graph building, but they still reference `scripts/n8n_discovery.py` and `scripts/initial_graph_builder.py`, which are missing.
- The installers also still advertise commands like `npm run metrics:snapshot` and documentation URLs like `https://github.com/n8n-io/n8n-mcp`, which need to be reconciled with the current repo identity and actual script surface.

Remediation:

- rebuild the installer and benchmark scripts from the current supported runtime only
- stop packaging missing graph-builder/update components as part of the install story
- validate every installer command, service file, entrypoint, and referenced script against the current repository during release preparation

## 138. The Remaining Validation and Demo Scripts Still Simulate Success or Point at Missing Server Surfaces

Several of the remaining top-level scripts still present themselves as authoritative validation, but they either call missing modules, assume legacy tool contracts, or declare success after simulated behavior.

Confirmed problems:

- [scripts/test-essentials.ts](scripts/test-essentials.ts) imports [src/mcp/server](src/mcp/server), which is not present in the current source tree, and tests `get_node_essentials` / `search_node_properties` against that historical server contract.
- [scripts/quick-test.ts](scripts/quick-test.ts) starts `npm start`, assumes newline-delimited JSON-RPC over stdio, and parses responses by searching for `\"jsonrpc\"` lines rather than using the actual current wrapper/client path.
- [scripts/test-complete-mcp-workflow.ts](scripts/test-complete-mcp-workflow.ts), [scripts/test-mcp-external-client.ts](scripts/test-mcp-external-client.ts), and [scripts/debug-workflow-generation.ts](scripts/debug-workflow-generation.ts) all test [LocalLLMOrchestrator](src/ai/local-llm-orchestrator.ts) directly instead of the live unified MCP server, yet they still narrate the results as MCP-server verification.
- [scripts/test-v3-implementation.ts](scripts/test-v3-implementation.ts) and [scripts/test-v3-runtime.js](scripts/test-v3-runtime.js) assume the presence of [src/mcp/handlers-v3-tools](src/mcp/handlers-v3-tools.ts), [dist/mcp/handlers-v3-tools](dist/mcp/handlers-v3-tools.js), and [dist/mcp/tools-consolidated](dist/mcp/tools-consolidated.js), which do not match the current audited runtime surface.

Remediation:

- classify these files explicitly as historical diagnostics, experimental scripts, or current smoke tests
- remove "server validated" / "production-ready" claims from scripts that do not drive the real unified MCP runtime
- build a single supported smoke-test path around the current stdio wrapper and live tool list

## 139. The Deploy and Shell-Test Scripts Still Define Three Different Products

The shell deployment/test layer still encodes incompatible product boundaries: a local private HTTP server, a remote `n8n-documentation` HTTP deployment, and a Dockerized stdio/HTTP MCP package.

Confirmed problems:

- [scripts/deploy-http.sh](scripts/deploy-http.sh) assumes the supported product is a single-user HTTP server with `AUTH_TOKEN` and `npm run start:http`.
- [scripts/deploy-to-vm.sh](scripts/deploy-to-vm.sh) still brands the service as `n8n Documentation MCP Server`, deploys `dist/index-http.js`, and generates Claude Desktop config around the remote HTTP client package.
- [scripts/test-http.sh](scripts/test-http.sh), [scripts/test-single-session.sh](scripts/test-single-session.sh), and [scripts/test-docker.sh](scripts/test-docker.sh) all test the HTTP JSON-RPC path, but the live audit has already shown that HTTP mode is not the same product surface as the current unified stdio runtime.
- [scripts/test-single-session.sh](scripts/test-single-session.sh) starts the server with `npm start > server.log 2>&1`, which hides stdout/stderr framing problems instead of treating stdout cleanliness as part of MCP correctness.

Remediation:

- choose one supported deployment story for the MCP server and mark the others deprecated or experimental
- stop treating the single-session HTTP server as interchangeable with the unified stdio runtime
- require all deployment and smoke-test scripts to target the same entrypoint and tool contract

## 140. The Build and Install Scripts Still Depend on Fallbacks, Placeholder Generation, and Prebuilt Data Artifacts

The build/install surface still assumes a looser, more recoverable product than the runtime audit supports.

Confirmed problems:

- [scripts/build-esbuild.js](scripts/build-esbuild.js) compiles every TypeScript file separately with esbuild, excludes parts of the tree that import `n8n` packages, and frames that as a valid runtime build strategy even though it further fragments the supported surface.
- [scripts/build-optimized.sh](scripts/build-optimized.sh) treats `data/nodes.db` as a required prebuilt artifact and assumes Docker packaging can safely omit the heavy dependencies because the database is already authoritative.
- [scripts/postinstall.js](scripts/postinstall.js) silently treats a failed build as acceptable and declares that `ts-node` will be used at runtime, which conflicts with the need for deterministic packaged behavior.
- [scripts/fix-n8n-install.js](scripts/fix-n8n-install.js) performs a full local reinstall and backs up `.env`, but it is a workstation repair script mixed into the main repo surface rather than a controlled maintenance tool.
- [scripts/sync-runtime-version.js](scripts/sync-runtime-version.js) preserves the split between `package.json` and `package.runtime.json`, which is part of the broader multi-product packaging drift.

Remediation:

- collapse to one supported build pipeline for release artifacts
- stop relying on `ts-node` fallback behavior in install-time scripts
- treat `nodes.db` as a derived cache, not a hidden runtime contract that packaging silently depends on
- reduce version/package duplication instead of scripting around it

## 141. The Graph Population Scripts Still Use Legacy Entry Points, Session Auth, and Direct Database Mutation

The GraphRAG bootstrap path remains one of the clearest examples of parallel truth sources and unsupported runtime assumptions.

Confirmed problems:

- [scripts/populate-graphrag.js](scripts/populate-graphrag.js) starts `dist/main.js`, not the current unified stdio wrapper, disables auto-sync manually, and then calls legacy tools such as `n8n_status`, `n8n_list_ai_nodes`, `n8n_list_trigger_nodes`, and `n8n_search_nodes`.
- The same script loads environment variables with `dotenv.config({ override: true })`, prints live auth configuration details, and populates the Python backend through a custom JSON-RPC bridge separate from the audited TypeScript MCP flow.
- [scripts/populate-graphrag-direct.js](scripts/populate-graphrag-direct.js) bypasses the server entirely, logs in to n8n via `/rest/login`, fetches `/types/nodes.json`, and writes directly into `graph.db` using its own schema and category-edge logic.
- [scripts/verify-graphrag.js](scripts/verify-graphrag.js) treats that direct SQLite representation as authoritative and verifies specific node IDs and category edges against it.

Remediation:

- define one supported graph-ingestion path and archive the others
- stop mixing API-key MCP access, browser-session auth, and direct SQLite writes as interchangeable population strategies
- make GraphRAG ingestion consume the same canonical live-node source and node identity rules as the runtime

## 142. The Remaining Data-Collection and One-Off Analysis Scripts Still Generate Non-Canonical Catalogs

Several current scripts are still building their own node indexes, search reports, or generated registries outside the main runtime authority.

Confirmed problems:

- [scripts/collect-node-data.cjs](scripts/collect-node-data.cjs) claims to collect from documentation, GitHub, and live n8n, but the latter two collection steps are placeholders and the generated registry is largely inferred/manual data.
- That same script writes [src/data/auto-generated-registry.ts](src/data/auto-generated-registry.ts) from guessed categories, guessed credential mappings, and placeholder resources, which creates another catalog source beside `nodes.db`, the node repository, and GraphRAG.
- [scripts/search-microsoft-nodes.ts](scripts/search-microsoft-nodes.ts) uses [NodeDocumentationService](src/services/node-documentation-service.ts) as its authority even though that service has already been identified as maintaining a separate documentation database and parser stack.
- [scripts/analyze-teams-workflow.ts](scripts/analyze-teams-workflow.ts) is a useful one-off operational script, but it reads directly from the live n8n API and writes ad hoc workflow JSON snapshots into the repo root rather than fitting into a stable diagnostics framework.

Remediation:

- stop generating new node registries from placeholder data
- require all search/report scripts to state which canonical source they are using
- move one-off business-analysis scripts into an explicitly operational or archived area so they do not read like core product tooling

## 143. The Auto-Update and Desktop Registration Scripts Still Target a Beta GraphRAG Packaging Model

The operational Windows scripts still assume an install layout and background-update model that do not align cleanly with the current repo/runtime audit.

Confirmed problems:

- [scripts/register-claude.ps1](scripts/register-claude.ps1) still registers `n8n-graphrag`, points Claude Desktop at `dist\\mcp\\index.js`, and configures `GRAPH_DIR`, which reflects a beta GraphRAG packaging story rather than the currently audited unified stdio wrapper.
- [scripts/setup-auto-update-task.ps1](scripts/setup-auto-update-task.ps1) expects a packaged `runtime\\python\\python.exe` and `scripts\\auto_updater.py`, and creates a scheduled task around automatic GraphRAG/database refresh behavior that is not part of the current verified runtime.
- Both scripts present their behavior as standard operational setup, even though the audited product surface is still split across entrypoints, caches, and update mechanisms.

Remediation:

- freeze or archive desktop-registration and auto-update scripts until the packaged product boundary is stable
- align any supported registration script to the exact released entrypoint and environment variables
- remove assumptions about packaged Python/update infrastructure unless those assets are actually part of the supported build

## 144. The Remaining Test Assets Still Include Sensitive and Manual-Debug Patterns That Should Not Be Treated as Normal QA

There are still current test assets that encourage manual secret handling or browser-debug workflows instead of reproducible automated validation.

Confirmed problems:

- [tests/test-ui-rendering.html](tests/test-ui-rendering.html) asks the operator to paste an n8n API key into the browser and stores it in `localStorage`, which is not an acceptable long-term validation pattern.
- [tests/error-handler.test.ts](tests/error-handler.test.ts) imports [src/utils/error-handler](src/utils/error-handler.ts), which is missing, so even the root-level error test surface is partly targeting removed files.
- [tests/test-sqlite-search.js](tests/test-sqlite-search.js) and [tests/test-slack-node-complete.js](tests/test-slack-node-complete.js) further reinforce the extracted-documentation/database-storage subsystem as a primary product surface by writing/reading test databases directly from `dist` services.

Remediation:

- move manual browser-debug helpers and secret-paste assets out of the active automated test surface
- remove or repair tests that target missing modules before counting them as part of project coverage
- keep documentation/extraction verification separate from the supported MCP runtime smoke tests

## 145. The Current Rebuild Scripts Still Recreate Multiple Different Databases Through Different Parsing Stacks

The active `scripts/build/*` layer still rebuilds the project's data authority through several distinct code paths with different schemas and fallback behavior.

Confirmed problems:

- [scripts/build/rebuild.ts](scripts/build/rebuild.ts) clears `data/nodes.db`, parses nodes through [src/parsers/node-parser.ts](src/parsers/node-parser.ts), fetches docs through [src/mappers/docs-mapper.ts](src/mappers/docs-mapper.ts), and can fall back to Docker extraction that creates mock node classes when real imports fail.
- That same rebuild path still validates "critical nodes" against the `n8n-nodes-base.*` convention and treats missing properties on those nodes as the main correctness signal, which is narrower than the full live node surface.
- [scripts/build/rebuild-database.ts](scripts/build/rebuild-database.ts) rebuilds the separate enhanced-documentation database through [NodeDocumentationService](src/services/node-documentation-service.ts), which the broader audit has already identified as another non-canonical authority.
- [scripts/build/rebuild-optimized.ts](scripts/build/rebuild-optimized.ts) writes an optimized schema with embedded source code and credential code into `nodes.db`, which is yet another storage contract different from the base rebuild path.

Remediation:

- choose one canonical rebuild path and one canonical schema for `nodes.db`
- remove mock-node fallbacks from rebuild flows that are supposed to define runtime truth
- separate experimental "optimized source embedding" builds from the supported runtime database

## 146. The Current Debug and Validation Scripts Still Codify Old Node IDs, Dead Endpoints, and GraphRAG-Only Paths

The active `scripts/debug/*` layer is still useful as audit evidence, but it also shows more contract drift that should not be mistaken for a reliable diagnostics suite.

Confirmed problems:

- [scripts/debug/validate.ts](scripts/debug/validate.ts) still validates critical nodes using `nodes-base.*` IDs and expects `nodes-langchain.agent` to be present with a specific package mapping, continuing the node-identity inconsistency already seen elsewhere.
- [scripts/debug/validation-summary.ts](scripts/debug/validation-summary.ts) computes success metrics over template validation but still interprets Sticky Note failures and unknown-node counts through the same older validator stack.
- [scripts/debug/list-node-types.ts](scripts/debug/list-node-types.ts) probes a raw `/node-types` endpoint with ad hoc axios instead of going through the actual supported client/runtime contract.
- [scripts/debug/consult-graph-rag.ts](scripts/debug/consult-graph-rag.ts) starts `dist/mcp/index.js` directly and treats `execute_agent_pipeline` output as a GraphRAG consultation path, which is another example of GraphRAG-specific tooling being mixed into the active repo surface.
- [scripts/debug/trigger-graph-learning.ts](scripts/debug/trigger-graph-learning.ts) feeds hardcoded "successful" workflow feedback into [GraphRAGLearningService](src/services/graphrag-learning-service.ts), which makes it more of a scripted demo than a trustworthy learning-system test.
- [scripts/debug/check-sse.js](scripts/debug/check-sse.js) and [scripts/debug/inspect-sse.js](scripts/debug/inspect-sse.js) are effectively package-presence probes for the MCP SDK transport rather than meaningful runtime tests.

Remediation:

- collapse debug validation around the current supported client/runtime path
- stop hardcoding outdated node IDs or endpoint guesses inside active debug utilities
- move GraphRAG learning/consultation demos into a clearly experimental or archived area

## 147. The Service and Reverse-Proxy Configs Still Publish the Historical HTTP Documentation Server

The operational Linux deployment files still describe the product as a remote HTTP documentation MCP service rather than the unified runtime currently under audit.

Confirmed problems:

- [scripts/n8n-docs-mcp.service](scripts/n8n-docs-mcp.service) runs `node /opt/n8n-mcp/dist/index-http.js` and labels the service `n8n Documentation MCP Server`.
- [scripts/nginx-n8n-mcp.conf](scripts/nginx-n8n-mcp.conf) is pinned to `n8ndocumentation.aiservices.pl` and proxies `/mcp` to `localhost:3000` with rate limiting and HTTP upgrade assumptions tailored to that remote HTTP deployment.
- Those files reinforce the same product story as [scripts/deploy-to-vm.sh](scripts/deploy-to-vm.sh), which is not the same validated surface as the live unified stdio runtime.

Remediation:

- decide whether the remote documentation HTTP deployment is still a supported product
- if not, archive these service/proxy files together with the rest of that HTTP deployment story
- if yes, maintain a separate explicit product boundary and test matrix for it instead of conflating it with the unified stdio MCP server

## 148. The Current Installer, Quick-Start, and Uninstall Scripts Still Package a Beta GraphRAG Distribution

The Windows operational scripts continue to reveal a packaged GraphRAG-heavy product boundary that does not line up with the current audited repo/runtime state.

Confirmed problems:

- [scripts/quick-start.ps1](scripts/quick-start.ps1) still tells users to start the server directly with `npx ts-node --transpile-only src/main.ts`, which again normalizes `ts-node` fallback as a supported operational path.
- [scripts/post-install.ps1](scripts/post-install.ps1) expects a packaged Node runtime, packaged Python runtime, `dist\\mcp\\index.js`, and missing scripts such as `scripts\\n8n_discovery.py` and `scripts\\initial_graph_builder.py`.
- [scripts/pre-uninstall.ps1](scripts/pre-uninstall.ps1) preserves GraphRAG caches, refers to `n8n-graphrag` Claude Desktop entries, and still points users to the historical GitHub identity and GraphRAG installation docs.

Remediation:

- stop shipping operational scripts that depend on missing packaged assets
- remove `ts-node`-first startup from the supported install/start story
- align install, quick-start, register, and uninstall tooling to one released product boundary

## 149. The Cleanup Scripts Are Managing Documentation and Artifact Sprawl Instead of Reducing the Underlying Causes

The repo contains dedicated cleanup/archival scripts because the root has repeatedly accumulated large amounts of transient docs, reports, experiments, and workflow artifacts.

Confirmed problems:

- [scripts/cleanup-project.ps1](scripts/cleanup-project.ps1) and [scripts/cleanup-root.ps1](scripts/cleanup-root.ps1) are built around moving large sets of reports, plans, diagnostics, workflows, logs, and session notes into archive folders after they accumulate in the root.
- The patterns in those scripts confirm that the sprawl is structural, not incidental: session docs, GraphRAG docs, Outlook/Teams docs, phase docs, debug logs, workflow JSON experiments, and miscellaneous patches/logs are all expected categories of root clutter.
- Maintaining those cleanup scripts is useful operationally, but it is also a strong signal that the repo needs clearer boundaries for generated artifacts, operational notes, archived research, and active product documentation.

Remediation:

- formalize where generated reports, one-off workflow JSON, and temporary diagnostics belong before they land in the root
- keep archive management, if retained, as a secondary hygiene tool rather than the primary answer to repo sprawl
- reduce the number of active product narratives so fewer transient docs are produced in the first place

## 150. The Checked-In Node Storage Export Is Another Large Generated Truth Source

The current test tree includes a large checked-in export of extracted node source/code metadata that acts like a frozen truth snapshot.

Confirmed problems:

- [tests/node-storage-export.json](tests/node-storage-export.json) contains extracted node source code, package metadata, file paths, and export-time statistics from June 7, 2025.
- That file further reinforces the "store extracted source and package truth in repo artifacts" pattern already seen in `nodes.db`, GraphRAG stores, and optimized rebuild outputs.
- Because it is a static export, it will drift from the live runtime, installed node versions, and current rebuild logic unless it is continuously regenerated and validated.

Remediation:

- decide whether checked-in node exports are truly required for the supported product
- if they are test fixtures, keep them minimal and scoped
- if they are historical artifacts, archive them with the rest of the extraction/documentation product layer instead of leaving them in the active test surface

## 151. The Windows Maintenance Launchers Still Encode Multiple Historical Entrypoints and Repo Paths

The current `scripts/maintenance/*` launcher wrappers are another concrete source of runtime confusion.

Confirmed problems:

- [scripts/maintenance/Start-HTTP-Server.bat](scripts/maintenance/Start-HTTP-Server.bat) still brands the product as `n8n Co-Pilot MCP Server` and launches `node start.js --http`, reinforcing the older HTTP product identity.
- [scripts/maintenance/Start-MCP-Server.bat](scripts/maintenance/Start-MCP-Server.bat) launches `node start.js %*`, which again routes through the broad smart-launcher surface rather than one explicitly supported entrypoint.
- [scripts/maintenance/start-n8n-mcp-server.bat](scripts/maintenance/start-n8n-mcp-server.bat) and [scripts/maintenance/start-n8n-server.ps1](scripts/maintenance/start-n8n-server.ps1) still hardcode `C:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\n8n-mcp-server`, which is a different repo path than the current workspace.
- [scripts/maintenance/stop-n8n-server.ps1](scripts/maintenance/stop-n8n-server.ps1) kills all `node` processes indiscriminately instead of targeting the actual server process.

Remediation:

- remove or archive launcher wrappers that still point to old repo locations or old product names
- provide one supported Windows launcher per supported runtime mode
- make stop scripts process-specific instead of killing all `node` processes on the machine

## 152. The Remaining Root Extraction Tests Still Model a Database-Storage Product Around dist Utilities

The remaining top-level extraction tests continue to define the project as a source-code extraction and database-ingestion system around built `dist` utilities.

Confirmed problems:

- [tests/test-database-extraction.js](tests/test-database-extraction.js) defines a PostgreSQL-like schema, extracts a hardcoded set of nodes through [dist/utils/node-source-extractor](dist/utils/node-source-extractor.js), and emits SQL/import artifacts as though that were a primary supported product.
- [tests/test-direct-extraction.js](tests/test-direct-extraction.js) probes hardcoded Docker/node-module paths and a specific `@n8n/n8n-nodes-langchain.Agent` file layout, which makes it a one-off environment diagnostic rather than a robust project test.
- [tests/test-enhanced-documentation.js](tests/test-enhanced-documentation.js), [tests/test-node-documentation-service.js](tests/test-node-documentation-service.js), [tests/test-storage-system.js](tests/test-storage-system.js), and [tests/test-small-rebuild.js](tests/test-small-rebuild.js) all revolve around [NodeDocumentationService](src/services/node-documentation-service.ts), [EnhancedSQLiteStorageService](dist/services/enhanced-sqlite-storage-service.js), or [NodeStorageService](dist/services/node-storage-service.js), not the live unified MCP runtime.
- [tests/debug-slack-doc.js](tests/debug-slack-doc.js) is another direct probe into the local `temp/n8n-docs` checkout structure, which keeps the docs mirror behaving like a required live subsystem.

Remediation:

- clearly separate source-extraction/storage/doc parsing experiments from supported MCP validation
- stop leaving `dist`-backed extraction demos in the active top-level test surface
- archive hardcoded-environment diagnostics once their findings are incorporated into real tooling

## 153. The Remaining Maintenance Diagnostics Still Present Smart-Launcher Checks As a Product Surface

Some of the remaining maintenance wrappers still encourage operating the server through broad "smart launcher" paths rather than one declared entrypoint.

Confirmed problems:

- [scripts/maintenance/Check-Configuration.bat](scripts/maintenance/Check-Configuration.bat) runs `node start.js --check`, which continues to rely on the broad launcher abstraction instead of a single supported runtime contract.
- [scripts/maintenance/stop-n8n-mcp-server.bat](scripts/maintenance/stop-n8n-mcp-server.bat) hardcodes the old `C:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\n8n-mcp-server` location and then kills `node.exe` at the OS level.
- [scripts/maintenance/STOP-N8N-SERVER.bat](scripts/maintenance/STOP-N8N-SERVER.bat) simply wraps the already over-broad [scripts/maintenance/stop-n8n-server.ps1](scripts/maintenance/stop-n8n-server.ps1) kill-all-Node behavior.

Remediation:

- retire launch/check wrappers that still depend on the older smart-launcher model unless that launcher is explicitly the supported entrypoint
- eliminate hardcoded workstation paths from maintenance scripts
- replace kill-all-Node shutdown behavior with PID-aware or service-aware process control

## 154. The Checked-In Docker Auto-Update Test Still Assumes a "Bulletproof" Container Product That Is Not the Audited Runtime

There is still an active root test asserting a simple auto-update Docker deployment story that does not match the current audited MCP server reality.

Confirmed problems:

- [tests/test-docker-simple-auto.sh](tests/test-docker-simple-auto.sh) builds and starts `docker-compose.simple-auto.yml`, checks for log phrases like `Server initialized successfully`, and declares `bulletproof reliability` if the container comes up.
- Its "MCP communication" check does not actually talk to the running MCP server inside the container; it launches a separate `node -e` process inside the container and checks whether that process can parse JSON input.
- The script therefore verifies container startup and log text more than it verifies real MCP protocol handling.

Remediation:

- replace container smoke tests with real MCP client calls against the actual running server process
- remove reliability claims that are based on container startup heuristics instead of end-to-end tool execution

## 155. The Current Test Setup and Typing Helpers Are Mildly Useful but Still Another Layer Masking Real Test Drift

The remaining generic test setup files are not harmful by themselves, but they further show how much effort has gone into preserving test ergonomics around a drifting test tree rather than stabilizing the real implementation surface.

Confirmed problems:

- [tests/test-setup.ts](tests/test-setup.ts) and [tests/jest-globals.d.ts](tests/jest-globals.d.ts) provide broad environment resets and custom Jest typings, which help the test suite compile but do not address the large number of missing-module, toy-helper, and legacy-contract tests already identified.
- This is another example of support scaffolding being kept current while a significant portion of the actual tests target removed modules or historical product shapes.

Remediation:

- keep generic test setup only after the test tree has been reduced to real implementation coverage
- prioritize fixing or removing stale tests over expanding compatibility scaffolding for them

## 156. The Dockerfiles and Entrypoints Still Publish Different Runtime Contracts and Some Still Pollute stdout

The current container story still exposes multiple incompatible server products instead of one clean MCP runtime.

Confirmed problems:

- [Dockerfile](Dockerfile) brands the image as `n8n Co-Pilot MCP Server`, builds `dist/main.js`, copies web assets, and defaults to `CMD ["node", "dist/main.js"]`, which is the older broad launcher/runtime path.
- [Dockerfile.simple](Dockerfile.simple) instead defaults to `MCP_MODE=http` and starts `dist/mcp/index.js`, which is a different runtime surface again.
- [docker/simple-entrypoint.sh](docker/simple-entrypoint.sh) prints setup/status lines to stdout before launching `dist/mcp/index.js`, which is unacceptable if that entrypoint is ever used for stdio MCP transport.
- [docker/entrypoint-auto-rebuild.sh](docker/entrypoint-auto-rebuild.sh) also prints banners and rebuild status to stdout before `exec node /app/dist/mcp/index.js`, mixing container UX with MCP framing requirements.
- [docker/docker-entrypoint.sh](docker/docker-entrypoint.sh) is more disciplined, but it still supports multiple fallback binaries and rebuild paths, including `dist/mcp/index.js`, `dist/scripts/rebuild.js`, and DB bootstrap assumptions around `/app/data/nodes.db`.

Remediation:

- publish one canonical container runtime per supported mode and retire the others
- ensure any stdio-capable entrypoint writes operational logs to stderr, not stdout
- remove fallback launch logic that silently converts one product surface into another

## 157. The Compose Files Still Describe At Least Five Different Products Instead of One Supported Deployment

The repo's compose layer is still a map of historical deployment experiments rather than a coherent packaging story.

Confirmed problems:

- [docker-compose.yml](docker-compose.yml) defines a large `n8n Co-Pilot` stack with n8n, MCP HTTP, Ollama, and Open WebUI.
- [docker-compose.simple.yml](docker-compose.simple.yml) defines a separate "simple" stack with `MCP_MODE=full`, host Ollama assumptions, and `USE_FIXED_HTTP=true`.
- [docker-compose.desktop.yml](docker-compose.desktop.yml) is a Docker Desktop setup-wizard product that points at a GHCR image and a browser-first startup story.
- [docker-compose.extract.yml](docker-compose.extract.yml) is an extraction/rebuild side product around `node dist/scripts/rebuild.js`.
- [docker-compose.open-webui.yml](docker-compose.open-webui.yml) is another side deployment centered on Open WebUI integration.
- [docker-compose.override.yml.example](docker-compose.override.yml.example) assumes mounted `src/` and `scripts/` development behavior that does not line up with a clean packaged runtime.

Remediation:

- define one supported compose topology for the released MCP server
- move extraction, Open WebUI, and experimental desktop/bootstrap stacks into explicit examples or archive locations
- stop presenting all compose variants as equally supported runtime surfaces

## 158. The Root Launchers and Setup Wizard Still Route Users Into the Historical Co-Pilot Product

The root operational surface continues to steer users into the older smart-launcher and setup-wizard model rather than the audited unified runtime.

Confirmed problems:

- [start.js](start.js) is still a broad smart launcher that normalizes `ts-node` fallback, setup modes, Kapa setup, HTTP mode, and branded startup banners for `n8n Co-Pilot MCP Server`.
- [setup.js](setup.js) still expects missing commands such as `npm run rebuild:local`, configures Claude Desktop against nonexistent `dist/consolidated-server.js`, and treats Docker, HTTP, and Desktop registration as one setup wizard.
- [start.sh](start.sh) and [start.bat](start.bat) still route users into the Docker Desktop/browser setup story instead of a single supported MCP runtime contract.
- [list-workflows.js](list-workflows.js) and [review-workflows.js](review-workflows.js) reinforce the root-script pattern where operational behavior is spread across ad hoc JS helpers rather than one supported CLI/tool surface.

Remediation:

- replace the smart-launcher/setup-wizard approach with one documented entrypoint per supported runtime
- remove references to missing packaged binaries and missing npm scripts
- keep workflow review/list helpers only if they are aligned with the live unified MCP contract

## 159. The Root MCP Verification Helpers Still Exercise Legacy Tools and Expose a Checked-In Secret

The active root verification scripts remain one of the clearest examples of public drift between the repo and the current runtime.

Confirmed problems:

- [review-workflows.js](review-workflows.js), [test-all-tools.js](test-all-tools.js), [test-node-discovery.js](test-node-discovery.js), and [verify-stdio.js](verify-stdio.js) still spawn `dist/main.js` rather than the audited `dist/mcp/stdio-wrapper.js`.
- Those scripts still call historical tool names such as `n8n_search_nodes`, `n8n_create_workflow`, and other legacy `n8n_*` contracts that do not represent the current unified server surface.
- [test-session-auth.js](test-session-auth.js) still validates the old session-auth path against `/rest/login` and `/types/nodes.json`, which reinforces the degraded catalog path as though it were a first-class capability.
- [verify-stdio.js](verify-stdio.js) contains a hardcoded JWT-like `N8N_API_KEY` ending in `Rw7Q`, which is both a checked-in secret exposure and a stale credential.

Remediation:

- replace all root MCP smoke scripts with tests that target the real current stdio wrapper and current tool names
- remove checked-in secrets from verification helpers immediately
- treat session-auth probing as a fallback diagnostic only, not part of the primary validation story

## 160. The Example Config Files Still Teach the Old EntryPoint, Old Modes, and Old Product Name

The checked-in example configs still direct users and clients toward outdated runtime assumptions.

Confirmed problems:

- [.mcp.json](.mcp.json) still points clients at `dist/main.js`, not the unified stdio wrapper that the live audit used.
- [claude-desktop-config-example.json](claude-desktop-config-example.json) still registers the server as `n8n-copilot` and launches `start.js`, inheriting the smart-launcher drift.
- [.env.nano.example](.env.nano.example) still documents `MCP_MODE=consolidated` and a dual-service nano/vLLM deployment story that does not match the current unified runtime.
- [.env.example](.env.example) still frames session-auth discovery through `/types/nodes.json` as part of the main configuration story.
- [package.runtime.json](package.runtime.json) introduces another runtime identity around `dist/index.js`.
- [smithery.yaml](smithery.yaml) still points to nonexistent `build/index.js`.

Remediation:

- rewrite all example configs around the actual supported entrypoint and actual supported modes
- remove config examples for deleted runtimes and missing binaries
- keep only one registration story per client type

## 161. The Root SQL Files Still Describe an Unrelated AI Outlook Email Assistant Product

The root SQL/bootstrap files are not just stale; they describe a completely different application domain than the MCP server.

Confirmed problems:

- [database-schema.sql](database-schema.sql) and [database-setup.sql](database-setup.sql) define an `AI Outlook Email Assistant` schema with tables such as `emails`, `conversation_history`, `draft_responses`, `email_templates`, and vector-search email analytics.
- Those root SQL files assume PostgreSQL/pgvector features such as `JSONB`, `VECTOR(1536)`, `TIMESTAMPTZ`, triggers, and PL/pgSQL functions.
- The actual MCP server data layer uses SQLite-style schemas under [src/database/schema.sql](src/database/schema.sql) and [src/database/schema-optimized.sql](src/database/schema-optimized.sql) for node catalogs, template storage, metadata, browser credential/session storage, and FTS.
- Keeping both schema families at the root/current source boundary makes it much harder to identify what database model actually belongs to the supported MCP product.

Remediation:

- remove or archive the Outlook/email-assistant SQL files from the active MCP server root unless they are explicitly part of a separate supported package
- keep only the authoritative MCP server schema(s) in the active runtime/config surface
- separate domain examples from product schemas so maintainers do not mistake them for active infrastructure

## 162. The Static Research, Cheatsheet, and OpenAPI Files Are Another Unscoped Knowledge Surface

The root also contains large static knowledge artifacts that can easily be mistaken for authoritative live behavior.

Confirmed problems:

- [n8n-openapi.yml](n8n-openapi.yml) is a checked-in snapshot of the n8n Public API (`version: 1.1.1`), but the audited product needs to work against the live instance and its actual enabled capabilities.
- [n8n-cheatsheet-clean.txt](n8n-cheatsheet-clean.txt) and [n8n-cheatsheet-extracted.txt](n8n-cheatsheet-extracted.txt) are OCR/extraction-style knowledge dumps from a third-party "17 Nodes" guide, including decoding artifacts and very broad workflow advice.
- [n8n-research.md](n8n-research.md) is a large manually compiled research document with product stats, platform claims, and external-market framing that can drift quickly.
- None of these root artifacts appear to be governed as versioned, live-synced truth sources, but they are large enough to bias humans or future agent retrieval toward stale or overly broad guidance.

Remediation:

- keep static research assets out of the default active runtime/documentation path unless they are actively maintained
- prefer live capability discovery and live API validation over checked-in static OpenAPI or research snapshots
- if retained, mark these files clearly as auxiliary research rather than active product truth

## 163. The Fleet and Reference Workflow Assets Still Train Users Toward Code-Heavy Agent Designs

The checked-in workflow corpus is valuable, but it is currently reinforcing the exact behavior the MCP remediation is trying to move away from.

Confirmed problems:

- [fleet-workflow.json](fleet-workflow.json), [fleet-workflow-v2.json](fleet-workflow-v2.json), [fleet-workflow-v3.json](fleet-workflow-v3.json), and [fleet-workflow-v3.1.json](fleet-workflow-v3.1.json) all represent progressively richer business workflows, but they still rely heavily on `n8n-nodes-base.code` and `@n8n/n8n-nodes-langchain.toolCode`.
- In [fleet-workflow-v3.1.json](fleet-workflow-v3.1.json), the workflow has 39 nodes, including 5 regular `code` nodes and 5 `toolCode` nodes. The notes explicitly market the workflow as `Agent Tools (13)` while only 3 of those tools are built-in deterministic tools (`Think`, `Calculator`, `Google Sheets`).
- [fleet-workflow-v3.json](fleet-workflow-v3.json) and earlier fleet variants also still contain mojibake in sticky notes and prompt text (`â€”`, `â€¢`), which weakens them as clean reference assets.
- The broader checked-in reference corpus under [reference_workflows](reference_workflows) follows the same mixed pattern: some workflows use modular `toolWorkflow` composition well, but others still rely on code-heavy tools, large credential footprints, or promotional/setup-note content.
- [reference_workflows/Ultimate Media Agent Army/Ultimate Media Agent.json](reference_workflows/Ultimate%20Media%20Agent%20Army/Ultimate%20Media%20Agent.json) is a concrete example of a large orchestration asset with 66 nodes, 8 `toolWorkflow` nodes, 2 `code` nodes, 42 credentialed nodes, and embedded setup/promo content.
- [reference_workflows/Ultimate Media Agent Army/Image to Video Tool.json](reference_workflows/Ultimate%20Media%20Agent%20Army/Image%20to%20Video%20Tool.json) is difficult to consume with standard JSON tooling because of duplicate keys that differ only by case (`Download file` vs `Download File` in the parsed object graph).

Remediation:

- curate a small supported example set that demonstrates the desired built-in-first, toolWorkflow-first generation style
- move promotional or creator-specific workflow packs out of the active reference surface
- treat code-heavy legacy examples as historical artifacts, not preferred design exemplars

## 164. The Installer Still Packages a Beta GraphRAG Product With Bundled Runtimes and Missing Assets

The Windows installer surface is still describing a large packaged beta product that does not line up with the current audited MCP server.

Confirmed problems:

- [installer/n8n-mcp-installer.iss](installer/n8n-mcp-installer.iss) is still versioned as `3.0.0-beta` and packages bundled Node, bundled embedded Python, `node_modules`, `dist`, `src`, GraphRAG backend files, and optional 2.6 GB model payloads.
- The installer still assumes missing or uncertain assets such as `installer\\setup.ico`, `installer\\task.xml`, `scripts\\setup-auto-update-task.ps1`, and `scripts\\setup-service.ps1`.
- It still exposes install-time choices for `GraphRAG Backend (LightRAG)` and model downloads, which reinforces the historical "beta GraphRAG bundle" product boundary rather than a focused MCP runtime.
- The post-install messaging still tells users to `Run npm run rebuild`, even though the broader repo surface already shows that rebuild/install/runtime contracts are fragmented.

Remediation:

- either finish and support a real packaged installer for the current product or archive this installer surface
- stop shipping installer flows that assume large bundled runtimes and missing helper assets
- align any future installer with the actual supported entrypoint and supported optional components

## 165. The IDE and Editor Scaffolding Still Points Developers at Deleted or Historical Runtime Surfaces

The local development metadata is still encoding old product assumptions into the everyday contributor workflow.

Confirmed problems:

- [.vscode/launch.json](.vscode/launch.json) still includes `Debug Consolidated Server (stdio)` against nonexistent `dist/consolidated-server.js`, a dashboard debug target, and an HTTP server target that assumes the old HTTP surface.
- [.vscode/tasks.json](.vscode/tasks.json) still defines `npm: rebuild:local`, which does not exist in the active package scripts, and a combined `Build and Rebuild` task that depends on that missing script.
- [.vscode/settings.json](.vscode/settings.json) keeps `dist` visible in the file tree while hiding it from search, which makes it easier to debug against compiled artifacts while simultaneously hiding drift in source/runtime alignment.
- [examples/enhanced-documentation-demo.js](examples/enhanced-documentation-demo.js) is still an active root example around `dist/utils/documentation-fetcher`, reinforcing the separate documentation-fetching product rather than the live unified MCP runtime.

Remediation:

- update or remove launch/tasks that point to deleted binaries and deleted npm scripts
- keep IDE helpers aligned to the one supported runtime and one supported rebuild/test flow
- move documentation-fetching demos out of the active examples surface unless they remain part of the supported product

## 166. The Embedded HTTP UI Is Still a Full Setup Wizard and Local-LLM Dashboard for a Different Product Slice

The checked-in web UI under `public/` still represents a larger browser-first setup product rather than the core MCP server.

Confirmed problems:

- [public/index.html](public/index.html) is a large branded setup/configuration dashboard with a multi-step wizard, local-LLM configuration, setup completion flow, chat/conversation UI, and workflow browsing.
- The page still drives the server through `/api/setup/status`, `/api/setup/test-n8n`, `/api/setup/test-login`, `/api/setup/test-model-runner`, `/api/setup/complete`, `/api/local-llm/chat`, `/api/local-llm/conversation`, and `/api/local-llm/workflows`.
- That surface assumes the broader HTTP/UI product is supported and healthy, even though the audited HTTP implementation is still serving placeholder and drifted responses in core areas.
- The page also continues the "Claude/Open WebUI/local model runner" positioning, which is much broader than the current unified stdio MCP runtime actually validated in this audit.

Remediation:

- decide whether the browser-based setup/dashboard is part of the supported product
- if it is, bring the HTTP/UI APIs into parity with the real runtime before treating the UI as active
- if it is not, archive or clearly de-emphasize the `public/` dashboard so it stops acting like a supported front door

## 167. The Local Claude Tooling Policy File Still Bakes In Legacy Commands and a Stale Secret

The workspace-local Claude tooling policy is another active configuration surface still pointing at the older server contract.

Confirmed problems:

- [.claude/settings.local.json](.claude/settings.local.json) explicitly whitelists many legacy commands around `dist/main.js`, `test-all-tools.js`, `test-node-discovery.js`, `test-session-auth.js`, and old `n8n_*` tool verification flows.
- That same file also embeds a hardcoded JWT-like `X-N8N-API-KEY` value ending in `Rw7Q` inside an allowed test command, which is both secret material and stale according to the live audit.
- The policy therefore normalizes both the wrong runtime entrypoint and the wrong credential into the local developer-assistant experience.
- [.kiro/settings/mcp.json](.kiro/settings/mcp.json) is empty, which further shows that workspace-local tool registration is fragmented across ad hoc files instead of one authoritative dev/runtime config.

Remediation:

- scrub secrets from local tooling policy files
- update local assistant policies to target the real current runtime and current tool contract
- consolidate workspace-local tool registration and assistant config so it mirrors the supported server surface

## 168. The GitHub Community Metadata Still Points Contributors at Stale Docs and Overstated CI Health

The non-workflow GitHub metadata is still presenting a cleaner and more coherent repo story than the current codebase actually supports.

Confirmed problems:

- [.github/ACTIONS_STATUS.md](.github/ACTIONS_STATUS.md) says core functionality is unaffected and `works perfectly with Docker Compose locally`, even though the broader audit shows serious drift across Docker, HTTP, and verification surfaces.
- [.github/pull_request_template.md](.github/pull_request_template.md) still expects contributors to update `GETTING-STARTED.md`, which is not part of the current active root doc set in this repo.
- [.github/ISSUE_TEMPLATE/question.yml](.github/ISSUE_TEMPLATE/question.yml) and [.github/ISSUE_TEMPLATE/config.yml](.github/ISSUE_TEMPLATE/config.yml) still link users to `GETTING-STARTED.md` and the older GitHub repo identity.
- [CODEOWNERS](CODEOWNERS) still references deleted or historical paths such as `/src/consolidated-server.ts` and `/GETTING-STARTED.md`.

Remediation:

- align GitHub issue/PR/community metadata to the current supported docs and current repo identity
- remove or revise status claims that are contradicted by the actual audited runtime
- keep CODEOWNERS in sync with the real source tree so review routing reflects the current product

## 169. The Checked-In Integration Registry Is Another Static and Incomplete Node Truth Source

The `data/integrations/*` surface is another generated catalog that can diverge from the live installed node set and from the real node database.

Confirmed problems:

- [data/integrations/comprehensive-registry.json](data/integrations/comprehensive-registry.json) is a generated snapshot from June 13, 2025 claiming only `47` total integrations across `11` categories.
- [data/integrations/summary.json](data/integrations/summary.json) and category files such as [data/integrations/ai.json](data/integrations/ai.json) encode a much smaller, curated subset of integrations than the live n8n runtime actually supports.
- This registry coexists with the node database, the docs mirror, the extraction services, the template catalogs, and live n8n node sync, creating yet another non-canonical source of node truth.
- [reports/collection-report-1750039165844.json](reports/collection-report-1750039165844.json) is another generated collection artifact in the same family, reinforcing the pattern of checked-in snapshot reports.

Remediation:

- remove or archive generated integration registries unless they are an intentional supported fixture
- if such registries are required, generate them directly from the canonical live node database and validate freshness
- stop using checked-in static subsets as a substitute for live node discovery

## 170. The Playwright Example Surface Is Still Pure Boilerplate and Not a Real Product Test

The remaining Playwright example coverage is not related to the MCP server at all.

Confirmed problems:

- [tests-examples/demo-todo-app.spec.ts](tests-examples/demo-todo-app.spec.ts) is the standard Playwright TodoMVC demo suite against `https://demo.playwright.dev/todomvc`.
- It does not touch the MCP server, the HTTP server, the dashboard, the setup UI, or the live n8n integration in any way.
- Keeping this as the visible example browser test surface makes it look like there is browser-level coverage when there is not.

Remediation:

- replace boilerplate Playwright examples with real product flows or remove them
- do not present generic upstream demos as evidence of this product's browser or UI quality

## 171. The Root Toolchain Config Still Carries Contradictory and Historical Build/Test Assumptions

The build/test scaffolding in the root config files is another place where historical runtime assumptions have been preserved.

Confirmed problems:

- [jest.config.cjs](jest.config.cjs) mixes `ts-jest/presets/default-esm`, explicit `ts-jest` transform config, and comments about Babel/ESM uncertainty, which matches the already-audited fragility in the test/build pipeline.
- [.babelrc](.babelrc) and [babel.config.cjs](babel.config.cjs) both exist even though the active build is TypeScript-first and the repo is already struggling with multiple module/runtime modes.
- [.npmrc](.npmrc) forces `legacy-peer-deps=true` and `engine-strict=false`, which normalizes looser installs instead of keeping dependency/runtime contracts explicit.
- [renovate.json](renovate.json) still instructs maintainers to run `npm run rebuild` and `npm run validate` after dependency updates, which assumes those flows are stable and authoritative even though the audit has shown otherwise.

Remediation:

- simplify the module/build/test toolchain so one supported compilation and test path exists
- remove Babel layers if they are not needed for the supported runtime
- stop encoding unreliable rebuild/validate expectations into dependency automation

## 172. The Ignore Rules No Longer Match the Reality of What Is Checked In

The `.gitignore` surface itself now documents repo drift.

Confirmed problems:

- [.gitignore](.gitignore) says files like `reports/`, `data/`, `fleet-workflow*.json`, `n8n-cheatsheet*.txt`, and `verify-stdio.js` should not be committed, yet those exact surfaces are already checked into the repo.
- The ignore file also excludes `.claude/settings.local.json`, `.kiro/`, `.qodo/`, and DB files because they may contain secrets or machine-local state, but the current workspace still carries some of those local/config artifacts.
- That mismatch is a strong signal that the repo has accumulated committed artifacts faster than the hygiene rules have been enforced.

Remediation:

- reconcile `.gitignore` with the actual intended tracked surface
- remove or archive files that are currently tracked but explicitly treated as ignorable/generated/local
- use the ignore rules as a product-boundary tool, not just aspirational cleanup guidance

## 173. The Checked-In Shared-Memory Database Contains Live Validation State and Workflow Identifiers

The repo currently includes active runtime memory state under `AppData/`, which is far beyond normal source control boundaries.

Confirmed problems:

- [AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db](AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db) is a live SQLite database containing `memory` and `memory_history` tables from actual MCP runtime usage.
- The stored rows include validation-cache entries, recent error summaries, handler-error records, live workflow IDs such as `Baf9nylVDD1pzj9Q`, and raw validation payloads describing request-body failures.
- This means real execution state, error history, and workflow-level metadata are currently living inside the repo workspace as checked-in or workspace-carried state.
- It also gives another concrete example of shared-memory/global-state behavior being persisted without request/session scoping at the product boundary.

Remediation:

- remove runtime memory/state databases from the active repo surface
- keep shared-memory state under user-local runtime storage only
- never treat captured runtime memory DBs as documentation or fixtures unless they are sanitized and explicitly versioned as such

## 174. The Extracted-Nodes Fixture Bundle Is Frozen on a Very Old n8n Package Snapshot

The `tests/extracted-nodes-db` fixture set is another historical extraction product, and it is much older than the current runtime assumptions.

Confirmed problems:

- [tests/extracted-nodes-db/database-import.json](tests/extracted-nodes-db/database-import.json) and [tests/extracted-nodes-db/extraction-report.json](tests/extracted-nodes-db/extraction-report.json) are dated June 2025 and built around `n8n-nodes-base` version `1.14.1`.
- The fixture set only covers eight nodes and still includes legacy node types like `n8n-nodes-base.Function`, which the current remediation effort is explicitly trying to de-emphasize in favor of built-in modern alternatives.
- [tests/extracted-nodes-db/insert-nodes.sql](tests/extracted-nodes-db/insert-nodes.sql) and the JSON fixtures encode a PostgreSQL-style import story around extracted source blobs, package metadata, and credentials, reinforcing the extraction/database-storage product layer yet again.
- The node source fixtures are also storing huge raw source/package payloads as JSON, making them both heavyweight and highly drift-prone.

Remediation:

- archive or sharply minimize old extracted-node fixture bundles
- if extraction fixtures are kept, regenerate them from the current supported runtime and keep them intentionally small
- do not let old source-extraction bundles influence current node authority or example generation

## 175. The Generated Test Result Snapshots Still Overstate Health Even When Their Own Details Show Failures

The test-result bundle under `tests/test-results` is another example of success-shaped artifacts hiding real drift.

Confirmed problems:

- [tests/test-results/test-summary.json](tests/test-results/test-summary.json) reports `6` passed tests and `0` failed tests.
- But the detailed payload inside that same file shows extraction failures, such as `@n8n/n8n-nodes-langchain.Agent` not being found, and it reports all packages as `unknown` when listing hundreds of available nodes.
- [tests/test-results/extracted-nodes.json](tests/test-results/extracted-nodes.json) is another very large generated snapshot that can easily be mistaken for a trustworthy current node catalog.
- This is the same pattern seen elsewhere in the repo: generated artifacts present a green summary even when the underlying details reveal structural breakage or incomplete coverage.

Remediation:

- stop checking in generated test-result snapshots as though they are durable evidence of health
- if result fixtures are kept, make failures visible and machine-asserted rather than hidden inside JSON detail payloads
- prefer reproducible integration tests over stored success reports

## 176. The Screenshots Folder Is Another Batch of Generated Operational Artifacts in the Active Repo Surface

The repo still carries batches of generated screenshot artifacts that are not part of the implementation.

Confirmed problems:

- [screenshots](screenshots) contains repeated generated PNG files with machine-generated names and no clear product-boundary meaning.
- These are almost certainly operational/debug outputs, not maintained implementation assets.
- Their presence in the active repo surface is consistent with the larger artifact-sprawl pattern already observed in reports, workflow experiments, extracted node dumps, and runtime DB state.

Remediation:

- move screenshots and other generated visual diagnostics into ignored output directories
- keep only screenshots that are explicitly needed as maintained documentation assets
- enforce a cleaner boundary between source, fixtures, and generated evidence

## 177. The Workspace Still Carries Three Different Local Node Databases With Different Shapes and States

The local database layer is even more fragmented than the source files alone suggest.

Confirmed problems:

- [data/nodes.db](data/nodes.db) contains the active SQLite-style node catalog with `543` rows in `nodes` and `db_metadata.n8n_version = 1.121.3`.
- [data/nodes-v2.db](data/nodes-v2.db) currently exists but is effectively empty.
- [nodes.db](nodes.db) at the repo root is a different database with tables such as `documentation_sources`, `extraction_stats`, and `nodes`, but currently zero actual node rows.
- This means the workspace currently carries at least three different local node-database authorities, only one of which appears populated.

Remediation:

- define one canonical node database location and schema for the supported product
- archive or remove empty/legacy alternate DB files
- ensure all rebuild, extraction, validation, and docs services use the same database authority

## 178. temp/n8n-docs Is Not a Registered Git Submodule Here; It Is a Vendored External Docs Tree

The external docs mirror boundary is looser than previously assumed.

Confirmed problems:

- `git submodule status` in this workspace reports `fatal: no submodule mapping found in .gitmodules for path 'temp/n8n-docs'`, which means [temp/n8n-docs](temp/n8n-docs) is not an actively registered git submodule in this repo.
- The directory still contains a full external docs project surface, including [temp/n8n-docs/mkdocs.yml](temp/n8n-docs/mkdocs.yml), [temp/n8n-docs/docs/api/v1/openapi.yml](temp/n8n-docs/docs/api/v1/openapi.yml), and [temp/n8n-docs/runtime.txt](temp/n8n-docs/runtime.txt).
- That makes `temp/n8n-docs` a vendored/copied external documentation tree living directly inside the workspace, with its own build system, plugin stack, and API snapshot.
- Because it is not cleanly isolated as a submodule boundary, it is easier for local scripts, tests, and developers to start treating it as an internal authoritative subsystem.

Remediation:

- either restore `temp/n8n-docs` as a clearly isolated submodule/vendor boundary or remove it from the active workspace
- do not let copied external docs repos silently behave like first-party runtime dependencies
- keep local code and tests from depending on raw file layouts inside vendored docs trees

## 179. The Extracted Source Fixtures Store Massive Raw Package Payloads, Not Just Minimal Test Data

The extracted-node fixture layer is not lightweight fixture data; it is preserving huge chunks of package metadata and source.

Confirmed problems:

- Fixtures such as [tests/extracted-nodes-db/n8n-nodes-base__HttpRequest.json](tests/extracted-nodes-db/n8n-nodes-base__HttpRequest.json) and [tests/extracted-nodes-db/n8n-nodes-base__Slack.json](tests/extracted-nodes-db/n8n-nodes-base__Slack.json) store raw source blobs plus extremely large `package_info` payloads listing hundreds of credentials and nodes.
- This makes each fixture a miniature package snapshot rather than a small test sample.
- It also means the repo is storing large volumes of extracted upstream package metadata in JSON, which is high-drift, high-noise, and expensive to maintain.

Remediation:

- replace raw package snapshots with intentionally minimal fixture payloads
- keep only the fields a given test actually needs
- avoid storing full upstream package manifests and source dumps in active test fixtures

## 180. Some Reference Workflows Demonstrate the Right Modular Pattern, but They Are Not Curated as Canonical Examples

The reference corpus contains both strong and weak design exemplars, but they are all mixed together in one flat active surface.

Confirmed problems:

- [reference_workflows/sample_agent_army/retrofuture-master-assistant.json](reference_workflows/sample_agent_army/retrofuture-master-assistant.json) is one of the better examples in the repo: one top-level agent, conversation memory, and seven `toolWorkflow` delegations to specialized workflows instead of a pile of custom code tools.
- But even that file is still only a placeholder orchestration asset, using symbolic workflow IDs such as `artisan-production-workflow-id` rather than import-ready or repo-resolved references.
- Because it sits beside much noisier assets without any curation layer, the repo does not clearly tell maintainers or agents that this is closer to the desired architecture than the code-heavy examples.

Remediation:

- curate a supported "good examples" set that explicitly highlights toolWorkflow-first modular orchestration
- distinguish between conceptual/example templates and import-ready production references
- use the curated example set to teach the built-in-first generation policy

## 181. Other Reference Workflows Are Credential-Bound Business Demos, Not Safe Canonical Templates

Several of the visible workflow examples are tightly bound to specific accounts, brands, and real external IDs.

Confirmed problems:

- [reference_workflows/From Zero to Inbox Agent.json](reference_workflows/From%20Zero%20to%20Inbox%20Agent.json) includes real-looking credential references, Gmail label IDs, brand-specific AI assistant instructions, and hardcoded email routing.
- The workflow does show useful node patterns such as `Text Classifier` plus agent-driven support response generation, but it is clearly a business/demo workflow rather than a neutral product template.
- Leaving such files in the main reference surface without curation makes it harder to identify which example assets are intended to guide architecture versus merely showcase creator demos.

Remediation:

- separate business/demo workflows from canonical product examples
- strip account-bound identifiers and business branding from any workflow intended to serve as a general template
- keep repo examples import-safe and credential-neutral where possible

## 182. The Ultimate Media Agent Pack Is a Large Creator-Specific Superagent, Not a Product Reference for the MCP Server

The largest workflow pack in the repo is especially important because it is sophisticated enough to be mistaken for the target architecture.

Confirmed problems:

- [reference_workflows/Ultimate Media Agent Army/Ultimate Media Agent.json](reference_workflows/Ultimate%20Media%20Agent%20Army/Ultimate%20Media%20Agent.json) is a large creator-specific orchestration workflow with Telegram triggers, multiple sub-agents, many `toolWorkflow` nodes, two `code` cleanup nodes, dozens of external services, and extensive credential dependence.
- It includes hardcoded folder IDs, workflow IDs, account-bound credentials, and a large sticky-note setup guide with creator branding, external promo links, and discount codes.
- That makes it a powerful showcase workflow, but not a clean, neutral, built-in-first architectural reference for how this MCP server should guide workflow creation.
- The repo currently lacks a clear boundary between "interesting creator workflow pack" and "supported canonical example for MCP-assisted generation."

Remediation:

- move large creator-specific workflow packs into a clearly labeled showcase/examples area
- keep the active canonical examples smaller, credential-neutral, and aligned with the desired generation policy
- avoid treating giant superagent demos as architecture standards for the MCP server itself

## 183. The Smaller Checked-In Agent Workflows Are Better Examples, but They Are Still Orphaned and Credential-Bound

The simpler workflow assets under `workflows/` are materially closer to the kind of composable subworkflow examples the MCP server should recommend.

Confirmed problems:

- [workflows/Billing_RAG_Agent.json](workflows/Billing_RAG_Agent.json) and [workflows/High_Priority_RAG_Agent.json](workflows/High_Priority_RAG_Agent.json) are compact, code-free RAG subworkflows built from `Execute Workflow Trigger`, agent, model, memory, vector-store tool, Postgres vector store, embeddings, and `Set`.
- [workflows/Fraud_Classifier_Agent.json](workflows/Fraud_Classifier_Agent.json) is similarly compact and code-free, using only an execute-workflow trigger, agent, model, and output mapping.
- These are stronger exemplars than the fleet and showcase packs for the built-in-first policy, but they still contain concrete credential IDs/names and are not surfaced as canonical templates in the planning/template system.
- They are also highly specialized to one support/email domain, so they are not yet curated as general product guidance for MCP-assisted workflow generation.

Remediation:

- promote these smaller code-free subworkflow patterns into the supported canonical example set
- scrub credential-bound identifiers from any workflow intended as a reusable example
- connect curated internal workflow examples into the template/planning/recommendation surfaces

## 184. The Repo Still Lacks a Clear Example Hierarchy Between Canonical Subworkflows, Showcase Packs, and Historical Assets

After reviewing the checked-in workflow corpus, the example hierarchy problem is consistent across the repo.

Confirmed problems:

- The repo mixes compact reusable subworkflows, creator showcase packs, historical experiments, and business-specific demos in adjacent locations without a clear support boundary.
- That makes it difficult for humans and future agent/template retrieval layers to determine which workflows represent recommended architecture versus mere historical or promotional examples.
- The result is that the MCP server has no clean in-repo example corpus to point at when trying to generate modern built-in-first workflows for users.

Remediation:

- divide examples into explicit tiers: canonical, showcase, and archived/historical
- ensure only canonical examples feed planner/template retrieval by default
- keep canonical examples small, code-light or code-free, import-safe, and credential-neutral

## 185. Archive Dead-Code Files Preserve Shadow Orchestrator and GitHub Subsystems That Still Look Production-Ready

The archive layer is not just passive text history; it contains TypeScript implementations that still resemble live subsystems.

Confirmed problems:

- [.archive/dead-code/graphrag-orchestrator.ts](.archive/dead-code/graphrag-orchestrator.ts) contains a full multi-agent orchestration class that initializes `PatternAgent`, `WorkflowAgent`, `ValidatorAgent`, and shared-memory state, then reads and writes the same unscoped keys such as `generated-workflow`.
- [.archive/dead-code/github-config.ts](.archive/dead-code/github-config.ts) contains a full GitHub monitoring/sync configuration layer with rate-limit helpers and environment-driven behavior.
- These are not tiny snippets; they are complete-looking modules with export surfaces, comments, and environment assumptions that closely resemble the architectural claims elsewhere in the repo.
- Keeping these files in a lightly labeled `dead-code` folder still leaves them easy to confuse with merely "temporarily unreferenced" runtime components.

Remediation:

- move shadow runtime implementations out of the normal workspace path or into a clearly quarantined archival package
- ensure archived implementation files cannot be confused with supported source modules during search, review, or code generation
- document which archived subsystems were abandoned versus merely postponed

## 186. The Archive Debug-Script Surface Is an Alternate Product Layer With Hardcoded Credentials and Obsolete Entrypoints

The debug-script archive is effectively a second operational toolkit, not just a few one-off troubleshooting helpers.

Confirmed problems:

- Many scripts in [.archive/debug-scripts](.archive/debug-scripts) still launch `dist/mcp/index.js`, not the audited current unified stdio wrapper.
- Representative files such as [.archive/debug-scripts/direct-mcp-agent.js](.archive/debug-scripts/direct-mcp-agent.js) and [.archive/debug-scripts/mcp-complete-server.mjs](.archive/debug-scripts/mcp-complete-server.mjs) define alternate clients/servers, tool contracts, and environment behavior.
- Numerous scripts in that folder contain a hardcoded JWT-like n8n API key ending in `Rw7Q`, which is both stale and sensitive.
- The same archive area mixes direct n8n REST mutation scripts, MCP tool callers, browser automation servers, validation utilities, and workflow fixers without a clear trust boundary.

Remediation:

- remove or scrub hardcoded credentials from all archived scripts immediately
- quarantine archive debug scripts from normal developer workflows and searches
- keep only a minimal curated set of reproducible diagnostics if historical debug scripts must be retained
- ensure obsolete MCP entrypoints and tool names are not preserved in active-looking helper scripts

## 187. Archive Session Reports Repeatedly Overstate Resolution and Product Completeness

The archive report layer is itself a major source of false confidence.

Confirmed problems:

- Files such as [.archive/session-docs/INVESTIGATION_SUMMARY.md](.archive/session-docs/INVESTIGATION_SUMMARY.md) and [.archive/session-docs/MCP_SERVER_DEEP_AUDIT_REPORT.md](.archive/session-docs/MCP_SERVER_DEEP_AUDIT_REPORT.md) describe issues as fully identified or fixed against server shapes that no longer match the current codebase.
- These reports assert coherent product states such as "wrong mode selected," "40+ tools available," or "issue resolved" while the present repository still contains broken imports, placeholder subsystems, and missing files.
- Multiple session docs also continue to reference absent files like `src/ai/graphrag-orchestrator.ts` and older tool contracts such as `n8n_create_workflow`.
- As a result, the archive status/report corpus acts like a parallel truth source that can override source-based reality in future reviews.

Remediation:

- stop treating archive completion reports as evidence of current runtime health
- add a clear archival disclaimer that session reports are historical narratives, not authoritative implementation status
- summarize archived findings into one maintained current-state document rather than leaving dozens of conflicting status files in circulation

## 188. Checked-In Logs Come From Multiple Product Eras and Should Not Be Treated as Current Runtime Evidence

The repo contains runtime logs, but they do not represent one stable product surface.

Confirmed problems:

- [logs/application.log](logs/application.log) and [logs/audit.log](logs/audit.log) contain records from an older `n8n-mcp-server/build/*` path rather than the present local repo layout.
- Those logs show massive repeated `EPIPE: broken pipe, write` uncaught-exception cascades tied to console/logging writes during shutdown, which confirms a real stdout/stderr fragility pattern in earlier runtime variants.
- [logs/mcp-server-2025-10-04.log](logs/mcp-server-2025-10-04.log) reports a `v3.0.0` lazy-init server with `54 tools`, `sql.js adapter`, and a specific initialization narrative that does not cleanly match the current audited wrapper/runtime path.
- Because these logs are checked in, they can easily be mistaken for validation of the current system instead of historical operational debris.

Remediation:

- do not keep mutable runtime logs under version control as if they were stable artifacts
- if historical logs must be retained, label them by product generation and runtime surface
- use reproducible smoke tests and generated summaries instead of checked-in raw logs to represent health

## 189. The Root Workflow History Shows the Project Drifted Toward More Code Nodes Over Time, Not Fewer

The fleet workflow sequence is useful because it reveals the repo's actual architectural direction in practice.

Confirmed problems:

- [fleet-workflow.json](fleet-workflow.json) has 14 nodes with 2 code-oriented nodes.
- [fleet-workflow-v2.json](fleet-workflow-v2.json) has 22 nodes with 2 code-oriented nodes.
- [fleet-workflow-v3.json](fleet-workflow-v3.json) has 33 nodes with 7 code-oriented nodes.
- [fleet-workflow-v3.1.json](fleet-workflow-v3.1.json) has 41 nodes with 10 code-oriented nodes, including 5 `toolCode` nodes.
- That progression means the visible internal flagship workflow history has been reinforcing custom-code-heavy growth rather than converging on built-in deterministic nodes.

Remediation:

- stop using the fleet workflow progression as an implicit architectural north star
- curate newer built-in-first exemplars that intentionally reduce code-node count as complexity rises
- use semantic validation to flag regressions where workflow sophistication increases by adding code nodes instead of native nodes

## 190. Root Examples and Reports Still Center a Side Documentation-Extraction Product Rather Than the Supported MCP Runtime

Some of the remaining active root examples are polished, but they teach the wrong subsystem.

Confirmed problems:

- [examples/enhanced-documentation-demo.js](examples/enhanced-documentation-demo.js) demonstrates `dist/utils/documentation-fetcher`, not the live unified MCP runtime.
- [reports/collection-report-1750039165844.json](reports/collection-report-1750039165844.json) is a successful five-node collection snapshot for that same documentation/extraction direction.
- Together they reinforce a side product around enhanced documentation harvesting rather than the actual workflow-creation and live-instance MCP contract now under remediation.
- This adds to the broader problem where extraction/docs tooling remains overrepresented in the visible example surface.

Remediation:

- move documentation-extraction demos and reports into a clearly separated subsystem area
- keep root examples focused on the supported MCP runtime and its current tool contract
- ensure example scripts exercise the same live server surface the repo expects external agents to use

## 191. Checked-In Kapa OAuth Artifacts Mean External Docs Authentication State Is Living in the Repo Root

The docs-auth integration is not only implemented in code; live authentication artifacts are checked into the workspace root.

Confirmed problems:

- [.kapa-client.json](.kapa-client.json) stores OAuth client registration metadata in the repository root.
- [.kapa-tokens.json](.kapa-tokens.json) stores token material in the repository root, including an access token and refresh token field.
- The runtime code in [src/kapa-auth-setup.ts](src/kapa-auth-setup.ts) and [src/interfaces/mcp-interface.ts](src/interfaces/mcp-interface.ts) explicitly reads and writes those same root files.
- This means docs-auth state is being treated like normal project content rather than secret-bearing local runtime state.

Remediation:

- stop tracking `.kapa-client.json` and `.kapa-tokens.json` in version control
- move third-party OAuth artifacts into a proper local secret/state directory outside the repo root
- ensure docs-auth integration follows the same secret-handling rules as n8n API credentials and shared-memory state

## 192. CLAUDE.md Is a High-Authority Repo Guide, but It Still Documents a Different Product Than the Current Tree

The root agent-guidance file has outsized influence because it is likely to be read first by automation and humans alike.

Confirmed problems:

- [CLAUDE.md](CLAUDE.md) still presents a long version history full of legacy `n8n_*` tools, old metrics, old commands, and older Docker/runtime assumptions.
- It describes commands such as `npm run typecheck`, `npm run test:essentials`, `npm run test:mcp-tools`, `npm run start:http:fixed`, and many other scripts that are not all present in the current [package.json](package.json).
- It still documents architectural files like [src/mcp/server.ts](src/mcp/server.ts) and a broader product story around versions `v2.x`/`v2.7.x` that no longer match the present audited runtime boundary.
- Because it is positioned as repo guidance for Claude Code, it can easily override the source-of-truth mental model before an audit even reaches the current implementation.

Remediation:

- either retire `CLAUDE.md` or rewrite it to describe only the current supported product surface
- remove stale script lists, metrics claims, and legacy tool references from the root guidance path
- keep any historical roadmap/version narrative in archived docs, not in active agent instructions

## 193. The Repo Contains Multiple Competing Fix Narratives Instead of One Maintained Remediation Source

The project now has several documents that diagnose MCP workflow/update issues, but they do not form one clean maintained path.

Confirmed problems:

- [docs/MCP_Issues_Fix_Guide.md](docs/MCP_Issues_Fix_Guide.md) contains a focused and often accurate source-based diagnosis of workflow update bugs.
- [docs/Response_To_ClaudeCode.md](docs/Response_To_ClaudeCode.md) contains another detailed rebuttal-style diagnosis of the same handler/update path.
- [docs/MCP-WORKFLOW-UPDATE-DEMO.md](docs/MCP-WORKFLOW-UPDATE-DEMO.md) meanwhile documents an older consolidated-tool contract (`n8n_workflow`, `n8n_system`, `n8n_execution`) that is not the same product shape.
- Together with the root [MCP_SERVER_REMEDIATION_BLUEPRINT.md](MCP_SERVER_REMEDIATION_BLUEPRINT.md), the repo now has multiple "authoritative" troubleshooting narratives for the same area.

Remediation:

- keep one maintained remediation source for current MCP defects and clearly archive the rest
- separate historical debate/proof documents from the active fix plan
- ensure workflow-update guidance references the actual live tool contract rather than an older consolidated API story

## 194. docs/AUDIT_PLAN.md Is Itself a Historical Audit Artifact, Not a Current Steering Document

There is an active-looking audit plan in `docs/`, but it describes a repo state that no longer matches the present tree.

Confirmed problems:

- [docs/AUDIT_PLAN.md](docs/AUDIT_PLAN.md) lays out a December 2025 audit around files like `src/ai/graphrag-orchestrator.ts`, `src/services/error-handler.ts`, `src/utils/query-cache.ts`, `src/mcp/tools-orchestration.ts`, and other paths already known to be missing, archived, or drifted.
- It frames the codebase around targets like `~30+` MCP tools, `~200` source files, and a set of duplication questions that have already evolved materially since then.
- Because it lives under `docs/` rather than an archive boundary, it can still be mistaken for an active steering plan for cleanup and consolidation.

Remediation:

- archive `docs/AUDIT_PLAN.md` or rewrite it to reflect the current repo and current remediation status
- do not keep old audit-planning artifacts beside active documentation without an explicit historical label
- ensure future audit planning starts from the maintained current-state blueprint, not a stale plan snapshot

## 195. Positive Review Documents in docs/ Still Overstate Architectural Health

The documentation layer also contains code-review narratives that are much more optimistic than the current codebase supports.

Confirmed problems:

- [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) gives strongly positive ratings to subsystems like `LLMAdapter`, `ValidationGateway`, `GraphRAGNanoOrchestrator`, and the broader architecture while assuming files, tests, and cleanup outcomes that have since drifted.
- That review references removal/archive work, "production-ready" judgments, and clean integration states that do not reflect the current combination of missing modules, stale tests, and broken runtime imports.
- Similar review/status files in `docs/` and `.archive/session-docs/` create a paper trail of approval that is easy to misread as present verification.

Remediation:

- keep review documents tied to a specific commit or archive period, not as standing evidence of current health
- clearly mark older positive reviews as historical snapshots
- rely on current reproducible audits and smoke tests for present-state judgments

## 196. Model-Migration and Enhanced-Visual-Verification Guides Document Side Products, Not the Core Supported MCP Contract

Some remaining docs are sophisticated and detailed, but they are centered on adjacent product visions rather than the supported MCP runtime.

Confirmed problems:

- [docs/MODEL_MIGRATION_GUIDE.md](docs/MODEL_MIGRATION_GUIDE.md) assumes a Docker + Ollama model-pair migration workflow with direct container benchmarking, embedding/generation model swaps, and a broad operational story around the MCP container.
- [docs/ENHANCED_VISUAL_VERIFICATION_GUIDE.md](docs/ENHANCED_VISUAL_VERIFICATION_GUIDE.md) documents an extensive AI visual-intelligence system with setup flows, tool calls, OCR/computer-vision analysis, real-time monitoring, and auto-fix behavior.
- Both guides are much closer to adjacent platform/product narratives than to the current live MCP workflow-creation contract that is actually under remediation.
- Leaving these guides in the main docs surface without a stronger product boundary makes the repo look like it officially supports more runtime surfaces than the code presently validates.

Remediation:

- separate side-product guides from the core MCP server documentation set
- clearly mark advanced/experimental guides as unverified unless they are covered by current runtime tests
- keep the main docs surface focused on the supported live entrypoints, tool contracts, and deployment paths

## 197. Editor and IDE Configurations Still Steer Developers Toward Dead Entrypoints and Missing Tasks

The repo-local editor surface still points contributors at older runtime shapes.

Confirmed problems:

- [.vscode/launch.json](.vscode/launch.json) still defines a primary "Debug Consolidated Server" target pointing to `dist/consolidated-server.js`, a dashboard target pointing to `dist/dashboard/server.js`, and a rebuild target pointing to `dist/scripts/rebuild.js`.
- Those paths do not correspond to the current audited runtime surface, which centers on `src/mcp/stdio-wrapper.ts`, `src/mcp/server-modern.ts`, and the unified MCP tool service.
- [.vscode/tasks.json](.vscode/tasks.json) still references `npm: rebuild:local`, but the current [package.json](package.json) no longer defines `rebuild:local`.
- [.vscode/settings.json](.vscode/settings.json) is mostly reasonable, but it deliberately leaves `dist/` visible in the file tree while excluding it from search, which makes it easier to debug against compiled artifacts rather than the canonical source path.
- [.kiro/settings/mcp.json](.kiro/settings/mcp.json) is empty, so another MCP-capable client surface exists without any canonical repo-configured target.

Remediation:

- rewrite editor launch/tasks to target the current unified stdio wrapper and current test/build scripts only
- remove or archive dead launch configurations for consolidated/dashboard products
- keep one editor-facing debug story that matches the supported runtime
- either provide a canonical `.kiro` MCP target or explicitly treat that surface as out-of-scope local state

## 198. Repository Governance and Support Metadata Still Point Users at Missing Docs and Older Architecture

The repo-governance layer is also drifted enough to misdirect contributors and issue reporters.

Confirmed problems:

- [CODEOWNERS](CODEOWNERS) still references `/src/consolidated-server.ts`, `/GETTING-STARTED.md`, and `/SECURITY.md`, none of which match the present tracked source/documentation surface.
- [.github/ISSUE_TEMPLATE/config.yml](.github/ISSUE_TEMPLATE/config.yml) and [.github/ISSUE_TEMPLATE/question.yml](.github/ISSUE_TEMPLATE/question.yml) send users to `GETTING-STARTED.md`, which is not present in the current repo.
- [.github/ACTIONS_STATUS.md](.github/ACTIONS_STATUS.md) claims "core MCP server functionality unaffected" and "works perfectly with Docker Compose locally" even though the audited runtime still contains broken imports, placeholder HTTP responses, and entrypoint drift.
- The issue templates themselves are structurally fine, but they inherit the stale deployment/documentation model of the rest of the repo.

Remediation:

- update repo governance files to reference only real current docs and current entrypoints
- stop claiming local Docker/core functionality is unaffected unless the current smoke suite proves it
- make issue-reporting paths match the supported runtime and current troubleshooting docs

## 199. Installer, Quick-Start, and Compose Launcher Surfaces Still Package a Different Product

The packaging and launcher layer continues to distribute an HTTP/setup-wizard/GraphRAG product rather than the audited unified MCP runtime.

Confirmed problems:

- [installer/n8n-mcp-installer.iss](installer/n8n-mcp-installer.iss) packages `runtime/node`, `runtime/python`, `dist`, `src`, `docs`, `scripts`, optional `models`, and expects artifacts such as `n8n-mcp.exe`, `installer/task.xml`, and `scripts/setup-service.ps1`.
- Those packaged artifacts do not line up cleanly with the current repo contents or the current supported runtime story.
- [start.bat](start.bat) and [start.sh](start.sh) boot [docker-compose.desktop.yml](docker-compose.desktop.yml), open a browser, and instruct users to complete a setup wizard on `http://localhost:3000`.
- [docker-compose.desktop.yml](docker-compose.desktop.yml) is therefore packaging an HTTP setup/UI product, not the current audited stdio-first MCP interface.
- [docker-compose.simple.yml](docker-compose.simple.yml) still uses `MCP_MODE: full`, which is not the supported mode contract of the current audited runtime.
- [docker-compose.open-webui.yml](docker-compose.open-webui.yml) packages an Open WebUI + MCP backend side product, and [docker-compose.extract.yml](docker-compose.extract.yml) packages a node-extraction product.

Remediation:

- define one supported packaging target and move the rest behind clearly named experimental/archive boundaries
- stop using quick-start launchers that imply the HTTP setup wizard is the canonical product
- remove unsupported `MCP_MODE` values from example deployment surfaces
- ensure installer assets are generated from the real runtime surface rather than a historical packaging vision

## 200. Root Environment and Client Config Examples Still Encode Old Brands, Old Modes, and Old Contracts

The example-config layer still teaches multiple incompatible product shapes.

Confirmed problems:

- [.env.example](.env.example) still brands the product as "n8n Co-Pilot", describes session-auth fallback extraction for `/types/nodes.json`, and documents a dry-run validation model that is only part of the real current validation story.
- [.env.nano.example](.env.nano.example) still uses `MCP_MODE=consolidated`, `USE_FIXED_HTTP=true`, and a dual-vLLM deployment model that belongs to an adjacent nano-LLM product surface.
- [claude-desktop-config-example.json](claude-desktop-config-example.json) still registers `n8n-copilot` through [start.js](start.js), not the unified stdio wrapper that was used for the live MCP audit.
- [.kiro/settings/mcp.json](.kiro/settings/mcp.json) provides no canonical client target at all.
- Together, these examples teach users several different server identities: `n8n-copilot`, `consolidated`, `http setup wizard`, and the current unified MCP server.

Remediation:

- collapse example configs to one supported client-registration story and one supported environment model
- retire the "n8n Co-Pilot" branding from active setup surfaces unless it is still the intentional product name everywhere
- move nano/vLLM deployment examples into clearly experimental or optional docs

## 201. Root Review and Test Scripts Still Exercise Legacy Tool Names and Older Runtime Shapes

Several current root scripts still provide misleading verification because they target the legacy contract or bypass the MCP server entirely.

Confirmed problems:

- [review-workflows.js](review-workflows.js) spawns `dist/main.js` and calls legacy tools such as `n8n_status`, `n8n_list_workflows`, and `n8n_get_workflow`.
- [test-node-discovery.js](test-node-discovery.js) also targets `dist/main.js` and legacy discovery tools like `n8n_search_nodes`, `n8n_list_ai_nodes`, `n8n_get_node_info`, and `n8n_list_trigger_nodes`.
- [test-minimal-mcp.js](test-minimal-mcp.js) is only a pure MCP SDK stdio smoke test and can succeed even when the real server is broken.
- [test-session-auth.js](test-session-auth.js) exercises a direct browser-session path to `/rest/login` and `/types/nodes.json`, which is useful diagnostically but not a verification of the supported MCP contract.
- [list-workflows.js](list-workflows.js) bypasses MCP entirely and directly parses `.env` to call the n8n REST API.

Remediation:

- separate true MCP integration tests from direct n8n API diagnostics and from SDK-only transport tests
- stop presenting legacy-tool test scripts as current server verification
- replace root verification scripts with a canonical unified-runtime smoke suite

## 202. Workspace-Local Agent Settings Still Carry Secret-Bearing, Stale Runtime Assumptions Outside Version Control

The workspace-local agent settings are not part of the tracked product, but they materially affect how local agents interact with the repo.

Confirmed problems:

- [.claude/settings.local.json](.claude/settings.local.json) contains a large allowlist of shell commands that still reference `dist/main.js`, legacy tool names, and a hardcoded stale n8n API key ending in `Rw7Q`.
- [.gitignore](.gitignore) intentionally excludes `.claude/settings.local.json`, `.kiro/`, and `.qodo/`, so this local automation surface can drift indefinitely outside review.
- The `.qodo` directory is currently empty in this workspace, reinforcing that some client/tooling surfaces are present only as local-state placeholders.
- This does not change the shipped product directly, but it does distort local agent behavior and can preserve stale credentials and assumptions long after the code changes.

Remediation:

- treat local agent/editor settings as sensitive operational state and keep them out of the authoritative product story
- remove stale hardcoded credentials and stale entrypoints from local automation configs
- provide a short reviewed template for local agent configuration if that workflow is expected to be part of development

## 203. Root Research and Cheat-Sheet Snapshots Are Useful References but Non-Authoritative Truth Sources

The root also contains research/reference artifacts that should not be treated as implementation truth.

Confirmed problems:

- [n8n-research.md](n8n-research.md) is a large external research compilation about n8n itself, with broad market/product/version claims that are useful for context but not specific to the current repo implementation.
- [n8n-cheatsheet-clean.txt](n8n-cheatsheet-clean.txt) and [n8n-cheatsheet-extracted.txt](n8n-cheatsheet-extracted.txt) are extracted/OCR-style reference artifacts rather than maintained project documentation.
- These files can still be helpful for prompt/reference material, but they are not versioned product contracts for this MCP server.

Remediation:

- move research/reference snapshots behind a clearly named `research/` or `references/` boundary
- keep them out of the main setup/product path so they are not mistaken for supported docs
- do not use them as evidence of current runtime behavior without validating against source and live tests

## 204. Dependency and Maintenance Metadata Still Prescribe Missing Commands and Outdated Maintenance Rituals

The maintenance metadata still assumes an older command surface.

Confirmed problems:

- [renovate.json](renovate.json) instructs maintainers to run `npm run rebuild` and `npm run validate` after dependency updates.
- The current [package.json](package.json) does not define either of those scripts.
- This means even automated dependency-maintenance guidance is drifted away from the current executable repo surface.

Remediation:

- update dependency-maintenance guidance to use real current scripts only
- if rebuild/validate are still required operational steps, add them back explicitly and wire them to maintained implementations
- otherwise remove those post-update instructions from Renovate metadata

## 205. Audit Coverage Is Now Project-Wide; Generated and Runtime State Are Classified but Not Treated as First-Party Truth

This blueprint has now absorbed findings from the current source tree, scripts, docs, tests, archive/history layer, packaging surfaces, client configs, local-state boundaries, vendored documentation tree, workflow/reference assets, and root support files.

Audit boundary:

- the current implementation-bearing repo surfaces have been reviewed across `src/`, `python/`, `scripts/`, `tests/`, `docs/`, `.github/`, root configs, launchers, workflow assets, archive/history docs, and the nested [temp/n8n-docs](temp/n8n-docs) tree
- generated/runtime/vendor surfaces such as `dist/`, `node_modules/`, `coverage/`, binary databases, screenshots, logs, and build caches were reviewed and classified, but are not treated as canonical implementation truth
- workspace-local and repo-internal state such as `.claude/`, `.kiro/`, `.qodo/`, `AppData/`, and `.git/` was reviewed as operational context rather than as shipped product code

Remediation:

- use this blueprint as the single maintained current-state fix plan
- keep archive/history/reference/runtime-state surfaces clearly separated from the supported implementation and docs path
- require future claims of completion or health to be backed by the maintained smoke suite against the supported entrypoint

## 206. CI and Release Automation Still Publish and Certify the Wrong Product Story

The last remaining repo automation layer still reinforces the older Docker-desktop/setup-wizard product and overclaims verification.

Confirmed problems:

- [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) publishes container images and then tells users to download [docker-compose.desktop.yml](docker-compose.desktop.yml) and [start.sh](start.sh), which launches the HTTP setup-wizard product rather than the unified stdio runtime audited here.
- [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml) and [.github/workflows/docker-build-fast.yml](.github/workflows/docker-build-fast.yml) are manual-only, but they still build/push the broader Docker product surface without proving parity with the supported MCP entrypoint.
- [.github/workflows/update-n8n-deps.yml](.github/workflows/update-n8n-deps.yml) creates PR text that marks "Database rebuilt successfully" and "All tests passed" as completed validation items even though the workflow does not actually run a trustworthy full rebuild-and-test sequence for the current unified runtime.

Remediation:

- align CI/release automation with the supported entrypoint and supported deployment story
- stop publishing quick-start instructions that route users into the wrong product surface
- only mark rebuild/test validation as complete when the workflow actually executes the maintained smoke suite and supporting checks

## 207. The Checked-In dist Output Is Another Drifted Product Surface, Not Just a Neutral Build Artifact

The generated `dist/` tree is not just a passive compilation result. It preserves runtime behavior, legacy contracts, and failure modes that do not always align cleanly with the current source.

Confirmed problems:

- The current [dist](dist) tree contains 310 files and acts like a second product surface that tools and local scripts can target directly.
- [dist/mcp/server-modern.js](dist/mcp/server-modern.js) still emits dynamic imports such as `import("./handlers-v3-tools")`, and [dist/services/mcp-tool-service.js](dist/services/mcp-tool-service.js) still emits `import("../utils/validation-cache")`.
- Those extensionless dynamic imports are exactly the generated-runtime paths implicated in the live failures of `workflow_execution` and local validation, even though [dist/mcp/handlers-v3-tools.js](dist/mcp/handlers-v3-tools.js) exists on disk.
- The same `dist/` tree does **not** contain `dist/consolidated-server.js`, `dist/dashboard/server.js`, or `dist/scripts/rebuild.js`, even though local launch/task surfaces still point at those outputs.
- [dist/interfaces/mcp-interface.js.map](dist/interfaces/mcp-interface.js.map) embeds `sourcesContent` for the old `n8n_*` MCP contract and older "n8n Co-Pilot" identity, preserving a legacy product shape in a generated artifact that still ships in the workspace.

Remediation:

- treat `dist/` as a published/runtime surface that must be validated explicitly, not as an afterthought
- fix the module-generation strategy so dynamic imports resolve reliably in the built runtime
- stop keeping launchers and scripts that target outputs no longer produced by the build
- if source maps are shipped, ensure they do not preserve stale canonical product narratives

## 208. Checked-In Coverage Artifacts Preserve Missing Modules and False Signals of Test Authority

The `coverage/` tree is also a stale truth source rather than a harmless artifact.

Confirmed problems:

- The current [coverage](coverage) tree contains 70 files and still reports on missing or superseded modules such as `error-handler.ts`, `resource-formatter.ts`, `utils/query-cache.ts`, and `ai/graphrag-orchestrator.ts`.
- Representative examples include [coverage/lcov-report/error-handler.ts.html](coverage/lcov-report/error-handler.ts.html), [coverage/lcov-report/resource-formatter.ts.html](coverage/lcov-report/resource-formatter.ts.html), [coverage/lcov-report/utils/query-cache.ts.html](coverage/lcov-report/utils/query-cache.ts.html), and [coverage/lcov-report/ai/graphrag-orchestrator.ts.html](coverage/lcov-report/ai/graphrag-orchestrator.ts.html).
- [coverage/lcov.info](coverage/lcov.info) and the report tree therefore preserve evidence of a test/build graph that no longer matches the present source tree.
- The coverage report also duplicates path shapes like `resource-formatter.ts` and `src/utils/resource-formatter.ts`, which further confuses what was actually tested.

Remediation:

- stop checking coverage artifacts into the main working tree unless they are intentionally versioned release artifacts
- purge stale coverage before drawing any conclusions about test reach or exercised modules
- ensure future coverage is produced only from the maintained current runtime and maintained current tests

## 209. The TypeScript Build Cache Still Tracks a Much Older Repository Graph

The checked-in TypeScript incremental build cache is another strong signal that the effective build graph has drifted from the present repo.

Confirmed problems:

- [tsconfig.tsbuildinfo](tsconfig.tsbuildinfo) still lists a large older root graph including files such as `src/http-server.ts`, `src/index-auto-update.ts`, `src/index-simple-auto.ts`, `src/config/github-config.ts`, `src/loaders/secure-hybrid-loader.ts`, `src/mcp/server.ts`, `src/mcp/server-auto-update.ts`, `src/mcp/tools.ts`, `src/services/visual-verification.ts`, `src/utils/error-handler.ts`, `src/utils/memory-manager.ts`, and other paths no longer present in the current audited source tree.
- It also records `errors: true`, confirming that the cached build state is not a clean authoritative representation of the current repo.
- Because it is checked in at the repo root, it can distort local editor/build behavior and contribute to confusion about what the project is actually compiling.

Remediation:

- stop versioning stale incremental build caches as if they were part of the project source of truth
- regenerate build metadata from the actual maintained `tsconfig` and current source set only
- use CI or smoke checks rather than cached compiler state to represent build health

## 210. Checked-In Databases and Runtime Journals Preserve Mutable Local State as If It Were Project Content

The repo and workspace also contain mutable SQLite/state artifacts that are useful operationally but should not be treated as project definition.

Confirmed problems:

- The root/workspace currently contains multiple mutable database/state surfaces including [nodes.db](nodes.db), [data/nodes.db](data/nodes.db), [data/nodes-v2.db](data/nodes-v2.db), [AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db](AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db), and their `-wal` / `-shm` companions.
- [data/nodes.db](data/nodes.db) is a large live mutable store, while `nodes.db`, `nodes-v2.db`, and `shared-memory.db` represent different operational layers and time slices.
- The presence of journal files such as [AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-wal](AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db-wal) and [data/nodes.db-shm](data/nodes.db-shm) makes it clear these are active runtime state surfaces rather than stable source artifacts.
- The repo also contains lightweight generated reports like [reports/collection-report-1750039165844.json](reports/collection-report-1750039165844.json), which are operational snapshots rather than maintained project definitions.

Remediation:

- treat runtime databases and journals as operational state, not as implementation truth
- keep only intentional seed/schema artifacts in versioned project surfaces
- avoid mixing mutable runtime stores with canonical docs, tests, or source-controlled product claims

## 211. Remaining UI, Demo, and Binary Support Assets Also Belong Behind Explicit Non-Core Boundaries

The last remaining files in the workspace are mostly support/demo assets, but they still reinforce the repo’s multi-product sprawl if left in the active path.

Confirmed problems:

- [src/web-ui/index.html](src/web-ui/index.html) is another full setup/configuration wizard UI, reinforcing the HTTP setup-product story rather than the unified MCP runtime.
- [tests/test-ui-rendering.html](tests/test-ui-rendering.html) is a manual browser diagnostic tool that asks for a live n8n API key and workflow ID directly in the page, which is useful for one-off debugging but not part of a clean automated test surface.
- [tests-examples/demo-todo-app.spec.ts](tests-examples/demo-todo-app.spec.ts) is standard Playwright TodoMVC boilerplate unrelated to the actual MCP server.
- [screenshots](screenshots) contains timestamped PNGs that function as ad hoc captured evidence rather than maintained project artifacts.
- [docs/images/architecture.png.placeholder](docs/images/architecture.png.placeholder) and [docs/images/n8n-api-key.png.placeholder](docs/images/n8n-api-key.png.placeholder) are placeholder markers rather than actual maintained assets.

Remediation:

- move demo diagnostics, screenshot captures, and placeholder image assets behind explicit `examples/`, `debug/`, or archive boundaries
- keep the active test surface limited to reproducible tests tied to the supported runtime
- avoid leaving parallel setup UIs in the source tree unless they are part of the supported product

## 212. temp/n8n-docs Is in an Inconsistent Gitlink/Nested-Repo State

The final repo-boundary audit corrected and refined the status of the nested docs repository.

Confirmed problems:

- `git ls-files -s temp/n8n-docs` shows `temp/n8n-docs` tracked as a `160000` gitlink entry.
- The root repo has **no** [.gitmodules](.gitmodules) file, and `git submodule status` fails with `no submodule mapping found in .gitmodules for path 'temp/n8n-docs'`.
- At the same time, [temp/n8n-docs](temp/n8n-docs) contains its own real hidden `.git` directory and a full standalone docs-repo structure.
- That means this workspace is carrying an orphaned or hand-managed nested repo/submodule hybrid rather than a clean vendored copy or a clean declared submodule.

Remediation:

- decide whether `temp/n8n-docs` is supposed to be a real submodule or a vendored snapshot
- if it is a submodule, restore proper `.gitmodules` mapping and submodule hygiene
- if it is vendored content, remove the gitlink state and nested repo metadata so it stops behaving like a broken submodule

## 213. The Installed node_modules Tree Is a Separate Operational Surface With Version and Engine Drift

The final vendor audit shows that the installed dependency tree is itself a moving operational target, not just a mechanical reflection of the root manifest.

Confirmed problems:

- [node_modules](node_modules) currently contains 1128 top-level directories and its own install-state snapshot at [node_modules/.package-lock.json](node_modules/.package-lock.json).
- The installed versions are materially newer than the minimum ranges implied by the root manifest in places, for example:
  - [package.json](package.json) declares `@modelcontextprotocol/sdk` as `^1.13.2`, but the installed version is `1.23.0`
  - [package.json](package.json) declares `@playwright/test` as `^1.53.2`, but the installed version is `1.57.0`
- The installed [node_modules/n8n/package.json](node_modules/n8n/package.json) requires Node `>=20.19 <=24.x`, while the root [package.json](package.json) still declares the project engine as `>=18.0.0`.
- The current runtime environment is `v22.14.0`, which satisfies the installed `n8n` package but further demonstrates that the true operational constraints are tighter than the root repo advertises.
- The tree also contains hidden native-module/temp-install directories such as `.cpu-features-hOIbsg8r`, `.sqlite3-PLTO9RLx`, `.ssh2-Q2OTsht9`, and `.ssh2-sftp-client-fr7dVx7h`, which are operational install artifacts rather than clean source-controlled dependencies.

Remediation:

- treat `node_modules` as an operational dependency surface that can introduce behavior drift independently of source changes
- tighten the root engine declaration to match the real lower bound imposed by the installed `n8n` stack
- pin and validate critical dependency upgrades more explicitly when MCP/runtime APIs are known to be sensitive to version shifts
- avoid treating hidden native-build directories inside `node_modules` as normal checked-in project context

## 214. Live SQLite Contents Confirm Multiple Authorities and Mixed Operational Concerns

The direct SQLite inspection confirms that the database layer is not one clean canonical store.

Confirmed problems:

- [nodes.db](nodes.db) is effectively an empty shell in this workspace: `documentation_sources`, `extraction_stats`, and `nodes` tables are present but all currently have zero rows.
- [data/nodes.db](data/nodes.db) is the actual live catalog store here, with `543` rows in `nodes` and `db_metadata.n8n_version = 1.121.3`.
- [data/nodes-v2.db](data/nodes-v2.db) is effectively empty, confirming yet another parallel but inactive database surface.
- The live [data/nodes.db](data/nodes.db) schema mixes node-catalog concerns with operational state tables such as `browser_automation_logs`, `browser_credentials`, `browser_sessions`, and `github_sync_metadata`.
- Its `nodes` table stores large serialized property-schema blobs and other metadata, which means the main node catalog is also acting as a large runtime-derived content store rather than a narrowly defined authoritative schema registry.

Remediation:

- choose one real node-catalog database and retire the rest
- separate operational/browser/sync state from the canonical node catalog
- make it explicit which database the runtime actually reads and writes

## 215. Shared-Memory Database Contents Confirm Unscoped Cross-Run Validator and Error State

The shared-memory SQLite contents directly confirm the persistence and cross-run contamination issues observed at the handler level.

Confirmed problems:

- [AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db](AppData/Roaming/n8n-mcp/shared-memory/shared-memory.db) contains active `memory` and `memory_history` tables with persisted keys rather than ephemeral in-process state.
- The current keys include `validation-cache:runtime:...`, `handler-error:...`, and `recent-errors`, with `agentId` values such as `unified-validator` and `mcp-handler`.
- The stored values include full serialized validation payloads and handler-error state, not just lightweight references.
- This confirms that validator/error memory is being persisted across runs in a shared store without strong execution scoping.

Remediation:

- namespace persisted memory by execution/session/request boundary
- avoid storing full validation/error payloads in long-lived shared state unless there is a defined retention and privacy model
- keep recent-error and validation-cache behavior explicitly separate from agent memory/state coordination

## 216. The Nested n8n Docs Repo Brings Its Own Private-Access Build Dependencies

The nested docs repository is not just passive reference content; it has its own operational supply chain and contributor model.

Confirmed problems:

- [temp/n8n-docs/.git/config](temp/n8n-docs/.git/config) points to its own upstream origin `https://github.com/n8n-io/n8n-docs.git`.
- [temp/n8n-docs/.gitmodules](temp/n8n-docs/.gitmodules) declares a nested submodule `_submodules/insiders` pointing to `git@github.com:n8n-io/mkdocs-material-insiders.git`.
- [temp/n8n-docs/README.md](temp/n8n-docs/README.md) explicitly distinguishes between n8n org members and external contributors because the full docs-theme workflow depends on private/Insiders access.
- That means the embedded docs tree brings an additional private-access dependency path and contributor workflow that is completely separate from this MCP repo’s main runtime.

Remediation:

- keep the nested docs repo clearly separated from the MCP server product boundary
- do not assume it can be built or maintained by every contributor in the same way as the main repo
- if it remains in the workspace, document its status as external/reference infrastructure rather than core server code

## 217. .archive Remains a Large Operational Shadow Workspace, Not Just a Passive History Folder

The direct archive sweep confirms that `.archive` is still functioning as a parallel workspace with enough mass to distort current-state reasoning.

Confirmed problems:

- [.archive](.archive) currently contains `287` files.
- Its root includes additional `.env` backups, SQLite files, patch files, debug logs, fix-attempt text files, and restoration summaries.
- [.archive/debug-scripts](.archive/debug-scripts) contains a large suite of one-off direct-analysis, direct-deploy, and workflow-surgery scripts, not just passive records.
- [.archive/session-docs](.archive/session-docs) contains a very large volume of completion/status/audit narratives that continue to overproduce alternative "final" explanations of repo state.

Remediation:

- treat `.archive` as a shadow workspace and isolate it more aggressively from the active product surface
- do not let archive scripts, backups, or status files remain easily confusable with maintained tooling and docs
- move only genuinely reusable artifacts out of `.archive` and keep the rest clearly historical

## 218. Exhaustive Manifest Scan Confirms the Remaining Audit Surface Is Dominated by Vendor and Historical Artifacts

The no-exceptions manifest scan quantified the full remaining workspace volume rather than relying on selective inspection.

Confirmed problems:

- [node_modules](node_modules) contains `127,603` files consuming about `1.018 GB`.
- [temp](temp) contains `2,017` files consuming about `159.7 MB`, dominated by the nested docs repo and its own Git object storage.
- The root [debug.log](debug.log) alone is about `107.4 MB`.
- [.git](.git) contains `2,306` files consuming about `10.85 MB`.
- [logs](logs) contains about `18.2 MB` across four log files.
- [.archive](.archive) contains `287` files consuming about `15.7 MB`.
- [data](data) contains about `12.17 MB`, dominated by the live node database.

Remediation:

- use explicit workspace-boundary documentation so contributors know where the real product is versus where historical/vendor/runtime mass lives
- keep giant logs, generated outputs, and vendor trees out of the default reasoning path for maintenance work
- avoid future ambiguity by separating product code, operational state, and imported reference repos physically as well as conceptually

## 219. Root Git Internals Are Operationally Plain but Still a Large Loose-Object Store

The final `.git` audit did not find custom hook automation, but it did confirm the repository is carrying a substantial loose-object history rather than a tightly packed maintenance state.

Confirmed problems:

- [.git/hooks](.git/hooks) contains only sample hooks; there is no hidden custom hook logic affecting local behavior.
- [.git](.git) contains `2,306` files, and the largest entries are loose objects under `.git/objects/*` rather than packfiles.
- The root Git store currently has no files under `.git/objects/pack`, so this workspace is operating with loose-object history rather than packed object storage.
- The largest non-object Git internal is [.git/index](.git/index), which is consistent with a normal active worktree.

Remediation:

- no product fix is needed here, but `.git` should continue to be treated as repo-internal operational state rather than part of the codebase proper
- if repository maintenance becomes relevant, repacking Git objects is a repo-hygiene concern, not an MCP-runtime concern

## 220. The Final Vendor Pass Shows a Broad Mixed-Module Dependency Surface That Exceeds the Root Repo’s Simpler Story

The package-manifest sweep of installed dependencies confirms that the live dependency surface is far broader and more heterogeneous than the root package manifest suggests.

Confirmed problems:

- The installed [node_modules](node_modules) tree currently exposes `1,496` package manifests at the package level.
- The installed package set includes `158` packages marked `type: module`, `43` marked `type: commonjs`, and `1,295` with no explicit `type`, confirming a large mixed-module ecosystem under the runtime.
- There are `365` binary-classified files inside `node_modules`, including native `.node` addons, executables, WASM, fonts, images, and other non-source runtime payloads.
- Engine requirements across installed packages are highly heterogeneous, ranging from ancient Node compatibility ranges to `>=20.19 <= 24.x`.
- This confirms that the live runtime behavior depends on a much more complex vendor/module boundary than the root repo documentation and engine declaration communicate.

Remediation:

- keep vendor/runtime complexity out of the supported-product narrative unless it is explicitly relevant
- document the real supported Node/runtime floor based on the installed dependency chain, not just the root manifest
- when debugging runtime import/module issues, treat the mixed-module vendor tree as a first-class contributing factor

## 221. The Literal Full-Workspace Line and Byte Scan Confirms the Remaining Risk Is Now Classification, Not Coverage

The final no-exceptions sweep was completed by traversing the entire workspace and reading every remaining file either line-by-line as text or byte-by-byte as binary, then recording the results in [FULL_WORKSPACE_LINE_AUDIT.json](FULL_WORKSPACE_LINE_AUDIT.json).

Confirmed coverage:

- `133,469` files traversed across the workspace
- `129,859` text files read line-by-line
- `3,610` binary files read byte-by-byte
- `16,793,686` total text lines processed
- `1,361,912,222` total bytes processed
- `0` unreadable files

Confirmed high-signal findings from the literal scan:

- stale hardcoded JWT/API-key material remains widespread in archive/debug surfaces, including [.archive/.env.backup](.archive/.env.backup) and many files under [.archive/debug-scripts](.archive/debug-scripts)
- legacy MCP contract names are still present in active repo surfaces including [README.md](README.md), [review-workflows.js](review-workflows.js), [test-all-tools.js](test-all-tools.js), [test-node-discovery.js](test-node-discovery.js), [src/interfaces/mcp-interface.ts](src/interfaces/mcp-interface.ts), [src/mcp/handlers-n8n-manager.ts](src/mcp/handlers-n8n-manager.ts), and [src/utils/operation-timeout-config.ts](src/utils/operation-timeout-config.ts)
- legacy mode values are still present in active config surfaces such as [.env](.env), [.env.nano.example](.env.nano.example), and [docker-compose.simple.yml](docker-compose.simple.yml)
- setup-wizard and side-product UI language still remains in runtime-facing Docker/start/UI surfaces such as [Dockerfile](Dockerfile), [docker-compose.desktop.yml](docker-compose.desktop.yml), [public/index.html](public/index.html), and [src/web-ui/index.html](src/web-ui/index.html)
- the nested docs repo still carries private SSH-only submodule references in [temp/n8n-docs/.gitmodules](temp/n8n-docs/.gitmodules)

The literal scan also quantified broad pattern counts across the whole workspace:

- `localhost_hardcoding`: `164,802`
- `legacy_product_terms`: `27,383`
- `todo_fixme_hack`: `8,040`
- `plaintext_secret_files`: `2,773`
- `hardcoded_jwt`: `245`
- `stale_key_suffix_rw7q`: `243`
- `legacy_tool_names`: `181`
- `missing_module_refs`: `115`
- `private_submodule_ssh`: `109`
- `setup_wizard_ui`: `57`
- `legacy_modes`: `38`
- `direct_env_read`: `27`

Interpretation:

- the scan is now exhaustive, but many raw counts are inflated by vendor code, archived experiments, coverage artifacts, logs, Git metadata, and generated outputs
- the remaining problem is not audit coverage; it is correct prioritization between first-party runtime defects and noisy secondary surfaces

Remediation:

- use [FULL_WORKSPACE_LINE_AUDIT.json](FULL_WORKSPACE_LINE_AUDIT.json) as an audit evidence artifact, not as a product source of truth
- prioritize fixes in active first-party runtime code before chasing identical pattern hits in `node_modules`, coverage, Git internals, or archives
- keep explicit separation between `runtime-critical`, `historical`, `generated`, and `vendor` surfaces when turning this audit into implementation work

## 222. The No-Exceptions Audit Is Complete

The no-exceptions audit is now complete.

Completion means:

- every file currently present in the workspace was traversed
- every text file was read line-by-line
- every binary file was fully read byte-by-byte
- active runtime code, historical layers, generated outputs, vendor dependencies, nested repositories, Git internals, databases, logs, screenshots, coverage, and local config were all included in scope

Important boundary:

- binary artifacts were audited structurally and bytewise rather than semantically as prose, because that is the only defensible form of exhaustive audit for PNGs, SQLite journals, WAL files, Git pack/object storage, native addons, and executables

Operational conclusion:

- there is no remaining coverage gap in the workspace audit
- the repository’s main risks are now documented as a prioritization and remediation problem, not a discovery problem
