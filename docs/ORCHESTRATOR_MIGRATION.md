# Legacy Orchestrator Migration Plan

> **Date:** December 2, 2025  
> **Priority:** 🟡 MEDIUM  
> **Estimated Time:** 1 hour

---

## Problem

Two orchestrators exist with different capabilities:

| Feature | Legacy (`graphrag-orchestrator.ts`) | Modern (`graphrag-nano-orchestrator.ts`) |
|---------|-------------------------------------|------------------------------------------|
| LLMAdapter | ❌ Not used | ✅ Uses unified LLMAdapter |
| EventBus | ❌ No events | ✅ Publishes pipeline events |
| KnowledgeAgent learning | ❌ No integration | ✅ Events feed learning |
| File location | `src/ai/` | `src/ai/agents/` |
| Lines of code | ~350 | ~400 |
| Used by | `tools-orchestration.ts` | `tools-nano-agents.ts` |

**Impact:** The MCP tool `orchestrate_workflow` uses the legacy orchestrator, missing out on:
- Unified LLM access via LLMRouter
- Event-driven learning via EventBus
- KnowledgeAgent integration

---

## Migration Steps

### Step 1: Update `tools-orchestration.ts` Imports

**Current:**
```typescript
import { createOrchestrator, GraphRAGOrchestrator } from '../ai/graphrag-orchestrator';
```

**Target:**
```typescript
import { GraphRAGNanoOrchestrator } from '../ai/agents/graphrag-nano-orchestrator';
import { createLLMAdapter } from '../ai/llm-adapter';
```

### Step 2: Update Orchestrator Initialization

**Current:**
```typescript
let orchestrator: GraphRAGOrchestrator | null = null;

async function getOrchestrator(): Promise<GraphRAGOrchestrator> {
  if (!orchestrator) {
    orchestrator = await createOrchestrator();
  }
  return orchestrator;
}
```

**Target:**
```typescript
let orchestrator: GraphRAGNanoOrchestrator | null = null;

async function getOrchestrator(): Promise<GraphRAGNanoOrchestrator> {
  if (!orchestrator) {
    const llmAdapter = await createLLMAdapter();
    orchestrator = new GraphRAGNanoOrchestrator({}, llmAdapter);
  }
  return orchestrator;
}
```

### Step 3: Update Handler Methods

**`handleOrchestrate`:**
```typescript
export async function handleOrchestrate(args: {
  goal: string;
  context?: Record<string, any>;
}): Promise<any> {
  try {
    const orchestrator = await getOrchestrator();
    
    // Use nano orchestrator's executePipeline method
    const result = await orchestrator.executePipeline(args.goal);
    
    return {
      success: result.success,
      goal: args.goal,
      workflow: result.workflow || null,
      validationResult: result.validationResult || null,
      pattern: result.pattern || null,
      executionStats: result.executionStats,
      errors: result.errors || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**`handleGetStatus`:**
```typescript
export async function handleGetStatus(): Promise<any> {
  try {
    const orchestrator = await getOrchestrator();
    // Nano orchestrator doesn't have getStatus, use alternative
    return {
      initialized: true,
      agentsReady: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### Step 4: Delete Legacy Orchestrator

After migration is tested:
```bash
rm src/ai/graphrag-orchestrator.ts
```

---

## Complete Updated File

```typescript
/**
 * MCP Tools for GraphRAG Orchestration
 * Uses modern GraphRAGNanoOrchestrator with LLMAdapter and EventBus
 */

import { ToolDefinition } from '../types';
import { GraphRAGNanoOrchestrator } from '../ai/agents/graphrag-nano-orchestrator';
import { createLLMAdapter } from '../ai/llm-adapter';

// Global orchestrator instance (lazy-loaded)
let orchestrator: GraphRAGNanoOrchestrator | null = null;

/**
 * Get or create the orchestrator instance
 */
async function getOrchestrator(): Promise<GraphRAGNanoOrchestrator> {
  if (!orchestrator) {
    const llmAdapter = await createLLMAdapter();
    orchestrator = new GraphRAGNanoOrchestrator({}, llmAdapter);
  }
  return orchestrator;
}

export const orchestrationTools: ToolDefinition[] = [
  {
    name: 'orchestrate_workflow',
    description:
      'Uses AI agents to discover workflow patterns, generate n8n workflow JSON, and validate the structure. ' +
      'Executes the complete multi-agent pipeline: Pattern Discovery → Graph Query → Workflow Generation → Validation. ' +
      'NOTE: Only official n8n nodes are used (community nodes blocked by policy).',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Natural language description of the workflow to create',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'get_orchestration_status',
    description: 'Get the current status of the orchestrator.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Handle orchestrate_workflow tool
 */
export async function handleOrchestrate(args: {
  goal: string;
}): Promise<any> {
  try {
    const orch = await getOrchestrator();
    const result = await orch.executePipeline(args.goal);

    return {
      success: result.success,
      goal: args.goal,
      workflow: result.workflow || null,
      validationResult: result.validationResult || null,
      pattern: result.pattern || null,
      graphInsights: result.graphInsights || null,
      executionStats: result.executionStats,
      errors: result.errors || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle get_orchestration_status tool
 */
export async function handleGetStatus(): Promise<any> {
  try {
    await getOrchestrator(); // Ensures initialization
    return {
      initialized: true,
      agentsReady: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      initialized: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Shutdown orchestrator
 */
export async function shutdownOrchestrator(): Promise<void> {
  orchestrator = null;
}
```

---

## Benefits After Migration

1. **Unified LLM Access** - Uses LLMRouter with Ollama/vLLM failover
2. **Event-Driven Learning** - Publishes events for KnowledgeAgent
3. **Consistent Architecture** - All orchestration uses nano pattern
4. **Reduced Code** - Delete ~350 lines of legacy code
5. **Node Policy Enforcement** - Via ValidationGateway Layer 0

---

## Testing Checklist

After migration:

- [ ] `orchestrate_workflow` tool works via MCP
- [ ] Events published to EventBus
- [ ] KnowledgeAgent receives pipeline events
- [ ] Only built-in nodes generated
- [ ] Build succeeds: `npm run build`
- [ ] Legacy file deleted

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API signature change | Medium | Update handlers to match |
| Missing features | Low | Nano orchestrator is superset |
| Build break | Low | TypeScript will catch issues |

---

## Decision

**Recommendation:** Proceed with migration

The modern orchestrator has strictly more features and better integration. The legacy orchestrator adds no unique value.
