# One-Stop-Shop-N8N-MCP — Issues & Fix Guide

> Compiled from live debugging of JARVIS v4 workflows · March 2026

---

## Executive Summary

During live application of JARVIS v4 workflow fixes, every attempt to update workflows through the One-Stop-Shop-N8N-MCP server failed. After examining the source code in `handlers-n8n-manager.ts` alongside the official n8n API specification (confirmed via the kapa.ai n8n docs MCP), the root causes were identified. This document details each issue, its technical explanation, and the exact code fix required.

---

## Issue Summary

| # | Issue | Severity |
|---|-------|----------|
| 1 | `workflow_manager update` — `changes` parameter silently ignored | 🔴 BLOCKER |
| 2 | `cleanWorkflowForUpdate` sends forbidden fields, triggering API rejection | 🔴 BLOCKER |
| 3 | `workflow_diff` operations schema undocumented and broken | 🟡 HIGH |
| 4 | No atomic `patch_workflow` tool — full workflow required every time | 🟡 HIGH |
| 5 | `updateWorkflowSchema` doesn't enforce required `name` field | 🟡 HIGH |
| 6 | Live validator runs against unclean payload, causing false rejections | 🟢 MEDIUM |

---

## Root Cause: The n8n API Contract

All issues ultimately trace back to a single hard constraint in the n8n Public API, confirmed by the official API specification retrieved from the kapa.ai MCP:

### `PUT /workflows/{id}` — Strict Schema

The request body is defined with **`additionalProperties: false`**. This means the API rejects the **entire request** if ANY field is present beyond the four allowed ones.

**Required fields (all four must be present every time):**
- `name` (string)
- `nodes` (array)
- `connections` (object)
- `settings` (object)

**Fields that cause instant rejection if included:**
- `id`
- `active`
- `createdAt` / `updatedAt`
- `versionId` / `activeVersionId` / `versionCounter`
- `tags` (read-only)
- `shared`
- `triggerCount`
- `isArchived`
- `meta`
- `pinData`

**Error returned:** `"request/body must NOT have additional properties"`

---

## Issue 1 — `workflow_manager update`: 'changes' Parameter Ignored

### What Happens

When calling `workflow_manager` with `action: "update"`, the tool accepts two top-level parameters: `id` and `changes`. However, the internal Zod validation schema is defined as a **flat object** expecting `name`, `nodes`, `connections`, and `settings` at the top level — not nested inside a `changes` key.

As a result, everything passed inside `changes` is **silently discarded**. The handler receives the `changes` key but the Zod schema has no `changes` field, so it parses successfully with everything stripped out.

### The Code

In `src/mcp/handlers-n8n-manager.ts`:

```typescript
// CURRENT — expects flat input, ignores 'changes' wrapper
const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});
```

When called as:
```
workflow_manager(action: "update", id: "abc123", changes: { name: "New Name" })
```

The `changes` key doesn't match anything in the schema — so `name` never reaches the handler.

### The Fix

```typescript
// FIXED — accept 'changes' wrapper, then merge with current workflow
const updateWorkflowSchema = z.object({
  id: z.string(),
  changes: z.object({
    name: z.string().optional(),
    nodes: z.array(z.any()).optional(),
    connections: z.record(z.any()).optional(),
    settings: z.any().optional(),
  }),
});

// In handleUpdateWorkflow:
const { id, changes } = updateWorkflowSchema.parse(args);
const current = await client.getWorkflow(id);
const payload = {
  name:        changes.name        ?? current.name,
  nodes:       changes.nodes       ?? current.nodes,
  connections: changes.connections ?? current.connections,
  settings:    changes.settings    ?? current.settings ?? {},
};
const workflow = await client.updateWorkflow(id, payload);
```

---

## Issue 2 — `cleanWorkflowForUpdate` Sends Forbidden Fields

### What Happens

The function `cleanWorkflowForUpdate` is supposed to strip read-only fields before the PUT request. However, it uses a **denylist** that doesn't include all fields that n8n rejects. The merged `fullWorkflow` object still contains `activeVersionId`, `versionCounter`, `isArchived`, `triggerCount`, and `shared` — all of which trigger the `additionalProperties` rejection.

### The Code

In `src/services/n8n-validation.ts`:

```typescript
// CURRENT — denylist approach, missing several fields
const systemFields = [
  "id", "createdAt", "updatedAt", "active", "tags",
  "versionId", "triggerCount", "shared", "isArchived"
];
// ❌ Missing: activeVersionId, versionCounter, meta, pinData
```

### The Fix

Switch from a **denylist** to an **allowlist** — only send what the API explicitly permits:

```typescript
export function cleanWorkflowForUpdate(workflow: any): any {
  return {
    name:        workflow.name,
    nodes:       workflow.nodes,
    connections: workflow.connections,
    settings:    workflow.settings ?? {},
    // Only include staticData if non-null
    ...(workflow.staticData != null && { staticData: workflow.staticData }),
  };
}
```

This approach is immune to new read-only fields being added by future n8n versions.

---

## Issue 3 — `workflow_diff` Operations Schema Broken

### What Happens

The `workflow_diff` tool exposes an `operations: array` parameter but the MCP tool definition doesn't document what shape the objects inside that array should be. Every attempt to use it returns either `"must NOT have additional properties"` or `"Invalid input"`.

### What Was Tried (All Failed)

```
{ "op": "update_node_parameter", "nodeName": "...", "parameterPath": "...", "value": "..." }
{ "type": "updateNode", "nodeName": "...", "changes": { "parameters.x": "..." } }
{ "type": "updateNode", "nodeName": "...", "changes": { "parameters": { "x": "..." } } }
```

### The Fix

Add a strongly-typed `discriminatedUnion` Zod schema and document the exact format in the tool description:

```typescript
const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('updateNode'),
    nodeName: z.string(),       // Exact node name as it appears in the workflow
    changes: z.record(z.any()), // Dot-notation paths supported: 'parameters.options.maxIterations'
  }),
  z.object({
    type: z.literal('addNode'),
    node: z.object({
      name: z.string(),
      type: z.string(),
      typeVersion: z.number(),
      position: z.tuple([z.number(), z.number()]),
      parameters: z.record(z.any()).optional(),
    }),
  }),
  z.object({
    type: z.literal('addConnection'),
    source: z.string(),  // Source node name
    target: z.string(),  // Target node name
    sourceIndex: z.number().optional(),
    targetIndex: z.number().optional(),
  }),
]);
```

The tool description shown to Claude must include a concrete example for each operation type.

---

## Issue 4 — No Atomic `patch_workflow` Tool

### What Happens

Every node parameter change — even a single value like `maxIterations` from 8 to 12 — requires:
1. Fetching the full workflow
2. Constructing the entire nodes array
3. Building the full connections object
4. Sending it all back

This is error-prone, token-expensive, and the primary reason updates fail: any mismatch in the manually-constructed payload triggers a rejection.

### The Fix

Add a new `patch_workflow` tool for targeted single-parameter changes:

```typescript
// Tool input
{
  id: string,              // Workflow ID
  nodeName: string,        // Exact node name, e.g. "Calendar Agent"
  parameterPath: string,   // Dot-notation path, e.g. "options.maxIterations"
  value: any               // New value to set
}

// Internal implementation
export async function handlePatchWorkflow(args: unknown): Promise<McpToolResponse> {
  const { id, nodeName, parameterPath, value } = patchSchema.parse(args);
  
  const wf = await client.getWorkflow(id);
  const node = wf.nodes.find(n => n.name === nodeName);
  if (!node) throw new Error(`Node '${nodeName}' not found in workflow`);
  
  setNestedValue(node, parameterPath, value); // dot-notation setter utility
  
  await client.updateWorkflow(id, {
    name:        wf.name,
    nodes:       wf.nodes,
    connections: wf.connections,
    settings:    wf.settings ?? {},
  });
  
  return { success: true, message: `Set ${nodeName}.${parameterPath} = ${JSON.stringify(value)}` };
}
```

Register this in `server-modern.ts` alongside the other workflow tools.

---

## Issue 5 — `updateWorkflowSchema` Doesn't Enforce Required `name`

### What Happens

The n8n API requires `name` in every PUT request. The current schema marks `name` as optional. When the handler skips fetching the current workflow, it's possible to send a PUT body missing `name`, which the API rejects with a confusing error.

### The Fix

Always fetch the current workflow at the start of `handleUpdateWorkflow`, regardless of what fields are being changed. This guarantees all four required fields are always present:

```typescript
export async function handleUpdateWorkflow(args, repository) {
  const { id, changes } = updateWorkflowSchema.parse(args);
  
  // ALWAYS fetch first — guarantees all 4 required fields are present
  const current = await client.getWorkflow(id);
  
  const payload = {
    name:        changes.name        ?? current.name,
    nodes:       changes.nodes       ?? current.nodes,
    connections: changes.connections ?? current.connections,
    settings:    changes.settings    ?? current.settings ?? {},
  };
  
  return client.updateWorkflow(id, payload);
}
```

---

## Issue 6 — Live Validator Runs Against Unclean Payload

### What Happens

`handleUpdateWorkflow` runs the live n8n validator against `fullWorkflow` **before** calling `cleanWorkflowForUpdate`. This means the validator sees the raw merged object with all the forbidden fields still present. If the validator rejects it, the error looks like a structural workflow problem rather than a field-stripping issue — making it very hard to diagnose.

### The Fix

Strip fields **before** validation, not after:

```typescript
// FIXED ORDER:
// 1. Merge changes onto current workflow
const merged = { ...current, ...changes };

// 2. Clean FIRST — strip all forbidden fields
const cleaned = cleanWorkflowForUpdate(merged);

// 3. THEN validate the cleaned payload
const liveResult = await liveValidator.validateWorkflow(cleaned);
if (!liveResult.valid) return errorResponse(liveResult.errors);

// 4. Send the already-cleaned payload (no second clean needed)
return client.updateWorkflow(id, cleaned);
```

---

## Implementation Plan

Apply fixes in this order to avoid interdependencies:

| Step | File | Change | Fixes |
|------|------|---------|-------|
| 1 | `src/services/n8n-validation.ts` | Rewrite `cleanWorkflowForUpdate` as allowlist | #2 |
| 2 | `src/mcp/handlers-n8n-manager.ts` | Rewrite `updateWorkflowSchema` + always GET current workflow | #1, #5 |
| 3 | `src/mcp/handlers-n8n-manager.ts` | Move `cleanWorkflowForUpdate` call before live validator | #6 |
| 4 | `src/mcp/handlers-workflow-diff.ts` | Add `discriminatedUnion` schema + update tool description | #3 |
| 5 | `handlers-n8n-manager.ts` + `server-modern.ts` | Add `patch_workflow` tool + register in MCP server | #4 |

After applying all steps, rebuild with `npm run build` and restart the MCP server.

Steps 1–3 are the **critical blockers**. Steps 4–5 are quality-of-life improvements that make future workflow edits reliable and fast.

---

*Document prepared: March 2026 · Based on live debugging of JARVIS v4 email automation system*
