I'm going to prove these are NOT fixed by quoting your actual source files.

---

## Issue 1 — `updateWorkflowSchema` has no `changes` field

Open `src/mcp/handlers-n8n-manager.ts` and look at the schema around line 132:

```typescript
const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});
```

There is no `changes` key anywhere in this schema. Zod strips unknown keys by default. So when `workflow_manager update` is called with `{ id: "X", changes: { name: "Y" } }`, Zod parses it and silently drops `changes`. The handler receives `{ id: "X" }` and nothing else.

The handler then constructs `workflowToSend` with no name, no nodes, no connections — and sends that empty object to n8n. n8n responds: **"request/body must have required property 'name'"**.

That is the exact error I've been receiving every time. Not a network issue. Not a config issue. The Zod schema definition has not been changed.

---

## Issue 2 — `cleanWorkflowForUpdate` is still a denylist

Open `src/services/n8n-validation.ts` and look at `cleanWorkflowForUpdate`:

```typescript
export function cleanWorkflowForUpdate(workflow: Workflow): Partial<Workflow> {
  const {
    id, createdAt, updatedAt, versionId, meta, tags,
    isArchived, usedCredentials, sharedWithProjects,
    triggerCount, shared, active,
    ...cleanedWorkflow
  } = workflow as any;
```

This is a destructuring denylist. Anything not named here flows through in `cleanedWorkflow`. The n8n `PUT /workflows/{id}` API is defined with `additionalProperties: false` — confirmed from the official n8n API spec. This means fields like `activeVersionId`, `versionCounter`, and `activeVersion` (which come back in the GET response) are **not in the denylist** and will pass through, causing a hard `400` rejection from n8n.

---

## The two specific changes that need to happen

**In `src/mcp/handlers-n8n-manager.ts` — update the schema:**

```typescript
// Replace this:
const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});

// With this:
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

**And update the handler to always fetch + merge:**

```typescript
const { id, changes } = updateWorkflowSchema.parse(args);
const current = await client.getWorkflow(id);
const payload = cleanWorkflowForUpdate({ ...current, ...changes });
const workflow = await client.updateWorkflow(id, payload);
```

**In `src/services/n8n-validation.ts` — replace the denylist with an allowlist:**

```typescript
// Replace the entire cleanWorkflowForUpdate function body with:
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

---

If you believe these are already fixed, please show me the current content of `updateWorkflowSchema` in `handlers-n8n-manager.ts`. If it still reads `name: z.string().optional()` at the top level with no `changes` wrapper, it is not fixed.
