# Teams-Outlook-Assistant Workflow Analysis
## Current State Assessment (Generated 2025-11-22)

---

## Executive Summary

**Workflow Name:** Ultimate Outlook AI Assistant - Open WebUI (Updated via MCP)
**Workflow ID:** 2dTTm6g4qFmcTob1
**Status:** Inactive (Not Running)
**Total Nodes:** 21
**Created:** 2025-06-16
**Last Updated:** 2025-07-20

### Key Finding
The current workflow is **Outlook-focused** with AI capabilities, but has **NO Microsoft Teams integration** despite the project name. This analysis identifies what exists, what's missing, and what needs to be added for complete Teams-Outlook integration.

---

## 1. Current Workflow Architecture

### 1.1 Workflow Execution Paths

The workflow has TWO independent execution paths:

#### Path 1: Interactive Chat Interface (WebUI)
```
Webhook → Parse Input → AI Agent → Format Response → Send Response
```
- Entry point: POST webhook at `/email-assistant`
- User sends natural language commands
- AI agent processes requests with tools
- Response returned to chat interface

#### Path 2: Automated Email Processing
```
Manual Trigger → Get Emails → Split Batches → Clean Content →
Extract Metadata → AI Classifier → Router → Action (Category/Agent/Spam)
```
- Processes unprocessed emails in batches
- AI classification into categories
- Automated actions based on classification

---

## 2. Node Inventory by Category

### 2.1 Trigger Nodes (2)
| Node ID | Node Name | Type | Purpose |
|---------|-----------|------|---------|
| `webui-webhook` | Open WebUI Chat Interface | `n8n-nodes-base.webhook` (v2) | Receives chat messages via POST |
| `email-trigger` | Email Processing Trigger | `n8n-nodes-base.manualTrigger` (v1) | Manual trigger for batch processing |

### 2.2 Microsoft Outlook Nodes (6)
| Node ID | Node Name | Type | Resource/Operation | Version |
|---------|-----------|------|-------------------|---------|
| `get-emails` | Get Unprocessed Emails | `n8n-nodes-base.outlook` | message/getAll | v2 |
| `move-spam` | Move Spam to Junk | `n8n-nodes-base.outlook` | move | v2 |
| `update-categories` | Update Email Categories | `n8n-nodes-base.outlook` | update | v2 |
| `create-draft-tool` | Create Draft Tool | `n8n-nodes-base.microsoftOutlookTool` | draft | v2 |
| `send-email-tool` | Send Email Tool | `n8n-nodes-base.microsoftOutlookTool` | send | v2 |
| `search-emails-tool` | Search Emails Tool | `n8n-nodes-base.microsoftOutlookTool` | getAll | v2 |

**Key Capabilities:**
- ✅ Read emails with custom filters
- ✅ Move emails to folders
- ✅ Update email categories
- ✅ Create draft emails
- ✅ Send emails
- ✅ Search emails (by sender, content, date)
- ❌ Calendar integration (MISSING)
- ❌ Contact management (MISSING)
- ❌ Meeting scheduling (MISSING)

### 2.3 AI/LangChain Nodes (7)
| Node ID | Node Name | Type | Purpose | Version |
|---------|-----------|------|---------|---------|
| `clean-content` | Clean Email Content | `@n8n/n8n-nodes-langchain.openAi` | HTML cleaning via GPT-4o-mini | v1.8 |
| `classify-email` | AI Email Classifier | `@n8n/n8n-nodes-langchain.textClassifier` | 6-category classification | v1 |
| `business-agent` | Business Inquiry Agent | `@n8n/n8n-nodes-langchain.agent` | Business inquiry handler | v1.7 |
| `main-agent` | Main Email Assistant | `@n8n/n8n-nodes-langchain.agent` | Primary chat interface | v1.7 |
| `knowledge-tool` | Knowledge Search Tool | `@n8n/n8n-nodes-langchain.vectorStorePGVector` | RAG vector search | v1 |
| `openai-model` | OpenAI Chat Model | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | GPT-4o-mini (temp=0.3) | v1.2 |
| `memory-buffer` | Memory Buffer | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | Session memory | v1.3 |

**AI Capabilities:**
- ✅ Natural language email processing
- ✅ Intelligent email classification
- ✅ Vector database search (PostgreSQL + pgvector)
- ✅ Conversational memory
- ✅ Multi-agent architecture
- ✅ Tool calling (search, draft, send)

### 2.4 Data Processing Nodes (3)
| Node ID | Node Name | Type | Purpose | Version |
|---------|-----------|------|---------|---------|
| `parse-input` | Parse Chat Input | `n8n-nodes-base.set` | Extract user message/session | v3.4 |
| `extract-metadata` | Extract Email Metadata | `n8n-nodes-base.set` | Extract email fields | v3.4 |
| `format-response` | Format Response for WebUI | `n8n-nodes-base.set` | Format AI response | v3.4 |

### 2.5 Control Flow Nodes (3)
| Node ID | Node Name | Type | Purpose | Version |
|---------|-----------|------|---------|---------|
| `split-emails` | Process Each Email | `n8n-nodes-base.splitInBatches` | Batch processing (size=1) | v3 |
| `route-category` | Email Category Router | `n8n-nodes-base.switch` | Route by classification | v3.2 |
| `send-response` | Send Response to WebUI | `n8n-nodes-base.respondToWebhook` | Return JSON response | v1.1 |

---

## 3. Email Classification System

The AI classifier categorizes emails into 6 categories:

| Category | Description | Action |
|----------|-------------|--------|
| `urgent_action` | Escalations, critical issues, deadlines, system failures | Update category |
| `business_inquiry` | Project inquiries, partnership requests, sales leads | Business Agent + Draft |
| `support_request` | Technical support, customer service, troubleshooting | Update category |
| `billing_finance` | Invoices, payments, receipts, accounting | Update category |
| `meeting_calendar` | Meeting requests, calendar invites, appointments | Update category |
| `spam_junk` | Spam, phishing, suspicious emails | Move to Junk folder |

**Current Routing:**
- Output 0 (urgent): → Update Email Categories
- Output 1 (business): → Business Inquiry Agent
- Output 2 (spam): → Move Spam to Junk
- Other categories: → Update Email Categories (default path)

---

## 4. Integration Points

### 4.1 Microsoft Outlook Integration ✅
**Authentication:** OAuth2 via Microsoft credentials
**Capabilities:**
- Read emails with custom OData filters
- Search by sender, subject, content
- Create and send emails
- Create drafts
- Move emails between folders
- Update email categories/flags

**Example Filter (Get Unprocessed Emails):**
```odata
flag/flagStatus eq 'notFlagged' and not categories/any()
```

### 4.2 Microsoft Teams Integration ❌
**Status:** NOT IMPLEMENTED
**Missing Capabilities:**
- Send Teams messages
- Create Teams channels
- Post channel messages
- Manage Teams meetings
- Send notifications
- Bot interactions

### 4.3 Database Integration (PostgreSQL + pgvector) ✅
**Purpose:** RAG-based knowledge search
**Table:** `email_knowledge`
**Features:**
- Vector embeddings for semantic search
- Past communication history
- Context retrieval for AI agents

### 4.4 External Interfaces

#### Webhook Interface ✅
- **URL:** `/email-assistant`
- **Method:** POST
- **Expected Input:**
  ```json
  {
    "message": "user query",
    "sessionId": "unique-session-id",
    "userId": "user-identifier"
  }
  ```
- **Response:** JSON with AI agent response

#### Open WebUI Integration ✅
- Configured for chat-based interaction
- Session management with memory
- Supports conversational context

---

## 5. AI Agent Architecture

### 5.1 Main Email Assistant
**Purpose:** Primary conversational interface
**System Prompt Capabilities:**
- Email management (search, send, categorize)
- Calendar functions (mentioned but NOT implemented)
- Knowledge base access
- Attachment handling (mentioned)

**Available Tools:**
1. Create Draft Tool
2. Send Email Tool
3. Search Emails Tool
4. Knowledge Search Tool

**Model:** GPT-4o-mini (temperature: 0.3)
**Memory:** Window buffer with session tracking

### 5.2 Business Inquiry Agent
**Purpose:** Specialized agent for business opportunities
**Workflow:**
1. Analyze opportunity and requirements
2. Search knowledge base
3. Create professional draft responses
4. Include company capabilities
5. Suggest next steps

**Available Tools:**
1. Create Draft Tool
2. Knowledge Search Tool

**Model:** GPT-4o-mini (shared with main agent)

---

## 6. Connection Map

### Main Data Flow Connections
```
WebUI Path:
  Webhook → Parse → Main Agent → Format → Respond

Email Processing Path:
  Trigger → Get Emails → Split → Clean → Extract →
  Classify → Router → [Category/Business Agent/Spam Handler]

AI Tool Connections:
  OpenAI Model → [Classifier, Main Agent, Business Agent]
  Memory Buffer → Main Agent
  Create Draft → [Main Agent, Business Agent]
  Send Email → Main Agent
  Search Emails → Main Agent
  Knowledge Search → [Main Agent, Business Agent]
```

### Connection Statistics
- **Total Connections:** 23
- **Main connections:** 13
- **AI tool connections:** 7
- **AI language model connections:** 3

---

## 7. Configuration Details

### 7.1 Email Retrieval Configuration
```json
{
  "limit": 15,
  "resource": "message",
  "operation": "getAll",
  "filtersUI": {
    "values": {
      "filters": {
        "custom": "flag/flagStatus eq 'notFlagged' and not categories/any()"
      }
    }
  }
}
```

### 7.2 Batch Processing Configuration
- **Batch Size:** 1 email at a time
- **Purpose:** Individual email processing with AI
- **Loop:** Continues until all emails processed

### 7.3 AI Model Configuration
- **Model:** gpt-4o-mini
- **Temperature:** 0.3 (focused, deterministic)
- **Provider:** OpenAI
- **Cost Optimization:** Using mini model for efficiency

### 7.4 Vector Database Configuration
- **Database:** PostgreSQL with pgvector extension
- **Table:** `email_knowledge`
- **Mode:** retrieve-as-tool
- **Tool Name:** `knowledge_search`
- **Description:** Search email history and knowledge base

---

## 8. Missing Capabilities Analysis

### 8.1 Microsoft Teams (HIGH PRIORITY)
**Missing Nodes:**
- `n8n-nodes-base.microsoftTeams` - NOT PRESENT

**Missing Features:**
- ❌ Send Teams messages
- ❌ Create Teams channels
- ❌ Post to channels
- ❌ Create Teams meetings
- ❌ Bot integration
- ❌ Notification system
- ❌ Teams file sharing

### 8.2 Calendar Integration (HIGH PRIORITY)
**Missing Capabilities:**
- ❌ Read calendar events
- ❌ Create calendar events
- ❌ Update appointments
- ❌ Check availability
- ❌ Send meeting invites
- ❌ Cancel meetings

**Note:** The Main Agent mentions calendar functions in its system prompt, but NO calendar nodes exist in the workflow!

### 8.3 Contact Management (MEDIUM PRIORITY)
**Missing Capabilities:**
- ❌ Read contacts
- ❌ Search contacts
- ❌ Create contacts
- ❌ Update contact information

### 8.4 Advanced Email Features (LOW PRIORITY)
**Missing Capabilities:**
- ❌ Attachment handling (download, process, extract)
- ❌ Email forwarding
- ❌ Email rules automation
- ❌ Multiple folder management
- ❌ Email tracking/analytics

---

## 9. Available n8n Nodes for Enhancement

### 9.1 Microsoft Teams Node
**Node Type:** `n8n-nodes-base.microsoftTeams`
**Estimated Version:** v2+

**Expected Resources:**
- channel
- message
- task (Planner)

**Expected Operations:**
- Create channel
- Post message to channel
- Send chat message
- List channels
- Get channel
- Delete channel

### 9.2 Microsoft Outlook (Extended)
**Node Type:** `n8n-nodes-base.outlook`
**Current Version:** v2 ✅

**Additional Resources (Not Currently Used):**
- calendar
- calendarEvent
- contact
- folder
- messageAttachment

### 9.3 Microsoft To-Do
**Node Type:** `n8n-nodes-base.microsoftToDo`
**Potential Use:** Task management from emails

---

## 10. Recommendations for Implementation

### Phase 1: Teams Integration (CRITICAL)
1. **Add Microsoft Teams Node**
   - Resource: channel, message
   - Operations: create, post, send
   - Connect to AI agents for Teams notifications

2. **Create Teams Message Tool**
   - Add `n8n-nodes-base.microsoftTeamsTool` if available
   - Connect to Main Agent as AI tool
   - Enable "Send Teams message" commands

3. **Bi-directional Integration**
   - Teams → Outlook: Meeting requests from Teams
   - Outlook → Teams: Email summaries to Teams channels

### Phase 2: Calendar Integration (HIGH)
1. **Add Calendar Operations**
   - Use existing Outlook node
   - Resource: calendar, calendarEvent
   - Operations: get, create, update, delete

2. **Calendar Tools for AI Agents**
   - Check availability tool
   - Create meeting tool
   - List events tool

3. **Update Main Agent System Prompt**
   - Remove calendar references OR
   - Add actual calendar tools to match promises

### Phase 3: Enhanced Features (MEDIUM)
1. **Attachment Handling**
   - Download attachments from emails
   - Extract text from PDFs/documents
   - Process images
   - Store in knowledge base

2. **Contact Management**
   - Add contact resource to Outlook node
   - Search contacts tool for AI
   - Auto-create contacts from emails

3. **Advanced Routing**
   - Multiple folder management
   - Custom categorization rules
   - VIP sender handling
   - Priority inbox logic

### Phase 4: Analytics & Monitoring (LOW)
1. **Email Analytics**
   - Response time tracking
   - Category distribution
   - AI accuracy metrics
   - Volume statistics

2. **Performance Monitoring**
   - Execution time tracking
   - Error rate monitoring
   - API quota management
   - Cost tracking (OpenAI API)

---

## 11. Technical Debt & Issues

### 11.1 Inactive Workflow
**Status:** Workflow is not active
**Impact:** No automated email processing
**Action Required:** Activate workflow OR schedule execution

### 11.2 System Prompt vs. Implementation Gap
**Issue:** Main Agent mentions calendar functions that don't exist
**Location:** Node `main-agent` system message
**Fix:** Either remove calendar mentions OR implement calendar tools

### 11.3 Single OpenAI Model Dependency
**Risk:** All AI functions depend on one external API
**Mitigation:** Consider fallback models or local alternatives
**Current:** GPT-4o-mini via OpenAI

### 11.4 PostgreSQL Dependency
**Requirement:** External PostgreSQL database with pgvector
**Configuration:** Table `email_knowledge` must exist
**Risk:** Knowledge search fails if database unavailable

### 11.5 Batch Size Inefficiency
**Current:** Processing 1 email at a time
**Impact:** Slower processing for large volumes
**Optimization:** Consider increasing batch size OR parallel processing

---

## 12. Security & Authentication

### 12.1 Required Credentials
1. **Microsoft OAuth2** (Outlook/Teams)
   - Scope: Mail.Read, Mail.Send, Mail.ReadWrite
   - Missing: Teams.Read, Channel.ReadWrite (for Teams integration)

2. **OpenAI API Key**
   - Used for: GPT-4o-mini model
   - Cost impact: ~$0.150 per 1M input tokens

3. **PostgreSQL Connection**
   - Database: pgvector-enabled instance
   - Credentials: Username, password, host, port

### 12.2 Webhook Security
**Current:** No authentication on webhook endpoint
**Risk:** Public endpoint accessible without auth
**Recommendation:** Add webhook authentication token

---

## 13. Workflow Execution Settings

```json
{
  "saveExecutionProgress": true,
  "saveManualExecutions": true,
  "saveDataErrorExecution": "all",
  "saveDataSuccessExecution": "all",
  "executionTimeout": 3600,
  "timezone": "UTC"
}
```

**Timeout:** 1 hour (sufficient for batch processing)
**Data Retention:** ALL executions saved (high storage usage)
**Timezone:** UTC (consider user timezone for scheduling)

---

## 14. Related Workflows in n8n Instance

The n8n instance contains **41 total workflows**, many with similar goals:

### Teams/Outlook Variants (12 workflows)
1. Ultimate Outlook AI Assistant - Open WebUI (Updated via MCP) ← **CURRENT**
2. Teams-Outlook RAG Assistant (Agent Generated) - Multiple versions
3. Teams-Outlook Manager Pro - Multiple versions
4. Teams-Outlook Email & Calendar Manager
5. AI Outlook Assistant with Teams Integration
6. Outlook AI Assistant - Core
7. Enhanced Outlook AI Assistant - Advanced
8. Ultimate Outlook AI Assistant - Fixed
9. Ultimate Outlook Enterprise Agent

**Observation:** Multiple attempts at similar functionality suggest iterative development or abandoned workflows.

---

## 15. Implementation Priority Matrix

| Feature | Priority | Complexity | Impact | Dependencies |
|---------|----------|------------|--------|--------------|
| Microsoft Teams Integration | **CRITICAL** | Medium | High | OAuth scope update |
| Calendar Integration | **HIGH** | Low | High | Outlook node (exists) |
| Activate Workflow | **HIGH** | Low | High | None |
| Fix System Prompt Gap | **MEDIUM** | Low | Medium | Calendar implementation |
| Attachment Handling | **MEDIUM** | Medium | Medium | Storage solution |
| Contact Management | **MEDIUM** | Low | Low | Outlook node (exists) |
| Webhook Authentication | **MEDIUM** | Low | High | Auth token config |
| Analytics Dashboard | **LOW** | High | Low | Data warehouse |
| Batch Size Optimization | **LOW** | Low | Medium | Testing |

---

## 16. Next Steps for Claude Code

### Immediate Actions (Can be automated)
1. ✅ **Analyze existing workflow** - COMPLETED
2. 🔄 **Query n8n MCP for available Teams nodes** - Use `search_nodes` tool
3. 🔄 **Get detailed Microsoft Teams node info** - Use `get_node_info` tool
4. 🔄 **Get calendar operations from Outlook node** - Use `get_node_essentials` tool
5. 📋 **Create implementation plan** - Based on findings

### Validation Required (Needs user input)
1. ❓ **Confirm Teams integration scope** - What Teams features are needed?
2. ❓ **Verify PostgreSQL availability** - Is pgvector database accessible?
3. ❓ **Check OAuth scopes** - Are Teams permissions granted?
4. ❓ **Determine deployment timeline** - Phased or all-at-once?

### Documentation Tasks
1. 📝 Create detailed Teams integration specification
2. 📝 Document calendar API usage patterns
3. 📝 Write workflow testing procedures
4. 📝 Create user guide for chat interface

---

## 17. Conclusion

The current workflow is a **sophisticated Outlook AI assistant** with:
- ✅ Excellent AI-powered email processing
- ✅ Multi-agent architecture
- ✅ RAG-based knowledge search
- ✅ Natural language chat interface
- ✅ Intelligent email classification

**However, it is missing:**
- ❌ Microsoft Teams integration (despite project name)
- ❌ Calendar functionality (despite mentions in AI prompts)
- ❌ Contact management
- ❌ Advanced email features

**The workflow is currently INACTIVE** and needs to be:
1. Activated for production use
2. Enhanced with Teams integration
3. Updated with calendar capabilities
4. Secured with webhook authentication

This analysis provides a complete foundation for Claude Code to create a verified, comprehensive implementation plan for the Teams-Outlook integration.

---

## Appendix A: Node Type Reference

### Microsoft Integration Nodes
- `n8n-nodes-base.outlook` - Outlook email/calendar/contacts
- `n8n-nodes-base.microsoftOutlookTool` - Outlook AI tool wrapper
- `n8n-nodes-base.microsoftTeams` - Teams channels/messages (NOT IN USE)
- `n8n-nodes-base.microsoftToDo` - To-Do task management (NOT IN USE)

### AI/LangChain Nodes
- `@n8n/n8n-nodes-langchain.agent` - AI agent executor
- `@n8n/n8n-nodes-langchain.lmChatOpenAi` - OpenAI chat model
- `@n8n/n8n-nodes-langchain.textClassifier` - Text classification
- `@n8n/n8n-nodes-langchain.openAi` - OpenAI direct calls
- `@n8n/n8n-nodes-langchain.vectorStorePGVector` - PostgreSQL vector DB
- `@n8n/n8n-nodes-langchain.memoryBufferWindow` - Conversation memory

### Core Nodes
- `n8n-nodes-base.webhook` - HTTP webhook trigger
- `n8n-nodes-base.respondToWebhook` - Webhook response
- `n8n-nodes-base.manualTrigger` - Manual execution
- `n8n-nodes-base.set` - Data transformation
- `n8n-nodes-base.splitInBatches` - Batch processing
- `n8n-nodes-base.switch` - Conditional routing

---

**Report Generated:** 2025-11-22
**Workflow Analyzed:** Ultimate Outlook AI Assistant - Open WebUI (Updated via MCP)
**Analysis Tool:** n8n MCP Server + Custom Scripts
**Total Workflows in Instance:** 41
**Analysis Completeness:** 100%
