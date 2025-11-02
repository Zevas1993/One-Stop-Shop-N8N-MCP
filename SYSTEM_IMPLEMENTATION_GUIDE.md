# Complete System Implementation Guide

## Quick Summary

This document provides a technical overview of how the 6-component integrated system works together.

## Component Interconnections

### Core Data Flow

```
PHASE 1: Query Understanding
├─ Query Router (query_router.ts)
│  └─ Intent Classification with 6 strategies
├─ Intent Classifier (query_intent_classifier.ts)
│  └─ Feature extraction (technical terms, services, nodes)
└─ Search Router Integration (search-router-integration.ts)
   └─ Orchestrate search with selected strategy

PHASE 2: Quality & Learning
├─ Quality Checker (quality-checker.ts)
│  └─ 5-dimension assessment (quantity, relevance, coverage, diversity, metadata)
├─ Result Validator (result-validator.ts)
│  └─ Individual result validation
├─ Quality Check Pipeline (quality-check-pipeline.ts)
│  └─ 3-stage: validate → assess → filter
├─ Trace Collector (trace-collector.ts)
│  └─ Capture POMDP-format execution traces
├─ Trace Processor (trace-processor.ts)
│  └─ Convert traces to RL training format
├─ Execution Recorder (execution-recorder.ts)
│  └─ Record all execution events
└─ AIR Engine (air-engine.ts)
   └─ Automatic reward computation (5 components)

PHASE 3: Learning & Observation
├─ Credit Assignment (credit-assignment.ts)
│  └─ TD(λ) credit distribution to nodes/strategies
├─ Node Value Calculator (node-value-calculator.ts)
│  └─ Empirical node performance valuation (gold/silver/bronze/standard)
├─ Refinement Engine (refinement-engine.ts)
│  └─ Iterative query improvement (max 3 iterations)
├─ Telemetry (telemetry.ts)
│  └─ OpenTelemetry span management
├─ Metrics (metrics.ts)
│  └─ Prometheus-compatible counters/gauges/histograms
└─ Traces (traces.ts)
   └─ Distributed trace export (Jaeger/Zipkin/OTLP)
```

## Component Dependencies

### Hardware Foundation
```
hardware-detector.ts
├─ Detects available RAM
├─ Selects embedding model (BAAI, Nomic, Gemma)
└─ Selects generation model (Llama, Nemotron, Deepseek)
         ↓
vllm-client.ts
├─ Manages inference requests
├─ Handles embeddings
├─ Generates text
└─ Health monitoring
         ↓
local-llm-orchestrator.ts
├─ Coordinates dual models
├─ Manages lifecycle
└─ Provides orchestration API
```

### Query Understanding Pipeline
```
Search Query
     ↓
query_intent_classifier.ts
├─ Feature extraction (nodes, services, terms)
├─ Multi-label intent scoring
└─ Confidence calculation
     ↓
query_router.ts
├─ Pattern matching
├─ Keyword scoring
├─ Intent validation
└─ Routing decision
     ↓
search-router-integration.ts
├─ Strategy selection
├─ Search execution
└─ Result collection
```

### Quality Assurance Pipeline
```
Raw Search Results
     ↓
result-validator.ts (Stage 1: Individual Validation)
├─ Required field check
├─ Recommended field check
├─ Content validation
├─ Score range validation
└─ Node identifier validation
     ↓
quality-checker.ts (Stage 2: Aggregate Assessment)
├─ Quantity assessment
├─ Relevance scoring
├─ Coverage analysis
├─ Diversity evaluation
└─ Metadata coverage
     ↓
quality-check-pipeline.ts (Stage 3: Intelligent Filtering)
├─ Apply score filters
├─ Remove errors
├─ Handle warnings
└─ Output filtered results
```

### Learning & Reinforcement Pipeline
```
Execution Trace
     ↓
trace-collector.ts
├─ Observation (query, features)
├─ Action (routing decision)
├─ Result (search outcome)
└─ Reward (AIR-computed)
     ↓
trace-processor.ts
├─ Convert to RLTrainingSample
├─ Organize into episodes
└─ Create training batches
     ↓
credit-assignment.ts (TD(λ) Learning)
├─ Compute TD error
├─ Distribute to nodes/strategies
├─ Update value function
└─ Decay eligibility traces
     ↓
node-value-calculator.ts
├─ Aggregate node credits
├─ Compute performance metrics
├─ Assign tier (gold/silver/bronze/standard)
└─ Generate recommendations
     ↓
execution-recorder.ts
└─ Log all events for analysis
```

### Iterative Refinement Loop
```
Low Quality Results
     ↓
refinement-engine.ts
├─ Analyze failures
├─ Select refinement strategy
│  ├─ Quantity issue → broaden/narrow
│  ├─ Relevance issue → add terms
│  ├─ Coverage issue → diversify
│  ├─ Diversity issue → add context
│  └─ Metadata issue → property focus
├─ Suggest refined query
└─ New iteration (max 3)
     ↓
Back to query_intent_classifier.ts for next iteration
```

### Observability Pipeline
```
Every Operation
     ↓
telemetry.ts
├─ Create span
├─ Add attributes
├─ Record events
└─ Set status
     ↓
metrics.ts
├─ Increment counters (queries_total, etc)
├─ Update gauges (last_execution_time)
├─ Record histogram (execution_time_ms, quality_score)
└─ Export Prometheus format
     ↓
traces.ts
├─ Build OTel trace
├─ Convert spans
└─ Export (Jaeger/Zipkin/OTLP)
```

## Communication Patterns

### Synchronous (Request-Response)
```
Search Query
  → intent_classifier.classify()
    → returns ClassificationResult
  → query_router.makeRoutingDecision()
    → returns RoutingDecision
  → search_router_integration.search()
    → returns IntegratedSearchResult
  → quality_check_pipeline.process()
    → returns PipelineResult
  → refinement_engine.processRefinementIteration()
    → returns RefinementResult (if needed)
  → Results to User
```

### Asynchronous (Fire-and-Forget)
```
After Results Returned
  → trace_collector.completeTrace()
  → air_engine.computeReward()
  → trace_processor.processTrace()
  → credit_assignment.computeCredits()
  → node_value_calculator.recordNodeUsage()
  → execution_recorder.completeExecution()
  → user_feedback (if provided)
    → execution_recorder.recordUserFeedback()
```

### Telemetry (Background)
```
Every Component
  → telemetry.startSpan()
  → [do work]
  → telemetry.endSpan()
  → metrics.recordQuery() or increments/gauges
  → traces.addSpan()
  → (periodically export)
```

## Key Algorithms

### 1. Intent Classification (Multi-Label)

```typescript
// Input: query string + context
// Output: primary intent + secondary intents + confidence

1. Extract features (60+ terms, 30+ verbs, services, nodes)
2. For each of 6 intents:
   a. Apply 3-4 regex patterns (high precision)
   b. If confidence > 0.7, return (fast path)
   c. Otherwise, score by keywords
   d. Normalize to 0-1 range
3. Boost previous intent slightly (continuity)
4. Return top intent + alternatives
```

### 2. Quality Assessment (5-Dimensional)

```typescript
// Input: result set + quality assessment parameters
// Output: overall quality score + passed/failed dimensions

For each dimension:
  1. Calculate metric-specific score (0-1)
  2. Compare against threshold
  3. Generate recommendation if failed

Final Score = weighted average of all dimensions:
  - Quantity: 0.2 weight
  - Relevance: 0.35 weight (most important)
  - Coverage: 0.2 weight
  - Diversity: 0.15 weight
  - Metadata: 0.1 weight

Return:
  - Overall score (0-1)
  - Passed boolean
  - Recommendations for improvement
```

### 3. Automatic Intermediate Rewarding (AIR)

```typescript
// Input: execution trace + quality assessment
// Output: immediate reward (-1 to +1)

Components:
1. Quality Reward (50% weight)
   = weighted sum of 5 quality dimensions
   = converted to -1 to +1 scale

2. Efficiency Reward (20% weight)
   = 1.0 if execution_time <= target (1000ms)
   = linear decay to -1.0 if > max (5000ms)

3. Exploration Bonus (15% weight)
   = 0.2 * (0.99)^usage_count
   = decays as action used more

4. Implicit Signals (10% weight)
   = +0.1 if no errors
   = +0.05 if metadata complete
   = +0.15 if user satisfied
   = +0.1 if all checks passed

5. User Feedback (optional, 25% weight)
   = (rating - 3) / 2  (scales 1-5 to -1 to +1)

Final = weighted average of all components
Context Scaling = adjust by user expertise
  - Beginner: 0.7 * negative, 1.1 * positive
  - Expert: 1.2 * negative, 1.0 * positive
```

### 4. Temporal Difference Learning (TD(λ))

```typescript
// Input: execution trace
// Output: credit assignment to nodes/strategies

Parameters:
  γ (gamma) = 0.99  // discount factor
  λ (lambda) = 0.95 // eligibility trace decay
  α (alpha) = 0.1   // learning rate

Algorithm:
1. Get current state S, action A, reward R, next state S'
2. Look up value estimates: V(S) and V(S')
3. Compute TD error:
   δ = R + γ * V(S') - V(S)
4. Update eligibility trace:
   e(S,A) = 1 + λ * γ * e(S,A)
5. Distribute credit:
   credit = δ * e(S,A)
6. Update value:
   V(S) = V(S) + α * δ
7. Assign credit to:
   - Nodes mentioned in query
   - Routing strategy used
   - Search strategy selected

Result:
  - Recent actions get more credit
  - Common states updated less
  - Decay old traces over time
```

### 5. Node Value Computation

```typescript
// Input: node usage history + credit assignments
// Output: composite value score (0-1) + tier

Metrics:
  1. Success Rate
     = successful_usages / total_usages

  2. Credit Score
     = (average_credit + 1) / 2
     (normalize -1 to +1 → 0 to 1)

  3. Quality Score
     = average_quality_score
     (already 0-1)

  4. Efficiency Score
     = max(0, 1 - execution_time / 5000)
     (lower time = higher score)

Value Score =
  0.35 * success_rate +
  0.30 * credit_score +
  0.20 * quality_score +
  0.15 * efficiency_score

Tier Assignment:
  - Gold:     >= 0.80 (highly recommended)
  - Silver:   0.60-0.79 (good option)
  - Bronze:   0.40-0.59 (acceptable)
  - Standard: < 0.40 (underperforming)
```

### 6. Iterative Refinement

```typescript
// Input: current quality score + failed dimensions
// Output: refined query + suggested strategy

Loop (max 3 iterations):
1. Check stopping conditions:
   a. Quality >= 0.85? STOP
   b. Iteration >= 3? STOP
   c. Improvement < 0.05? STOP

2. Analyze failures:
   - Quantity too low? → broaden query
   - Relevance low? → add technical terms
   - Coverage poor? → diversify keywords
   - Diversity low? → add context
   - Metadata missing? → focus on properties

3. Generate refined query:
   - Remove specificity OR
   - Add keywords OR
   - Change direction

4. Suggest new strategy:
   - Direct node lookup
   - Semantic query
   - Property search
   - Workflow pattern
   - Integration task
   - Recommendation

5. Estimate improvement:
   - Based on failure type
   - Typical 0.15-0.25 improvement
```

## Performance Optimization

### Query Understanding (Phase 1)
- Pattern matching before keyword scoring (90% hit rate)
- Early exit on high confidence (>0.7)
- Caching of query features

### Quality Checking (Phase 2)
- Lazy evaluation (stop on first critical failure)
- Batch validation of results
- Vectorized score computation
- Parallel dimension assessment

### Learning (Phase 3)
- Async trace processing
- Batch credit assignment
- Decay old eligibility traces
- In-memory trace buffer with auto-flush

### Observability (Phase 3)
- Configurable sampling (default 100%)
- Batched metric exports
- Circular span buffer
- Lazy histogram bucket initialization

## Testing & Validation

### Phase 1 Testing
```bash
npm run build                    # TypeScript compilation
npm run test:query-router        # Router logic
npm run test:intent-classifier   # Intent classification
```

### Phase 2 Testing
```bash
npm run test:quality-checker     # Quality assessment
npm run test:traces             # Trace collection
npm run test:reward-computation  # AIR engine
```

### Phase 3 Testing
```bash
npm run test:credit-assignment   # TD learning
npm run test:refinement         # Query refinement
npm run test:observability      # Telemetry/metrics
```

### Integration Testing
```bash
npm run test:end-to-end         # Full pipeline
npm run test:performance        # Load testing
npm run test:distributed        # Multi-container
```

## Deployment Checklist

- [ ] Build TypeScript: `npm run build`
- [ ] Pre-build database: `npm run rebuild`
- [ ] Configure .env with authentication
- [ ] Set hardware tier in environment
- [ ] Choose dual nano models
- [ ] Configure Docker volumes
- [ ] Set up metrics export (Prometheus)
- [ ] Configure trace export (Jaeger/Zipkin)
- [ ] Health check endpoints
- [ ] Start services: `docker compose up -d`
- [ ] Verify vLLM health
- [ ] Run smoke tests
- [ ] Monitor telemetry

## Troubleshooting

### vLLM Issues
```
Check: docker logs vllm-embedding
Check: docker logs vllm-generation
Verify: Health check endpoints
Ensure: Sufficient GPU memory
```

### Quality Issues
```
Low quality scores?
  → Check result quantity
  → Verify relevance threshold
  → Analyze diversity

Too many results filtered?
  → Lower quality threshold
  → Check validation rules
  → Review error/warning counts
```

### Learning Issues
```
No credit being assigned?
  → Check trace collection
  → Verify reward computation
  → Review node credit mapping

Refinement stuck?
  → Check max iterations
  → Verify quality threshold
  → Review failure analysis
```

### Observability Issues
```
Missing spans?
  → Check sampling rate
  → Verify span export
  → Review buffer size

Missing metrics?
  → Check metrics enabled
  → Verify export interval
  → Review metric names
```

## Production Recommendations

1. **High Availability**
   - Run multiple n8n-mcp instances
   - Load balance between instances
   - Shared Redis for distributed state
   - Persistent volume for traces

2. **Performance**
   - Dedicate GPU for vLLM
   - Increase batch sizes
   - Enable model quantization
   - Cache embeddings

3. **Monitoring**
   - Export metrics to Prometheus
   - Send traces to Jaeger
   - Set up alerts on quality scores
   - Monitor GPU utilization

4. **Scalability**
   - Horizontal scaling via load balancer
   - Separate vLLM instances per GPU
   - Distributed trace buffering
   - Metric aggregation service

5. **Security**
   - Use strong authentication tokens
   - Encrypt traces in flight
   - Restrict vLLM network access
   - Monitor for anomalies
