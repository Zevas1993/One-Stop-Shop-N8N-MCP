# Verify Current n8n Workflow Setup

**Purpose**: Use the MCP server to query and analyze your actual n8n workflow configuration
**Date**: November 23, 2025
**Status**: Instructions for verification

---

## 🎯 Objective

Before implementing enhancements, we need to understand the exact structure of your current workflow:

1. What nodes currently exist
2. How they're connected
3. What configuration each has
4. What data flows between them
5. What integration points exist

This ensures our enhancement plan aligns perfectly with your actual setup.

---

## 📡 Using MCP Tools to Query Workflow

The MCP server exposes tools to query n8n workflows. Here's how to use them:

### Method 1: Direct MCP Tool Calls (Recommended)

You can call the MCP tools directly through the stdio interface:

```javascript
// Example: Get workflow structure
{
  "method": "tools/call",
  "params": {
    "name": "n8n_get_workflow_structure",
    "arguments": {
      "workflowId": "teams-outlook-assistant",
      "includeNodeDetails": true,
      "includeConnections": true,
      "includeParameters": true
    }
  }
}
```

**Tools to use**:
- `n8n_list_workflows` - Get all workflows
- `n8n_get_workflow` - Get workflow by ID
- `n8n_get_workflow_structure` - Get structure with nodes
- `list_nodes` - Get available node types

### Method 2: Using n8n REST API (if configured)

If your n8n has REST API enabled:

```bash
# Get all workflows
curl -X GET http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: your-api-key"

# Get specific workflow
curl -X GET http://localhost:5678/api/v1/workflows/1 \
  -H "X-N8N-API-KEY: your-api-key"
```

### Method 3: Export Workflow JSON

From n8n UI:
1. Open your workflow
2. Menu → Download
3. Save the JSON file
4. Analyze the structure

---

## 📋 What to Look For

### 1. Trigger Nodes

```json
{
  "name": "Email Trigger Node",
  "type": "n8n-nodes-base.outlookEmailTrigger",
  "configuration": {
    "resourceOwner": "user@example.com",
    "mailFolders": ["Inbox"],
    "folderSpecifier": "inbox",
    "additionalFields": {}
  }
}
```

**Check**:
- Which account is configured
- What folders it watches
- Any filtering applied

### 2. Processing Nodes

```json
{
  "name": "Code Node",
  "type": "n8n-nodes-base.code",
  "parameters": {
    "jsCode": "// actual code here"
  }
}
```

**Check**:
- What transformations are applied
- What data is extracted
- What features are already implemented

### 3. AI Integration Nodes

```json
{
  "name": "Claude AI",
  "type": "OpenAI or custom",
  "configuration": {
    "apiKey": "sk-...",
    "model": "gpt-4 or claude-3",
    "systemPrompt": "You are..."
  }
}
```

**Check**:
- Which AI model is used
- Current prompts
- API configuration

### 4. Output Nodes

```json
{
  "name": "Send Teams Message",
  "type": "n8n-nodes-base.microsoftTeams",
  "configuration": {
    "channel": "general",
    "messageText": "{{ $json.response }}"
  }
}
```

**Check**:
- Where messages are sent
- What format
- Any filtering

### 5. Database Nodes

```json
{
  "name": "Create Log Entry",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "query": "INSERT INTO logs..."
  }
}
```

**Check**:
- What data is logged
- Which tables are used
- How data is structured

### 6. Conditional/Routing Logic

```json
{
  "name": "If Node",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "number": [
        {
          "value1": "{{ $json.urgency }}",
          "operation": "greaterThan",
          "value2": 50
        }
      ]
    }
  }
}
```

**Check**:
- What routing decisions are made
- What conditions trigger different paths
- How priorities are handled

---

## 🔍 Analysis Checklist

After retrieving the workflow, check:

### Email Processing
- [ ] Email trigger is configured
- [ ] Email body is being extracted
- [ ] Sender information is captured
- [ ] Subject is being used
- [ ] Attachments are handled
- [ ] Timestamps are preserved

### AI Integration
- [ ] AI model is configured
- [ ] Prompts are defined
- [ ] Context is being passed
- [ ] Responses are captured
- [ ] Error handling exists

### Teams Integration
- [ ] Teams connector is authenticated
- [ ] Channel/user is specified
- [ ] Message format is defined
- [ ] Buttons/actions are configured
- [ ] Error notifications exist

### Data Flow
- [ ] Email data → Processing → AI → Teams
- [ ] Database logging exists
- [ ] Error paths are handled
- [ ] Feedback loops exist

### Database
- [ ] Logging tables exist
- [ ] Schema supports conversations
- [ ] Indexes are optimized
- [ ] Cleanup procedures exist

---

## 📊 Document the Current State

Create a document with:

```markdown
# Current Workflow Inventory

## Triggers
- [ ] Outlook Email Trigger
  - Account: ___________
  - Folders: ___________
  - Filters: ___________

## Processing Nodes
- [ ] Email Parser
- [ ] Data Extractor
- [ ] Categorizer
- [ ] ...

## AI Integration
- [ ] Model Type: ___________
- [ ] API Key: Configured [ ]
- [ ] System Prompt: ___________

## Output Channels
- [ ] Teams Integration
  - Channel: ___________
  - Format: ___________
- [ ] Outlook Integration
  - Send Email: ___________
  - Draft Creation: ___________

## Database
- [ ] Table: ___________
  - Purpose: ___________
  - Fields: ___________

## Error Handling
- [ ] Error nodes: ___________
- [ ] Notifications: ___________
- [ ] Logging: ___________
```

---

## 🎨 Create Architecture Diagram

Based on actual workflow, create diagram:

```
[Outlook Email Trigger]
         ↓
[Extract Email Data]
         ↓
[Categorize/Analyze]
         ↓
[Send to AI]
         ↓
[Format Response]
         ↓
[Send to Teams]
         ↓
[Log Results]
```

Note:
- Node names and types
- Connection points
- Data transformations
- Error paths

---

## 🔗 Integration Points to Document

For each connection, document:

1. **Source Node**
   - Name and type
   - Output structure
   - Available fields

2. **Target Node**
   - Name and type
   - Expected inputs
   - Parameter mappings

3. **Data Transformation**
   - Any mapping needed
   - Any filtering applied
   - Any aggregation

---

## 💾 Enhancement Planning Based on Actual Setup

Once you understand the current workflow:

1. **Identify Insertion Points**
   - Where can enrichment nodes be added?
   - Where to add context loading?
   - Where to add error handling?

2. **Plan Data Flow Changes**
   - How to add conversation history?
   - How to add GraphRAG queries?
   - How to modify Teams messages?

3. **Database Schema Alignment**
   - What fields already exist?
   - What new tables needed?
   - How to maintain backward compatibility?

4. **Phased Integration**
   - Which nodes to add first?
   - Test points after each addition
   - Rollback procedures

---

## 🚀 Next Steps

1. **Retrieve Workflow JSON**
   - Use MCP tool or API
   - Export from n8n UI
   - Document current state

2. **Map Current Architecture**
   - Create detailed diagram
   - Document each node
   - List all connections

3. **Analyze for Enhancement Points**
   - Where to add intelligence
   - Where to add context
   - Where to add error handling

4. **Customize Enhancement Plan**
   - Based on actual workflow
   - Adjusted insertion points
   - Updated phasing

5. **Implement with Confidence**
   - Know exactly what will change
   - Predict impact
   - Plan rollback procedures

---

## 📝 Example: What We'll Find

Based on your description, we expect to find:

```json
{
  "workflow": {
    "name": "Teams-Outlook-Assistant",
    "nodes": [
      {
        "id": "1",
        "name": "Outlook Email Trigger",
        "type": "n8n-nodes-base.outlookEmailTrigger"
      },
      {
        "id": "2",
        "name": "Extract Email",
        "type": "n8n-nodes-base.code"
      },
      {
        "id": "3",
        "name": "Central Orchestrator",
        "type": "n8n-nodes-base.code"
      },
      {
        "id": "4",
        "name": "Fraud Classifier Agent",
        "type": "n8n-nodes-base.code"
      },
      {
        "id": "5",
        "name": "Triage Agent",
        "type": "n8n-nodes-base.code"
      },
      {
        "id": "6",
        "name": "High Priority Handler",
        "type": "n8n-nodes-base.code"
      },
      {
        "id": "7",
        "name": "Send to Teams",
        "type": "n8n-nodes-base.microsoftTeams"
      },
      {
        "id": "8",
        "name": "Create Email Draft",
        "type": "n8n-nodes-base.outlookCreateDraft"
      },
      {
        "id": "9",
        "name": "Send Email",
        "type": "n8n-nodes-base.outlook"
      },
      {
        "id": "10",
        "name": "Log to Database",
        "type": "n8n-nodes-base.postgres"
      }
    ],
    "connections": {
      "1": [2],
      "2": [3],
      "3": [4, 5, 6],
      "4": [7],
      "5": [7, 8],
      "6": [7, 9],
      "7": [10],
      "8": [10],
      "9": [10]
    }
  }
}
```

This structure helps us know exactly where to add:
- Email enrichment nodes (after trigger)
- Context loaders (before orchestrator)
- GraphRAG queries (before AI)
- Card formatters (before Teams send)
- Error handlers (in parallel)

---

## 🎓 Key Insights

Understanding your actual workflow means:

1. **Precise Planning**
   - Know exactly what to modify
   - No guesswork about structure
   - Confident implementation

2. **Minimize Risk**
   - Understand current state
   - Know what won't break
   - Plan safe rollbacks

3. **Better Integration**
   - Align with existing patterns
   - Reuse working components
   - Respect current architecture

4. **Efficient Development**
   - Write code for actual setup
   - No "guess and fix" cycles
   - Faster implementation

---

This verification step is crucial for successful implementation. Once complete, we can provide workflow-specific enhancement plans with exact node positions, data mappings, and integration points.

