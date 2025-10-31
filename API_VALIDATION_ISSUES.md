# API Validation Issues - n8n MCP Server

**Date:** October 31, 2025
**Status:** 🔴 CRITICAL - These issues waste time and cause agent frustration

---

## Issue Summary

The n8n API endpoint `/api/v1/workflows` has STRICT validation that the MCP server should validate BEFORE passing requests to agents. Currently, agents waste tokens and time discovering these constraints through trial and error.

### Issues Found

#### 1. 🔴 CRITICAL: Missing `settings` Property Required
**Impact:** HIGH - All workflow creation attempts fail
**Error:** `request/body must have required property 'settings'`

**Current Behavior:**
- Agent creates workflow JSON without `settings` property
- Request sent to n8n API
- API returns 400 error
- Agent must debug and retry

**Solution:**
- MCP should validate and AUTO-ADD default settings before sending
- OR inform agent upfront: "Workflow creation requires settings property with: executionOrder, saveManualExecutions"

**Example Valid Settings:**
```json
{
  "settings": {
    "executionOrder": "v1",
    "saveManualExecutions": true,
    "errorHandler": null
  }
}
```

---

#### 2. 🔴 CRITICAL: Strict Property Validation (NO Additional Properties)
**Impact:** CRITICAL - Valid workflows rejected
**Error:** `request/body must NOT have additional properties`

**Current Behavior:**
- Agent includes `active`, `description`, or other standard workflow properties
- n8n API rejects them as "additional properties"
- Agent confused because these seem like standard properties

**Valid Properties (Only These Allowed):**
- `name` (required)
- `nodes` (required)
- `connections` (required)
- `settings` (required)

**Invalid Properties (Will Cause Rejection):**
- ❌ `active`
- ❌ `description`
- ❌ `tags`
- ❌ `createdAt`
- ❌ `updatedAt`
- ❌ Any other property

**Solution:**
- MCP schema should document EXACTLY which properties are accepted
- Tool description should state: "Only include: name, nodes, connections, settings"
- Validation function should strip invalid properties automatically

---

#### 3. ⚠️ HIGH: Node Type Validation Missing
**Impact:** HIGH - Invalid nodes deployed
**Current Behavior:**
- Agent creates nodes with invalid `type` values (e.g., `webhook` instead of `n8n-nodes-base.webhook`)
- n8n API doesn't validate node types upfront
- Workflow created but nodes don't work

**Solution:**
- MCP should call `list_nodes` first
- Validate agent's node types against known node list
- Provide helpful error: "Node type 'webhook' not found. Did you mean 'n8n-nodes-base.webhook'?"

**Example Valid Node Types:**
```
n8n-nodes-base.webhook
n8n-nodes-base.microsoftOutlook
n8n-nodes-base.microsoftTeams
n8n-nodes-base.openAi
n8n-nodes-base.httpRequest
```

---

#### 4. ⚠️ HIGH: typeVersion Not Validated
**Impact:** MEDIUM - Node configuration inconsistencies
**Current Behavior:**
- Agent creates nodes without specifying `typeVersion`
- API accepts it but may use unexpected default version
- Node behavior differs from what agent intended

**Solution:**
- MCP should provide node info with correct typeVersion
- Tool description should clarify: "Each node type has specific typeVersions - check node info first"
- Validation should require typeVersion or use known default

---

#### 5. ⚠️ MEDIUM: Node Parameter Validation Not Available
**Impact:** MEDIUM - Agents discover errors by testing
**Current Behavior:**
- Agent provides parameters that don't match node's expected schema
- No validation error until workflow execution
- Wasted time deploying broken workflows

**Solution:**
- `get_node_info` should include parameter validation schema
- New tool: `validate_node_parameters` to check specific node config
- Tool description: "Validate your node configuration before deploying workflow"

---

#### 6. ⚠️ MEDIUM: Connection Format Not Validated
**Impact:** MEDIUM - Workflows with broken connections
**Current Behavior:**
- Agent creates connections with incorrect format
- API accepts invalid connection structure
- Workflow doesn't execute properly

**Valid Connection Format:**
```json
{
  "Node Name": {
    "main": [
      [
        { "node": "Target Node Name", "type": "main", "index": 0 }
      ]
    ]
  }
}
```

**Common Mistakes:**
- ❌ Using node ID instead of node name
- ❌ Incorrect output index
- ❌ Missing "main" array wrapper
- ❌ Wrong type value

**Solution:**
- Tool description should include connection format example
- `validate_workflow_connections` tool should check format
- Error message should show correct format

---

#### 7. ⚠️ MEDIUM: Missing Node Parameters Not Caught Early
**Impact:** MEDIUM - Incomplete node configurations
**Current Behavior:**
- Agent creates nodes without required parameters
- API accepts it
- Workflow shows errors only during execution

**Solution:**
- MCP should provide required parameters list from `get_node_info`
- Validation tool should check all required parameters present
- Tool output: "These parameters are required: [list]"

---

## Summary Table

| Issue | Severity | Type | Impact | Solution |
|-------|----------|------|--------|----------|
| Missing `settings` | 🔴 CRITICAL | API Validation | All workflows fail | Auto-add or validate |
| Extra properties rejected | 🔴 CRITICAL | API Strictness | Valid workflows rejected | Document allowed props |
| Node type validation | ⚠️ HIGH | Input Validation | Invalid nodes deployed | Validate against list |
| typeVersion missing | ⚠️ HIGH | Version Control | Node behavior inconsistent | Include in node info |
| Parameter validation | ⚠️ MEDIUM | Schema Validation | Workflows fail at runtime | Add validation tool |
| Connection format | ⚠️ MEDIUM | Structure Validation | Broken connections | Show format examples |
| Required parameters | ⚠️ MEDIUM | Completeness | Incomplete configs | List required fields |

---

## Recommended MCP Tool Enhancements

### 1. Update Tool Description for `n8n_create_workflow`

**Current:** Generic description
**Enhanced:**
```
Create a workflow with built-in validation.

REQUIRED FIELDS ONLY:
- name: workflow name (string)
- nodes: array of node definitions
- connections: object mapping node connections
- settings: { executionOrder: "v1", saveManualExecutions: true }

DO NOT INCLUDE: active, description, tags, createdAt, updatedAt

BEFORE calling this tool:
1. Use get_node_info to verify each node type exists
2. Use validate_workflow to check structure
3. Verify connection format matches: { "NodeName": { "main": [[{ "node": "TargetName", "type": "main", "index": 0 }]] } }
```

### 2. New Tool: `n8n_validate_workflow_schema`

**Purpose:** Check workflow JSON structure before deployment
**Input:**
```json
{
  "workflow": { /* workflow object */ },
  "validateOnly": true
}
```

**Output:**
```json
{
  "valid": true/false,
  "errors": [
    "Missing settings property",
    "Invalid property 'active' - not allowed",
    "Node 'webhook' type is invalid - should be 'n8n-nodes-base.webhook'"
  ],
  "warnings": [
    "Node has missing required parameter 'path'"
  ]
}
```

### 3. New Tool: `n8n_get_node_schema`

**Purpose:** Get node's parameter schema for validation
**Input:** `{ "node_type": "n8n-nodes-base.webhook" }`
**Output:**
```json
{
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "requiredParameters": ["path"],
  "optionalParameters": ["options"],
  "parameterSchema": { /* full schema */ }
}
```

### 4. Update Workflow Validation Guides

Create documentation showing:
- ✅ Correct workflow structure
- ❌ Common mistakes
- 🔧 How to validate before deploying

---

## Code Changes Needed

### Location: `src/mcp/tools.ts`

Add validation to tool definitions:
```typescript
{
  name: "n8n_create_workflow",
  description: `Create workflow with STRICT validation.

  REQUIRED: name, nodes, connections, settings
  FORBIDDEN: active, description, tags, createdAt, updatedAt

  Validate BEFORE calling:
  - get_node_info for each node type
  - validate_workflow for structure
  - Connection format: {"NodeName": {"main": [[{"node": "Target", "type": "main", "index": 0}]]}}`,
  // ... rest of tool definition
}
```

### Location: `src/services/workflow-validator.ts`

Add schema validation:
```typescript
validateWorkflowSchema(workflow: any): ValidationError[] {
  const errors = [];

  // Check required properties
  if (!workflow.name) errors.push('Missing required property: name');
  if (!workflow.nodes) errors.push('Missing required property: nodes');
  if (!workflow.connections) errors.push('Missing required property: connections');
  if (!workflow.settings) errors.push('Missing required property: settings');

  // Check for forbidden properties
  const forbidden = ['active', 'description', 'tags', 'createdAt', 'updatedAt'];
  forbidden.forEach(prop => {
    if (prop in workflow) {
      errors.push(`Property '${prop}' is not allowed in n8n API requests`);
    }
  });

  return errors;
}
```

---

## Testing Needed

After implementing fixes, test:
1. ✅ Agent cannot create workflow with forbidden properties
2. ✅ Helpful error message explains what's wrong
3. ✅ Agent gets validation results BEFORE sending to API
4. ✅ Node type validation catches typos
5. ✅ Connection format validation catches errors
6. ✅ Required parameters validation completes workflows

---

## Impact on Agent Experience

### Before (Current - Wasting Time)
```
Agent: "Create workflow with webhook node"
MCP: Creates workflow, sends to API
API: 400 error - missing settings
Agent: Wastes tokens, retries with settings
MCP: Sends to API
API: 400 error - 'active' not allowed
Agent: Wastes more tokens, removes 'active'
MCP: Finally works after 3+ attempts
```

### After (With Validation)
```
Agent: "Create workflow with webhook node"
MCP: Validates schema, node types, connections
MCP: "Ready to deploy. Before continuing, verify:
     - Webhook node type: n8n-nodes-base.webhook ✓
     - Required parameter 'path' provided? No
     Please provide 'path' parameter for webhook."
Agent: Adds missing parameter
MCP: Validates again, all checks pass
MCP: Deploys with settings auto-included
Success on first try
```

---

## Priority

1. 🔴 **IMMEDIATE:** Fix critical issues (settings, property validation)
2. 🟠 **HIGH:** Add node type validation
3. 🟡 **MEDIUM:** Add schema validation tools
4. 🟢 **LOW:** Enhanced error messages

---

**Created By:** Claude Code
**Session:** Workflow Building - Email Manager for Outlook + Teams
**Next Step:** Implement schema validation before agents continue building workflows
