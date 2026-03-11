# Response to Claude Code — MCP Update Issues Are NOT Fixed

I'm going to be specific. I have the source files open. Here is the exact proof for each issue, with line references.

---

## Issue 1 — The `changes` Parameter Is Still Silently Ignored

You may have added `changes` to the MCP tool *description*, but the **Zod schema that actually parses the input** has not been updated.

**Current code in `src/mcp/handlers-n8n-manager.ts`:**

```typescript
const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});
```

There is no `changes` field in this schema. Zod's default behavior is to **strip unknown keys silently**. So when I call:

```
workflow_manager(action: "update", id: "aCc3aW4wKSmPC9Os", changes: { name: "New Name" })
```

The schema parses successfully, but `changes` is stripped. The handler receives only `{ id: "aCc3aW4wKSmPC9Os" }`. Then:

```typescript
const { id, ...updateData } = input;
// updateData = {} — completely empty
```

Because `updateData.nodes` and `updateData.connections` are both undefined, the handler skips the merge block and eventually calls:

```typescript
const workflow = await client.updateWorkflow(id, workflowToSend);
// workflowToSend = {} — empty object sent to n8n
```

n8n responds: `"request/body must have required property 'name'"` — which is **exactly the error I received every single time**.

**This is not fixed.** The Zod schema needs a `changes` wrapper added to it. The tool description and the schema are out of sync.

---

## Issue 2 — `cleanWorkflowForUpdate` Uses a Denylist That Misses Fields

**Current code in `src/services/n8n-validation.ts`:**

```typescript
export function cleanWorkflowForUpdate(workflow: Workflow): Partial<Workflow> {
  const {
    id,
    createdAt,
    updatedAt,
    versionId,
    meta,
    tags,
    isArchived,
    usedCredentials,
    sharedWithProjects,
    triggerCount,
    shared,
    active,
    ...cleanedWorkflow
  } = workflow as any;
```

This is a **destructuring denylist**. Anything not named here passes through to `cleanedWorkflow` untouched.

The n8n API GET response also returns these fields, which are **not in the denylist**:
- `activeVersionId`
- `versionCounter`
- `activeVersion` (full object)
- `description` (in some n8n versions)

The n8n `PUT /workflows/{id}` API is defined with **`additionalProperties: false`**. I confirmed this directly from the official n8n API specification via the kapa.ai MCP. That means **any field not explicitly in the schema causes a full rejection** — not a warning, a hard `400`.

If any of those unlisted fields come back in the GET response and flow through `cleanedWorkflow`, the PUT fails. This is a structural fragility. Every time n8n adds a new field to their GET response, this denylist silently breaks.

**The fix is an allowlist, not a denylist:**

```typescript
export function cleanWorkflowForUpdate(workflow: any) {
  return {
    name:        workflow.name,
    nodes:       workflow.nodes,
    connections: workflow.connections,
    settings:    workflow.settings ?? {},
    ...(workflow.staticData != null && { staticData: workflow.staticData }),
  };
}
```

The current code has not been changed to this.

---

## Issue 3 — These Two Bugs Compound Each Other

Here is the actual execution path when I call `workflow_manager update` right now:

1. I pass `{ id: "X", changes: { name: "Y", nodes: [...] } }`
2. `updateWorkflowSchema.parse()` strips `changes` → result: `{ id: "X" }`
3. `updateData` = `{}`
4. Since `updateData.nodes` is undefined, the full-workflow fetch+merge block is **skipped entirely**
5. `workflowToSend` = `cleanWorkflowForUpdate({})` → returns `{ settings: { executionOrder: "v1", ... } }` (just defaults)
6. `client.updateWorkflow("X", { settings: {...} })` → n8n: **"must have required property 'name'"**

This is not a deployment issue, a build issue, or a configuration issue. It is a logic bug in the Zod schema definition that has not been changed. I can verify this by reading the file right now — the schema on lines ~132–138 of `handlers-n8n-manager.ts` still reads exactly as shown above, with no `changes` field.

---

## What Actually Needs to Change

**File: `src/mcp/handlers-n8n-manager.ts`**

Replace the `updateWorkflowSchema` definition:

```typescript
// BEFORE (broken):
const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});

// AFTER (fixed):
const updateWorkflowSchema = z.object({
  id: z.string(),
  changes: z.object({
    name: z.string().optional(),
    nodes: z.array(z.any()).optional(),
    connections: z.record(z.any()).optional(),
    settings: z.any().optional(),
  }),
});
```

Update the handler to always fetch the current workflow and merge:

```typescript
const { id, changes } = updateWorkflowSchema.parse(args);
const current = await client.getWorkflow(id);
const merged = {
  ...current,
  ...changes,
};
const payload = cleanWorkflowForUpdate(merged);
const workflow = await client.updateWorkflow(id, payload);
```

**File: `src/services/n8n-validation.ts`**

Replace `cleanWorkflowForUpdate` with an allowlist:

```typescript
export function cleanWorkflowForUpdate(workflow: any): any {
  return {
    name:        workflow.name,
    nodes:       workflow.nodes,
    connections: workflow.connections,
    settings:    workflow.settings ?? {},
    ...(workflow.staticData != null && { staticData: workflow.staticData }),
  };
}
```

After these two changes, run `npm run build` and restart. Until these specific lines are changed, `workflow_manager update` will continue failing with the same errors.

---

## How to Verify the Current State

To confirm the schema has NOT been updated yet, search the codebase:

```bash
grep -n "updateWorkflowSchema" src/mcp/handlers-n8n-manager.ts
```

You will see `changes` is not in the object definition. That is the bug.
