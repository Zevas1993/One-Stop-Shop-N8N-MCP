# Phase 5.2: Agentic Graph Builder - Implementation Specification

**Objective:** Extract all 526 n8n nodes and build knowledge graph with AGENTIC enhancements
**Duration:** Days 3-4
**Expected Code:** 1,200+ lines
**Focus:** Build graph data that serves agent reasoning, not just data retrieval

---

## 🎯 AGENTIC PRINCIPLES FOR GRAPH BUILDING

### Principle 1: Agent-Relevant Metadata
Extract metadata that AGENTS need to make decisions:

```python
# Instead of:
node = {
    "id": "n8n-nodes-base.slack",
    "label": "Slack",
    "description": "Send messages to Slack"
}

# Build:
agent_friendly_node = {
    # Basic
    "id": "n8n-nodes-base.slack",
    "label": "Slack",
    "description": "Send messages to Slack",

    # Agent Use Cases
    "use_cases": [
        "Send notifications to team",
        "Alert on workflow errors",
        "Post daily reports",
        "Share metrics and dashboards"
    ],

    # Agent Prerequisites
    "prerequisites": [
        "Must authenticate with Slack workspace",
        "Need channel name or ID",
        "Understand message formatting"
    ],

    # Agent Success Patterns
    "common_configurations": {
        "alert_notification": {
            "channel": "#alerts",
            "text": "Workflow failed: ${{$node.Item.error_message}}"
        },
        "daily_report": {
            "channel": "#reports",
            "text": "Daily Report",
            "blocks": "[... formatted report ...]"
        }
    },

    # Agent Failure Information
    "failure_modes": [
        "Forgetting to set channel parameter",
        "Trying to send to non-existent channel",
        "Message too long or invalid format"
    ],

    # Agent Tips
    "agent_tips": [
        "Use blocks for rich formatting",
        "Set channel OR channel_id, not both",
        "Test with @channel before production use"
    ],

    # Success Metrics
    "success_rate": 0.98,
    "usage_frequency": 1250,
    "average_rating": 4.8
}
```

### Principle 2: Relationships That Enable Planning
Build relationships that help agents plan workflows:

```python
# Slack → HTTP Request (predecessor)
relationship = {
    "source": "n8n-nodes-base.httpRequest",
    "target": "n8n-nodes-base.slack",
    "type": "compatible_with",
    "strength": 0.95,

    # Agent reasoning
    "reasoning": "HTTP requests often need to send results to Slack",

    # Success when used together
    "success_rate": 0.97,
    "common_pattern": "Fetch data → Send to Slack",

    # Data mapping help for agents
    "common_config_mapping": {
        "from": "HTTP response data",
        "to": "Slack message",
        "example": {
            "http_output": {"status": "ok", "count": 42},
            "slack_mapping": {
                "text": "API returned {http_output.status}",
                "blocks": "[...]"
            }
        }
    },

    # Gotchas for agents
    "gotchas": [
        "HTTP response might be nested, need Set node to extract",
        "Large responses need pagination",
        "Slack has rate limits for bulk messages"
    ],

    # Guidance for agents
    "agent_guidance": "Use Set node between HTTP and Slack to format data properly"
}
```

---

## 📋 TASKS FOR PHASE 5.2

### Task 1: Entity Extractor (400 lines)
Extract 526 n8n nodes with AGENT-RELEVANT metadata

```python
class AgenticEntityExtractor:
    """
    Extract n8n nodes from database with agent-friendly metadata
    """

    async def extract_nodes(self, nodes_db_path: str) -> List[AgenticNode]:
        """
        For each node:
        1. Extract basic info (ID, name, description)
        2. Extract properties and operations
        3. Generate keywords from description
        4. Categorize node (Communication, Data, Trigger, etc.)
        5. Extract use cases from description
        6. Identify prerequisites
        7. Determine complexity level
        8. Generate agent tips

        Return list of AgenticNode objects
        """
        pass

    def extract_use_cases(self, description: str) -> List[str]:
        """
        Parse description to identify use cases agents care about

        Example:
        Input: "Send messages to Slack channels and threads"
        Output: [
            "Send notifications",
            "Post alerts",
            "Share updates",
            "Provide feedback"
        ]
        """
        pass

    def determine_prerequisites(self, node_id: str, properties: Dict) -> List[str]:
        """
        Identify what agents need to know before using node

        Example for Slack node:
        [
            "Must authenticate with Slack",
            "Need target channel name or ID",
            "Understand message formatting"
        ]
        """
        pass

    def generate_agent_tips(self, node_id: str, metadata: Dict) -> List[str]:
        """
        Extract practical tips agents should know

        Example for Slack:
        [
            "Use blocks for rich formatting",
            "Test with @channel first",
            "Slack has rate limits"
        ]
        """
        pass
```

**Output:** 526 nodes with complete agent-friendly metadata

---

### Task 2: Relationship Builder (350 lines)
Create 7 types of relationships with agent reasoning

```python
class AgenticRelationshipBuilder:
    """
    Build relationships between nodes that support agent planning
    """

    async def build_relationships(self, nodes: List[AgenticNode]) -> List[AgenticEdge]:
        """
        For all node pairs:
        1. Determine relationship type (compatible_with, requires, etc.)
        2. Calculate compatibility strength
        3. Find common patterns in real workflows
        4. Extract data mapping examples
        5. Identify common gotchas
        6. Generate agent guidance
        """
        pass

    async def extract_pattern_relationships(self, catalog: Dict) -> List[AgenticEdge]:
        """
        For each workflow pattern, identify which nodes work together:

        Pattern: "Slack Notification"
        Nodes: Manual Trigger → Slack
        Relationship: Manual Trigger --(triggers)--> Slack
        """
        pass

    def calculate_compatibility_strength(
        self,
        source_node: AgenticNode,
        target_node: AgenticNode
    ) -> float:
        """
        Calculate 0-1 strength score based on:
        - Output type compatibility
        - Common usage patterns
        - Community feedback
        - Success rates

        Returns: 0.95 (high compatibility)
        """
        pass

    def extract_data_mapping(
        self,
        source_node: AgenticNode,
        target_node: AgenticNode
    ) -> Dict:
        """
        Help agents understand data flow between nodes

        Example:
        {
            "from": "HTTP Response (JSON object)",
            "to": "Slack expects: channel, text, blocks",
            "mapping": {
                "response.data" → "text",
                "hardcode" → "channel": "#alerts"
            }
        }
        """
        pass

    def extract_gotchas(
        self,
        source_node: AgenticNode,
        target_node: AgenticNode
    ) -> List[str]:
        """
        Identify common mistakes when these nodes are together

        Example for HTTP → Slack:
        [
            "Response might be nested, use Set to extract",
            "Large responses need pagination",
            "Slack rate limits apply"
        ]
        """
        pass
```

**Output:** ~5,000 relationships with agentic guidance

---

### Task 3: Graph Builder Orchestrator (300 lines)
Coordinate node/edge/embedding creation

```python
class AgenticGraphBuilder:
    """
    Orchestrate building complete knowledge graph with agentic focus
    """

    async def build_complete_graph(self,
        nodes_db_path: str,
        catalog_path: str,
        output_db_path: str
    ):
        """
        Complete pipeline:
        1. Extract all nodes with agent metadata
        2. Generate embeddings for each node
        3. Build all relationships
        4. Calculate success rates
        5. Store everything in database
        6. Generate metrics
        """
        pass

    async def generate_embeddings(self, nodes: List[AgenticNode]) -> List[Embedding]:
        """
        For each node description, generate 384-dim embedding
        These embeddings enable semantic search for agents
        """
        pass

    async def calculate_success_rates(self, catalog: Dict) -> Dict[str, float]:
        """
        Analyze real workflows to calculate success rates

        Example:
        {
            "n8n-nodes-base.slack": 0.98,  # 98% of Slack-using workflows succeed
            "n8n-nodes-base.httpRequest": 0.94,  # 94% success rate
        }
        """
        pass

    async def extract_common_configurations(
        self,
        nodes: List[AgenticNode],
        catalog: Dict
    ) -> Dict[str, Dict]:
        """
        Extract common settings agents use

        Example for Slack:
        {
            "notification": {
                "channel": "#alerts",
                "text": "Alert: {error_message}",
                "blocks": "[...]"
            },
            "report": {
                "channel": "#reports",
                "text": "Daily Report",
                "ts": "{report_timestamp}"
            }
        }
        """
        pass
```

**Output:** Complete graph in SQLite with all node/edge/embedding data

---

### Task 4: Catalog Builder (150 lines)
Serialize graph for distribution and reuse

```python
class CatalogBuilder:
    """
    Build catalog.json for distribution and serialization
    """

    async def build_catalog(self, db: Database) -> Dict:
        """
        Create exportable catalog containing:
        - All 526 nodes with metadata
        - All relationships
        - Common patterns
        - Success rates
        - Agent configurations
        """
        pass

    def serialize_for_distribution(self, catalog: Dict) -> str:
        """
        Serialize to JSON for sharing/backup
        Ensures reproducibility
        """
        pass

    def create_manifest(self, catalog: Dict) -> Dict:
        """
        Create manifest documenting:
        - What's in the catalog
        - Node count
        - Relationship count
        - Embedding model
        - Build timestamp
        - Hash for integrity
        """
        pass
```

**Output:** catalog.json + manifest for distribution

---

## 🧠 AGENTIC ENHANCEMENTS BUILT IN

### 1. Agent Use Case Extraction
Every node includes use cases agents care about:
```
Slack node use cases:
- Send notifications to team
- Alert on workflow errors
- Post daily reports
- Share metrics
```

### 2. Common Mistake Detection
Every node warns about common errors:
```
Slack common mistakes:
- Forgetting channel parameter
- Using wrong channel format
- Message too long
```

### 3. Agent Tips
Every node includes practical guidance:
```
Slack agent tips:
- Use blocks for formatting
- Set channel OR channel_id
- Test before production
```

### 4. Success Rate Tracking
Every node shows real-world success:
```
Slack success rate: 98%
Used in 1,250+ workflows
Average rating: 4.8/5
```

### 5. Pattern-Based Relationships
Relationships show how nodes work together:
```
HTTP → Slack:
- 97% success when used together
- Common pattern: Fetch → Format → Send
- Common gotcha: Need data transformation
```

### 6. Data Mapping Help
Relationships include data flow examples:
```
HTTP response → Slack input mapping:
{response.data} → {text}
{response.timestamp} → {ts}
```

---

## 📊 EXPECTED GRAPH STATISTICS

After Phase 5.2 completes, graph will contain:

```
Nodes:
├─ 526 n8n nodes (all with agent metadata)
├─ 10 workflow patterns
├─ 50+ use cases
├─ 12 categories
└─ 8 trigger types
= ~600 total entities

Relationships:
├─ compatible_with: ~1,500
├─ belongs_to_category: ~538
├─ used_in_pattern: ~100
├─ solves: ~250
├─ requires: ~1,000
├─ triggered_by: ~200
└─ similar_to: ~1,400
= ~5,000 total relationships

Embeddings:
├─ 526 node embeddings (384-dim)
├─ 10 pattern embeddings
├─ 50+ use case embeddings
└─ 12 category embeddings
= ~600 embeddings

Metadata:
├─ Success rates for all nodes
├─ Common configurations for top 100 nodes
├─ Failure modes for all nodes
├─ Agent tips for all nodes
└─ Community ratings and usage counts
```

---

## 🔄 INTEGRATION WITH SHARED MEMORY

Agentic graph builder will integrate with existing shared memory:

```python
class SharedMemoryIntegration:
    """
    Integrate graph building with agent shared memory
    """

    async def store_graph_stats(self, shared_memory, stats: Dict):
        """
        Store in shared memory:
        - Graph build progress
        - Node extraction status
        - Relationship discovery status
        - Embedding generation progress
        """
        pass

    async def notify_agents(self, shared_memory):
        """
        Notify orchestrator that graph is ready:
        - Graph build complete
        - Ready for semantic search
        - Embeddings available
        - Relationships indexed
        """
        pass
```

This allows other agents to track graph building progress!

---

## ✅ SUCCESS CRITERIA FOR PHASE 5.2

- ✅ All 526 n8n nodes extracted
- ✅ All nodes have agent-relevant metadata
- ✅ All 7 relationship types created
- ✅ ~5,000 relationships built
- ✅ All 526 embeddings generated
- ✅ Success rates calculated
- ✅ Common configurations identified
- ✅ Agent tips extracted
- ✅ Failure modes documented
- ✅ Use cases identified
- ✅ Complete catalog.json created
- ✅ Database populated and indexed
- ✅ Graph statistics calculated
- ✅ Shared memory integration working
- ✅ Ready for Phase 5.3 (Query Engine)

---

## 🎯 WHY THIS BUILDS THE BEST AGENTIC GRAPHRAG

By focusing on **agent-friendly metadata** and **reasoning-enabling relationships**, we create a graph that:

1. **Understands Agent Perspective** - Metadata is what agents need, not what's in docs
2. **Enables Multi-Step Planning** - Relationships show workflow sequences
3. **Prevents Agent Mistakes** - Failure modes and gotchas documented
4. **Builds Agent Confidence** - Success rates and ratings provided
5. **Guides Agent Reasoning** - Use cases and tips for all nodes
6. **Supports Feedback Loop** - Common configurations can be learned from
7. **Integrates with Orchestrator** - Shared memory keeps all agents informed
8. **Stays Current** - Success rates updated from real agent usage

This is not just a graph of n8n nodes - it's a **reasoning system for n8n agents**.

---

**Next Phase:** Phase 5.3 - Semantic Query Engine (will use this graph to power agent reasoning)

