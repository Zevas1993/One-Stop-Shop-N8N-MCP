# Comprehensive n8n Research Document

> Compiled from extensive research across official n8n documentation, DeepWiki analysis, community resources, third-party guides, and the n8n GitHub repository.

---

## Table of Contents

1. [Core Overview & Architecture](#1-core-overview--architecture)
2. [Editor UI & Canvas](#2-editor-ui--canvas)
3. [Node Types & Categories](#3-node-types--categories)
4. [AI & LangChain Nodes](#4-ai--langchain-nodes)
5. [Data Flow & Expressions](#5-data-flow--expressions)
6. [Connections & Workflow Structure](#6-connections--workflow-structure)
7. [Credentials & Authentication](#7-credentials--authentication)
8. [Workflow Features](#8-workflow-features)
9. [Error Handling](#9-error-handling)
10. [Self-Hosting & Deployment](#10-self-hosting--deployment)
11. [n8n REST API](#11-n8n-rest-api)
12. [MCP Integration](#12-mcp-integration)
13. [Security & User Management](#13-security--user-management)
14. [Code Node & Custom Code](#14-code-node--custom-code)
15. [Community & Ecosystem](#15-community--ecosystem)
16. [Pricing & Competitors](#16-pricing--competitors)
17. [Version History](#17-version-history)
18. [GitHub Repository Structure](#18-github-repository-structure)
19. [nodes-base Package Deep Dive](#19-nodes-base-package-deep-dive)

---

## 1. Core Overview & Architecture

### What is n8n?

n8n (pronounced "n-eight-n", short for "nodemation" — the '8' represents eight letters between 'n' in "node" and 'n' in "automation") is a **source-available (fair-code license) workflow automation platform** that combines AI capabilities with business process automation. It gives technical teams the flexibility of code with the speed of no-code.

### Architecture

- **Node-based visual editor**: Users construct workflows by dragging, dropping, and connecting nodes on a digital canvas
- **Fair-code license**: Source code is publicly accessible on GitHub; users can inspect, modify (under license conditions), and self-host
- **Dual deployment**: Available as n8n Cloud (managed SaaS) or self-hosted (Docker, Kubernetes, npm)
- **AI-native platform**: ~70 dedicated nodes for LangChain integration, RAG, multi-step AI agents
- **Data format**: JSON flows between nodes as the standard data format
- **175,000+ GitHub stars** with active development and public roadmap (611 contributors, 531 releases)

### Three Primary Node Categories

| Category | Purpose | Examples |
|----------|---------|---------|
| **Trigger Nodes** | Initiate workflows | Webhook, Schedule, Form, App Events |
| **Action Nodes** | Execute tasks | API calls, database queries, send messages |
| **Logic Nodes** | Control flow | IF, Switch, Merge, Loop, Error handling |

### Key Strengths

- **Code integration**: Seamless JavaScript/Python within Function/Code nodes
- **Extensibility**: npm/PyPI libraries, custom nodes, any REST/GraphQL API via HTTP Request
- **400+ pre-built integrations** with ability to connect to any API
- **Self-hosting**: Complete data sovereignty, air-gapped deployment support
- **Enterprise features**: SSO (SAML/LDAP), RBAC, audit logs, high availability
- **Execution-based pricing**: One workflow run = one execution regardless of step count

---

## 2. Editor UI & Canvas

### Interface Layout

| Component | Location | Purpose |
|-----------|----------|---------|
| **Node Library** | Left panel | Toolbox with all pre-built integrations; searchable |
| **Canvas** | Center | Main workspace for building workflows; drag-and-drop |
| **Configuration Panel** | Right side | Node parameters, credentials, settings |
| **Execution Panel** | Bottom | Real-time execution data, node-by-node output |

### Left Side Panel

- **Overview**: All workflows, credentials, and executions
- **Personal project**: Default project space
- **Projects**: Group workflows and credentials with role assignments
- Collapsible via arrow icon or **Tab** key

### Canvas Features

- Gray dotted grid background
- Zoom to fit, zoom in/out, reset zoom, tidy up nodes
- Execute workflow button appears after adding first node
- Drag-and-drop node placement
- Visual connection lines between nodes
- Real-time execution data preview

### Keyboard Shortcuts

#### Workflow Controls
| Shortcut | Action |
|----------|--------|
| `Ctrl + Alt + N` | New workflow |
| `Ctrl + O` | Open workflow |
| `Ctrl + S` | Save workflow |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + Enter` | Execute workflow |

#### Canvas Navigation
| Shortcut | Action |
|----------|--------|
| `Space + drag` | Pan canvas |
| `Ctrl + Mouse Wheel` | Zoom in/out |
| `+` / `-` | Zoom in/out |
| `0` | Reset zoom |
| `1` | Zoom to fit |

#### Node Operations
| Shortcut | Action |
|----------|--------|
| `Tab` | Open node panel |
| `Double click` | Open node details |
| `Ctrl + A` | Select all nodes |
| `Ctrl + C` / `Ctrl + V` | Copy/paste nodes |
| `D` | Deactivate selected node |
| `P` | Pin data in node |
| `F2` | Rename node |
| `Delete` | Delete node |
| `Shift + S` | Add sticky note |
| `Shift + Arrow Left/Right` | Select all nodes left/right |
| `=` | Switch to expressions mode (in empty input) |

#### Command Bar
- `Ctrl/Cmd + K` — Opens command bar for workflow actions, resource navigation, execution controls

---

## 3. Node Types & Categories

### Core Nodes (67 nodes)

Complete list of built-in core nodes:

1. Activation Trigger
2. Aggregate
3. AI Transform
4. Chat
5. Chat Trigger
6. Code
7. Compare Datasets
8. Compression
9. Convert to File
10. Crypto
11. Data table
12. Date & Time
13. Debug Helper
14. Edit Fields (Set)
15. Edit Image
16. Email Trigger (IMAP)
17. Error Trigger
18. Evaluation
19. Evaluation Trigger
20. Execute Command
21. Execute Sub-workflow
22. Execute Sub-workflow Trigger
23. Execution Data
24. Extract From File
25. Filter
26. FTP
27. Git
28. GraphQL
29. Guardrails
30. HTML
31. HTTP Request
32. If
33. JWT
34. LDAP
35. Limit
36. Local File Trigger
37. Loop Over Items (Split in Batches)
38. Manual Trigger
39. Markdown
40. MCP Client
41. MCP Server Trigger
42. Merge
43. n8n
44. n8n Form
45. n8n Form Trigger
46. n8n Trigger
47. No Operation, do nothing
48. Read/Write Files from Disk
49. Remove Duplicates
50. Rename Keys
51. Respond to Webhook
52. RSS Read
53. RSS Feed Trigger
54. Schedule Trigger
55. Send Email
56. Sort
57. Split Out
58. SSE Trigger
59. SSH
60. Stop And Error
61. Summarize
62. Switch
63. TOTP
64. Wait
65. Webhook
66. Workflow Trigger
67. XML

### Node Type Classifications

| Type | Description | Examples |
|------|-------------|---------|
| **Trigger nodes** | Start workflows on events/schedules | Webhook, Schedule, Form Trigger, App Event triggers |
| **Action nodes** | Perform operations on services | HTTP Request, Send Email, database operations |
| **Logic/Flow nodes** | Control execution flow | IF, Switch, Merge, Loop Over Items, Filter |
| **Utility nodes** | Transform/manipulate data | Code, Edit Fields, Aggregate, Sort, Summarize |
| **Cluster nodes** | AI/ML grouped functionality | AI Agent (root) + LLM/Memory/Tools (sub-nodes) |

### Integration Nodes

- **400+ pre-built integrations** across categories:
  - AI & Machine Learning
  - Communication (Slack, Teams, Discord, Telegram, WhatsApp)
  - CRM & Sales (Salesforce, HubSpot, Pipedrive)
  - Data & Storage (PostgreSQL, MySQL, MongoDB, Redis, S3)
  - Developer Tools (GitHub, GitLab, Jira, Linear)
  - Marketing (Mailchimp, ActiveCampaign, SendGrid)
  - Productivity (Notion, Airtable, Google Sheets, Monday.com)
  - Payment (Stripe, PayPal)
  - Cloud Platforms (AWS, Azure, Google Cloud)

---

## 4. AI & LangChain Nodes

### Overview

n8n provides ~70 dedicated AI nodes built on LangChain, organized as **cluster nodes** (root + sub-nodes).

### Root Nodes

#### AI Agent (Primary)
Agent variants:
- **Conversational Agent** — Dialogue-based interactions
- **OpenAI Functions Agent** — OpenAI function calling
- **Plan and Execute Agent** — Complex task decomposition
- **ReAct Agent** — Reasoning and action combined
- **SQL Agent** — Database query specialization
- **Tools Agent** — General-purpose tool orchestration

#### Chain Nodes
- **Basic LLM Chain** — Simple prompt → response
- **Question and Answer Chain** — Document-based Q&A
- **Summarization Chain** — Text summarization
- **Information Extractor** — Structured data extraction
- **Text Classifier** — Text categorization
- **Sentiment Analysis** — Sentiment detection
- **LangChain Code** — Custom LangChain code

### Sub-Nodes

#### Language Models (Chat)
| Provider | Node |
|----------|------|
| Anthropic | `lmchatanthropic` |
| AWS Bedrock | `lmchatawsbedrock` |
| Azure OpenAI | `lmchatazureopenai` |
| Cohere | `lmchatcohere` |
| DeepSeek | `lmchatdeepseek` |
| Google Gemini | `lmchatgooglegemini` |
| Google Vertex | `lmchatgooglevertex` |
| Groq | `lmchatgroq` |
| Mistral Cloud | `lmchatmistralcloud` |
| Ollama | `lmchatollama` |
| OpenAI | `lmchatopenai` |
| OpenRouter | `lmchatopenrouter` |
| Vercel AI Gateway | — |

#### Embeddings
AWS Bedrock, Azure OpenAI, Cohere, Google Gemini, Google PaLM, Google Vertex, HuggingFace Inference, Mistral Cloud, Ollama, OpenAI

#### Vector Stores
| Store | Node |
|-------|------|
| Azure AI Search | Vector Store |
| Chroma | Vector Store |
| Milvus | Vector Store |
| MongoDB Atlas | Vector Store |
| PGVector | Vector Store |
| Pinecone | Vector Store |
| Qdrant | Vector Store |
| Redis | Vector Store |
| Simple (in-memory) | Vector Store |
| Supabase | Vector Store |
| Weaviate | Vector Store |
| Zep | Vector Store |

#### Memory Types
- Simple Memory (buffer window)
- Chat Memory Manager
- Motorhead
- MongoDB Chat Memory
- Redis Chat Memory
- Postgres Chat Memory
- Xata
- Zep

#### Tools
- AI Agent Tool
- Calculator
- Custom Code Tool
- MCP Client Tool
- SearXNG
- SerpApi
- Think Tool
- Vector Store QA Tool
- Wikipedia
- Wolfram|Alpha
- n8n Workflow Tool

#### Other Sub-Nodes
- **Data Loading**: Default Data Loader, GitHub Document Loader
- **Output Parsers**: Auto-fixing, Item List, Structured
- **Retrievers**: Contextual Compression, MultiQuery, Vector Store, Workflow
- **Text Splitters**: Character, Recursive Character, Token Splitter
- **Reranker**: Cohere
- **Model Selector**

---

## 5. Data Flow & Expressions

### Data Structure

- All data flows between nodes as **JSON arrays of items**
- Each item is an object with a `json` property (and optionally `binary`)
- Format: `[{ json: { key: "value" } }, { json: { key: "value2" } }]`
- Nodes process items one at a time by default — each run accesses the current item

### Binary Data

- Files (images, PDFs, etc.) stored as Base64-encoded strings
- Accessed via `$binary` variable
- ~33% size increase from encoding
- Nodes handle encoding/decoding automatically
- Storage options: filesystem (default), database (PostgreSQL), S3 (required for queue mode)

### Expressions

n8n uses a templating language called **Tournament**, extended with custom methods, variables, and data transformation functions.

**Basic syntax**: `{{ your JavaScript expression here }}`

#### Core Variables

| Variable | Purpose |
|----------|---------|
| `$json` | Current item's JSON data |
| `$json.fieldName` | Access specific property |
| `$binary` | Current item's binary data |
| `$input.all()` | All input items as array |
| `$input.item` | Current item (per-item mode) |
| `$itemIndex` | Current item position (0-based) |
| `$("NodeName").first()` | First item from named node |
| `$("NodeName").all()` | All items from named node |
| `$("NodeName").last()` | Last item from named node |
| `$now` | Current timestamp (Luxon DateTime) |
| `$today` | Today at midnight |
| `$execution.id` | Current execution ID |
| `$workflow` | Workflow metadata (isActive, id, name) |
| `$prevNode.name` | Previous node name |
| `$runIndex` | Current run index |
| `$vars.variableName` | Custom variable access |
| `$env` | Environment variables (when allowed) |

#### Built-in Libraries

- **Luxon** — Date/time manipulation (`$now.toFormat("yyyy-MM-dd")`, `$now.plus({days: 7})`)
- **JMESPath** — JSON querying (`$jmespath($input.all(), '[?json.status == \'active\']')`)

#### Common Expression Patterns

```javascript
// String operations
{{ $json.text.trim().toLowerCase() }}
{{ $json.firstName + " " + $json.lastName }}
{{ $json.email.split('@')[1] }}

// Null safety
{{ $json?.user?.email }}
{{ $json.value ?? "default" }}
{{ $json.status === 'active' ? 'Online' : 'Offline' }}

// Array operations
{{ $json.items.map(item => item.name) }}
{{ $json.products.filter(p => p.inStock) }}
{{ $json.tags.join(', ') }}

// Date operations
{{ $now.toFormat("yyyy-MM-dd") }}
{{ $json.date.toDateTime().year }}

// JSON conversion
{{ $json.toJsonString() }}

// Regex
{{ $json.text.match(/\d{4}-\d{2}-\d{2}/)[0] }}
```

---

## 6. Connections & Workflow Structure

### Connections

- Nodes connect via output → input connectors
- Data flows left-to-right through connections
- Some nodes have multiple outputs (IF has true/false, Switch has multiple branches)
- Merge node combines multiple input streams

### Branching & Logic

| Node | Purpose | Outputs |
|------|---------|---------|
| **IF** | Conditional branching | True / False |
| **Switch** | Multi-way branching | Multiple named outputs |
| **Merge** | Combine data streams | Single merged output |
| **Filter** | Pass/block items | Matching items only |
| **Loop Over Items** | Iterate in batches | Loop body / Done |

### Sub-workflows

- **Execute Sub-workflow** node calls another workflow
- Sub-workflow must contain an **Execute Sub-workflow Trigger** node
- Input fields defined in trigger are pulled into calling workflow
- Can pass data between parent and child workflows
- Settings control which workflows can call the sub-workflow
- v2.0 fixes: Parent workflows correctly pause/wait for sub-workflows with Wait nodes

### Workflow Execution Modes

- **Manual execution**: Triggered from editor UI, uses test webhook URLs
- **Production execution**: Active workflows triggered by real events, uses production URLs
- **Queue mode**: Distributed execution across workers (see Hosting section)

---

## 7. Credentials & Authentication

### Supported Authentication Types

| Method | Description | Example Services |
|--------|-------------|------------------|
| **API Key** | Secret key in header/query | OpenAI, Airtable, Mailchimp |
| **Basic Auth** | Username + password | Older systems, basic APIs |
| **Header Auth** | Custom header authentication | Custom APIs |
| **OAuth2** | Token-based authorization flow | Google, GitHub, Salesforce, Slack |
| **Service Account** | Server-to-server auth | Google Cloud services |
| **Bearer Token** | Token in Authorization header | Many REST APIs |
| **SSH Key** | Key-based authentication | SSH, SFTP servers |
| **Database Credentials** | Connection strings | MySQL, PostgreSQL, MongoDB |

### Credential Management

- Credentials stored encrypted in n8n database using `N8N_ENCRYPTION_KEY`
- Credential sharing between users within projects
- Credentials never exposed in API list operations (secrets redacted)
- Predefined credential types for 200+ services
- Generic credential types for custom APIs (HTTP Request node)
- Support for HashiCorp Vault and environment-based secrets

### Service Categories with Credentials

- **Cloud**: AWS, Azure, Google Cloud, Vercel
- **Communication**: Slack, Teams, Discord, Telegram, WhatsApp
- **CRM**: Salesforce, HubSpot, Pipedrive, Copper
- **AI/ML**: OpenAI, Anthropic, Cohere, Mistral, Perplexity, DeepSeek, Groq
- **Databases**: 15+ SQL and NoSQL platforms
- **Productivity**: Airtable, Notion, Monday.com, ClickUp
- **Payment**: Stripe, PayPal, Chargebee
- **Email**: Gmail (IMAP/SMTP), Outlook, Yahoo, generic SMTP
- **Enterprise SSO**: LDAP, OIDC, SAML, Microsoft Entra ID

---

## 8. Workflow Features

### Workflow States (v2.0+)

- **Draft**: Saved edits that don't affect production
- **Published**: Active production version
- **Save** button preserves edits without changing production
- **Publish** button pushes changes live

### Execution Management

- **Execution history**: View past executions with status, duration, data
- **Execution statuses**: `canceled`, `error`, `running`, `success`, `waiting`
- **Data pinning**: Pin specific output data for testing without re-executing
- **Data mocking**: Use mock data during development
- **Retry**: Re-run failed executions (with original or latest workflow version)

### Workflow Settings

- **Error workflow**: Designate a separate workflow to handle errors
- **Timeout**: Set maximum execution time
- **Save execution data**: Control what gets saved
- **Timezone**: Override instance timezone
- **Caller policy**: Control which workflows can call as sub-workflow

### Tags & Organization

- Tag workflows for categorization
- Filter workflows by tags
- Project-based organization with role assignments

### Templates

- **8,300+ community templates** available at n8n.io/workflows
- Import/export workflows as JSON
- Share workflows via JSON files or template library

### Version Control

- Git-compatible workflow versioning
- Track changes and revert to previous versions
- Workflow version history accessible via API

---

## 9. Error Handling

### Workflow-Level Error Handling

- **Error Workflow**: Separate workflow triggered on failure via Error Trigger node
- **Error Trigger node**: Receives error details (message, node, execution ID, workflow info)

### Node-Level Options

| Option | Behavior |
|--------|----------|
| **Stop on fail** | Halts workflow execution (default) |
| **Continue on fail** | Skips failed node, continues workflow |
| **Continue (using error output)** | Routes to error output branch (red connector) |
| **Retry on fail** | Retries with configurable attempts and delay |

### Retry Configuration

- **Max tries**: Number of retry attempts
- **Wait between tries**: Delay between retries (supports exponential backoff)
- **Important**: If "Retry on Fail" AND "Continue on Error" are both enabled, retries are skipped

### Advanced Patterns

- **Dead-Letter Queue (DLQ)**: Route failed items to separate storage for inspection
- **Try/Catch in loops**: Continue processing remaining items when one fails
- **Error output branching**: Handle errors differently per node
- **Self-healing workflows**: Auto-detect and resolve issues

---

## 10. Self-Hosting & Deployment

### Docker (Primary Method)

- Official image: `docker.n8n.io/n8nio/n8n`
- Runs as non-root user `node:node` (since v1.0)
- Default port: **5678**
- Data persists in `/home/node/.n8n` volume mount

**Minimal Docker Compose**:
```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
    environment:
      - GENERIC_TIMEZONE=America/New_York
      - TZ=America/New_York
```

### Database Options

| Database | Use Case | Queue Mode |
|----------|----------|------------|
| **SQLite** (default) | Development, small deployments (<1000 exec/day) | Not supported |
| **PostgreSQL** (recommended) | Production, queue mode | Required |

### Execution Modes

#### Main Mode (Default)
Single process handles: UI, webhooks, workflow execution, scheduled triggers.

#### Queue Mode (Horizontal Scaling)
Distributed execution using Redis as message broker.

**Requirements**:
- `EXECUTIONS_MODE=queue` on all processes
- Redis accessible to all instances
- PostgreSQL (SQLite not supported)
- Shared `N8N_ENCRYPTION_KEY` across all processes
- S3-compatible storage for binary data

**Components**:
- **Main process**: UI, webhook handling, scheduling
- **Workers**: `n8n worker --concurrency 5` — execute workflows
- **Webhook processors**: Dedicated webhook handling (optional)

### Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `N8N_ENCRYPTION_KEY` | Auto-generated | Credential encryption (MUST be same across instances) |
| `EXECUTIONS_MODE` | `main` | Execution architecture (`main` or `queue`) |
| `DB_TYPE` | `sqlite` | Database type (`sqlite` or `postgresdb`) |
| `WEBHOOK_URL` | `http://localhost:5678/` | Public webhook URL |
| `N8N_HOST` | `localhost` | Hostname |
| `N8N_PORT` | `5678` | Application port |
| `N8N_PROTOCOL` | `http` | HTTP protocol |
| `GENERIC_TIMEZONE` | `America/New_York` | Schedule node timezone |
| `EXECUTIONS_DATA_PRUNE` | `true` | Auto-prune execution data |
| `EXECUTIONS_DATA_MAX_AGE` | `336` (14 days) | Retention period in hours |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT` | `10000` | Max executions to retain |
| `EXECUTIONS_TIMEOUT` | `-1` (disabled) | Default workflow timeout (seconds) |
| `N8N_RUNNERS_ENABLED` | `true` (v2.0) | Task runner isolation |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `true` (v2.0) | Block env access from Code node |
| `NODE_FUNCTION_ALLOW_BUILTIN` | empty | Allowed Node.js built-in modules |
| `NODE_FUNCTION_ALLOW_EXTERNAL` | empty | Allowed npm packages |

### Queue Mode Redis Variables

| Variable | Default |
|----------|---------|
| `QUEUE_BULL_REDIS_HOST` | `localhost` |
| `QUEUE_BULL_REDIS_PORT` | `6379` |
| `QUEUE_BULL_REDIS_PASSWORD` | (empty) |
| `QUEUE_BULL_REDIS_DB` | `0` |

### Kubernetes Deployment

- Standard manifests for n8n + PostgreSQL
- Supported on AWS EKS, GCP GKE, Azure AKS
- Resource recommendations: 256Mi–4Gi+ RAM depending on scale
- Horizontal Pod Autoscaler for workers

### Multi-Main Setup (Enterprise)

- Multiple main processes with automatic leader election via Redis
- One leader handles schedule triggers, polling, persistent connections
- Load balancer with sticky sessions required
- `N8N_MULTI_MAIN_SETUP_ENABLED=true`

### Data Directory Structure

```
~/.n8n/
├── database.sqlite (if used)
├── encryption.key
├── config/
├── custom/nodes/
├── nodes/
├── binary-data/
└── .cache/
```

---

## 11. n8n REST API

### Authentication

All requests require the `X-N8N-API-KEY` header. Generate keys from **Settings > API** in n8n UI. Key displayed only once — store securely.

### Base URL

`/api/v1` relative to your n8n instance URL.

### Endpoints

#### Workflows
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/workflows` | Create workflow |
| `GET` | `/api/v1/workflows` | List all (filter by active, tags, name, projectId) |
| `GET` | `/api/v1/workflows/{id}` | Get specific workflow |
| `PUT` | `/api/v1/workflows/{id}` | Update workflow |
| `GET` | `/api/v1/workflows/{id}/{versionId}` | Get specific version |
| `POST` | `/api/v1/workflows/{id}/activate` | Activate workflow |
| `POST` | `/api/v1/workflows/{id}/deactivate` | Deactivate workflow |
| `PUT` | `/api/v1/workflows/{id}/transfer` | Transfer to project |
| `GET` | `/api/v1/workflows/{id}/tags` | List tags |
| `PUT` | `/api/v1/workflows/{id}/tags` | Update tags |

#### Executions
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/executions` | List (filter: status, workflowId, projectId) |
| `GET` | `/api/v1/executions/{id}` | Get execution (optional includeData) |
| `DELETE` | `/api/v1/executions/{id}` | Delete execution |
| `POST` | `/api/v1/executions/{id}/retry` | Retry failed execution |

#### Credentials
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/credentials` | List (metadata only, no secrets) |
| `POST` | `/api/v1/credentials` | Create credential |
| `PATCH` | `/api/v1/credentials/{id}` | Update (owner only) |
| `DELETE` | `/api/v1/credentials/{id}` | Delete (owner only) |
| `GET` | `/api/v1/credentials/schema/{type}` | Get credential schema |

#### Users
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/users` | List users (owner only) |
| `POST` | `/api/v1/users` | Create user(s) |
| `GET` | `/api/v1/users/{id}` | Get user |
| `DELETE` | `/api/v1/users/{id}` | Delete user |
| `PATCH` | `/api/v1/users/{id}/role` | Change role |

#### Tags, Variables, Audit
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST/GET/PUT/DELETE` | `/api/v1/tags[/{id}]` | CRUD tags |
| `POST/GET/DELETE` | `/api/v1/variables[/{id}]` | CRUD variables |
| `POST` | `/api/v1/audit` | Generate security audit |
| `POST` | `/api/v1/source-control/pull` | Pull from Git (Enterprise) |

### Pagination

Cursor-based pagination across all list endpoints:
- `limit`: Max items per response
- `cursor`: Opaque token for next page

### HTTP Status Codes

- `200/201`: Success
- `204`: Success (no content)
- `400`: Invalid request
- `401`: Missing/invalid API key
- `403`: Insufficient permissions
- `404`: Resource not found
- `409`: Conflict

---

## 12. MCP Integration

### Native MCP Nodes

n8n provides two native MCP nodes:

#### MCP Server Trigger
- Exposes n8n workflows as MCP tools for external AI agents
- Connects to and executes tool nodes (unlike conventional triggers)
- Clients can `listTools()` and `callTool()` against the endpoint
- Supports **SSE** (deprecated) and **Streamable HTTP** (recommended) transports
- Authentication: Bearer token

**Limitations**:
- Requires persistent connections (SSE/streamable HTTP)
- Queue mode: Works with single webhook replica; multiple replicas need `/mcp*` routing to dedicated replica
- Reverse proxy: Must disable buffering for MCP endpoint

#### MCP Client Tool
- Connects to external MCP servers as an AI agent sub-node
- Configure with SSE endpoint URL
- n8n AI agents can discover and call tools from external MCP servers

### Community MCP Servers

- **n8n-mcp** (czlonkowski): Provides AI assistants access to n8n node documentation, properties, and operations
- **n8n-nodes-mcp** (nerding-io): Custom n8n node for MCP integration
- **n8n-mcp-server** (illuminaresolutions): Secure interaction with n8n workflows via MCP

---

## 13. Security & User Management

### Instance Authentication

| Method | Availability |
|--------|-------------|
| Email/Password | All plans |
| Two-Factor Auth (2FA) | All plans (enforceable on Enterprise) |
| LDAP | Enterprise |
| OIDC (OpenID Connect) | Enterprise |
| SAML | Enterprise |

### User Roles

#### Instance-Level Roles
| Role | Capabilities |
|------|-------------|
| **Owner** | Full instance control, user management, API key management |
| **Admin** | Most administrative functions |
| **Member** | Standard workflow access |

#### RBAC (Role-Based Access Control)
- Available on all paid plans
- Project-level access control
- Super admin user roles

### Security Features

- **Encrypted credentials**: All credentials encrypted with `N8N_ENCRYPTION_KEY`
- **SSL/TLS**: Configurable HTTPS
- **Audit logs**: Track user actions (Enterprise)
- **Log streaming**: Forward logs to external systems
- **Data pruning**: Automatic execution data cleanup
- **Non-root Docker**: Containers run as `node:node` user
- **Task runners** (v2.0): Code executes in isolated processes
- **Environment variable blocking** (v2.0): Code nodes can't access env vars by default
- **File access controls**: Configurable allowed directories
- **HIPAA, GDPR, SOC 2** compliance support (self-hosted)

### v2.0 Security Defaults

| Setting | Default |
|---------|---------|
| `N8N_RUNNERS_ENABLED` | `true` (isolated execution) |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `true` |
| Execute Command node | Disabled |
| Local File Trigger | Disabled |

---

## 14. Code Node & Custom Code

### Code Node Overview

Replaces legacy Function and Function Item nodes (since v0.198.0). Supports JavaScript and Python.

### Execution Modes

| Mode | Behavior | Access |
|------|----------|--------|
| **Run Once for All Items** | Single execution, all items | `$input.all()` returns array |
| **Run Once for Each Item** | Per-item execution | `$input.item` returns current item |

### JavaScript

- Full async/await support
- `console.log()` for debugging
- n8n built-in methods with `$` prefix
- Module imports blocked by default

**Enable modules (self-hosted)**:
- `NODE_FUNCTION_ALLOW_BUILTIN` — e.g., `"fs,path"` or `"*"`
- `NODE_FUNCTION_ALLOW_EXTERNAL` — e.g., `"lodash,moment"`

**n8n Cloud pre-approved**: `crypto`, `moment`

### Python

- **v2.0+**: Native Python via isolated task runners
- Uses underscore prefix: `_items`, `_item` (not `$`)
- Bracket notation required: `item["json"]["field"]`
- Full Python standard library
- Third-party modules require allowlisting
- `N8N_PYTHON_ENABLED=true` (default)

### Execute Command Node

- Runs shell commands on host system
- **Not available on n8n Cloud**
- **Disabled by default in v2.0** (must explicitly enable)
- Docker: Commands run in container, not host
- Security warning: Significant risk in multi-user environments

### Custom Node Development

- Use `npm create @n8n/node` to scaffold
- Declarative (low-code) style recommended for HTTP API nodes
- Publish to npm for community distribution
- ~5,834 community nodes indexed (as of Jan 2026)
- Growth rate: ~18 new community nodes per day

---

## 15. Community & Ecosystem

### Community Statistics

- **40,000+ GitHub stars**
- **5,834+ community nodes** on npm
- **8,300+ workflow templates** on n8n.io
- **8+ million** community node downloads
- Active community forum, Discord, and Reddit (r/n8n)

### Community Node Categories

| Category | Top Examples |
|----------|-------------|
| Communication & Messaging | Evolution API (6.6M downloads), ChatWoot, Z-API, WAHA WhatsApp |
| Document & Content | QR code generation, PDF generation, Handlebars templates |
| Browser Automation | Firecrawl (283K downloads), Puppeteer, SerpApi |
| Data Processing | Globals, text manipulation, OCR (Tesseract), phone parsing |
| API & Cloud | Kommo CRM, Brave Search, Tavily, Apify, Power BI |
| AI, LLM & Voice | ElevenLabs (800K downloads), MCP, DeepSeek |
| File & PDF | PDF.co, DOCX filling, HTML-to-PDF |

### Resources

- **Official docs**: docs.n8n.io
- **Templates**: n8n.io/workflows
- **Integrations**: n8n.io/integrations
- **awesome-n8n**: github.com/restyler/awesome-n8n
- **Community forum**: community.n8n.io
- **YouTube**: Official n8n channel
- **Blog**: blog.n8n.io

---

## 16. Pricing & Competitors

### n8n Pricing

#### Cloud Plans

| Plan | Price | Executions/Month | Active Workflows |
|------|-------|-------------------|-----------------|
| **Starter** | ~$20-24/mo | 2,500 | 5 |
| **Pro** | ~$50-120+/mo | 10,000-50,000+ | 15+ |
| **Enterprise** | Custom | Custom | Custom |

#### Self-Hosted

| Edition | Cost | Notes |
|---------|------|-------|
| **Community** | Free (fair-code) | Infrastructure costs (~$5-10/mo VPS) |
| **Enterprise** | Custom | SSO, RBAC, audit logs, support SLAs |

#### Pricing Model

n8n charges per **complete workflow execution** — one run = one execution regardless of how many nodes/API calls. This is more cost-effective for complex workflows than:
- **Zapier**: Per task (per successful action step)
- **Make**: Per operation (per module action)

### Competitor Comparison

| Feature | n8n | Zapier | Make |
|---------|-----|--------|------|
| **Pricing model** | Per execution | Per task | Per operation |
| **Self-hosting** | Yes | No | No |
| **Code integration** | JS + Python | Limited | Limited |
| **Integrations** | 400+ (any API via HTTP) | 6,000-7,000+ | 1,500-2,000+ |
| **AI nodes** | 70+ LangChain nodes | App-based | App-based |
| **Git version control** | Yes | No | No |
| **Custom nodes** | SDK + npm | No | No |
| **Open source** | Fair-code | No | No |
| **Target audience** | Developers/technical | Non-technical | Mixed |
| **Learning curve** | Steeper | Easy | Moderate |

### Real-World Impact

- **Delivery Hero**: Saved 200 hours/month of manual IT work
- **Stepstone Group**: Data integration in 2 hours vs 2 weeks (25x faster)

---

## 17. Version History

### n8n v2.0 (January 5, 2026)

**Theme**: Enterprise hardening, secure-by-default execution.

**Key changes**:
- **Draft/Published workflow states**: Save without affecting production; explicit Publish to go live
- **Task runners default**: Code node executions in isolated environments
- **Environment variable access blocked**: Code nodes can't access env vars by default
- **Execute Command disabled**: Must explicitly re-enable
- **Pyodide removed**: Python now uses native task runners only
- **Sub-workflow fixes**: Parent workflows correctly pause/wait for child Wait nodes
- **UI refinements**: Canvas improvements, sidebar reorganization

**Breaking changes**:
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` by default
- `N8N_RUNNERS_ENABLED=true` by default
- Execute Command and LocalFileTrigger disabled by default
- Pyodide Python support removed entirely
- Migration tool available: Settings > Migration Report

### n8n v1.x (2024-2025)

Major milestones:
- **v1.0**: Non-root Docker, execution pruning default, WebSocket default over SSE
- **v1.x**: 400+ integrations, MCP nodes, AI Agent system, LangChain integration
- Continuous node additions and improvements

---

## 18. GitHub Repository Structure

> Source: [github.com/n8n-io/n8n](https://github.com/n8n-io/n8n)

### Repository Stats (as of February 2026)

| Metric | Value |
| --- | --- |
| Stars | 175,000+ |
| Forks | 55,000+ |
| Total Commits | 17,981 |
| Contributors | 611 |
| Open Issues | 502 |
| Open Pull Requests | 894 |
| Total Releases | 531 |
| Latest Release | n8n@2.8.3 (Feb 13, 2026) |
| Primary Language | TypeScript (91.4%) |
| Secondary Languages | Vue.js (7.2%), SCSS (0.5%), JS (0.4%), Python (0.4%) |

### Monorepo Architecture

n8n uses a **pnpm workspace monorepo** orchestrated by **Turborepo 2.7.3**.

**Top-level directory structure:**

```text
n8n/
├── packages/              # Core monorepo packages (15+)
├── .github/               # GitHub Actions workflows and templates
├── docker/                # Docker and containerization configs
├── scripts/               # Build and automation scripts
├── package.json           # Root workspace configuration
├── pnpm-workspace.yaml    # pnpm workspace definition
├── turbo.json             # Turborepo build orchestration
├── tsconfig.json          # TypeScript configuration
├── jest.config.js         # Jest testing configuration
├── biome.json             # Code quality and formatting (Biome 1.9.0)
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE.md             # Sustainable Use License
└── LICENSE_EE.md          # Enterprise Edition License
```

### Core Packages

| Package | Version | Purpose |
| --- | --- | --- |
| `packages/cli` | v2.9.0 | Backend server, REST API, user management (Express 5.1.0, TypeORM, Bull job queues) |
| `packages/core` | v2.9.0 | Workflow execution engine, node lifecycle, expression evaluation, credential handling |
| `packages/workflow` | v2.9.0 | Workflow data structures, definitions, parsing, validation (lodash, luxon, zod, esprima-next, JMESPath, @langchain/core) |
| `packages/frontend` | - | Vue.js 3 web UI with Tailwind CSS |
| `packages/editor-ui` | - | Visual drag-and-drop workflow editor |
| `packages/nodes-base` | v2.9.0 | 400+ pre-built integration nodes |
| `packages/node-dev` | - | Dev tools for creating custom nodes (scaffolding, testing helpers) |
| `packages/testing` | - | Jest/Vitest test utilities, mock fixtures, test data generators |

### Scoped Packages (`@n8n/*`)

| Package | Purpose |
| --- | --- |
| `@n8n/typeorm` | Custom TypeORM fork with n8n enhancements |
| `@n8n/utils` | Shared utilities across packages |
| `@n8n/typescript-config` | Centralized TypeScript configuration |
| `@n8n/eslint-config` | ESLint rules and configuration |
| `@n8n/stylelint-config` | Style linting configuration |
| `@n8n/nodes-langchain` | LangChain AI integration nodes |

### Extensions

| Package | Purpose |
| --- | --- |
| `packages/extensions/insights` | Analytics, workflow performance, execution dashboards |

### Package Dependency Graph

```text
┌─────────────────────────────────────────────────┐
│   @n8n/typescript-config, eslint-config, etc.   │  (Shared config)
└──────────────────────┬──────────────────────────┘
                       │ extends
       ┌───────────────┼───────────────┐
       │               │               │
  ┌────────┐    ┌──────────┐    ┌──────────┐
  │  CLI   │    │   CORE   │    │ WORKFLOW │
  │(Entry) │    │ (Engine) │    │  (Data)  │
  └───┬────┘    └────┬─────┘    └────┬─────┘
      │              │               │
      └──────────────┼───────────────┘
                     │
       ┌─────────────┴─────────────┐
       │                           │
  ┌──────────┐            ┌────────────┐
  │NODES-BASE│            │  FRONTEND  │
  │(Integr.) │            │  (Web UI)  │
  └──────────┘            └────────────┘
```

### Build System & Tooling

| Tool | Version | Purpose |
| --- | --- | --- |
| Turborepo | 2.7.3 | Parallel task execution across monorepo |
| pnpm | 10.22.0 | Package manager (enforced via corepack) |
| Biome | 1.9.0 | Linting + formatting (replacing Prettier) |
| ESLint | - | Additional linting via @n8n/eslint-config |
| Jest | 29.6.2 | Primary testing framework |
| Vitest | - | Supplementary test runner |
| Playwright | - | E2E browser testing |
| tsc-alias | 1.8.10 | TypeScript path alias resolution |
| Node.js | >=22.16 | Required runtime |

**Turbo pipeline:**

- `build` depends on upstream `^build` (packages built in dependency order)
- `typecheck` depends on `^typecheck` + `^build`
- `test` depends on `^build` + local `build`
- Output caching: `dist/`, `build/`, `coverage/**`, `*.xml`

### CI/CD (GitHub Actions)

**Build & Release:**

- `build-base-image.yml` - Docker base images
- `docker-build-push.yml` - Build and publish Docker images
- `release-publish.yml` - Official releases to npm/GitHub
- `release-create-pr.yml` - Release PRs with changelog
- `build-windows.yml` - Windows native builds

**Testing:**

- `ci-pull-requests.yml` - PR validation
- `ci-master.yml` - Main branch testing
- `test-unit-reusable.yml` - Unit test suites
- `test-e2e-reusable.yml` - End-to-end scenarios
- `test-db-reusable.yml` - Database validation (SQLite, PostgreSQL, MariaDB)
- `test-workflows-nightly.yml` - Scheduled workflow testing

**Security:**

- `sec-ci-reusable.yml` - Security CI
- `security-trivy-scan-callable.yml` - Trivy vulnerability scanning
- `sbom-generation-callable.yml` - Software bill of materials

### Contributing Guidelines

**Prerequisites:**

- Node.js >=24 (strict)
- pnpm >=10.22 (strict, via corepack)
- Platform build tools (build-essential/Xcode/VS Build Tools)

**Development modes:**

```bash
pnpm dev        # Full development (backend + frontend)
pnpm dev:be     # Backend only (faster)
pnpm dev:fe     # Frontend only
pnpm dev:ai     # AI/LangChain nodes development
N8N_DEV_RELOAD=true pnpm dev  # Hot reload for nodes
```

**PR requirements:**

- Small, focused PRs addressing a single feature
- Tests required (auto-close after 14 days without tests)
- Follow PR title convention
- No `ts-ignore` comments
- Spell-checking required
- 14-day response deadline for requested changes
- New node PRs auto-close unless explicitly requested by n8n team

### Licensing

**Sustainable Use License v1.0** (main codebase):

- Non-exclusive, royalty-free worldwide license
- Permitted: internal business, non-commercial, personal use
- Distribution: only free of charge for non-commercial purposes
- Commercial use requires n8n Enterprise License
- 30-day grace period for violations

**n8n Enterprise License** (files containing `.ee.` in path):

- Advanced permissions, SSO, source control integration
- External secrets management, log streaming
- Insights dashboards, air-gapped deployments
- Commercial usage rights, priority support

---

## 19. nodes-base Package Deep Dive

> Source: [github.com/n8n-io/n8n/tree/master/packages/nodes-base](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base)

### Package Overview

`n8n-nodes-base` (v2.9.0) is the default collection of 400+ pre-built integration nodes. It's the largest package in the monorepo.

### Directory Structure

```text
packages/nodes-base/
├── credentials/           # 500+ OAuth, API key, and auth credential implementations
├── nodes/                 # 400+ node implementations organized alphabetically by service
├── types/                 # TypeScript type definitions and interfaces
├── utils/                 # Shared utility functions and helpers
├── scripts/               # Build and utility scripts
├── test/                  # Test files and test utilities
├── package.json           # Package metadata and dependencies
├── index.js               # Main entry point exporting all nodes and credentials
├── tsconfig.json          # TypeScript configuration
└── jest.config.js         # Jest test configuration
```

### Node File Patterns

Each node follows a consistent file structure:

| File Pattern | Purpose |
| --- | --- |
| `[ServiceName].node.ts` | Main `INodeType` implementation (e.g., `Slack.node.ts`) |
| `[ServiceName]Description.ts` | Separated `INodeTypeDescription` metadata |
| `[ServiceName]V1.node.ts` | Version-specific implementation |
| `GenericFunctions.ts` | Service-specific helper utilities |
| `types.d.ts` | Node-specific type definitions |

### Node Organization

Nodes are organized **alphabetically by service name** in the `nodes/` directory:

**Communication:** Slack, Discord, Telegram, Twilio, WhatsApp, Microsoft Teams, Email, SMTP

**Business Tools:** Salesforce, HubSpot, Pipedrive, Jira, Monday.com, Asana, Notion, Airtable, Google Sheets, Zendesk

**Databases:** PostgreSQL, MongoDB, MySQL, Snowflake, BigQuery, Elasticsearch, Firebase, DynamoDB, Cassandra

**Cloud Services:** AWS (S3, Lambda, etc.), Google Cloud, Microsoft Azure, Dropbox, Box, OneDrive

**Marketing/CRM:** Mailchimp, Brevo, GetResponse, Mautic, ActiveCampaign, Pardot, Klaviyo

**Core/Utility Nodes:** HTTP Request (V1-V3), Webhook, Code, Function, Filter, Merge, Split Out, Set, Rename Keys, Transform, Aggregate

### INodeType Interface

Every node implements the `INodeType` interface:

```typescript
class MyNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: string;           // User-visible name
    name: string;                  // Internal ID (e.g., 'n8n-nodes-base.slack')
    icon: string;                  // Icon reference or data URI
    group: string[];               // Categories: 'trigger', 'output', 'transform'
    subtitle?: string;             // Dynamic display subtitle
    version: number | number[];    // Supported versions
    defaultVersion?: number;       // Default version to use
    description?: string;          // User-facing description
    properties: INodeProperties[]; // Configuration fields
    credentials?: INodeCredentialDescription[];
    webhookMethods?: { ... };      // For trigger nodes
    triggerPanel?: { ... };        // Trigger-specific config
  };

  async execute(): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter('operation', 0) as string;
    const credentials = await this.getCredentials('serviceOAuth2Api');
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      // Operation-specific logic
    }

    return [returnData];
  }
}
```

### Versioned Nodes

For backward compatibility, nodes use a versioning system:

```typescript
// Main class extends VersionedNodeType
class HttpRequest extends VersionedNodeType {
  constructor() {
    const nodeVersions: IVersionedNodeType[] = {
      1: new HttpRequestV1(),
      2: new HttpRequestV2(),
      3: new HttpRequestV3(),  // Latest
    };
    super(nodeVersions);
  }
}
```

**Key versioned nodes:**

- **HTTP Request**: V1 (basic), V2 (OAuth, retries), V3 (enhanced auth, streaming)
- **Slack**: Versions 1, 2.1, 2.2, 2.3, 2.4
- **Code**: Multiple versions with expanding language support
- **Google Sheets**: Multiple versions with expanded operations

**Benefits:**

- Existing workflows continue to work on their original version
- New workflows get the latest version by default
- Users can upgrade versions when ready
- No forced migration or breaking changes

### Trigger Nodes

Trigger nodes differ from regular nodes by implementing webhook lifecycle methods:

```typescript
webhookMethods = {
  default: {
    activate: async function() { /* Register webhook with service */ },
    deactivate: async function() { /* Unregister webhook */ },
    test: async function() { /* Verify webhook works */ }
  }
}
```

**Trigger-specific features:**

- Response modes: `onReceived` (immediate), `responseNode` (delegated), `streaming`
- IP allowlisting and bot/spam detection
- Binary data and multipart form handling
- Custom headers extraction
- Query parameter and path parameter parsing

### Credentials Structure

Credentials live in `packages/nodes-base/credentials/` with naming patterns:

- `[ServiceName]Api.credentials.ts` (API key auth)
- `[ServiceName]OAuth2Api.credentials.ts` (OAuth2 flows)

```typescript
export class SlackOAuth2Api implements ICredentialType {
  name = 'slackOAuth2Api';
  extends = ['oAuth2Api'];  // Inherits base OAuth2 fields
  properties = [
    // Service-specific configuration
    // Grant type, authorization URL, token endpoint, scopes
  ];
}
```

**Credential types supported:** OAuth2, API Keys, Basic Auth, Bearer Token, Service-specific auth (Firebase, AWS IAM, etc.)

**Total:** 500+ credential implementations

### Dependencies

**Database/Message Queues:** MongoDB, MySQL, PostgreSQL, Redis, RabbitMQ, Kafka drivers

**Cloud SDKs:** AWS SDK, Google Cloud libraries, Azure SDK, Dropbox SDK

**Utilities:** Luxon (dates), Lodash (data), UUID, XML parsing, cryptography (js-nacl)

**File Processing:** pdf-parse, xlsx (Excel), cheerio (HTML), sanitize-html

**Email:** Nodemailer (sending), mailparser (parsing)

### Testing

- **Jest** with ts-jest for TypeScript support
- Unit tests per node (`*.test.ts`)
- Integration tests (`*.integration.test.ts`)
- Workflow tests for node behavior validation
- Mock node runner, credential manager, and schema validators
- ESM dependencies transformed via Babel (pdfjs-dist, openid-client, jose, etc.)

### Key Statistics

| Metric | Value |
| --- | --- |
| Total Nodes | 400+ |
| Total Credential Types | 500+ |
| Unique Integrations | 300+ |
| Versioned Nodes | HTTP Request (3), Slack (5), Code, Google Sheets, others |
| Package Version | 2.9.0 |

---

## Sources

- [n8n Official Site](https://n8n.io/)
- [n8n Documentation](https://docs.n8n.io/)
- [n8n API Reference](https://docs.n8n.io/api/api-reference/)
- [n8n GitHub](https://github.com/n8n-io/n8n)
- [n8n Blog](https://blog.n8n.io/)
- [n8n Community Forum](https://community.n8n.io/)
- [awesome-n8n](https://github.com/restyler/awesome-n8n)
- [DeepWiki n8n Analysis](https://deepwiki.com/n8n-io/n8n-docs/)
- [BayTech n8n Overview 2025](https://www.baytechconsulting.com/blog/n8n-overview-2025)
- [HatchWorks n8n Guide 2026](https://hatchworks.com/blog/ai-agents/n8n-guide/)
- [n8n Arena Expressions Cheat Sheet](https://n8narena.com/guides/n8n-expression-cheatsheet/)
- [n8n Docs - Keyboard Shortcuts](https://github.com/n8n-io/n8n-docs/blob/main/docs/keyboard-shortcuts.md)
- [n8n GitHub Repository](https://github.com/n8n-io/n8n)
- [n8n nodes-base Package](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base)
