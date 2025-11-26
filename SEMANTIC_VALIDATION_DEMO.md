# Semantic Validation System - Live Demo Guide

## Overview

This guide demonstrates the n8n MCP server's semantic validation system in action. The system automatically analyzes workflows and warns AI agents when they over-rely on Code nodes instead of using n8n's 525+ built-in nodes.

## Prerequisites

1. **n8n instance running:** http://localhost:5678
2. **n8n API key:** Set in environment variables
3. **MCP server built:** `npm run build`

## Demo Scenarios

### Scenario 1: Good Workflow (High Score)

**Workflow:** Manual Trigger → HTTP Request → Set Fields

**Expected Validation:**
- ✅ Score: 100/100
- ✅ No warnings
- ✅ No suggestions
- ✅ Passes validation

**Test Command:**

```bash
# Set environment
export N8N_API_URL=http://localhost:5678
export N8N_API_KEY=your-api-key-here
export DEBUG_MCP=true

# Start MCP server
node dist/mcp/index.js
```

**Expected Log Output:**

```
[handleCreateWorkflow] Running semantic validation (built-in nodes first policy)
[handleCreateWorkflow] ✅ Semantic validation passed (score: 100/100)
```

---

### Scenario 2: Bad Workflow (Low Score - Triggers Warnings)

**Workflow:** Manual Trigger → Code → Code → Code

**Expected Validation:**
- ❌ Score: 0/100
- ❌ CRITICAL: 100% Code nodes
- ⚠️ 6 warnings
- 💡 3 suggestions

**Workflow Definition:**

```json
{
  "name": "Demo - Too Many Code Nodes",
  "nodes": [
    {
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {}
    },
    {
      "name": "Code Node 1",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [450, 300],
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "return items.map(item => ({ json: { step: 1 } }));"
      }
    },
    {
      "name": "Code Node 2",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [650, 300],
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "return items.map(item => ({ json: { step: 2 } }));"
      }
    },
    {
      "name": "Code Node 3",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [850, 300],
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "return items.map(item => ({ json: { step: 3 } }));"
      }
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [[{ "node": "Code Node 1", "type": "main", "index": 0 }]]
    },
    "Code Node 1": {
      "main": [[{ "node": "Code Node 2", "type": "main", "index": 0 }]]
    },
    "Code Node 2": {
      "main": [[{ "node": "Code Node 3", "type": "main", "index": 0 }]]
    }
  }
}
```

**Expected Log Output:**

```
[handleCreateWorkflow] Running semantic validation (built-in nodes first policy)

📊 Workflow Semantic Validation Score: 0/100
❌ FAILED - Workflow needs improvement

⚠️  Warnings (6):
   ❌ CRITICAL: 100% of nodes are Code nodes (max 30%)
   Node "Code Node 1" might be replaceable with built-in nodes
   Node "Code Node 2" might be replaceable with built-in nodes
   Node "Code Node 3" might be replaceable with built-in nodes
   ❌ Only 0 built-in nodes detected. Workflows should leverage n8n's built-in capabilities!
   ⚠️  Detected minimal architecture pattern (trigger + code). This is usually a sign of under-utilizing n8n's capabilities.

💡 Suggestions (3):
   • This workflow relies too heavily on custom code. n8n has 525+ built-in nodes - please search for existing nodes first!
   • Start by searching for built-in nodes that match your requirements before writing custom code
   • Consider using built-in nodes for data transformation, HTTP requests, and business logic

[handleCreateWorkflow] ⚠️  Semantic validation score low: 0/100
[handleCreateWorkflow] Workflow over-relies on Code nodes instead of built-in nodes
```

---

### Scenario 3: HTTP Request in Code (Should Use HTTP Request Node)

**Workflow:** Manual Trigger → Code (with fetch())

**Code Content:**
```javascript
const response = await fetch('https://api.github.com/repos/n8n-io/n8n');
const data = await response.json();
return [{ json: data }];
```

**Expected Validation:**
- ❌ Score: 0/100
- ⚠️ Detects HTTP pattern
- 💡 Suggests: `n8n-nodes-base.httpRequest`

**Expected Warnings:**

```
Node "Custom HTTP Code" might be replaceable with built-in nodes

💡 Suggestions:
   • Replace Code node "Custom HTTP Code" with HTTP Request node
   Reasoning: HTTP Request node handles authentication, retries,
              rate limiting, and error handling automatically
```

---

### Scenario 4: Data Transformation in Code (Should Use Set Node)

**Workflow:** Manual Trigger → Code (with .map())

**Code Content:**
```javascript
return items.map(item => ({
  json: {
    fullName: item.json.firstName + ' ' + item.json.lastName,
    email: item.json.email.toLowerCase(),
    ...item.json
  }
}));
```

**Expected Validation:**
- ❌ Score: 0/100
- ⚠️ Detects transformation pattern
- 💡 Suggests: `n8n-nodes-base.set`

**Expected Warnings:**

```
Node "Transform Data" might be replaceable with built-in nodes

💡 Suggestions:
   • Replace Code node "Transform Data" with Set/Edit Fields or Function node
   Reasoning: Set node provides visual interface for data transformation
              without writing code
```

---

## Running the Demo

### Method 1: Direct Node.js Script

```bash
# Run the simple test
node test-semantic-simple.js
```

This will:
1. Create a workflow with multiple Code nodes directly via n8n API
2. Show the workflow structure
3. Note that semantic validation logs appear in MCP server output

### Method 2: Via MCP Server Test

```bash
# Build the project
npm run build

# Run the semantic validation test suite
node dist/scripts/test-semantic-validation.js
```

This will:
1. Run 5 different test workflows
2. Show semantic validation scores for each
3. Display all warnings and suggestions
4. Provide a summary of test results

### Method 3: Via MCP Client (External Agent)

```bash
# Terminal 1: Start MCP server with debug logging
export N8N_API_URL=http://localhost:5678
export N8N_API_KEY=your-api-key
export DEBUG_MCP=true
node dist/mcp/index.js

# Terminal 2: Use MCP client to call n8n_create_workflow
# (Use the workflow JSON from Scenario 2 above)
```

Watch Terminal 1 for semantic validation logs.

---

## Understanding the Output

### Score Ranges

| Score | Status | Meaning |
|-------|--------|---------|
| 80-100 | ✅ Excellent | Proper use of built-in nodes |
| 60-79 | ⚠️ Acceptable | Some Code nodes, but reasonable |
| 0-59 | ❌ Poor | Over-reliance on Code nodes |

### Warning Severity

| Severity | Symbol | Meaning |
|----------|--------|---------|
| error | ❌ | Critical issue that should be addressed |
| warning | ⚠️ | Potential issue to review |
| info | ℹ️ | Informational message |

### Suggestion Types

| Type | Description |
|------|-------------|
| `replace_code_node` | Specific Code node should be replaced with a built-in node |
| `use_builtin_node` | Search for existing built-in nodes before using Code |
| `simplify_workflow` | Workflow architecture needs improvement |

---

## Real-World Examples

### Example 1: Slack Integration

**❌ Wrong Approach (Low Score):**

```javascript
// Code node
const slack = require('@slack/web-api');
const client = new slack.WebClient(process.env.SLACK_TOKEN);
await client.chat.postMessage({
  channel: '#general',
  text: 'Hello from n8n!'
});
```

**✅ Correct Approach (High Score):**

Use the built-in **Slack** node (`n8n-nodes-base.slack`)
- Pre-configured authentication
- Visual interface for message composition
- Automatic retry and error handling

---

### Example 2: Data Filtering

**❌ Wrong Approach (Low Score):**

```javascript
// Code node
return items.filter(item => {
  if (item.json.status === 'active' && item.json.score > 80) {
    return true;
  }
  return false;
});
```

**✅ Correct Approach (High Score):**

Use the built-in **Filter** node or **IF** node
- Visual condition builder
- No code required
- Easier to maintain

---

### Example 3: HTTP API Call

**❌ Wrong Approach (Low Score):**

```javascript
// Code node
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'test' })
});
return [{ json: await response.json() }];
```

**✅ Correct Approach (High Score):**

Use the built-in **HTTP Request** node
- Visual request builder
- Credential management
- Automatic retry on failure
- Response parsing
- Error handling

---

## Troubleshooting

### Not Seeing Validation Logs?

Make sure `DEBUG_MCP=true` is set, or create workflows with score < 60 to trigger automatic logging.

### Validation Not Running?

Check that:
1. MCP server is running
2. n8n API is configured (N8N_API_URL and N8N_API_KEY)
3. Using `n8n_create_workflow` or `n8n_update_full_workflow` tools

### Scores Seem Too Strict?

This is intentional! The validator is designed to strongly encourage built-in nodes. The thresholds can be adjusted in `src/services/workflow-semantic-validator.ts`:

```typescript
private readonly MAX_CODE_NODE_RATIO = 0.3;  // Max 30% Code nodes
private readonly IDEAL_CODE_NODE_RATIO = 0.1; // Ideal <10% Code nodes
private readonly MIN_BUILTIN_NODES = 2;       // Minimum built-in nodes
```

---

## Next Steps

After seeing the semantic validation in action:

1. **Review the validator source:** `src/services/workflow-semantic-validator.ts`
2. **Check integration point:** `src/mcp/handlers-n8n-manager.ts` lines 222-246
3. **Run full test suite:** `node dist/scripts/test-semantic-validation.js`
4. **Adjust thresholds** if needed for your use case

---

**Demo prepared:** 2025-11-25
**System version:** n8n-mcp v2.7.1
**Status:** ✅ Fully operational
