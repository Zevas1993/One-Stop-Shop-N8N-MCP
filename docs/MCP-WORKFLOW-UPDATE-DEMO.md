# MCP Server Workflow Update Demo

This document demonstrates how to use the n8n MCP Server to update workflows via the consolidated tools.

## 🎯 Overview

The MCP server provides 8 unified tools for managing n8n workflows. This demo shows how to:
1. List existing workflows
2. Get workflow details
3. Update workflows using diff operations
4. Validate changes before applying

---

## 📋 Available MCP Tools

### 1. n8n_system
Unified tool for node discovery and information:
- `list_nodes` - Browse available nodes
- `get_node` - Get node configuration details
- `search_nodes` - Search for specific nodes
- `get_node_essentials` - Get only essential properties

### 2. n8n_workflow
Unified tool for workflow operations:
- `list_workflows` - List all workflows
- `get_workflow` - Get workflow by ID
- `create_workflow` - Create new workflow
- `update_full_workflow` - Replace entire workflow
- `update_partial_workflow` - Update using diff operations (NEW!)
- `validate_workflow` - Validate before deployment
- `delete_workflow` - Delete workflow

---

## 🔧 Demo: Updating a Workflow

### Scenario
You have an existing workflow and want to:
1. Add a new node (Slack notification)
2. Connect it to an existing node
3. Update a node's parameters

### Step 1: List Workflows

**MCP Tool Call:**
```json
{
  "tool": "n8n_workflow",
  "parameters": {
    "action": "list_workflows"
  }
}
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "1",
      "name": "Email Monitor Workflow",
      "active": true,
      "nodes": 5,
      "connections": 4,
      "createdAt": "2025-10-03T10:00:00Z",
      "updatedAt": "2025-10-03T12:00:00Z"
    }
  ],
  "count": 1
}
```

### Step 2: Get Current Workflow

**MCP Tool Call:**
```json
{
  "tool": "n8n_workflow",
  "parameters": {
    "action": "get_workflow",
    "workflowId": "1"
  }
}
```

**Response:**
```json
{
  "id": "1",
  "name": "Email Monitor Workflow",
  "active": true,
  "nodes": [
    {
      "id": "webhook-1",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "parameters": {
        "httpMethod": "POST",
        "path": "email-monitor"
      }
    },
    {
      "id": "filter-1",
      "name": "Filter Emails",
      "type": "n8n-nodes-base.filter",
      "typeVersion": 2,
      "position": [450, 300],
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.subject}}",
              "operation": "contains",
              "value2": "urgent"
            }
          ]
        }
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Filter Emails",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### Step 3: Update Using Diff Operations (NEW!)

**MCP Tool Call:**
```json
{
  "tool": "n8n_workflow",
  "parameters": {
    "action": "update_partial_workflow",
    "workflowId": "1",
    "operations": [
      {
        "type": "addNode",
        "node": {
          "name": "Slack Notification",
          "type": "n8n-nodes-base.slack",
          "typeVersion": 2,
          "position": [650, 300],
          "parameters": {
            "resource": "message",
            "operation": "post",
            "channel": "#alerts",
            "text": "Urgent email received: {{$json.subject}}"
          }
        }
      },
      {
        "type": "addConnection",
        "from": "Filter Emails",
        "to": "Slack Notification",
        "fromOutput": "main",
        "toInput": "main",
        "fromOutputIndex": 0,
        "toInputIndex": 0
      },
      {
        "type": "updateNode",
        "nodeId": "Filter Emails",
        "updates": {
          "parameters": {
            "conditions": {
              "string": [
                {
                  "value1": "={{$json.subject}}",
                  "operation": "contains",
                  "value2": "urgent"
                },
                {
                  "value1": "={{$json.from}}",
                  "operation": "contains",
                  "value2": "@important-client.com"
                }
              ]
            }
          }
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "1",
  "changes": {
    "nodesAdded": 1,
    "nodesUpdated": 1,
    "connectionsAdded": 1,
    "totalOperations": 3
  },
  "message": "Workflow updated successfully using 3 diff operations"
}
```

### Step 4: Validate Updated Workflow

**MCP Tool Call:**
```json
{
  "tool": "n8n_workflow",
  "parameters": {
    "action": "validate_workflow",
    "workflowId": "1",
    "options": {
      "profile": "strict"
    }
  }
}
```

**Response:**
```json
{
  "valid": true,
  "workflow": {
    "id": "1",
    "name": "Email Monitor Workflow"
  },
  "validation": {
    "nodes": {
      "total": 3,
      "valid": 3,
      "issues": []
    },
    "connections": {
      "total": 2,
      "valid": 2,
      "issues": []
    },
    "expressions": {
      "total": 4,
      "valid": 4,
      "issues": []
    }
  },
  "message": "Workflow is valid and ready for deployment"
}
```

---

## 🎨 Alternative: Full Workflow Update

If you prefer to replace the entire workflow:

**MCP Tool Call:**
```json
{
  "tool": "n8n_workflow",
  "parameters": {
    "action": "update_full_workflow",
    "workflowId": "1",
    "workflow": {
      "name": "Email Monitor Workflow",
      "nodes": [
        {
          "name": "Webhook",
          "type": "n8n-nodes-base.webhook",
          "typeVersion": 2,
          "position": [250, 300],
          "parameters": {
            "httpMethod": "POST",
            "path": "email-monitor"
          }
        },
        {
          "name": "Filter Emails",
          "type": "n8n-nodes-base.filter",
          "typeVersion": 2,
          "position": [450, 300],
          "parameters": {
            "conditions": {
              "string": [
                {
                  "value1": "={{$json.subject}}",
                  "operation": "contains",
                  "value2": "urgent"
                },
                {
                  "value1": "={{$json.from}}",
                  "operation": "contains",
                  "value2": "@important-client.com"
                }
              ]
            }
          }
        },
        {
          "name": "Slack Notification",
          "type": "n8n-nodes-base.slack",
          "typeVersion": 2,
          "position": [650, 300],
          "parameters": {
            "resource": "message",
            "operation": "post",
            "channel": "#alerts",
            "text": "Urgent email received: {{$json.subject}}"
          }
        }
      ],
      "connections": {
        "Webhook": {
          "main": [[{"node": "Filter Emails", "type": "main", "index": 0}]]
        },
        "Filter Emails": {
          "main": [[{"node": "Slack Notification", "type": "main", "index": 0}]]
        }
      }
    }
  }
}
```

---

## 💡 Diff Operations vs Full Updates

### Use Diff Operations When:
- ✅ Making small targeted changes
- ✅ Adding/removing specific nodes
- ✅ Updating specific parameters
- ✅ Want to save 80-90% token usage

### Use Full Updates When:
- ✅ Rebuilding entire workflow
- ✅ Making major structural changes
- ✅ Have complete workflow JSON

---

## 🔧 Available Diff Operations

### 1. Node Operations
- `addNode` - Add a new node
- `removeNode` - Remove a node
- `updateNode` - Update node parameters
- `moveNode` - Change node position
- `enableNode` - Enable a disabled node
- `disableNode` - Disable a node

### 2. Connection Operations
- `addConnection` - Connect two nodes
- `removeConnection` - Disconnect nodes
- `updateConnection` - Modify connection properties

### 3. Workflow Operations
- `updateSettings` - Update workflow settings
- `updateName` - Rename workflow
- `addTag` - Add workflow tag
- `removeTag` - Remove workflow tag

---

## 📊 Real-World Example

### Before: Manual JSON Editing
```json
// Send 100KB+ of full workflow JSON
{
  "nodes": [...50 nodes...],
  "connections": {...},
  // ... entire workflow
}
```

### After: Diff Operations
```json
// Send only 5KB of changes
{
  "operations": [
    {"type": "addNode", "node": {...}},
    {"type": "addConnection", "from": "A", "to": "B"}
  ]
}
```

**Result:** 95% reduction in data transfer!

---

## ✅ Best Practices

### 1. Always Validate First
```json
{
  "action": "validate_workflow",
  "workflowId": "1",
  "options": {"validateOnly": true}
}
```

### 2. Use Node Names (Not IDs)
```json
{
  "type": "addConnection",
  "from": "Filter Emails",  // ✅ Use name
  "to": "Slack Notification"
}
```

### 3. Limit Operations
- Max 5 operations per request
- Break large updates into multiple calls

### 4. Check Results
Always verify the response confirms your changes

---

## 🎯 Complete Workflow Lifecycle

### 1. Discover Nodes
```json
{"tool": "n8n_system", "parameters": {"action": "search_nodes", "query": "slack"}}
```

### 2. Get Node Details
```json
{"tool": "n8n_system", "parameters": {"action": "get_node_essentials", "nodeName": "n8n-nodes-base.slack"}}
```

### 3. Create Workflow
```json
{"tool": "n8n_workflow", "parameters": {"action": "create_workflow", "workflow": {...}}}
```

### 4. Validate
```json
{"tool": "n8n_workflow", "parameters": {"action": "validate_workflow", "workflowId": "1"}}
```

### 5. Update (Diff)
```json
{"tool": "n8n_workflow", "parameters": {"action": "update_partial_workflow", "workflowId": "1", "operations": [...]}}
```

### 6. Execute
```json
{"tool": "n8n_execution", "parameters": {"action": "trigger_webhook", "workflowId": "1"}}
```

---

## 📚 Related Documentation

- [Workflow Diff Examples](./workflow-diff-examples.md)
- [MCP Tools Reference](./mcp-tools-reference.md)
- [n8n API Integration](./n8n-management.md)

---

## 🎉 Summary

The n8n MCP Server provides:
- ✅ 8 unified tools (down from 60+)
- ✅ Diff-based updates (80-90% token savings)
- ✅ Workflow validation
- ✅ Complete lifecycle management
- ✅ AI-optimized guidance

**Try it yourself:**
1. Start MCP server: `npm start`
2. Connect from Claude Desktop
3. Use `n8n_workflow` tool with actions shown above!
