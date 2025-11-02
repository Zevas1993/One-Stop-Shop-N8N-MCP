# Nano LLM-Driven GraphRAG Learning System

## System Overview

Your n8n MCP Orchestrator now features a **sophisticated Nano LLM-driven learning system** that enables the Embedding and Generation models to intelligently manage GraphRAG updates based on real workflow execution patterns. This is a two-stage pipeline where specialized Nano LLMs orchestrate the entire learning process.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web UI (localhost:3000)                       │
│              - Chat interface for NLP commands                   │
│              - Workflow generation requests                      │
│              - Execution feedback submission                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              Express HTTP Server (MCP_MODE=http)                │
│              ┌─────────────────────────────────────────┐        │
│              │  GraphRAGLearningService                │        │
│              │  (Orchestration Layer)                  │        │
│              └─────────────────────────────────────────┘        │
│                       │                                          │
│         ┌─────────────┴──────────────┬──────────────────┐      │
│         ▼                            ▼                  ▼       │
│  ┌──────────────┐          ┌──────────────┐      ┌──────────┐  │
│  │Stage 1:      │          │Stage 2:      │      │Pattern   │  │
│  │Embedding     │          │Generation    │      │History   │  │
│  │Model         │          │Model         │      │Tracking  │  │
│  │              │          │              │      │          │  │
│  │Neural Graph  │          │Graph Update  │      │Evidence  │  │
│  │Semanticist   │          │Strategist    │      │Accum.    │  │
│  └──────────────┘          └──────────────┘      └──────────┘  │
│         │                            │                          │
│         └─────────────┬──────────────┘                          │
│                       ▼                                          │
│         ┌──────────────────────────────┐                        │
│         │  GraphRAG Update Decision    │                        │
│         │  - Update Operations         │                        │
│         │  - Promotion Decisions       │                        │
│         │  - Conflict Detection        │                        │
│         └──────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────────┐
         │      GraphRAG Knowledge Graph       │
         │  (Patterns, Relationships, Nodes)   │
         └─────────────────────────────────────┘
```

## Quick Start

### 1. Start the Server

```bash
# Build TypeScript
npm run build

# Set required environment variables
export AUTH_TOKEN=$(openssl rand -base64 32)
export MCP_MODE=http

# Start in HTTP mode
npm run start:http

# Server will be available at http://localhost:3000
```

### 2. Access the Web UI

Open your browser to `http://localhost:3000` and you'll see:
- **Sidebar**: System status and metrics
- **Main Chat Interface**: Chat area for natural language interaction

### 3. Describe Your Workflow

In the chat interface, describe your workflow in natural language:

```
"Create a workflow that fetches data from an API and sends it to Slack"
```

### 4. Submit Execution Feedback

After running a workflow, submit feedback so the Nano LLMs can learn:

```bash
curl -X POST http://localhost:3000/api/learning/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "executionId": "exec-123456",
    "workflowId": "wf-789",
    "userId": "user-456",
    "workflow": {
      "nodes": [
        {"name": "Webhook", "type": "nodes-base.webhook", "position": [100, 100]},
        {"name": "HTTP Request", "type": "nodes-base.httpRequest", "position": [300, 100]},
        {"name": "Slack", "type": "nodes-base.slack", "position": [500, 100]}
      ],
      "connections": {
        "Webhook": {"main": [[{"node": "HTTP Request"}]]},
        "HTTP Request": {"main": [[{"node": "Slack"}]]}
      }
    },
    "feedback": {
      "success": true,
      "executionTime": 2.34,
      "userSatisfaction": 5,
      "userFeedback": "Perfect! Data fetched and posted to Slack"
    }
  }'
```

### 5. Monitor Learning Progress

```bash
curl http://localhost:3000/api/learning/progress
```

## Two-Stage Nano LLM Pipeline

### Stage 1: Embedding Model (Neural Graph Semanticist)

**Responsibilities**:
- Extract semantic intent from workflow execution feedback
- Generate 768-dimensional embeddings for discovered patterns
- Identify workflow archetypes (data-fetch, notification, integration, etc.)
- Discover node relationships and co-occurrence patterns
- Calculate semantic stability and pattern confidence scores

**Output**: Semantic analysis with embeddings and relationships

### Stage 2: Generation Model (Graph Update Strategist)

**Responsibilities**:
- Evaluate patterns against strict quality thresholds
- Make promotion/demotion decisions for patterns
- Generate GraphRAG update operations
- Detect conflicts with existing patterns
- Provide explainable reasoning for all decisions

**Quality Thresholds (STRICTLY ENFORCED)**:
- ✅ Success Rate ≥ 80%
- ✅ Observations ≥ 3 independent executions
- ✅ Confidence ≥ 0.85
- ✅ Semantic Soundness (nodes logically flow together)
- ✅ No conflicts with existing promoted patterns
- ✅ User satisfaction ≥ 4/5

## API Endpoints

### POST /api/orchestrate
Generate workflows from natural language descriptions

```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Fetch user data from API and post to Slack",
    "context": {"userMessage": "Fetch user data from API and post to Slack"}
  }'
```

### POST /api/learning/feedback
Submit workflow execution feedback for Nano LLM learning

**Response**:
```json
{
  "success": true,
  "feedback": "processed through Nano LLM learning pipeline",
  "decision": "promote-pattern",
  "confidence": 0.95,
  "operations": 3,
  "timestamp": "2024-11-02T17:50:30Z"
}
```

### GET /api/learning/progress
Get learning progress metrics and recent updates

**Response**:
```json
{
  "patternsDiscovered": 42,
  "patternsPromoted": 15,
  "pendingPatterns": 8,
  "successRate": 87.5,
  "avgConfidenceScore": 0.92,
  "lastUpdated": "2024-11-02T17:50:30.000Z",
  "recentUpdates": [
    {
      "patternId": "pattern-webhook-http-slack",
      "decision": "promote-pattern",
      "confidence": 0.95,
      "timestamp": "2024-11-02T17:50:20.000Z"
    }
  ]
}
```

### GET /health
Health check endpoint

## Environment Configuration

### Required Variables

```bash
AUTH_TOKEN=your-secure-token-32-chars-minimum
MCP_MODE=http
```

### Optional Variables

```bash
NODE_ENV=production                              # development, production
LOG_LEVEL=info                                  # debug, info, warn, error
PORT=3000                                       # HTTP server port
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5         # Default embedding model
GENERATION_MODEL=Qwen/Qwen3-4B-Instruct        # Default generation model
CORS_ORIGIN=*                                   # CORS origin
```

## Files & Components

### System Prompts
- **src/prompts/embedding-model-system-prompt.ts** (298 lines)
  - Defines the complete job scope for the Embedding Model
  - Teaches semantic understanding and pattern embedding generation

- **src/prompts/generation-model-system-prompt.ts** (287 lines)
  - Defines the complete job scope for the Generation Model
  - Teaches promotion decision-making with strict quality thresholds

### Learning Service
- **src/services/graphrag-learning-service.ts** (757 lines)
  - Orchestrates both Nano LLMs in a two-stage pipeline
  - Manages pattern history and learning state
  - Processes workflow execution feedback

### HTTP Server
- **src/http-server-single-session.ts**
  - Single-session HTTP server for localhost access
  - Serves static web UI
  - Implements MCP protocol endpoints
  - Integrates GraphRAG learning service

### Web UI
- **public/index.html** (143 lines)
  - Beautiful chat interface for NLP interaction
  - Responsive two-panel layout
  - Real-time metrics display

## Learning Example

### Observation 1: User creates webhook → HTTP → Slack workflow

**Success**: ✅ 2.34s, Satisfaction: 5/5

**Embedding Model** analyzes:
- Detects archetype: "api-to-notification"
- Semantic intent: "Fetch data from API and notify team via Slack"
- Generates embeddings for pattern
- Discovers relationships:
  - Webhook → HTTP: "data-source-to-fetch" (strength: 0.98)
  - HTTP → Slack: "result-to-notification" (strength: 0.94)
- Confidence: 0.95

**Generation Model** decides:
- Observations: 1 (need 3+)
- Decision: **HOLD** - insufficient data
- Pattern status: "pending"

### Observations 2-3: Same pattern repeats, both succeed

**Metrics now**:
- Observation Count: 3
- Success Rate: 100% (3/3)
- User Satisfaction: 4.7/5 average

**Generation Model re-evaluates**:
- ✅ Success rate: 100% (≥ 80%)
- ✅ Observations: 3 (≥ 3)
- ✅ Confidence: 0.95 (≥ 0.85)
- ✅ Semantic: Sound
- ✅ Conflicts: None
- ✅ User satisfaction: 4.7 (≥ 4)

**Decision**: **PROMOTE!** 🎉

Update operations generated:
1. Promote pattern from "pending" to "promoted"
2. Add relationship: Webhook is ideal predecessor for HTTP Request
3. Add relationship: HTTP Request is ideal predecessor for Slack

**Result**: Next user wanting to fetch from API and notify Slack can get confident recommendation!

## Performance Expectations

| Component | Latency |
|-----------|---------|
| Embedding Model Analysis | < 500ms |
| Generation Model Analysis | < 300ms |
| Update Operation Generation | < 200ms |
| **Total Pipeline** | **< 1000ms** |

## What Makes This System Special

1. **Learns from real execution feedback** - Not synthetic training data
2. **Makes explicit, reasoning-based decisions** - Not opaque neural predictions
3. **Enforces strict quality thresholds** - Promotes only patterns that truly work
4. **Tracks evidence accumulation** - Shows why each pattern was promoted
5. **Operates in nano-scale** - Works on consumer hardware (no GPU required)
6. **Explains everything** - Every decision includes reasoning and confidence scores

This is a **human-interpretable learning system** where the Nano LLMs understand their job and explain their thinking!

## Next Steps

1. **Start the server**: `npm run start:http`
2. **Open web UI**: `http://localhost:3000`
3. **Describe a workflow**: Use natural language in the chat
4. **Execute and provide feedback**: Submit success/failure feedback
5. **Monitor learning**: Check `/api/learning/progress` to see discovered patterns
6. **Iterate**: The more feedback, the smarter the Nano LLMs become!

---

**Questions?** Check the system prompts in `src/prompts/` to understand exactly what each Nano LLM was instructed to do.
