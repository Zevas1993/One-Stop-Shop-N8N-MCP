# GraphRAG Complete Specification

**Purpose:** Define EXACTLY what the GraphRAG system needs to be and do
**Status:** Specification phase (no implementation until approval)
**Last Updated:** January 25, 2025

---

## 🎯 CORE REQUIREMENTS

### What is GraphRAG for n8n-mcp?

**Primary Purpose:** Enable AI agents to discover the optimal n8n nodes and workflows for ANY user goal using semantic understanding of:
1. What each n8n node does
2. How nodes relate to each other
3. Common workflow patterns
4. Use case mappings

**Not Just:** A database query tool
**Actually:** A semantic understanding system that makes intelligent workflow recommendations

---

## 📊 DATA MODEL SPECIFICATION

### What Data Goes Into The Graph?

#### 1. **ENTITIES (Nodes in Graph)**

```
NODE TYPES:
├─ n8n Node (526 nodes)
│  ├─ ID: "n8n-nodes-base.slack"
│  ├─ Label: "Slack"
│  ├─ Category: "Communication"
│  ├─ Description: "Send messages to Slack channels"
│  ├─ Keywords: ["slack", "message", "channel", "notification", "chat"]
│  ├─ Capabilities: ["send_message", "react_to_message", "list_channels"]
│  └─ Metadata: {versions, properties, operations, requirements}
│
├─ Workflow Pattern (10 patterns)
│  ├─ ID: "pattern-slack-notification"
│  ├─ Label: "Slack Notification"
│  ├─ Description: "Send notifications to Slack on events"
│  ├─ Keywords: ["notification", "alert", "slack", "event-driven"]
│  ├─ Node Template: [Manual Trigger → Slack]
│  └─ Metadata: {use_cases, complexity, success_rate}
│
├─ Use Case (100+ implied)
│  ├─ ID: "usecase-monitor-api"
│  ├─ Label: "Monitor API Health"
│  ├─ Description: "Check API status and alert when down"
│  ├─ Keywords: ["monitor", "api", "health", "alert", "webhook"]
│  └─ Related Nodes: [HTTP Request, Switch, Slack, Database]
│
├─ Category (12 categories)
│  ├─ ID: "category-communication"
│  ├─ Label: "Communication"
│  ├─ Description: "Nodes for sending messages and notifications"
│  └─ Node Count: 45
│
└─ Trigger Type (8 trigger types)
   ├─ ID: "trigger-webhook"
   ├─ Label: "Webhook"
   ├─ Description: "Trigger workflow on HTTP request"
   └─ Compatible Nodes: [All nodes]
```

#### 2. **RELATIONSHIPS (Edges in Graph)**

```
RELATIONSHIP TYPES:

1. Node-to-Node Relationships
   └─ "compatible_with" (Data flow)
      Example: HTTPRequest → JSON → Slack
      Strength: 0.95 (high compatibility)
      Direction: Source → Target

2. Node-to-Category Relationships
   └─ "belongs_to_category"
      Example: Slack → Communication
      Strength: 1.0 (definitive)

3. Node-to-Pattern Relationships
   └─ "used_in_pattern"
      Example: Slack → Slack Notification Pattern
      Strength: 0.9

4. Pattern-to-UseCase Relationships
   └─ "solves"
      Example: Slack Notification Pattern → Send Alerts Use Case
      Strength: 0.85

5. UseCase-to-Node Relationships
   └─ "requires"
      Example: Monitor API → HTTP Request
      Strength: 0.95

6. Node-to-Trigger Relationships
   └─ "triggered_by"
      Example: Slack → Webhook
      Strength: 0.8

7. Semantic Similarity Relationships
   └─ "similar_to"
      Example: Slack → Discord (based on embeddings)
      Strength: 0.75
```

#### 3. **ATTRIBUTES (Metadata)**

Each node has rich metadata:

```json
{
  "node_id": "n8n-nodes-base.slack",
  "label": "Slack",
  "category": "Communication",
  "description": "Send messages to Slack channels...",
  "keywords": ["slack", "message", "notification"],
  "properties": {
    "channel": "required",
    "text": "required",
    "thread_ts": "optional"
  },
  "operations": ["send", "react"],
  "capabilities": {
    "input_types": ["string", "json"],
    "output_types": ["object"],
    "rate_limit": "60 req/min",
    "authentication": "required"
  },
  "use_cases": [
    "Send notifications",
    "Alert on errors",
    "Post updates"
  ],
  "common_workflows": [
    "Slack Notification",
    "Error Alert",
    "Daily Report"
  ],
  "similar_nodes": [
    "discord",
    "telegram",
    "email-send"
  ],
  "version_history": ["1.0", "2.0", "2.1"],
  "success_metrics": {
    "used_in_workflows": 1250,
    "avg_rating": 4.8,
    "reliability": 0.98
  }
}
```

---

## 🔍 QUERY & SEARCH SPECIFICATION

### What Queries Should GraphRAG Answer?

#### **Type 1: Semantic Node Discovery**
```
User Query: "I want to send notifications to Slack when something happens"
System Should Return:
├─ Best Match: Slack node (confidence: 0.95)
├─ Related Nodes:
│  ├─ HTTP Request (to trigger)
│  ├─ Switch (to conditional)
│  └─ Set (to format message)
├─ Suggested Pattern: "Slack Notification"
└─ Similar Nodes: Discord, Telegram, Email
```

#### **Type 2: Pattern-Based Discovery**
```
User Query: "I need a workflow that monitors an API"
System Should Return:
├─ Matching Patterns:
│  ├─ "HTTP Health Check" (confidence: 0.92)
│  ├─ "Webhook Monitor" (confidence: 0.88)
│  └─ "API Integration" (confidence: 0.85)
├─ Required Nodes: [HTTP Request, Switch, Slack, Database]
├─ Step-by-step: [Webhook → HTTP Request → Switch → Slack]
└─ Why This Works: "Monitors endpoint, alerts on failure"
```

#### **Type 3: Use Case Fulfillment**
```
User Query: "Build a workflow to sync data between systems"
System Should Return:
├─ Primary Nodes: [HTTP Request, Database, Format Data]
├─ Secondary Options: [Cloud Storage, FTP, API]
├─ Workflow Steps: Exact sequence to build
├─ Configuration Tips: Common pitfalls, best practices
└─ Related Workflows: Similar use cases from community
```

#### **Type 4: Node Relationship Discovery**
```
User Query: "What nodes work well with Slack?"
System Should Return:
├─ Common Predecessors: [HTTP Request, Database, Set]
├─ Common Successors: [None typically, it's a sink node]
├─ Data Format Requirements: JSON object expected
├─ Success Stories: 3 common workflow patterns
└─ Common Failures: What doesn't work and why
```

#### **Type 5: Category-Based Discovery**
```
User Query: "Show me communication nodes"
System Should Return:
├─ All Communication Nodes: [Slack, Email, Discord, Telegram, ...]
├─ Subcategories: [Messaging, Call, Notification, ...]
├─ Most Popular: Ranked by usage
├─ Common Combinations: Which work together
└─ Use Case Breakdown: What each is used for
```

---

## 🧠 EMBEDDING & SEMANTIC UNDERSTANDING

### How Does Semantic Search Work?

```
EMBEDDING STRATEGY:

1. For Node Descriptions
   Input: "Send messages to Slack channels and threads"
   Embedding: 384-dimensional vector
   Similarity: Can find similar nodes like Discord, Telegram
   Use: Semantic search for node discovery

2. For Keywords
   Input: ["slack", "message", "notification", "chat"]
   Embedding: Average of keyword embeddings
   Similarity: Finds nodes with similar keywords
   Use: Keyword-based discovery

3. For Use Cases
   Input: "Monitor API health and send alerts"
   Embedding: Semantic understanding of the use case
   Similarity: Finds workflows solving similar problems
   Use: Use case matching

4. For Workflow Patterns
   Input: [HTTP Request, Switch, Slack]
   Embedding: Pattern semantics
   Similarity: Finds similar workflow structures
   Use: Pattern matching and recommendation

EMBEDDING MODEL:
- Name: "all-MiniLM-L6-v2" (Sentence-Transformers)
- Dimensions: 384
- Speed: ~1ms per text
- Accuracy: Good for technical documentation
- Memory: ~50MB loaded
```

### Similarity Computation

```
APPROACH: Cosine Similarity + Weighted Ranking

For Query: "Send Slack notifications"
1. Embed query text → vector Q
2. For each node with embedding E:
   - Compute similarity = cosine(Q, E)
   - Apply category boost: if node category matches +0.1
   - Apply keyword boost: if keywords match +0.05
   - Apply relationship boost: if common pattern +0.05
   - Final score = similarity + boosts
3. Return top-k nodes by final score

MINIMUM THRESHOLD: 0.5 (50% similarity)
```

---

## 💾 STORAGE & PERFORMANCE SPECIFICATION

### Database Requirements

```
REQUIREMENTS:
├─ Capacity: 526 n8n nodes + relationships + embeddings
├─ Embeddings: 384-dim float32 per node = ~1.5MB per node
├─ Total Size: ~850MB for complete graph with embeddings
├─ Queries: <50ms latency for 99th percentile
├─ Throughput: >100 queries/second
└─ Durability: ACID transactions, WAL mode

STORAGE BREAKDOWN:
├─ Nodes table: 500KB (metadata + IDs)
├─ Edges table: 2MB (relationships)
├─ Embeddings: 800MB (384-dim per node)
├─ Indexes: 50MB (query optimization)
└─ Cache: ~50MB (query results)

TECHNOLOGY: SQLite with:
├─ WAL mode (Write-Ahead Logging)
├─ Indexes on frequently queried columns
├─ BLOB storage for embeddings
├─ Query result caching (60s TTL)
└─ Vacuum on startup
```

---

## 🔄 DATA FLOW SPECIFICATION

### How Data Gets Built & Updated

#### **Initial Build (One-time)**
```
Step 1: Extract n8n Nodes
├─ Read nodes.db (existing n8n-mcp database)
├─ Extract: ID, name, description, properties, operations
├─ Count: 526 nodes
└─ Output: Node list with metadata

Step 2: Generate Embeddings
├─ For each node description: Generate 384-dim embedding
├─ Store embeddings in database
├─ Time: ~30 seconds for all nodes
└─ Output: nodes + embeddings

Step 3: Extract Keywords
├─ For each node: Extract keywords from description
├─ Use keyword + semantic extraction
├─ Create keyword-to-node mappings
└─ Output: Keyword index

Step 4: Create Categories
├─ Categorize nodes (Communication, Data, Trigger, etc.)
├─ Create category entities
├─ Create node-to-category relationships
└─ Output: 12 categories with node memberships

Step 5: Build Patterns
├─ Create 10 workflow pattern templates
├─ Link patterns to component nodes
├─ Create pattern-to-node relationships
└─ Output: Pattern library

Step 6: Generate Recommendations
├─ Analyze common node combinations
├─ Create node-to-node relationships (compatibility)
├─ Calculate strength scores
└─ Output: Relationship graph

Step 7: Create Use Cases
├─ Define 50+ common use cases
├─ Map use cases to node combinations
├─ Create use case entities and relationships
└─ Output: Use case database

Result: Complete graph with ~1000+ entities, 5000+ relationships
```

#### **Incremental Updates (Periodic)**
```
Trigger: n8n node database changes detected

Step 1: Detect Changes
├─ Watch nodes.db for modifications
├─ Identify new/updated/deleted nodes
└─ Filter duplicates

Step 2: Extract New Node Data
├─ For new nodes: Extract full metadata
├─ For updated nodes: Re-extract description/properties
├─ Generate embeddings for new content
└─ Store in database

Step 3: Rebuild Relationships
├─ For affected nodes: Recalculate relationships
├─ Update similarity scores
├─ Add to new categories if applicable
└─ Invalidate related caches

Step 4: Update Pattern Compatibility
├─ Check if new nodes fit existing patterns
├─ Create new pattern suggestions
├─ Update pattern recommendations
└─ Recalculate pattern strengths

Result: Graph stays current with n8n updates
```

---

## ⚙️ QUERY EXECUTION SPECIFICATION

### How Queries Get Answered

#### **Query: "Send slack notifications"**

```
Step 1: Parse & Understand
├─ Input: "Send slack notifications"
├─ Intent: Find nodes for sending Slack messages
├─ Keywords: ["send", "slack", "notifications"]
└─ Context: Communication workflow

Step 2: Generate Embeddings
├─ Embed: "Send slack notifications" → 384-dim vector
└─ Store: For potential caching

Step 3: Semantic Search
├─ Find nodes with high embedding similarity
├─ Results:
│  ├─ Slack (similarity: 0.98, rank: 1)
│  ├─ Discord (similarity: 0.85, rank: 2)
│  └─ Telegram (similarity: 0.82, rank: 3)
└─ Filter: Keep only >0.7 similarity

Step 4: Keyword Matching
├─ Find nodes with matching keywords
├─ Results:
│  ├─ Slack ["slack", "message", "notification"]
│  ├─ Email ["send", "notification", "message"]
│  └─ HTTP ["send", "request"]
└─ Boost scores for keyword matches

Step 5: Pattern Matching
├─ Find patterns using these nodes
├─ Results:
│  ├─ "Slack Notification" pattern (uses Slack)
│  ├─ "Alert System" pattern (uses Slack)
│  └─ "Status Update" pattern (uses Slack)
└─ Get templates from patterns

Step 6: Relationship Traversal
├─ Find related nodes 1-2 hops away
├─ Common predecessors: [HTTP Request, Database, Set]
├─ Common successors: None (Slack is typically end)
└─ Add to results with context

Step 7: Rank & Return
├─ Final ranking:
│  ├─ 1st: Slack (primary match)
│  ├─ 2nd: HTTP Request (common predecessor)
│  ├─ 3rd: Switch (common router before Slack)
│  ├─ 4th: Discord (similar alternative)
│  └─ 5th: Email (similar alternative)
├─ Return: Top 10 results with explanations
└─ Cache: Result for 60 seconds

Step 8: Generate Explanation
├─ "You asked about sending Slack notifications"
├─ "The Slack node is perfect for this"
├─ "Common workflow: HTTP Request → Switch → Slack"
├─ "Alternatives: Discord, Telegram, Email"
└─ "Success rate: 98% in production"

Final Response:
{
  "primary": {
    "node": "n8n-nodes-base.slack",
    "confidence": 0.98,
    "explanation": "Perfect match for sending Slack notifications"
  },
  "related": [
    {
      "node": "n8n-nodes-base.httpRequest",
      "relationship": "common_predecessor",
      "reason": "Usually triggered by webhooks or API calls"
    },
    {
      "node": "n8n-nodes-base.switch",
      "relationship": "common_predecessor",
      "reason": "Often used to route messages conditionally"
    }
  ],
  "pattern": "Slack Notification",
  "template": "[Manual Trigger] → [Slack]",
  "use_case": "Send alerts and notifications"
}
```

---

## 🚀 PERFORMANCE REQUIREMENTS

### Speed Targets

```
OPERATION LATENCY TARGETS:

Query Semantic Search
├─ Embed query: <5ms
├─ Vector search: <20ms
├─ Relationship lookup: <10ms
├─ Ranking & filtering: <10ms
└─ Total: <50ms (P95)

Pattern Matching
├─ Pattern similarity search: <30ms
├─ Node relationship lookup: <15ms
└─ Total: <50ms (P95)

Full Use Case Recommendation
├─ Initial search: <50ms
├─ Pattern matching: <30ms
├─ Relationship depth: <20ms
└─ Total: <100ms (P95)

Graph Building (Initial)
├─ Extract 526 nodes: ~5 seconds
├─ Generate embeddings: ~30 seconds
├─ Build relationships: ~10 seconds
└─ Total: ~45 seconds

Graph Update (Incremental)
├─ Detect changes: <1 second
├─ Process new nodes: <5 seconds per node
├─ Update relationships: <10 seconds
└─ Invalidate cache: <100ms
```

### Throughput Targets

```
CONCURRENT QUERIES:
├─ Minimum: 100 queries/second
├─ Peak: 500 queries/second
├─ Burst: 1000 queries/second (with caching)

MEMORY REQUIREMENTS:
├─ Database in memory: ~900MB
├─ Embeddings cache: ~100MB
├─ Query result cache: ~50MB
├─ Overhead: ~50MB
└─ Total: ~1.1GB
```

---

## 🔌 INTEGRATION POINTS SPECIFICATION

### How GraphRAG Integrates with n8n-mcp

```
CURRENT FLOW (Phases 1-4):
  User Query
    ↓
  Pattern Agent (hardcoded patterns)
    ↓
  Workflow Agent (template generation)
    ↓
  Validator Agent (structure validation)
    ↓
  MCP Tools (expose to Claude)
    ↓
  Claude Desktop / HTTP

ENHANCED FLOW (Phase 5 - What GraphRAG Adds):
  User Query
    ↓
  GraphRAG Query Engine (semantic understanding)
    ├─ What nodes exist?
    ├─ What do they do?
    ├─ How do they work together?
    └─ What patterns solve this?
    ↓
  Pattern Agent (now enriched)
    ├─ Better pattern matching
    ├─ Semantic understanding
    └─ Recommendation confidence
    ↓
  Workflow Agent (now smarter)
    ├─ Generate from GraphRAG patterns
    ├─ Better node selection
    └─ Optimized configurations
    ↓
  Validator Agent (same as before)
    ↓
  MCP Tools (with GraphRAG data)
    ├─ query_graph: "What nodes solve X?"
    ├─ recommend_nodes: "What nodes should I use?"
    └─ explain_pattern: "Why this workflow works"
    ↓
  Claude Desktop / HTTP
```

### New MCP Tools Enabled

```
1. query_graph(query: string) → SearchResult
   - Semantic search across graph
   - Returns: Top nodes, patterns, recommendations

2. recommend_nodes(goal: string) → Recommendation
   - Smart node recommendation
   - Returns: Best nodes + reasoning

3. find_pattern(goal: string) → Pattern
   - Find workflow patterns
   - Returns: Pattern template + components

4. explain_workflow(nodes: string[]) → Explanation
   - Explain why nodes work together
   - Returns: Relationships + reasoning

5. get_alternatives(node_id: string) → Alternatives
   - Find similar nodes
   - Returns: Alternative nodes + comparison
```

---

## ✅ SUCCESS CRITERIA

GraphRAG is complete when:

1. **Knowledge Graph Built**
   - ✅ All 526 n8n nodes extracted and indexed
   - ✅ All relationships discovered and scored
   - ✅ All embeddings generated and stored
   - ✅ Database size: <1GB

2. **Semantic Search Working**
   - ✅ Query latency: <50ms P95
   - ✅ Accuracy: >85% for common queries
   - ✅ Throughput: >100 queries/second

3. **Pattern Matching Accurate**
   - ✅ All 10 patterns in graph
   - ✅ Pattern matching accuracy: >90%
   - ✅ Recommendation confidence: >0.8

4. **Auto-Updates Working**
   - ✅ Detects n8n node changes
   - ✅ Updates graph incrementally
   - ✅ No service downtime during updates

5. **Full Test Coverage**
   - ✅ Unit tests for graph builder
   - ✅ Unit tests for query engine
   - ✅ Integration tests end-to-end
   - ✅ Performance benchmarks

6. **Production Ready**
   - ✅ Docker deployment ready
   - ✅ Configuration documented
   - ✅ Examples provided
   - ✅ Performance tuned

7. **AI Agent Integration**
   - ✅ MCP tools expose GraphRAG
   - ✅ Claude can query graph
   - ✅ Intelligent recommendations work
   - ✅ Explainability built in

---

## 📋 NEXT STEPS AFTER APPROVAL

1. **Confirm this specification** with your requirements
2. **Identify any missing aspects** or clarifications needed
3. **Adjust performance targets** if different from above
4. **Decide on LLM model** (Ollama, cloud, etc.)
5. **Approve implementation plan** when spec is finalized
6. **Begin Phase 5.1** implementation

---

**This specification defines EXACTLY what GraphRAG needs to be.**
**No implementation starts until you approve this specification.**

