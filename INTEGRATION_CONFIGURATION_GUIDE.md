# Integration Configuration & Execution Guide
## n8n MCP Server - Complete Setup for Outlook AI Assistant Workflow

This guide covers how to properly configure and execute your restored "Ultimate Outlook AI Assistant" workflow with all required integrations.

---

## Part 1: Core Configuration

### 1.1 Environment Setup

Create or update your `.env` file with the following required variables:

```env
# ===== CORE n8n MCP SERVER CONFIGURATION =====

# n8n API Connection (REQUIRED)
N8N_API_URL=http://localhost:5678/api/v1
N8N_API_KEY=your_n8n_api_key_here

# Debugging (Optional)
DEBUG=false

# ===== OPTIONAL: GraphRAG & Performance =====

# Cache directory for graph queries (optional)
GRAPH_DIR=C:\Users\Chris Boyd\AppData\Roaming\n8n-mcp\graph

# Memory threshold for cache cleanup (MB)
MEM_GUARD_THRESHOLD_MB=512

# Max cached query entries
BRIDGE_CACHE_MAX=100

# JSON-RPC body size limit (KB)
MCP_HTTP_MAX_BODY_KB=512

# Enable performance metrics
METRICS_GRAPHRAG=false
```

### 1.2 Generate n8n API Key

Your workflow requires an API key with appropriate permissions:

1. **Open n8n**: `http://localhost:5678`
2. **Navigate to**: Settings → API → API Keys
3. **Click**: "Create" button
4. **Set Permissions** (minimum required):
   - `workflow:read` - Read workflow information
   - `workflow:write` - Modify workflows
   - `workflow:execute` - Run workflows
   - `execution:read` - View execution history
5. **Copy** the generated key to your `.env` file

---

## Part 2: Integration Configuration

### 2.1 Microsoft Outlook Integration

Your workflow requires Microsoft Outlook credentials for email operations:

#### Setup Steps:

1. **Create Azure Application**:
   - Go to [Microsoft Azure Portal](https://portal.azure.com)
   - Navigate to: Azure Active Directory → App registrations → New registration
   - Name: "n8n-outlook-integration"
   - Supported account types: "Accounts in any organizational directory (Multi-tenant)"
   - Click: "Register"

2. **Configure Permissions**:
   - In your app registration, go to: API permissions
   - Click: "Add a permission"
   - Select: "Microsoft Graph"
   - Choose: "Delegated permissions"
   - Search for and add these permissions:
     - `Mail.Read`
     - `Mail.ReadWrite`
     - `Mail.Send`
     - `Calendars.Read`
     - `Calendars.ReadWrite`

3. **Create Client Secret**:
   - Go to: Certificates & secrets
   - Click: "New client secret"
   - Description: "n8n-outlook"
   - Copy the value (you'll need this)

4. **Configure in n8n**:
   - In n8n UI, open your workflow
   - For each Outlook node (Get Unprocessed Emails, Move Spam to Junk, Update Email Categories):
     - Click: "Authenticate with Outlook"
     - Client ID: (from your Azure app)
     - Client Secret: (the secret you created)
     - Save credentials

#### n8n Outlook Node Reference
The workflow uses `n8n-nodes-base.outlook` and `n8n-nodes-base.microsoftOutlookTool` nodes with these operations:
- **Outlook**: Get messages, update message categories
- **Outlook Tool**: Create email drafts, send emails, search emails

### 2.2 OpenAI Integration

Your workflow uses OpenAI for AI text processing and language models:

#### Setup Steps:

1. **Get OpenAI API Key**:
   - Go to [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create a new API key
   - Set up billing in OpenAI account

2. **Configure in n8n**:
   - In n8n UI, open your workflow
   - For OpenAI nodes (Clean Email Content, OpenAI Chat Model):
     - Click: "Authenticate with OpenAI"
     - Paste your API key
     - Save credentials

#### n8n OpenAI Node Reference
The workflow uses `@n8n/n8n-nodes-langchain.openAi` node with:
- **Model**: `gpt-4` or `gpt-3.5-turbo` (configurable)
- **Operations**: Text processing, completions, embeddings
- **Default temperature**: 0.7 (adjustable)

### 2.3 LangChain Integration

Your workflow uses LangChain for AI agent orchestration:

#### Nodes Configuration:

1. **AI Agents** (`@n8n/n8n-nodes-langchain.agent`):
   - Main Email Assistant
   - Business Inquiry Agent
   - **Type**: ReAct Agent (for reasoning + action)
   - **Tools Connected**: Email tools, search tools, memory buffer
   - **Max Iterations**: 5 (default)

2. **Text Classifier** (`@n8n/n8n-nodes-langchain.textClassifier`):
   - AI Email Classifier
   - **Purpose**: Categorize email content
   - **Categories**: Custom or predefined based on your needs

3. **Vector Store** (`@n8n/n8n-nodes-langchain.vectorStorePGVector`):
   - Knowledge Search Tool
   - **Requires**: PostgreSQL database
   - **Purpose**: Semantic search over email knowledge base

4. **Memory** (`@n8n/n8n-nodes-langchain.memoryBufferWindow`):
   - Memory Buffer
   - **Window size**: 5 (recent messages to remember)
   - **Purpose**: Conversation context for agents

### 2.4 PostgreSQL for Vector Storage (Optional but Recommended)

If using Knowledge Search Tool with vector embeddings:

```sql
-- Setup instructions
CREATE DATABASE n8n_knowledge;

-- Connect to the database and create table
-- (LangChain will handle schema creation automatically)

-- In n8n Vector Store node, configure:
-- Host: localhost (or your PostgreSQL host)
-- Port: 5432
-- Database: n8n_knowledge
-- Username: your_postgres_user
-- Password: your_postgres_password
```

---

## Part 3: Workflow Configuration

### 3.1 Node-by-Node Setup

#### Trigger Nodes
- **Open WebUI Chat Interface** (Webhook):
  - Path: `/email-assistant`
  - Method: POST
  - Response Mode: responseNode

- **Email Processing Trigger** (Manual):
  - Used for manual email batch processing

#### Data Processing Nodes
- **Parse Chat Input** (Set): Extracts user message, session ID
- **Extract Email Metadata** (Set): Parses email information
- **Format Response for WebUI** (Set): Prepares final response

#### Outlook Nodes (Email Operations)
- **Get Unprocessed Emails**: Lists unread/unprocessed emails
  - Filter: Inbox, status = unread
  - Sort: Most recent first

- **Move Spam to Junk**: Routes spam emails
  - Condition: Based on classifier output
  - Action: Move to Junk folder

- **Update Email Categories**: Tags emails with categories
  - Input: Email ID, category name
  - Action: Updates email categories

#### Processing Nodes
- **Process Each Email** (Split in Batches):
  - Batch size: 5
  - Process sequentially through AI agents

#### AI Nodes
- **Clean Email Content**: Preprocesses emails for analysis
  - Removes signatures, formatting
  - Standardizes content

- **AI Email Classifier**: Categories emails by type
  - Categories: Business, Personal, Spam, Action Required
  - Confidence threshold: 0.8

- **Email Category Router** (Switch): Routes based on classification
  - Cases: One for each email category
  - Default: Unclassified handling

#### AI Agents
- **Business Inquiry Agent**: Handles business-related emails
  - Tools: Email creation, sending, search
  - Context: Business email memory

- **Main Email Assistant**: Primary agent
  - Tools: All email tools + knowledge search
  - Context: Full conversation history

#### Supporting Nodes
- **Create Draft Tool**: Creates email drafts (Outlook Tool)
- **Send Email Tool**: Sends prepared emails (Outlook Tool)
- **Search Emails Tool**: Searches email history (Outlook Tool)
- **Knowledge Search Tool**: Semantic search via vector DB (Vector Store)

#### LLM & Memory
- **OpenAI Chat Model**: GPT-4 language model
  - Temperature: 0.7
  - Max tokens: 2000

- **Memory Buffer**: Conversation context
  - Messages to remember: 5
  - Clears on user logout

#### Response Node
- **Send Response to WebUI**: Returns results to web interface
  - Format: JSON
  - Includes: AI response, actions taken, metadata

---

## Part 4: Execution Management

### 4.1 Workflow Execution Methods

#### Method 1: Via Webhook (REST API)
```bash
# Trigger the workflow via HTTP
curl -X POST http://localhost:5678/webhook/email-assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Check my inbox for important emails",
    "sessionId": "user-session-123",
    "userId": "user-001"
  }'
```

#### Method 2: Via n8n API (MCP)
```javascript
// Using n8n MCP Server tools
const execution = await n8n.run_workflow({
  workflowId: "Zp2BYxCXj9FeCZfi",
  data: {
    message: "Summarize my emails from today",
    sessionId: "user-session-123"
  },
  waitForCompletion: true
});
```

#### Method 3: Manual Trigger in n8n UI
1. Open workflow: `http://localhost:5678/workflow/Zp2BYxCXj9FeCZfi`
2. Click: "Execute Workflow"
3. Input data in the trigger node
4. View execution results

### 4.2 Monitoring Executions

#### View Execution History
```bash
# Get all executions for the workflow
curl -X GET http://localhost:5678/api/v1/executions \
  -H "X-N8N-API-KEY: your_api_key" \
  -H "Content-Type: application/json"
```

#### Check Execution Status
```bash
# Get specific execution details
curl -X GET http://localhost:5678/api/v1/executions/{executionId} \
  -H "X-N8N-API-KEY: your_api_key"
```

Response includes:
- Execution ID
- Status: `success`, `error`, `running`, `waiting`
- Start and end times
- Execution data and results
- Any error messages

### 4.3 API Response Format

Successful execution response:
```json
{
  "id": "execution-id",
  "finished": true,
  "mode": "integrated",
  "startedAt": "2025-11-24T10:30:00.000Z",
  "stoppedAt": "2025-11-24T10:30:15.000Z",
  "workflowId": "Zp2BYxCXj9FeCZfi",
  "data": {
    "resultData": {
      "runData": {
        "Send Response to WebUI": [
          {
            "data": {
              "json": {
                "response": "Found 5 unread emails...",
                "actions": ["categorized", "moved_spam"],
                "timestamp": "2025-11-24T10:30:15Z"
              }
            }
          }
        ]
      }
    }
  }
}
```

---

## Part 5: Advanced Configuration

### 5.1 Performance Tuning

**For large email volumes**:
- Increase batch size in "Process Each Email" node (5 → 10-20)
- Enable async processing: `Batch mode: "Parallel"`
- Reduce OpenAI max tokens if not needed

**For faster response times**:
- Use `gpt-3.5-turbo` instead of `gpt-4`
- Reduce memory buffer window (5 → 3)
- Disable unnecessary logging: `DEBUG=false`

### 5.2 Custom Integrations

To add additional integrations:

1. **HTTP Request Node**: Call external APIs
   - Include authentication headers
   - Handle rate limiting
   - Implement retry logic

2. **Code Node**: Custom JavaScript processing
   - Parse complex data formats
   - Implement custom logic
   - Transform data between nodes

Example: Adding Slack notifications on important emails
```javascript
// In a Code node after Email Classifier
if (item.importance === "high") {
  return [{
    json: {
      channel: "#important-emails",
      message: `Important: ${item.subject}`,
      timestamp: new Date().toISOString()
    }
  }];
}
```

### 5.3 Security Best Practices

1. **Credential Management**:
   - Use n8n's built-in credential storage
   - Never commit credentials to version control
   - Rotate API keys regularly

2. **API Key Permissions**:
   - Use least privilege principle
   - Create separate keys for different scopes
   - Monitor key usage in n8n Activity Log

3. **Network Security**:
   - Use HTTPS for webhook URLs (production)
   - Implement IP whitelisting if needed
   - Validate all incoming webhook data

---

## Part 6: Troubleshooting

### Common Issues & Solutions

#### Issue: "Authentication failed" for Outlook
**Solution**:
- Verify API key has `Mail.Read` and `Mail.Send` permissions
- Check Azure app registration is approved
- Ensure client secret hasn't expired

#### Issue: OpenAI API errors
**Solution**:
- Verify API key is valid
- Check OpenAI account has sufficient credits
- Ensure rate limits aren't exceeded (max 3 requests/min for free tier)

#### Issue: Workflow timeout
**Solution**:
- Check network connectivity to n8n instance
- Reduce email batch size
- Use `gpt-3.5-turbo` for faster responses
- Increase timeout in API requests (default: 30s)

#### Issue: Vector store connection failed
**Solution**:
- Verify PostgreSQL is running
- Check connection credentials
- Ensure database tables are created
- Review pg vector extension is installed

### Debug Mode

Enable detailed logging:
```env
DEBUG=true
```

View logs:
```bash
# For stdio mode
# Logs appear in terminal output

# For HTTP mode
curl http://localhost:3000/health -H "Authorization: Bearer $AUTH_TOKEN"
```

---

## Part 7: API Reference Summary

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/workflows` | GET | List all workflows |
| `/api/v1/workflows` | POST | Create new workflow |
| `/api/v1/workflows/{id}` | GET | Get workflow details |
| `/api/v1/workflows/{id}` | PUT | Update workflow |
| `/api/v1/executions` | GET | List executions |
| `/api/v1/executions/{id}` | GET | Get execution details |
| `/webhook/{path}` | POST | Trigger workflow via webhook |

### Required Headers

```
X-N8N-API-KEY: your_api_key
Content-Type: application/json
```

---

## Part 8: Verification Checklist

Before using the workflow in production:

- [ ] `.env` file configured with N8N_API_URL and N8N_API_KEY
- [ ] n8n API key generated with correct permissions
- [ ] Microsoft Outlook credentials configured in n8n
- [ ] OpenAI API key configured and billing active
- [ ] LangChain nodes have AI model credentials
- [ ] PostgreSQL running (if using vector store)
- [ ] Workflow ID verified: `Zp2BYxCXj9FeCZfi`
- [ ] Test execution successful via n8n UI
- [ ] Webhook accessible and responding
- [ ] Execution history showing successful runs
- [ ] Response format matches expectations
- [ ] Error handling configured

---

## Additional Resources

- [n8n API Documentation](https://docs.n8n.io/api/)
- [n8n Integrations Guide](https://docs.n8n.io/integrations/)
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [LangChain Documentation](https://js.langchain.com/)
- [Microsoft Graph API Reference](https://learn.microsoft.com/en-us/graph/api/overview)

---

**Last Updated**: 2025-11-24
**Workflow ID**: `Zp2BYxCXj9FeCZfi`
**Status**: Ready for Configuration
