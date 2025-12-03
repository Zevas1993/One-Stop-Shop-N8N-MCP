# Integration Plan: LLMRouter + Agent Framework + Built-in Nodes Restriction

**Version:** 2.0  
**Date:** December 2, 2025  
**Status:** ✅ COMPLETE  

---

## Table of Contents

1. [Overview](#overview)
2. [Task 1: Wire LLMRouter to Agent Framework](#task-1-wire-llmrouter-to-agent-framework)
3. [Task 2: Connect EventBus to Orchestrator](#task-2-connect-eventbus-to-orchestrator)
4. [Task 3: Integrate KnowledgeAgent with GraphRAG](#task-3-integrate-knowledgeagent-with-graphrag)
5. [Task 4: Restrict to Built-in Nodes Only](#task-4-restrict-to-built-in-nodes-only)
6. [Task 5: Update Initialization Flow](#task-5-update-initialization-flow)
7. [Validation Logic Flow](#validation-logic-flow)
8. [Implementation Order](#implementation-order)
9. [Testing Checklist](#testing-checklist)

---

## Overview

This document outlines the integration plan for connecting the LLMRouter to the existing agent framework, enabling event-driven learning, and implementing a critical security feature that restricts external agents to built-in n8n nodes only.

### Task Summary

| Task | Files Affected | Complexity | Status |
|------|---------------|------------|--------|
| 1. Wire LLMRouter to Agents | 3 files | Medium | ✅ Complete |
| 2. Connect EventBus to Orchestrator | 2 files | Low | ✅ Complete |
| 3. Integrate KnowledgeAgent | 2 files | Low | ✅ Complete |
| 4. Restrict to Built-in Nodes Only | 5 files | Medium | ✅ Complete |
| 5. Update Initialization | 2 files | Low | ✅ Complete |
| 6. MCP Tool Filtering | 1 file | Low | ✅ Complete |
| 7. Node Alternatives System | 2 files | Low | ✅ Complete |

### Goals (All Achieved)

- ✅ Unified LLM access through LLMRouter (Ollama primary, vLLM fallback)
- ✅ Event-driven architecture for agent communication
- ✅ Autonomous learning from workflow patterns
- ✅ **Security: 4-layer protection against community nodes**
- ✅ MCP tool filtering (agents can't discover blocked nodes)
- ✅ Intelligent alternative suggestions when nodes are blocked

---

## Task 1: Wire LLMRouter to Agent Framework

### Problem Statement

Agents currently use `VLLMClient` directly. We need unified LLM access via `LLMRouter` to enable:
- Automatic backend selection (Ollama vs vLLM)
- Hardware-aware model selection
- Graceful fallback when backends unavailable

### Files to Create/Modify

#### 1.1 Create LLM Adapter (NEW FILE)

**File:** `src/ai/llm-adapter.ts`

**Purpose:** Wrap LLMRouter to match VLLMClient interface for backward compatibility with existing agents.

```typescript
// Exports:
export function createLLMAdapter(): LLMAdapterInterface;

// Interface matches VLLMClient for drop-in replacement:
interface LLMAdapterInterface {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isAvailable(): boolean;
}

// Internal implementation uses LLMRouter:
// - getLLMRouter() for actual LLM calls
// - Translates between interfaces
// - Handles errors gracefully
```

#### 1.2 Update Base Agent

**File:** `src/ai/agents/base-agent.ts`

**Changes:**
- Replace `VLLMClient` import with `LLMAdapter` import
- Update constructor signature to accept `LLMAdapter`
- Keep same method signatures for backward compatibility
- Adapter handles translation internally

```typescript
// Before:
import { VLLMClient } from '../vllm-client';

// After:
import { LLMAdapterInterface, createLLMAdapter } from '../llm-adapter';
```

#### 1.3 Update GraphRAG Orchestrator

**File:** `src/ai/agents/graphrag-nano-orchestrator.ts`

**Changes:**
- Import `getLLMRouter` from `'../llm-router'`
- Import `createLLMAdapter` from `'../llm-adapter'`
- Create adapter from LLMRouter in constructor
- Pass adapter to all agent constructors

```typescript
constructor(config?: Partial<NanoAgentPipelineConfig>) {
  // Create unified LLM adapter
  const llmAdapter = createLLMAdapter();
  
  // Pass to all agents
  this.patternAgent = new PatternAgent(this.sharedMemory, llmAdapter);
  this.workflowAgent = new WorkflowAgent(this.sharedMemory, llmAdapter);
  this.validatorAgent = new ValidatorAgent(this.sharedMemory, llmAdapter);
}
```

---

## Task 2: Connect EventBus to Orchestrator

### Problem Statement

The orchestrator runs pipelines but doesn't publish events for learning. Other components can't observe or react to pipeline execution.

### Files to Modify

#### 2.1 Update GraphRAG Orchestrator

**File:** `src/ai/agents/graphrag-nano-orchestrator.ts`

**Changes:**

```typescript
// Add imports
import { getEventBus, EventTypes } from '../event-bus';

// Add property
private eventBus: EventBus;

// In initialize()
this.eventBus = getEventBus();
```

**Events to Publish:**

| Event Point | Event Type | Payload |
|-------------|------------|---------|
| Pipeline started | `system:pipeline_started` | `{ pipelineId, goal, timestamp }` |
| Pattern discovered | `pattern:discovered` | `{ pipelineId, pattern, confidence }` |
| Graph queried | `pattern:graph_queried` | `{ pipelineId, query, results }` |
| Workflow generated | `workflow:created` | `{ pipelineId, workflow, nodes }` |
| Validation passed | `validation:completed` | `{ pipelineId, result, layers }` |
| Validation failed | `validation:failed` | `{ pipelineId, errors, failedLayer }` |
| Pipeline complete | `workflow:pipeline_complete` | `{ pipelineId, success, timing }` |

**Event Payload Structure:**

```typescript
interface PipelineEvent {
  pipelineId: string;
  goal: string;
  stage: string;
  result: any;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
  success: boolean;
}
```

---

## Task 3: Integrate KnowledgeAgent with GraphRAG

### Problem Statement

KnowledgeAgent exists but isn't wired to learn from orchestrator execution.

### Files to Modify

#### 3.1 Update AI Index

**File:** `src/ai/index.ts`

**Changes:**
- Ensure KnowledgeAgent initializes AFTER EventBus
- Add subscription setup for orchestrator events
- Export `getKnowledgeAgent` for other modules

**Initialization Order:**

```
1. SharedMemory (SQLite key-value store)
2. EventBus (pub/sub system)
3. LLMRouter (Ollama → vLLM fallback)
4. KnowledgeAgent (subscribes to EventBus)
5. Publish SYSTEM_STARTED event
```

#### 3.2 Update Knowledge Agent

**File:** `src/ai/knowledge-agent.ts`

**Changes:**
- Add subscription to `pattern:*` events
- Add subscription to `workflow:pipeline_complete` events
- Extract patterns from successful pipelines
- Store node combinations that work
- Track failure patterns for debugging

```typescript
// In initialize():
this.eventBus.subscribe('pattern:discovered', this.handlePatternDiscovered.bind(this));
this.eventBus.subscribe('workflow:pipeline_complete', this.handlePipelineComplete.bind(this));
this.eventBus.subscribe('validation:failed', this.handleValidationFailed.bind(this));
```

---

## Task 4: Restrict to Built-in Nodes Only

### Problem Statement

External agents can currently use community nodes which may not exist on all n8n instances. This creates:
- Workflow failures when community nodes aren't installed
- Security risks from untrusted community packages
- Inconsistent behavior across environments

### Strategy

| Node Type | Prefix | Status |
|-----------|--------|--------|
| Built-in Core | `n8n-nodes-base.*` | ✅ ALLOWED |
| Built-in AI | `@n8n/n8n-nodes-langchain.*` | ✅ ALLOWED |
| Community | Everything else | ❌ BLOCKED |

### Files to Create/Modify

#### 4.1 Create Node Filter (NEW FILE)

**File:** `src/core/node-filter.ts`

```typescript
/**
 * Node Filter - Centralized node allowlist logic
 * 
 * Determines which nodes external agents can use.
 * Default: Only built-in n8n nodes allowed.
 */

// Built-in node prefixes (always allowed)
export const BUILT_IN_PREFIXES = [
  'n8n-nodes-base.',
  '@n8n/n8n-nodes-langchain.'
];

// Configuration interface
export interface NodeFilterConfig {
  allowCommunityNodes: boolean;        // from env: ALLOW_COMMUNITY_NODES
  allowedCommunityPackages?: string[]; // whitelist specific packages
}

// Exports
export function isBuiltInNode(nodeType: string): boolean;
export function isAllowedNode(nodeType: string, config: NodeFilterConfig): boolean;
export function filterNodes(nodes: NodeTypeInfo[], config: NodeFilterConfig): NodeTypeInfo[];
export function getBlockedNodeMessage(nodeType: string): string;
export function suggestAlternatives(nodeType: string): string[];
```

**Implementation Logic:**

```typescript
export function isBuiltInNode(nodeType: string): boolean {
  return BUILT_IN_PREFIXES.some(prefix => nodeType.startsWith(prefix));
}

export function isAllowedNode(nodeType: string, config: NodeFilterConfig): boolean {
  // Built-in nodes always allowed
  if (isBuiltInNode(nodeType)) {
    return true;
  }
  
  // Community nodes only if explicitly enabled
  if (config.allowCommunityNodes) {
    // Check whitelist if provided
    if (config.allowedCommunityPackages?.length) {
      return config.allowedCommunityPackages.some(pkg => 
        nodeType.startsWith(pkg)
      );
    }
    return true; // All community nodes allowed
  }
  
  return false; // Community nodes blocked
}
```

#### 4.2 Update Node Catalog

**File:** `src/core/node-catalog.ts`

**Changes:**

```typescript
// Add import
import { isBuiltInNode, isAllowedNode, filterNodes, NodeFilterConfig } from './node-filter';

// Add config property
private filterConfig: NodeFilterConfig;

// In constructor
this.filterConfig = {
  allowCommunityNodes: process.env.ALLOW_COMMUNITY_NODES === 'true',
  allowedCommunityPackages: process.env.COMMUNITY_NODE_WHITELIST?.split(',')
};
```

**Update Methods:**

| Method | Change |
|--------|--------|
| `getNode(type)` | Return `null` if not allowed |
| `searchNodes(query)` | Filter results to allowed only |
| `getAllNodes()` | Filter to allowed only |
| `hasNode(type)` | Check allowlist status |

**Add New Methods:**

```typescript
isNodeAllowed(nodeType: string): boolean {
  return isAllowedNode(nodeType, this.filterConfig);
}

getBlockedNodeMessage(nodeType: string): string {
  return `Node '${nodeType}' is a community node and is not allowed. ` +
    `Only built-in n8n nodes (n8n-nodes-base.*, @n8n/n8n-nodes-langchain.*) are permitted. ` +
    `Set ALLOW_COMMUNITY_NODES=true to enable community nodes.`;
}
```

#### 4.3 Update Validation Gateway

**File:** `src/core/validation-gateway.ts`

**Changes:**

Add **Layer 0** - Node Allowlist Check (runs FIRST, before all other validation):

```typescript
// New validation layer
private async validateNodeAllowlist(workflow: any): Promise<LayerResult> {
  const blockedNodes: string[] = [];
  
  for (const node of workflow.nodes || []) {
    if (!this.nodeCatalog.isNodeAllowed(node.type)) {
      blockedNodes.push(node.type);
    }
  }
  
  if (blockedNodes.length > 0) {
    return {
      passed: false,
      layer: 0,
      layerName: 'Node Allowlist',
      errors: [{
        code: 'COMMUNITY_NODE_BLOCKED',
        message: `Workflow contains ${blockedNodes.length} blocked community node(s)`,
        blockedNodes,
        suggestion: 'Replace with built-in alternatives or enable ALLOW_COMMUNITY_NODES=true'
      }]
    };
  }
  
  return { passed: true, layer: 0, layerName: 'Node Allowlist' };
}
```

**Update ValidationResult Interface:**

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  passedLayers: number[];
  failedLayer?: number;
  // NEW FIELDS:
  blockedNodes?: string[];
  allowlistViolation?: boolean;
}
```

#### 4.4 Update MCP Server

**File:** `src/mcp/server-modern.ts`

**Changes in `workflow_manager` tool:**

```typescript
// Before any create/update:
case 'create':
case 'update':
  // Pre-check for blocked nodes
  const allowlistCheck = await this.validateNodeAllowlist(workflow);
  if (!allowlistCheck.passed) {
    return this.formatResponse({
      success: false,
      error: 'Workflow contains blocked community nodes',
      blockedNodes: allowlistCheck.blockedNodes,
      suggestion: allowlistCheck.suggestion
    });
  }
  // Continue with normal flow...
```

**Changes in `node_discovery` tool:**

```typescript
// Filter search results
case 'search':
  const results = await this.toolService.searchNodes(query, limit);
  // Mark each result with allowlist status
  const annotatedResults = results.map(node => ({
    ...node,
    isBuiltIn: isBuiltInNode(node.type),
    allowed: this.nodeCatalog.isNodeAllowed(node.type)
  }));
  return this.formatResponse(annotatedResults);
```

**Add New Tool Action:**

```typescript
// New action: check_node_allowed
case 'check_allowed':
  if (!nodeType) throw new Error('nodeType required');
  const allowed = this.nodeCatalog.isNodeAllowed(nodeType);
  return this.formatResponse({
    nodeType,
    allowed,
    isBuiltIn: isBuiltInNode(nodeType),
    reason: allowed ? 'Node is built-in' : 'Community node blocked',
    alternatives: allowed ? [] : suggestAlternatives(nodeType)
  });
```

#### 4.5 Update Environment Example

**File:** `.env.example`

```bash
# =============================================================================
# NODE RESTRICTIONS
# =============================================================================

# Allow community nodes (default: false for security)
# When false, only n8n-nodes-base.* and @n8n/n8n-nodes-langchain.* are allowed
ALLOW_COMMUNITY_NODES=false

# Whitelist specific community packages (comma-separated)
# Only used when ALLOW_COMMUNITY_NODES=true
# Example: COMMUNITY_NODE_WHITELIST=n8n-nodes-custom,@company/n8n-nodes-internal
# COMMUNITY_NODE_WHITELIST=
```

---

## Task 5: Update Initialization Flow

### Files to Modify

#### 5.1 Update Main Entry Point

**File:** `src/main.ts`

**Startup Sequence:**

```typescript
async function main() {
  console.log('n8n MCP Server v3.0.0 starting...');
  
  // 1. Load environment
  dotenv.config();
  
  // 2. Initialize AI system (non-blocking if Ollama unavailable)
  console.log('Initializing AI system...');
  const aiStatus = await initAISystem().catch(err => {
    console.warn('AI system unavailable:', err.message);
    return { initialized: false };
  });
  
  // 3. Initialize core (n8n connection, validation, catalog)
  console.log('Initializing core...');
  await initCore();
  
  // 4. Wire LLMRouter to ValidationGateway
  if (aiStatus.initialized) {
    const gateway = getValidationGateway();
    const router = getLLMRouter();
    gateway.setLLMBrain({
      analyzeWorkflowLogic: async (workflow) => {
        const prompt = `Analyze this workflow for logical issues: ${JSON.stringify(workflow)}`;
        const response = await router.generate(prompt);
        return parseAnalysisResponse(response);
      }
    });
  }
  
  // 5. Log node restriction status
  const allowCommunity = process.env.ALLOW_COMMUNITY_NODES === 'true';
  console.log(`Node restrictions: ${allowCommunity ? 'Community nodes ALLOWED' : 'Built-in nodes ONLY'}`);
  
  // 6. Start interface (MCP or HTTP)
  if (process.env.MCP_MODE === 'http') {
    await startHttpServer();
  } else {
    await startMCPInterface();
  }
}
```

#### 5.2 Update MCP Index

**File:** `src/mcp/index.ts`

**Changes:**

```typescript
import { initAISystem, getAISystemStatus } from '../ai';

async function main() {
  // Initialize AI system before server
  try {
    await initAISystem();
    console.error('[DEBUG] AI system initialized');
  } catch (error) {
    console.error('[DEBUG] AI system unavailable, continuing without LLM support');
  }
  
  // Log node restriction policy
  const allowCommunity = process.env.ALLOW_COMMUNITY_NODES === 'true';
  console.error(`[DEBUG] Node policy: ${allowCommunity ? 'All nodes' : 'Built-in only'}`);
  
  // Start server
  const { createUnifiedMCPServer } = await import('./server-modern');
  const server = await createUnifiedMCPServer();
  await server.run();
}
```

---

## Validation Logic Flow

After implementing these changes, the validation pipeline will be:

```
                    Workflow Submitted
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 0: Node        │ ◄── NEW: First check
              │   Allowlist Check      │
              │                        │
              │   - Extract all nodes  │
              │   - Check each against │
              │     allowlist          │
              │   - Block if ANY       │
              │     community node     │
              └────────────────────────┘
                           │
                    Pass   │   Fail
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
              ┌───────────┐  ┌─────────────────────────────┐
              │ Continue  │  │ REJECT with error:          │
              │ to        │  │ "Community node blocked"    │
              │ Layer 1   │  │ + list of blocked nodes     │
              └───────────┘  │ + suggested alternatives    │
                    │        └─────────────────────────────┘
                    ▼
              ┌────────────────────────┐
              │   LAYER 1: Schema      │
              │   Validation (Zod)     │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 2: Node        │
              │   Existence Check      │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 3: Connection  │
              │   Integrity            │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 4: Credential  │
              │   Check                │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 5: LLM         │
              │   Semantic Check       │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   LAYER 6: n8n         │
              │   Dry-Run Test         │
              └────────────────────────┘
                           │
                           ▼
                  ✅ WORKFLOW APPROVED
```

---

## Built-in Node Detection

### Examples

| Node Type | Built-in? | Allowed? |
|-----------|-----------|----------|
| `n8n-nodes-base.httpRequest` | ✅ Yes | ✅ Yes |
| `n8n-nodes-base.slack` | ✅ Yes | ✅ Yes |
| `n8n-nodes-base.code` | ✅ Yes | ✅ Yes |
| `n8n-nodes-base.webhook` | ✅ Yes | ✅ Yes |
| `@n8n/n8n-nodes-langchain.agent` | ✅ Yes | ✅ Yes |
| `@n8n/n8n-nodes-langchain.chainLlm` | ✅ Yes | ✅ Yes |
| `n8n-nodes-custom.myNode` | ❌ No | ❌ Blocked |
| `@company/n8n-nodes-internal.api` | ❌ No | ❌ Blocked |
| `some-random-node` | ❌ No | ❌ Blocked |

### Error Response Format

When a workflow contains blocked community nodes:

```json
{
  "success": false,
  "error": "Workflow contains community nodes which are not allowed",
  "validation": {
    "valid": false,
    "failedLayer": 0,
    "layerName": "Node Allowlist",
    "allowlistViolation": true
  },
  "blockedNodes": [
    "n8n-nodes-custom.myNode",
    "@company/n8n-nodes-internal.api"
  ],
  "suggestion": "Replace with built-in alternatives or enable ALLOW_COMMUNITY_NODES=true",
  "builtInAlternatives": {
    "n8n-nodes-custom.myNode": [
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.code"
    ]
  }
}
```

---

## Implementation Order

| Step | Task | File | Dependencies |
|------|------|------|--------------|
| 1 | Create node filter | `src/core/node-filter.ts` | None |
| 2 | Update node catalog | `src/core/node-catalog.ts` | Step 1 |
| 3 | Update validation gateway | `src/core/validation-gateway.ts` | Step 2 |
| 4 | Create LLM adapter | `src/ai/llm-adapter.ts` | None |
| 5 | Update base agent | `src/ai/agents/base-agent.ts` | Step 4 |
| 6 | Update orchestrator | `src/ai/agents/graphrag-nano-orchestrator.ts` | Steps 4, 5 |
| 7 | Update knowledge agent | `src/ai/knowledge-agent.ts` | None |
| 8 | Update AI index | `src/ai/index.ts` | Steps 6, 7 |
| 9 | Update MCP server | `src/mcp/server-modern.ts` | Steps 2, 3 |
| 10 | Update main.ts | `src/main.ts` | All above |
| 11 | Update mcp/index.ts | `src/mcp/index.ts` | All above |
| 12 | Update .env.example | `.env.example` | None |
| 13 | Test full pipeline | - | All above |

---

## Testing Checklist

### Build

```bash
cd "C:\Users\Chris Boyd\Documents\MCP-Servers\One-Stop-Shop-N8N-MCP"
npm run build
```

### Test Node Filter

```bash
# Test 1: Create workflow with community node - should REJECT
curl -X POST http://localhost:3001/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Community Node",
    "nodes": [
      { "type": "n8n-nodes-custom.myNode", "name": "Custom" }
    ]
  }'
# Expected: 400 error with blockedNodes list

# Test 2: Create workflow with only built-in nodes - should PASS
curl -X POST http://localhost:3001/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Built-in Nodes",
    "nodes": [
      { "type": "n8n-nodes-base.webhook", "name": "Webhook" },
      { "type": "n8n-nodes-base.httpRequest", "name": "HTTP" }
    ]
  }'
# Expected: 200 success
```

### Test LLM Integration

```bash
# Test LLM generate
curl -X POST http://localhost:3001/api/llm/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is n8n?", "maxTokens": 100}'
# Expected: Generated text response
```

### Test Agent Pipeline

```bash
# Use execute_agent_pipeline via MCP tool
# Or via HTTP:
curl -X POST http://localhost:3001/api/agents/pipeline \
  -H "Content-Type: application/json" \
  -d '{"goal": "Send Slack message when webhook receives data"}'

# Verify:
# 1. Events published to EventBus
# 2. KnowledgeAgent learns from result
# 3. Only built-in nodes in generated workflow
```

### Test Node Discovery Filter

```bash
# Search nodes - should only return built-in
curl "http://localhost:3001/api/nodes/search?query=slack"
# Expected: Only n8n-nodes-base.slack, not any community Slack nodes

# Check specific node
curl "http://localhost:3001/api/nodes/check?type=n8n-nodes-custom.myNode"
# Expected: { "allowed": false, "reason": "Community node blocked" }
```

### Test with Environment Override

```bash
# Enable community nodes
$env:ALLOW_COMMUNITY_NODES = "true"
npm run start:http

# Now community nodes should be allowed
curl -X POST http://localhost:3001/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Community Node",
    "nodes": [
      { "type": "n8n-nodes-custom.myNode", "name": "Custom" }
    ]
  }'
# Expected: 200 success (when ALLOW_COMMUNITY_NODES=true)
```

---

## Appendix: File Inventory

### New Files to Create

| File | Purpose |
|------|---------|
| `src/core/node-filter.ts` | Centralized node allowlist logic |
| `src/ai/llm-adapter.ts` | VLLMClient-compatible wrapper for LLMRouter |

### Files to Modify

| File | Changes |
|------|---------|
| `src/core/node-catalog.ts` | Add allowlist filtering |
| `src/core/validation-gateway.ts` | Add Layer 0 allowlist check |
| `src/ai/agents/base-agent.ts` | Use LLM adapter |
| `src/ai/agents/graphrag-nano-orchestrator.ts` | Publish events, use adapter |
| `src/ai/knowledge-agent.ts` | Subscribe to events |
| `src/ai/index.ts` | Wire KnowledgeAgent to EventBus |
| `src/mcp/server-modern.ts` | Add allowlist checks to tools |
| `src/main.ts` | Update initialization sequence |
| `src/mcp/index.ts` | Add AI system init |
| `.env.example` | Add node restriction vars |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | December 2024 | Initial plan |
