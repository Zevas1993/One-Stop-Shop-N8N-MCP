# DETAILED ROADMAP: Phases 5.4-5.8 (With Phase -1 First)

**Date Created:** October 30, 2025
**Status:** ✅ APPROVED
**Duration:** 50 days total (5 day Phase -1 + 45 days implementation)
**Team Size:** 1-2 developers
**Complexity:** Medium-High

---

## PHASE -1: CRITICAL DESIGN & PLANNING (Days 1-5) ⚠️ DO FIRST

### Why Phase -1 Exists
The initial Grok integration plan was optimistic (8-15 days) but identified **173 architectural gaps**. Phase -1 resolves the 13 blocking issues through detailed specifications before ANY code is written.

**If Phase -1 is skipped:** Expect 10-20 days of rework in Phases 5.4-5.8.

### Phase -1 Tasks

#### Day 1-2: Architecture Design Sessions
**Task 1.1: Python-TypeScript Bridge Architecture (2 days)**
- **Input:** Gap analysis showing 8 decisions needed
- **Process:**
  1. Review options (stdio vs HTTP vs IPC)
  2. Evaluate trade-offs
  3. Document decision rationale
  4. Create architecture diagram
- **Output:** `python-typescript-bridge-spec.md` (5 pages)
  - IPC mechanism selected: **stdio with JSON-RPC**
  - Process lifecycle defined
  - Error handling contract specified
  - Performance targets: <10ms latency
  - Timeout: 5 seconds
  - 20+ error scenarios catalogued

**Task 1.2: Embedding Pipeline Design (1.5 days)**
- **Input:** Hardware matrix (4GB → 32GB+)
- **Process:**
  1. Evaluate embedding models (Sentence-Transformers, BGE, Qwen)
  2. Hardware-based selection logic
  3. Caching strategy (L1 memory + L2 SQLite)
  4. Generation timing (lazy vs eager vs hybrid)
- **Output:** `embedding-pipeline-spec.md` (8 pages)
  - Hardware selection matrix (4 tiers)
  - Model specifications (params, dims, memory)
  - Caching strategy with TTLs
  - Warmup procedures
  - Fallback logic

**Task 1.3: Docker Architecture Design (1.5 days)**
- **Input:** Multi-process requirements
- **Process:**
  1. Evaluate process managers (Supervisord, custom, K8s)
  2. Design volume strategy
  3. Configuration approach
  4. Resource allocation
- **Output:** `docker-architecture-spec.md` (6 pages)
  - Supervisord configuration
  - Volume structure (models, cache, db, uploads, user_state)
  - Memory allocation strategy
  - Health check design
  - GPU support approach

#### Day 3: Success Criteria Definition
**Task 1.4: Acceptance Criteria & Metrics (1 day)**
- **Output:** `acceptance-criteria.md` (4 pages)
  - Phase 5.4: Embedding latency targets, cache hit rates, hardware support
  - Phase 5.5: Bridge latency, error recovery, concurrency limits
  - Phase 5.6: Docker build time, image size, startup time, platform support
  - Phase 5.7: Version detection accuracy, RAG rebuild time, isolation testing
  - Phase 5.8: Test pass rate, documentation coverage, performance benchmarks

#### Day 4: Test Strategy
**Task 1.5: Comprehensive Test Strategy (1 day)**
- **Output:** `test-strategy.md` (5 pages)
  - 50-60 unit tests (embedding, cache, error handling, JSON-RPC, config)
  - 30-40 integration tests (E2E queries, bridge, Docker, isolation, recovery)
  - 15-20 performance tests (latency, throughput, memory profiling)
  - 10-15 compatibility tests (Docker, Python, Node.js, OS versions)
  - 12-15 failure mode tests (crashes, OOM, timeout, corruption)
  - GitHub Actions workflows
  - CI/CD pipeline configuration

#### Day 5: Stakeholder Review & Sign-off
- **Activities:**
  1. Review all 4 specifications
  2. Present architecture decisions & rationale
  3. Get stakeholder approval
  4. Resolve any concerns
  5. Finalize Phase -1 deliverables

### Phase -1 Success Criteria
- ✅ All 13 blocking issues resolved
- ✅ Architecture decisions documented with rationale
- ✅ 30+ pages of specifications completed
- ✅ Test strategy approved
- ✅ Team aligned on approach
- ✅ No rework needed in Phases 5.4-5.8

### Phase -1 Deliverables
1. `python-typescript-bridge-spec.md` (5 pages)
2. `embedding-pipeline-spec.md` (8 pages)
3. `docker-architecture-spec.md` (6 pages)
4. `acceptance-criteria.md` (4 pages)
5. `test-strategy.md` (5 pages)
6. Decision log with rationales
7. Architecture diagrams (ASCII and/or images)
8. Risk mitigation plans

**Total: 30+ pages of specifications**

---

## PHASE 5.4: LLM INTEGRATION (Days 6-15) - 10 Days

### Goal
Real embedding generation + Grok LLM inference + Hardware-aware model selection

### Prerequisites
- ✅ Phase -1 specifications approved
- ✅ All architectural decisions made
- ✅ Success criteria defined

### Task Breakdown

#### Task 5.4.1: Hardware Detection & Model Selection (2 days)
**Files to Create:**
- `scripts/hardware_scan.py` (150 lines)
- `scripts/model_selector.py` (200 lines)
- `config/model_matrix.json` (50 lines)

**What It Does:**
```
On container startup:
  1. Detect: RAM (GB), CPU cores, GPU (NVIDIA/AMD/Metal)
  2. Select: Embedding model (22M-33M params)
  3. Select: LLM model (2B-8B params)
  4. Download: Models from Hugging Face
  5. Store: Selection in config
  6. Report: "Using Sentence-Transformers + Qwen2-7B"
```

**Hardware Matrix:**
```
4GB RAM:   Qwen3-Embedding-0.6B (192-dim) + Qwen2-2B-Instruct
8GB RAM:   all-MiniLM-L6-v2 (384-dim) + Qwen2-7B-Instruct
16GB RAM:  bge-small-en-v1.5 (384-dim) + Qwen2-8B-Instruct
32GB+ RAM: bge-small-en-v1.5 (384-dim) + Qwen2-72B (if available)
```

**Success Criteria:**
- ✓ Correctly identifies hardware on 10+ test systems
- ✓ No false GPU positives
- ✓ Model selection never causes OOM
- ✓ Download completes in <10 minutes

**Tests:**
- Unit tests: Hardware detection accuracy
- Integration tests: Model selection + download
- Performance tests: Startup time

---

#### Task 5.4.2: Embedding Generation Pipeline (3 days)
**Files to Create:**
- `python/backend/embedding_service.py` (300 lines)
- `python/backend/embedding_cache.py` (150 lines)
- `python/backend/embedding_model.py` (100 lines)

**What It Does:**
```
First request (cold start):
  1. Load model to GPU/CPU (30-60 seconds)
  2. Generate embedding for query (50-100ms)
  3. Store in L1 cache (in-memory)
  4. Store in L2 cache (SQLite)
  5. Return 384-dimensional vector

Subsequent requests (warm):
  1. Check L1 cache → 95% hit (immediate)
  2. If miss: Check L2 cache → 4% hit (<5ms)
  3. If miss: Generate → 1% (<100ms)
  4. Return vector in <10ms average
```

**Caching Strategy:**
- **L1 Cache (Memory):**
  - 10,000 entries max
  - LRU eviction
  - 60-second TTL
  - Hit rate target: >95%

- **L2 Cache (SQLite):**
  - Persistent across restarts
  - All 526 node embeddings
  - Hit rate target: >4%

**Success Criteria:**
- ✓ P50 latency: <50ms per embedding
- ✓ P99 latency: <100ms per embedding
- ✓ Batch (32 texts): <500ms
- ✓ Cache hit rate: >95% after warmup
- ✓ Memory: <1GB with full cache
- ✓ No OOM crashes

**Tests:**
- Unit tests: Embedding generation, caching, fallbacks
- Performance tests: Latency profiling by batch size
- Memory tests: No leaks after 1000 requests
- Failure tests: OOM handling, graceful degradation

---

#### Task 5.4.3: Grok LLM Integration (3 days)
**Files to Create:**
- `python/backend/llm_service.py` (250 lines)
- `python/backend/prompt_templates.py` (100 lines)
- `python/backend/response_cache.py` (80 lines)

**What It Does:**
```
Generate explanations for search results:
  1. Take query + search results
  2. Build prompt from template
  3. Send to LLM (Grok or fallback)
  4. Stream response tokens
  5. Cache result (60s TTL)

Fallback behavior:
  If LLM unavailable:
    1. Use rule-based template
    2. Less personalized but always works
```

**Prompt Templates:**
```
Template 1: "Why this node?"
  Input: Node name, search query
  Output: "This node is recommended because..."

Template 2: "How to use?"
  Input: Node name, use case
  Output: "To use this node, follow these steps..."

Template 3: "Integration guide"
  Input: Source node, target node
  Output: "To connect these nodes, configure..."
```

**Success Criteria:**
- ✓ Explanation latency: <1s (P99)
- ✓ Token throughput: >50 tokens/second
- ✓ Context window: Handle 4K tokens input
- ✓ Fallback: Works 100% if LLM fails
- ✓ Cache hit rate: >95% for repeated queries
- ✓ Memory: Stable <500MB additional

**Tests:**
- Unit tests: Prompt generation, LLM calls, fallbacks
- Performance tests: Token throughput, latency
- Failure tests: LLM unavailable, timeout, context overflow
- Quality tests: Explanation relevance (manual)

---

#### Task 5.4.4: TypeScript Embedding Client (2 days)
**Files to Create:**
- `src/services/embedding-client.ts` (150 lines)
- `src/services/embedding-cache-ts.ts` (100 lines)
- Updates to `src/mcp/tools.ts` (new embedding-aware tools)

**What It Does:**
```
Before (Phase 5.3, mock embeddings):
  Query → Keyword search → Results

After (Phase 5.4, real embeddings):
  Query
    → embedding_client.embed(query)  [Generate embedding]
    → db.semanticSearch(embedding)   [Find similar nodes]
    → llmClient.explain(results)     [Generate explanation]
    → formatted_response
```

**New MCP Tools Added:**
- `embed_text` - Generate embedding for text
- `semantic_search_with_embedding` - Search using embedding
- `generate_explanation` - Generate LLM explanation
- `cache_stats` - Show cache hit rates

**Success Criteria:**
- ✓ Latency: Phase 5.3 targets maintained (<50ms total)
- ✓ Error handling: Python crashes don't crash TypeScript
- ✓ Caching: TypeScript cache prevents Python calls
- ✓ Memory: Stable TypeScript footprint

**Tests:**
- Integration tests: TypeScript → Python bridge
- Latency tests: End-to-end query performance
- Error tests: Python crashes handled gracefully

#### Task 5.4.5: Integration Testing & Validation (1 day)
**Testing Focus:**
- Embedding quality (semantic accuracy)
- LLM output quality (explanation relevance)
- Hardware compatibility (4GB, 8GB, 16GB, GPU)
- Performance targets met
- No regressions from Phase 5.3

### Phase 5.4 Success Criteria
- ✅ Embeddings generated for 526 nodes in <30 minutes (first run)
- ✅ Single embedding: P50 <50ms, P99 <100ms
- ✅ Batch embedding (32): <500ms
- ✅ Semantic search accuracy: >90%
- ✅ LLM explanation latency: <1s
- ✅ Cache hit rate: >95% after warmup
- ✅ Works on 4GB, 8GB, 16GB, 32GB hardware
- ✅ No OOM crashes
- ✅ Graceful fallback if Python crashes

### Phase 5.4 Code Statistics
- **Python:** 700+ lines
- **TypeScript:** 250+ lines
- **Config:** 150+ lines
- **Total:** ~1,100 lines

### Phase 5.4 Deliverables
1. Hardware detection working
2. Real embeddings generating (<50ms latency)
3. Grok LLM integration complete
4. TypeScript client functional
5. All Phase 5.3 features still working
6. 40+ new unit/integration tests passing
7. Performance targets documented

---

## PHASE 5.5: TYPESCRIPT-PYTHON BRIDGE COMPLETION (Days 16-25) - 10 Days

### Goal
Robust, observable, fault-tolerant cross-language communication

### Prerequisites
- ✅ Phase 5.4 complete
- ✅ Python subprocess architecture proven

### Task Breakdown

#### Task 5.5.1: Process Management & Communication (3 days)
**Files to Create:**
- `src/services/python-bridge.ts` (250 lines)
- `src/services/process-manager.ts` (150 lines)
- `src/services/json-rpc-protocol.ts` (100 lines)

**What It Does:**
```
Process Lifecycle:
  1. App boot → Start Python subprocess
  2. Normal operation → Keep running
  3. Crash detected → Auto-restart (<5s)
  4. App shutdown → Graceful exit

JSON-RPC Protocol:
  Request: {"jsonrpc": "2.0", "method": "embed", "params": {...}, "id": 1}
  Success: {"jsonrpc": "2.0", "result": {...}, "id": 1}
  Error: {"jsonrpc": "2.0", "error": {"code": -32603, "message": "..."}, "id": 1}
```

**Process Management Features:**
- Auto-restart on crash
- Exponential backoff (1s, 2s, 4s, 8s max)
- Graceful shutdown (SIGTERM handling)
- Memory monitoring
- Process health checks every 10 seconds

**Success Criteria:**
- ✓ Process recovery: <5s from crash
- ✓ Memory: Stable <500MB
- ✓ Concurrency: 50+ pending RPC calls
- ✓ All timeouts honored (<5s)

**Tests:**
- Unit tests: JSON-RPC framing, error codes
- Integration tests: Process restart, graceful shutdown
- Stress tests: 50+ concurrent requests

---

#### Task 5.5.2: Error Handling & Fallbacks (2 days)
**Files to Create:**
- `src/services/bridge-error-handler.ts` (120 lines)
- `src/services/fallback-strategies.ts` (100 lines)

**Error Scenarios Handled:**
```
Scenario 1: Python crashes
  → Auto-restart, queue pending requests
  → Fallback: Keyword search (no embeddings)
  → User sees: "Using basic search (semantic offline)"

Scenario 2: Model loading fails
  → Kill process, restart with smaller model
  → Fallback: Rule-based explanations
  → User sees: "Model loading, please wait..."

Scenario 3: Embedding generation OOM
  → Reduce batch size, retry
  → Fallback: Single embedding at a time
  → User sees: "Slow mode enabled"

Scenario 4: Network timeout
  → Kill hanging request, return cached result
  → Fallback: Previous search result
  → User sees: "Using cached results"

Scenario 5: Invalid response format
  → Log error, retry
  → Fallback: Use default structure
  → User sees: Incomplete but valid results
```

**Success Criteria:**
- ✓ All 20+ error scenarios handled
- ✓ User always gets results
- ✓ Error logging: Clear, actionable
- ✓ Recovery rate: 99%+

**Tests:**
- Error scenario tests (20+ scenarios)
- Recovery tests (auto-restart, fallback)
- Logging tests (all errors captured)

---

#### Task 5.5.3: Performance Optimization (2 days)
**Files to Create:**
- `src/services/bridge-cache.ts` (100 lines)
- `src/services/batch-optimizer.ts` (80 lines)

**Optimizations:**
```
L1 Cache (TypeScript):
  - 100 entries, 60s TTL, LRU eviction
  - Hit rate target: >90%

Request Batching:
  - Batch up to 32 embedding requests
  - Wait 100ms for more requests
  - 5-10x speedup

Connection Pooling:
  - Keep Python subprocess alive
  - Reuse connections between requests
```

**Success Criteria:**
- ✓ Cache hit rate: >90%
- ✓ Batch throughput: 5-10x improvement
- ✓ Latency consistency: P99 < 2x P50

**Tests:**
- Cache hit rate tests
- Batch performance tests
- Latency distribution tests

---

#### Task 5.5.4: Monitoring & Observability (2 days)
**Files to Create:**
- `src/services/bridge-metrics.ts` (100 lines)
- Update `src/mcp/tools.ts` with `get_bridge_health` tool

**Metrics Collected:**
```
Real-time:
  - RPC latency (P50, P99, max)
  - Error rate (%)
  - Cache hit rate (%)
  - Process memory (MB)
  - Python uptime (seconds)

Exposed Endpoints:
  GET /health → { ready: bool, python: bool, models: bool }
  GET /metrics → Prometheus format
  GET /bridge-status → Detailed bridge health
```

**Success Criteria:**
- ✓ Metrics available for monitoring
- ✓ Health checks accurate
- ✓ No performance impact from monitoring

**Tests:**
- Metrics collection tests
- Health endpoint tests
- Dashboard visualization tests (manual)

---

#### Task 5.5.5: Integration Testing (1 day)
**Testing Focus:**
- 40+ integration tests
- Cross-platform testing (Windows, Mac, Linux)
- Stress testing (concurrent requests, OOM)
- Error recovery testing

### Phase 5.5 Success Criteria
- ✅ Bridge latency: <10ms (P50)
- ✅ Error recovery: 99%+
- ✅ Concurrency: 50+ parallel queries
- ✅ Memory: Stable <500MB
- ✅ Timeouts: All <5s or handled
- ✅ All 40+ integration tests passing

### Phase 5.5 Code Statistics
- **TypeScript:** 500+ lines
- **Tests:** 40+ test cases
- **Total:** ~600 lines

---

## PHASE 5.6: DOCKER INTEGRATION (Days 26-38) - 13 Days

### Goal
Single-command Docker Desktop deployment with hardware auto-detection and GPU support

### Prerequisites
- ✅ Phases 5.4 & 5.5 complete
- ✅ All components tested standalone

### Task Breakdown (See detailed roadmap document for full task breakdown)

### Phase 5.6 Deliverables
1. Functional Dockerfile (multi-stage)
2. docker-compose.yml configuration
3. Supervisord process management
4. Open WebUI integration
5. Health checks & startup verification
6. GPU support & fallback
7. All components working together

---

## PHASE 5.7: SELF-UPDATING & PER-USER (Days 39-47) - 9 Days

### Goal
Zero-maintenance system that never gets stale + multi-user ready architecture

### Prerequisites
- ✅ Docker infrastructure working
- ✅ All services stable

### Task Breakdown (See detailed roadmap document for full task breakdown)

### Phase 5.7 Deliverables
1. Version tracking daemon
2. State management system
3. RAG rebuilding pipeline
4. Per-user volume isolation
5. Multi-user testing suite

---

## PHASE 5.8: TESTING, DOCUMENTATION & DEPLOYMENT (Days 48-55) - 8 Days

### Goal
Production-ready, fully documented, tested system

### Prerequisites
- ✅ All functionality complete
- ✅ All processes tested

### Task Breakdown

#### Task 5.8.1: Integration & E2E Testing (2 days)
- 40+ end-to-end test scenarios
- Docker build testing on CI/CD
- Platform compatibility testing

#### Task 5.8.2: Performance Benchmarking (2 days)
- Baseline metrics for all operations
- Hardware tier performance matrix
- Optimization recommendations

#### Task 5.8.3: Documentation (2 days)
- 60+ pages of documentation
- Installation, user, admin, troubleshooting guides
- Architecture documentation
- API reference

#### Task 5.8.4: Security & Deployment (2 days)
- Security review & hardening
- Deployment checklist
- Docker Hub image push
- GitHub release creation

### Phase 5.8 Deliverables
1. Docker image on Docker Hub
2. GitHub release with artifacts
3. 60+ pages of documentation
4. 100+ tests passing
5. Performance benchmarks
6. Security review complete

---

## TIMELINE AT A GLANCE

```
Week 1 (Days 1-7):
  Phase -1 (5 days) ← CRITICAL - DO FIRST
  Phase 5.4 Start (2 days) ← Begin hardware detection

Week 2 (Days 8-14):
  Phase 5.4 Completion (6 days)
  Embedding generation + LLM integration

Week 3 (Days 15-21):
  Phase 5.5 Completion (10 days)
  Bridge implementation + error handling

Week 4 (Days 22-28):
  Phase 5.6 Start (7 days)
  Docker infrastructure

Week 5 (Days 29-35):
  Phase 5.6 Completion (6 days)
  Docker testing + integration

Week 6 (Days 36-42):
  Phase 5.7 Implementation (7 days)
  Self-updating + per-user system

Week 7 (Days 43-49):
  Phase 5.7 Completion (2 days)
  Phase 5.8 Start (5 days)

Week 8 (Days 50-55):
  Phase 5.8 Completion (8 days)
  Testing, documentation, release

TOTAL: 55 days (8 weeks)
```

---

## CRITICAL PATH

**Items that block other work:**
1. ✅ Phase -1 decisions (blocks everything)
2. ✅ Python subprocess stability (blocks Phase 5.5)
3. ✅ Docker architecture (blocks Phase 5.6)
4. ✅ Embedding pipeline (blocks Phase 5.5)

**Parallelizable work:**
- Hardware detection (parallel with embedding pipeline)
- Documentation (can start during Phase 5.6)
- Testing (can start during Phase 5.4)

---

## SUCCESS METRICS

| Phase | Success Criteria | Target | Actual |
|-------|-----------------|--------|--------|
| -1 | Specs complete | 30+ pages | TBD |
| 5.4 | Embeddings latency | P50 <50ms | TBD |
| 5.5 | Bridge latency | <10ms | TBD |
| 5.6 | Docker build time | <5min | TBD |
| 5.7 | Version detect time | <1s | TBD |
| 5.8 | Test pass rate | >95% | TBD |

---

**Status:** ✅ READY FOR IMPLEMENTATION
**Next Action:** Begin Phase -1 (Planning)
