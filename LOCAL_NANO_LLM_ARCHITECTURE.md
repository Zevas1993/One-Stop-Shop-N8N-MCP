# Local Nano LLM Architecture - Offline-First MCP Server

**Date:** October 31, 2025
**Status:** 🔄 IN PROGRESS - Planning Phase
**Objective:** Enable direct user interaction with MCP server via hardware-aware local nano LLMs, without requiring external AI agents

---

## Overview

Transform the MCP server from **agent-only tool** to **user-facing application** that:

1. **Runs locally** via Docker Desktop (ultra-simple setup)
2. **Selects nano LLM based on hardware** (Grok's recommendations for CPU/RAM/GPU)
3. **Accepts n8n API key directly** from end user
4. **Discusses workflow ideas** with end user in natural conversation
5. **Generates workflows autonomously** using nano agent orchestrator
6. **Validates and deploys** to n8n instance
7. **Works fully offline** (no external AI service required)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Desktop (User)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │            Web UI (Browser: localhost:3000)                │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  1. Setup Page                                       │  │ │
│  │  │     - n8n API URL input                              │  │ │
│  │  │     - n8n API Key input (secure storage)            │  │ │
│  │  │     - Hardware detection results                     │  │ │
│  │  │     - Selected nano LLM info                         │  │ │
│  │  │                                                      │  │ │
│  │  │  2. Conversation Page                               │  │ │
│  │  │     - Chat interface with nano LLM                  │  │ │
│  │  │     - Discuss workflow ideas                        │  │ │
│  │  │     - View generated workflows                      │  │ │
│  │  │     - Deploy workflows to n8n                       │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↑↓ HTTP API                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         MCP Server (Node.js + Local Nano LLM)             │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ Hardware Detection Module                            │ │ │
│  │  │ - CPU cores, RAM, GPU detection                     │ │ │
│  │  │ - Grok recommendations mapping                       │ │ │
│  │  │ - Selected LLM: Phi-3.5 / Mixtral / etc            │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ Local Nano LLM Orchestrator                          │ │ │
│  │  │ - Manages LLM lifecycle                             │ │ │
│  │  │ - System prompt with n8n expertise                  │ │ │
│  │  │ - Context window management                         │ │ │
│  │  │ - Memory of workflow discussion                     │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ Nano Agent Orchestrator (Existing)                  │ │ │
│  │  │ - PatternAgent → GraphRAG → WorkflowAgent → Validator│ │ │
│  │  │ - Autonomous workflow generation                    │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ Existing Tools (27 doc + 16 management)             │ │ │
│  │  │ - Node search & documentation                       │ │ │
│  │  │ - Workflow creation/update/validation               │ │ │
│  │  │ - Execution management                              │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         SQLite Database (nodes.db)                         │ │
│  │         Pre-built with all n8n node info                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  n8n Instance    │
                    │  (Remote or      │
                    │   Localhost:5678)│
                    └──────────────────┘
```

---

## Key Components to Implement

### 1. Hardware Detection Module

**Purpose:** Detect user's hardware and recommend appropriate nano LLM

**Implementation Location:** `src/ai/hardware-detector.ts`

```typescript
export interface HardwareProfile {
  cpuCores: number;
  ramGbytes: number;
  hasGpu: boolean;
  gpuVram?: number;
  osType: string;
  recommendedLlm: NanoLLMOption;
}

export enum NanoLLMOption {
  PHI_3_MINI = 'phi-3.5-mini',      // 3.8B - Minimal (2GB RAM, 2 cores)
  PHI_3_SMALL = 'phi-3.5-small',    // ~7B - Low resource (4GB RAM, 4 cores)
  MIXTRAL_7B = 'mixtral-7b',        // 7B - Balanced (8GB RAM, 4 cores)
  LLAMA_2_13B = 'llama-2-13b',      // 13B - Better quality (16GB RAM, 8 cores)
  NEURAL_CHAT_7B = 'neural-chat-7b' // 7B - Specialized for chat
}

export class HardwareDetector {
  detectHardware(): HardwareProfile
  getRecommendedLLM(profile: HardwareProfile): NanoLLMOption
  validateGpuAvailability(): boolean
}
```

**Grok-Provided LLM Recommendations** (from previous discussion):
- **≤2GB RAM, 2 cores:** Phi-3.5-mini (3.8B parameters)
- **2-4GB RAM, 2-4 cores:** Phi-3.5-small (~7B)
- **4-8GB RAM, 4-8 cores:** Mixtral-7B or Neural-Chat-7B
- **8-16GB RAM, 8+ cores:** Llama-2-13B or larger
- **16GB+ RAM, with GPU:** Larger models with GPU acceleration

### 2. Local Nano LLM Orchestrator

**Purpose:** Manage nano LLM lifecycle and conversation state

**Implementation Location:** `src/ai/local-llm-orchestrator.ts`

```typescript
export interface ConversationContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  workflowIdeas: string[];
  generatedWorkflows: WorkflowGenerationResult[];
  n8nApiKey: string;
  n8nApiUrl: string;
}

export class LocalLLMOrchestrator {
  private llm: LLMClient;
  private context: ConversationContext;
  private systemPrompt: string;

  constructor(llmOption: NanoLLMOption, config: LocalLLMConfig) {
    // Initialize LLM (Ollama, LocalAI, or Hugging Face)
    // Load system prompt for n8n workflow expertise
  }

  async chat(userMessage: string): Promise<string>
  async generateWorkflow(idea: string): Promise<WorkflowGenerationResult>
  async validateAndDeployWorkflow(workflow: any): Promise<DeploymentResult>
  getConversationContext(): ConversationContext
  clearContext(): void
}
```

**System Prompt Content:**
```
You are an expert n8n workflow architect assistant.

Your capabilities:
1. Discuss workflow ideas with users in natural conversation
2. Recommend n8n nodes for specific tasks
3. Design multi-step workflows
4. Understand n8n concepts: nodes, connections, triggers, execution, expressions

When users describe workflow ideas:
- Ask clarifying questions about requirements
- Suggest specific nodes from available n8n catalog (525 nodes)
- Explain how nodes connect and pass data
- Help refine workflow requirements

You have access to:
- Complete n8n node documentation (525 nodes)
- Nano agent orchestrator for autonomous workflow generation
- n8n API for validation and deployment

Always strive to create practical, validated workflows ready for deployment.
```

### 3. HTTP API for Web UI

**Purpose:** Expose nano LLM conversation and setup functionality

**Implementation Location:** `src/http/local-llm-routes.ts`

```
POST /api/setup/detect-hardware
  Response: HardwareProfile + Recommended LLM

POST /api/setup/configure
  Input: { n8nApiUrl, n8nApiKey }
  Response: { status, message }

POST /api/chat
  Input: { message: string }
  Response: { response: string, suggestedActions: string[] }

POST /api/workflow/generate
  Input: { idea: string, constraints?: object }
  Response: { workflow, explanation, deployment }

POST /api/workflow/deploy
  Input: { workflowId }
  Response: { deploymentStatus, executionLink }

GET /api/context
  Response: ConversationContext
```

### 4. Web UI Components

**Purpose:** Simple, intuitive interface for users

**Implementation Location:** `src/web-ui/`

**Key Pages:**
1. **Setup Page** (`/setup`)
   - Hardware detection results
   - Selected nano LLM info
   - n8n API configuration form
   - Connection test

2. **Conversation Page** (`/chat`)
   - Chat interface with nano LLM
   - Workflow ideas history
   - Generated workflows viewer
   - Deploy button

3. **Workflow Viewer** (`/workflows`)
   - Generated workflows list
   - Visual workflow editor (optional)
   - Validation results
   - Deployment history

---

## Implementation Phases

### Phase 1: Hardware Detection & LLM Selection ✅ PLANNED
- [ ] Implement HardwareDetector
- [ ] Create LLM selection logic based on Grok's recommendations
- [ ] Add detection to HTTP API

### Phase 2: Local LLM Integration (Ollama/LocalAI) 🔄 IN PROGRESS
- [ ] Integrate Ollama for local LLM hosting
- [ ] Create LocalLLMOrchestrator
- [ ] Write comprehensive system prompt
- [ ] Implement conversation context management

### Phase 3: HTTP API & Web UI 📋 PLANNED
- [ ] Create HTTP routes for setup and chat
- [ ] Build simple web UI (HTML/CSS/JS)
- [ ] Integrate with existing MCP server

### Phase 4: Integration with Nano Agents 📋 PLANNED
- [ ] Connect nano LLM to nano agent orchestrator
- [ ] Enable workflow generation from chat
- [ ] Implement validation and deployment flow

### Phase 5: Docker Desktop Setup 📋 PLANNED
- [ ] Docker Compose configuration
- [ ] Environment setup guide
- [ ] One-click deployment script

---

## Data Flow: User Conversation → Workflow → Deployment

```
User: "I want to send Slack notifications when Airtable records are updated"
  ↓
LocalLLMOrchestrator.chat()
  ↓
Nano LLM: "Great idea! This involves:
           - Airtable trigger
           - Data transformation
           - Slack notification
           Let me generate a workflow..."
  ↓
Nano LLM calls LocalLLMOrchestrator.generateWorkflow()
  ↓
Nano Agent Orchestrator.executePipeline()
  - PatternAgent: "Notification Pattern (85% confidence)"
  - GraphRAG: "Airtable + Slack nodes compatible"
  - WorkflowAgent: "Generated workflow with 3 nodes"
  - ValidatorAgent: "Validation passed ✅"
  ↓
Workflow JSON returned to Web UI
  ↓
User clicks "Deploy"
  ↓
n8nApiClient.createWorkflow() → Deployed ✅
  ↓
User receives confirmation: "Workflow deployed! ID: 123"
```

---

## Configuration Files

### Docker Compose Setup

```yaml
version: '3.8'
services:
  mcp-server:
    image: n8n-mcp:local-llm
    ports:
      - "3000:3000"        # Web UI
      - "5678:5678"        # n8n instance (optional)
    environment:
      NODE_ENV: production
      MCP_MODE: http
      AUTH_TOKEN: ${AUTH_TOKEN}
      ENABLE_LOCAL_LLM: true
      LLM_OPTION: auto # or specific: phi-3.5-mini, mixtral-7b, etc.
    volumes:
      - ./config:/app/config
      - ./data:/app/data
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./ollama:/root/.ollama
    environment:
      OLLAMA_HOST: 0.0.0.0:11434
```

### Environment Configuration

```env
# MCP Server
NODE_ENV=production
MCP_MODE=http
AUTH_TOKEN=your-secure-token
PORT=3000

# Local LLM
ENABLE_LOCAL_LLM=true
LLM_OPTION=auto              # or: phi-3.5-mini, mixtral-7b, etc.
OLLAMA_BASE_URL=http://ollama:11434

# n8n Configuration (set by user via Web UI)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=xxxx
```

---

## Hardware-LLM Mapping (Grok's Recommendations)

| Hardware | LLM Option | Model Size | Requirements | Performance |
|----------|-----------|-----------|--------------|-------------|
| **Minimal** | Phi-3.5-mini | 3.8B | 2GB RAM, 2 cores | Fast, basic |
| **Low-End** | Phi-3.5-small | 7B | 4GB RAM, 4 cores | Good, capable |
| **Mid-Range** | Mixtral-7B | 7B-MOE | 8GB RAM, 4 cores | Excellent, fast |
| **Standard** | Llama-2-13B | 13B | 16GB RAM, 8 cores | Outstanding, slower |
| **With GPU** | GPU-accelerated model | Variable | GPU VRAM + RAM | Fastest, best quality |

---

## Next Steps

1. **Implement HardwareDetector** - Detect user's hardware specifications
2. **Integrate Ollama** - Local LLM hosting with auto-download
3. **Create LocalLLMOrchestrator** - Manage conversation and workflow generation
4. **Build HTTP API routes** - Expose setup and chat endpoints
5. **Create Web UI** - Simple HTML/CSS interface for users
6. **Docker setup** - One-click Docker Desktop deployment
7. **Testing** - E2E testing with various hardware profiles

---

## Success Criteria

✅ User can start MCP server via Docker Desktop with one command
✅ Hardware detection automatically selects appropriate nano LLM
✅ User enters n8n API key via Web UI (no config files)
✅ User can discuss workflow ideas with nano LLM in natural conversation
✅ Nano LLM can trigger nano agent orchestrator to generate workflows
✅ Generated workflows are validated and deployable to n8n
✅ Entire flow works offline (no external AI service required)
✅ System works on hardware from 2GB RAM/2 cores up to high-end machines

---

## Benefits

🎯 **For End Users:**
- Ultra-simple setup (just `docker compose up`)
- Direct interaction without Claude Desktop
- No external AI service dependency
- Works fully offline
- Conversational workflow design

🎯 **For Developers:**
- Reuses existing nano agent orchestrator
- Leverages existing n8n tool catalog
- Hardware-aware optimization
- Extensible architecture

🎯 **For n8n Community:**
- Makes n8n automation accessible to everyone
- Removes barriers to workflow creation
- Enables conversational workflow design
- Offline-first approach for privacy/security
