# Outlook AI Assistant Workflow Analysis

## MCP Server Knowledge Base Analysis
**Generated**: 2025-11-23
**Purpose**: External agent analysis of n8n MCP server's knowledge about building an "Outlook AI Assistant for Open WebUI" workflow

---

## Executive Summary

Based on the n8n MCP server's knowledge base (536 loaded nodes across `n8n-nodes-base` and `@n8n/n8n-nodes-langchain` packages), here is what the system knows about building an optimal Outlook AI Assistant workflow.

---

## Available Nodes for Outlook/Email Operations

### Microsoft Outlook Nodes
The MCP server contains the following Outlook-specific nodes:

1. **Microsoft Outlook** (`n8n-nodes-base.microsoftOutlook`)
   - Purpose: Interact with Microsoft Outlook for email operations
   - Likely operations: getMessage, sendMessage, listMessages, createDraft, replyMessage, etc.
   - Full node type: `n8n-nodes-base.microsoftOutlook`

2. **Microsoft Outlook Trigger** (`n8n-nodes-base.microsoftOutlookTrigger`)
   - Purpose: Trigger workflows when new Outlook events occur
   - Full node type: `n8n-nodes-base.microsoftOutlookTrigger`

### Alternative Email Nodes
- **Gmail** (`n8n-nodes-base.gmail`) - Google email operations
- **Gmail Trigger** (`n8n-nodes-base.gmailTrigger`) - Trigger on new Gmail messages
- **Email Read (IMAP)** (`n8n-nodes-base.emailReadImap`) - Read emails via IMAP
- **Email Send** (`n8n-nodes-base.emailSend`) - Send emails via SMTP
- **SendGrid** (`n8n-nodes-base.sendGrid`) - SendGrid email service

---

## Available AI/LangChain Nodes

### Core AI Agent Nodes
From the `@n8n/n8n-nodes-langchain` package:

1. **Agent** (`@n8n/n8n-nodes-langchain.agent`)
   - PRIMARY AI node for intelligent decision-making
   - Can use tools and make autonomous decisions
   - Recommended for AI assistant workflows

2. **Agent Tool** (`@n8n/n8n-nodes-langchain.agentTool`)
   - Defines custom tools for agents

3. **Chain (LLM)** (`@n8n/n8n-nodes-langchain.chainLlm`)
   - Simpler chain-based processing
   - Alternative to Agent for linear workflows

4. **OpenAI Assistant** (`@n8n/n8n-nodes-langchain.openAiAssistant`)
   - Use OpenAI's Assistant API directly

### Language Model Options
- **Anthropic** (`@n8n/n8n-nodes-langchain.lmChatAnthropic`)
- **OpenAI** (`@n8n/n8n-nodes-langchain.lmChatOpenAi`)
- **Google Gemini** (`@n8n/n8n-nodes-langchain.lmChatGoogleGemini`)
- **Azure OpenAI** (`@n8n/n8n-nodes-langchain.lmChatAzureOpenAi`)
- **Groq** (`@n8n/n8n-nodes-langchain.lmChatGroq`)
- **Mistral** (`@n8n/n8n-nodes-langchain.lmChatMistralCloud`)
- **DeepSeek** (`@n8n/n8n-nodes-langchain.lmChatDeepSeek`)
- **Ollama** (`@n8n/n8n-nodes-langchain.lmChatOllama`)

### AI Specialized Nodes
- **Sentiment Analysis** (`@n8n/n8n-nodes-langchain.sentimentAnalysis`)
- **Information Extractor** (`@n8n/n8n-nodes-langchain.informationExtractor`)
- **Text Classifier** (`@n8n/n8n-nodes-langchain.textClassifier`)
- **Chain Summarization** (`@n8n/n8n-nodes-langchain.chainSummarization`)

### Tool Nodes for AI Agents
- **Tool: HTTP Request** (`@n8n/n8n-nodes-langchain.toolHttpRequest`)
- **Tool: Code** (`@n8n/n8n-nodes-langchain.toolCode`)
- **Tool: Workflow** (`@n8n/n8n-nodes-langchain.toolWorkflow`) - Call other n8n workflows as tools
- **Tool: Wikipedia** (`@n8n/n8n-nodes-langchain.toolWikipedia`)
- **Tool: Calculator** (`@n8n/n8n-nodes-langchain.toolCalculator`)

### Memory/Context Nodes
- **Memory: Buffer Window** (`@n8n/n8n-nodes-langchain.memoryBufferWindow`)
- **Memory: PostgreSQL Chat** (`@n8n/n8n-nodes-langchain.memoryPostgresChat`)
- **Memory: MongoDB Chat** (`@n8n/n8n-nodes-langchain.memoryMongoDbChat`)
- **Memory: Redis Chat** (`@n8n/n8n-nodes-langchain.memoryRedisChat`)
- **Memory: Manager** (`@n8n/n8n-nodes-langchain.memoryManager`)

---

## Webhook and Trigger Nodes

For integrating with Open WebUI:

1. **Webhook** (`n8n-nodes-base.webhook`)
   - PRIMARY node for receiving HTTP requests from Open WebUI
   - Full node type: `n8n-nodes-base.webhook`
   - Should be the first node in the workflow

2. **Respond to Webhook** (`n8n-nodes-base.respondToWebhook`)
   - Returns responses back to the webhook caller
   - Should be the last node when using webhooks

3. **Manual Trigger** (`n8n-nodes-base.manualTrigger`)
   - For testing workflows manually

---

## Utility Nodes

### Data Processing
- **Set** (`n8n-nodes-base.set`) - Transform and set data
- **Code** (`n8n-nodes-base.code`) - Custom JavaScript/Python code
- **Function** (`n8n-nodes-base.function`) - Legacy function node
- **Filter** (`n8n-nodes-base.filter`) - Filter items
- **Merge** (`n8n-nodes-base.merge`) - Combine data from multiple sources

### Control Flow
- **If** (`n8n-nodes-base.if`) - Conditional routing
- **Switch** (`n8n-nodes-base.switch`) - Multi-way conditional routing
- **Split In Batches** (`n8n-nodes-base.splitInBatches`) - Process items in batches
- **Wait** (`n8n-nodes-base.wait`) - Pause execution

### HTTP Communication
- **HTTP Request** (`n8n-nodes-base.httpRequest`) - Make HTTP/API calls
- **GraphQL** (`n8n-nodes-base.graphQL`) - GraphQL queries

---

## Recommended Workflow Structures

### MINIMAL VIABLE WORKFLOW (2-3 nodes)
**Best for**: Simple AI responses without email integration

```
┌────────────────────────────────────────────────┐
│  1. Webhook (n8n-nodes-base.webhook)           │
│     - Receives requests from Open WebUI        │
│     - Path: /webhook/outlook-ai                │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  2. AI Agent (@n8n/n8n-nodes-langchain.agent)  │
│     - Processes user request                   │
│     - Connected to LLM (OpenAI, Anthropic)     │
│     - Can use tools if configured              │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  3. Respond to Webhook                         │
│     (n8n-nodes-base.respondToWebhook)          │
│     - Returns AI response to Open WebUI        │
└────────────────────────────────────────────────┘
```

**Connection Structure**:
```json
{
  "connections": {
    "Webhook": {
      "main": [[{ "node": "AI Agent", "type": "main", "index": 0 }]]
    },
    "AI Agent": {
      "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]]
    }
  }
}
```

---

### COMPLETE OUTLOOK AI ASSISTANT WORKFLOW (5-7 nodes)
**Best for**: Full email integration with AI capabilities

```
┌────────────────────────────────────────────────┐
│  1. Webhook (n8n-nodes-base.webhook)           │
│     - Authentication: Header Auth              │
│     - Method: POST                             │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  2. Set Node (OPTIONAL - data preparation)     │
│     (n8n-nodes-base.set)                       │
│     - Extract user query from webhook          │
│     - Prepare context for AI                   │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  3. Microsoft Outlook (OPTIONAL - read email)  │
│     (n8n-nodes-base.microsoftOutlook)          │
│     - Operation: Get Message / List Messages   │
│     - Fetch relevant emails                    │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  4. AI Agent (PRIMARY PROCESSING)              │
│     (@n8n/n8n-nodes-langchain.agent)           │
│     - Language Model: OpenAI / Anthropic       │
│     - System Prompt: "You are an Outlook AI    │
│       assistant..."                            │
│     - Tools: Can call Outlook operations       │
│     - Memory: Optional buffer window           │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  5. Microsoft Outlook (OPTIONAL - send email)  │
│     (n8n-nodes-base.microsoftOutlook)          │
│     - Operation: Send Message / Create Draft   │
│     - Uses AI-generated content                │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  6. Set Node (format response)                 │
│     (n8n-nodes-base.set)                       │
│     - Format AI output for Open WebUI          │
│     - Add metadata if needed                   │
└────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────┐
│  7. Respond to Webhook                         │
│     (n8n-nodes-base.respondToWebhook)          │
│     - Returns formatted response               │
└────────────────────────────────────────────────┘
```

---

## MCP Server Best Practices & Guardrails

### CRITICAL WORKFLOW RULES (From MCP v2.7.1 Guardrails)

1. **Connection Requirements**:
   - Every node (except the last) MUST connect to the next node
   - Single-node workflows are ONLY allowed for webhooks with response nodes
   - Multi-node workflows with empty `connections: {}` will fail

2. **Node Type Format**:
   - ✅ CORRECT: `n8n-nodes-base.webhook`
   - ✅ CORRECT: `@n8n/n8n-nodes-langchain.agent`
   - ❌ WRONG: `webhook` (missing package prefix)
   - ❌ WRONG: `nodes-base.webhook` (missing `n8n-` prefix)

3. **Connection Format**:
   - Use node NAMES (not IDs) in connections
   - Format: `{ "NodeName": { "main": [[{ "node": "TargetNode", "type": "main", "index": 0 }]] }}`

4. **typeVersion Requirements**:
   - Versioned nodes MUST specify `typeVersion`
   - Example: HTTP Request node requires `typeVersion: 5` (current)
   - Code node requires `typeVersion: 2`

5. **Avoid Custom/Invented Nodes**:
   - ALWAYS search existing nodes first using MCP tools
   - Use `list_nodes` or `search_nodes` to verify node types exist
   - Don't invent node types - the MCP has 536 real nodes!

---

## MCP Server Tools for Workflow Building

The MCP server provides these tools to help build workflows correctly:

### Discovery Tools
- `list_nodes` - List all 536 available nodes with filtering
- `search_nodes` - Full-text search across nodes
- `get_node_info` - Get complete node information
- `get_node_essentials` - Get only essential properties (recommended)
- `list_ai_tools` - List AI-capable nodes

### Validation Tools
- `validate_workflow` - Validate entire workflow before deployment
- `validate_workflow_connections` - Check workflow structure
- `validate_workflow_expressions` - Validate n8n expressions
- `validate_node_operation` - Verify node configuration

### Template Tools
- `search_templates` - Search for pre-built templates
- `get_template` - Get complete workflow JSON
- `list_node_templates` - Find templates using specific nodes

### n8n Management Tools (if configured)
- `n8n_create_workflow` - Create workflows programmatically
- `n8n_update_partial_workflow` - Update using diff operations
- `n8n_validate_workflow` - Validate from n8n instance
- `n8n_run_workflow` - Execute workflows directly
- `n8n_activate_workflow` - Enable/disable workflows

---

## Common Mistakes to Avoid

### ❌ DON'T DO THIS:
```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "webhook",  // ❌ Wrong - missing package prefix
      "position": [250, 300]
    }
  ],
  "connections": {}  // ❌ Wrong - empty connections in multi-node workflow
}
```

### ✅ DO THIS INSTEAD:
```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",  // ✅ Correct - full type
      "typeVersion": 2,  // ✅ Include typeVersion
      "position": [250, 300],
      "parameters": {
        "path": "outlook-ai",
        "responseMode": "responseNode"
      }
    },
    {
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",  // ✅ Correct - full type
      "typeVersion": 1,
      "position": [450, 300]
    }
  ],
  "connections": {  // ✅ Proper connections
    "Webhook": {
      "main": [[{ "node": "AI Agent", "type": "main", "index": 0 }]]
    }
  }
}
```

---

## Integration with Open WebUI

### Webhook Configuration
```json
{
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "parameters": {
    "path": "outlook-ai-assistant",
    "responseMode": "responseNode",
    "httpMethod": "POST",
    "authentication": "headerAuth"
  }
}
```

### Expected Input from Open WebUI
```json
{
  "query": "Check my recent emails and summarize them",
  "user_id": "user123",
  "context": {}
}
```

### Response Format for Open WebUI
```json
{
  "response": "I found 5 new emails. Here's a summary...",
  "metadata": {
    "emails_processed": 5,
    "ai_model": "gpt-4"
  }
}
```

---

## Node Selection Decision Tree

```
START: Building Outlook AI Assistant
│
├─ Need to receive requests from Open WebUI?
│  └─ YES → Use Webhook node (n8n-nodes-base.webhook)
│
├─ Need AI processing?
│  ├─ Complex decision-making with tools?
│  │  └─ YES → Use Agent node (@n8n/n8n-nodes-langchain.agent)
│  └─ Simple text processing?
│     └─ YES → Use Chain node (@n8n/n8n-nodes-langchain.chainLlm)
│
├─ Need to read emails?
│  └─ YES → Use Microsoft Outlook node (operation: getMessage/listMessages)
│
├─ Need to send emails?
│  └─ YES → Use Microsoft Outlook node (operation: sendMessage/createDraft)
│
├─ Need data transformation?
│  └─ YES → Use Set node (n8n-nodes-base.set)
│
└─ Need to return response?
   └─ YES → Use Respond to Webhook (n8n-nodes-base.respondToWebhook)
```

---

## Database Statistics

From the rebuild process:
- **Total Nodes**: 536
- **n8n-nodes-base**: 438 nodes
- **@n8n/n8n-nodes-langchain**: 98 nodes
- **Outlook Nodes**: 2 (MicrosoftOutlook + MicrosoftOutlookTrigger)
- **AI Agent Nodes**: 6+ core AI/LangChain nodes
- **Memory/Context Nodes**: 10+ options
- **Tool Nodes**: 10+ specialized tools for agents

---

## Recommendations for "Ultimate Outlook AI Assistant"

### Optimal Architecture
Based on the MCP server's knowledge base, the BEST structure is:

1. **Trigger**: Webhook (for Open WebUI integration)
2. **AI Core**: LangChain Agent (for intelligent decision-making)
3. **Email Integration**: Microsoft Outlook node (for read/send operations)
4. **Response**: Respond to Webhook (return to Open WebUI)

### Must-Have Features
- ✅ Webhook authentication for security
- ✅ AI Agent with proper system prompt
- ✅ Memory/context for conversation continuity
- ✅ Tool configuration for Outlook operations
- ✅ Proper error handling
- ✅ Validated connections between all nodes

### Nice-to-Have Features
- Vector store for long-term memory
- Multiple LLM fallback options
- Email sentiment analysis
- Automated email categorization
- Draft email generation with review step

---

## Next Steps for Implementation

1. **Verify Node Types**: Use `get_node_essentials` to get configuration details for:
   - `n8n-nodes-base.webhook`
   - `n8n-nodes-base.microsoftOutlook`
   - `@n8n/n8n-nodes-langchain.agent`
   - `n8n-nodes-base.respondToWebhook`

2. **Check Existing Templates**: Use `search_templates` for "outlook" or "email ai"

3. **Validate Before Deployment**: Use `validate_workflow` to catch errors early

4. **Test Incrementally**: Start with minimal workflow, then add features

---

## Conclusion

The n8n MCP server has EXCELLENT knowledge for building an Outlook AI Assistant:
- ✅ 536 nodes available including all necessary components
- ✅ Complete LangChain/AI integration (@n8n/n8n-nodes-langchain)
- ✅ Native Microsoft Outlook support
- ✅ Comprehensive validation and guardrails (v2.7.1)
- ✅ Workflow management tools for deployment
- ✅ Clear best practices and anti-patterns documented

The system is well-equipped to guide proper workflow construction while preventing common mistakes through built-in validation and guardrails.
