# Complete System Architecture - Dual Nano LLM with Intent-Driven Search

## Overview

This document describes the complete architecture of the integrated n8n-mcp system with dual nano LLM models, intent-driven query routing, quality assurance, reinforcement learning, and distributed observability.

## System Components

### 1. Nano LLM Foundation (Phase 1)

#### Hardware Detection & Model Selection
**File:** `src/ai/hardware-detector.ts`

Automatic hardware-aware model selection with 5 tiers:
- **2GB RAM**: EmbeddingGemma 300M (embedding) + Llama 3.2 1B (generation)
- **4GB RAM**: Nomic-Embed-Text (embedding) + Llama 3.2 3B (generation)
- **8GB RAM**: BAAI BGE Small (embedding) + Nemotron Nano 4B (generation)
- **16GB+ RAM**: Nomic-Embed-Text v1.5 (embedding) + Nemotron 4B (generation)

**Key Methods:**
- `selectEmbeddingModel(ramGB: number)` - Select embedding model based on RAM
- `selectGenerationModel(ramGB: number)` - Select generation model based on RAM
- `estimateEmbeddingLatency()` - Estimate embedding inference latency
- `estimateGenerationTokensPerSecond()` - Estimate generation throughput

#### vLLM Inference Client
**File:** `src/ai/vllm-client.ts`

Complete vLLM OpenAI API-compatible inference engine:
- **Embedding Generation**: For semantic understanding
- **Text Generation**: For response creation
- **Health Checking**: Periodic health verification
- **Retry Logic**: Exponential backoff with timeout
- **Error Handling**: Comprehensive error recovery

**Key Methods:**
```typescript
async generateEmbedding(text: string): EmbeddingResponse
async generateText(prompt: string, options?: GenerationOptions): GenerationResponse
async checkHealth(forceCheck?: boolean): boolean
async getHealthStatus(): VLLMHealthStatus
```

#### Docker Orchestration
**File:** `docker-compose.yml`

Three-service deployment:
1. **vllm-embedding**: Lightweight embedding model (2-4GB memory)
2. **vllm-generation**: Larger generation model (8-16GB memory)
3. **n8n-mcp**: Main application with dependencies on both vLLM services

Bridge networking with health checks and automatic startup dependencies.

### 2. Intent-Driven Query Routing (Phase 1)

#### Query Router
**File:** `src/ai/query_router.ts`

6-strategy intent detection system with dual-layer classification:

**6 Query Intent Types:**
1. **DIRECT_NODE_LOOKUP** - User knows exact node name
2. **SEMANTIC_QUERY** - User describes what they want
3. **WORKFLOW_PATTERN** - User wants complete workflow example
4. **PROPERTY_SEARCH** - User asks about node properties
5. **INTEGRATION_TASK** - User wants service integration
6. **RECOMMENDATION** - User seeks best practices/comparisons

**Classification Methods:**
- Pattern matching (regex-based, high precision)
- Keyword scoring (fallback, covers edge cases)
- Confidence scoring (0-1 scale)

**Routing Decision Output:**
```typescript
interface RoutingDecision {
  intent: QueryIntent;
  confidence: number;
  primaryStrategy: string;
  fallbackStrategies: string[];
  searchType: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
  maxResults: number;
  scoreThreshold: number;
}
```

#### Intent Classifier
**File:** `src/ai/query_intent_classifier.ts`

Deep intent classification with feature extraction:

**Feature Extraction:**
- Query length analysis
- Noun/verb phrase detection
- Question mark presence
- Action word identification (30+ verbs)
- Technical term detection (60+ terms)
- Service mention extraction (20+ services)
- Node mention identification

**Multi-Label Classification:**
- Primary intent with confidence
- Secondary intents (alternatives)
- Feature-based scoring
- Context-aware refinement
- User expertise consideration

#### Search Router Integration
**File:** `src/ai/search-router-integration.ts`

Integration layer connecting router to semantic search pipeline:
- Orchestrates intent classification
- Makes routing decisions
- Executes appropriate search strategy
- Filters results based on quality
- Returns integrated results with metadata

### 3. Quality Assurance Layer (Phase 2)

#### Quality Checker
**File:** `src/ai/quality-checker.ts`

5-dimension quality assessment:

**Quality Dimensions:**
1. **Quantity** (0.2 weight) - Do we have enough results? (min: 2, max: 50)
2. **Relevance** (0.35 weight) - Are results relevant? (avg score > 0.5)
3. **Coverage** (0.2 weight) - Diverse node types? (>50% diversity)
4. **Diversity** (0.15 weight) - Well-distributed scores? (multiple buckets)
5. **Metadata** (0.1 weight) - Complete metadata? (>60% coverage)

**Output:**
```typescript
interface QualityAssessment {
  overallScore: number; // 0-1 (weighted average)
  passed: boolean;
  scores: QualityScore[];
  failedDimensions: string[];
  recommendations: string[];
}
```

#### Result Validator
**File:** `src/ai/result-validator.ts`

Individual result validation with 5+ checks:

**Validation Levels:**
1. **Required Fields**: score, content (mandatory)
2. **Recommended Fields**: nodeName, nodeId, metadata
3. **Content Validation**: Length (10-10000 chars), quality, completeness
4. **Score Validation**: Range 0-1, numeric
5. **Metadata Validation**: Structure, size, completeness
6. **Node Identifiers**: At least one of nodeId or nodeName

**Severity Levels:** Error, Warning, Info

#### Quality Check Pipeline
**File:** `src/ai/quality-check-pipeline.ts`

3-stage validation pipeline:

**Stage 1: Individual Result Validation**
- Validate each result against 5+ criteria
- Generate error/warning reports
- Score each result

**Stage 2: Aggregate Quality Assessment**
- Evaluate 5 quality dimensions
- Weight by importance
- Calculate overall quality score

**Stage 3: Intelligent Filtering**
- Filter by quality threshold
- Remove low-scoring results
- Apply user-configured strictness

**Output:**
```typescript
interface PipelineResult {
  originalResults: any[];
  filteredResults: any[];
  validationResults: ValidationResult[];
  qualityAssessment: QualityAssessment;
  pipeline: {
    totalInputs: number;
    passedValidation: number;
    failedValidation: number;
    qualityScore: number;
    qualityPassed: boolean;
    executionTimeMs: number;
  };
}
```

### 4. Trace-Based Reinforcement Learning (Phase 2)

#### Trace Collector
**File:** `src/ai/trace-collector.ts`

POMDP (Partially Observable Markov Decision Process) format trace collection:

**Execution Trace Components:**
```typescript
ExecutionTrace {
  traceId: string;
  observation: Observation;      // Query + features
  action: Action;                // Router decision
  result: Result;                // Search outcome
  reward: Reward;                // Feedback signal
  metadata: {
    userExpertise?: string;
    isFollowUp?: boolean;
    refinementIteration?: number;
    endUserSatisfaction?: { rating?, feedback?, selectedResult? }
  };
}
```

**Key Methods:**
- `startTrace()` - Begin execution recording
- `recordAction()` - Log router decision
- `recordResult()` - Log search results
- `completeTrace()` - Finalize with reward
- `getSuccessfulTraces()` - Training data
- `getFailedTraces()` - Negative examples

#### Trace Processor
**File:** `src/ai/trace-processor.ts`

Converts execution traces to RL training format:

**Output Format:**
```typescript
RLTrainingSample {
  state: { queryFeatures, userProfile, context };
  action: { intent, strategy, searchType };
  reward: { immediate, components };
  resultState: { resultCount, qualityScore, executionTime };
  metadata: { success, userSatisfaction };
}
```

**Batch Processing:**
- Organize traces into episodes (conversations)
- Create training batches
- Export to CSV/JSON for ML frameworks
- Calculate success rates and reward distributions

#### Automatic Intermediate Rewarding (AIR)
**File:** `src/ai/air-engine.ts`

Automatic reward computation without explicit user feedback:

**Reward Components (sum to immediate reward):**
1. **Quality Reward** (50% weight) - Result quality dimensions
2. **Efficiency Reward** (20% weight) - Execution time vs target
3. **Exploration Bonus** (15% weight) - Encourages trying new strategies
4. **Implicit Signals** (10% weight) - Metadata, error-free, validation passed
5. **User Feedback** (optional, 25% weight) - Explicit ratings if available

**Reward Scaling:**
- Base range: -1 to +1
- Context-aware scaling by user expertise
- Beginner: More forgiving (reduce negative)
- Expert: Stricter standards (amplify both)

**Quality Reward Factors:**
- Quantity score (15%)
- Relevance score (35%)
- Coverage score (20%)
- Diversity score (15%)
- Metadata score (15%)

#### Execution Recorder
**File:** `src/ai/execution-recorder.ts`

Comprehensive execution event logging:

**Event Types:**
- QUERY_RECEIVED
- INTENT_CLASSIFIED
- SEARCH_STARTED/COMPLETED
- RESULTS_VALIDATED
- QUALITY_CHECKED
- RESULTS_RETURNED
- ERROR_OCCURRED
- USER_FEEDBACK

**Execution Record:**
```typescript
ExecutionRecord {
  executionId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  events: ExecutionEvent[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  userInteraction: {
    resultSelected?: number;
    userRating?: number;
    userFeedback?: string;
    timeToSelection?: number;
  };
}
```

### 5. Credit Assignment & Valuation (Phase 3)

#### Credit Assignment Engine
**File:** `src/ai/credit-assignment.ts`

TD(λ) temporal difference learning for credit distribution:

**Algorithm:**
- **Discount Factor (γ)**: 0.99 (future rewards still matter)
- **Eligibility Trace Decay (λ)**: 0.95 (recent actions more important)
- **Learning Rate (α)**: 0.1 (moderate update speed)

**TD Error Computation:**
```
TD Error = r(t) + γ*V(s_next) - V(s_current)
```

**Credit Distribution:**
- Distributes credit to all nodes mentioned in query
- Updates strategy success rates
- Maintains value function estimates for states
- Decays eligibility traces over time

**Output:**
```typescript
TDCreditAssignment {
  traceId: string;
  stepCredits: [{
    stepIndex: number;
    actionType: string;
    immediateReward: number;
    discountedFutureReward: number;
    tdError: number;
    totalCredit: number;
    eligibilityTrace: number;
  }];
  totalTraceReward: number;
  valueEstimate: number;
}
```

#### Node Value Calculator
**File:** `src/ai/node-value-calculator.ts`

Empirical node performance valuation:

**Node Performance Metrics:**
```typescript
NodePerformance {
  nodeId: string;
  nodeName: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  totalCredit: number;
  averageCredit: number;
  averageExecutionTime: number;
  averageQualityScore: number;
  valueScore: number;      // 0-1 composite
  tier: 'gold' | 'silver' | 'bronze' | 'standard';
  rank: number;
}
```

**Tiers:**
- **Gold** (>0.8): Highly recommended, proven performance
- **Silver** (0.6-0.8): Good options with consistent results
- **Bronze** (0.4-0.6): Acceptable, may need alternatives
- **Standard** (<0.4): Underperforming, avoid if possible

**Value Score Computation:**
```
ValueScore =
  0.35 * successRate +
  0.30 * creditScore +
  0.20 * qualityScore +
  0.15 * efficiencyScore
```

### 6. Iterative Refinement (Phase 3)

#### Refinement Engine
**File:** `src/ai/refinement-engine.ts`

Automatic query refinement based on quality failures:

**Refinement Strategies:**
1. **Quantity Issues** → Broaden/narrow query
2. **Relevance Issues** → Add technical terms or simplify
3. **Coverage Issues** → Diversify search keywords
4. **Diversity Issues** → Add contextual terms
5. **Metadata Issues** → Focus on property search

**Refinement Loop:**
- Max iterations: 3 (configurable)
- Quality threshold: 0.85 (stop if reached)
- Min improvement: 0.05 (stop if no progress)
- Query modification aggressiveness: 0.7

**Output:**
```typescript
RefinementSuggestion {
  iterationNumber: number;
  originalQuery: string;
  refinedQuery: string;
  reason: string;
  suggestedStrategy: QueryIntent;
  confidence: number;
  expectedImprovement: number;
}
```

### 7. Observability & Monitoring (Phase 3)

#### Telemetry Service
**File:** `src/ai/telemetry.ts`

OpenTelemetry-compatible tracing:

**Span Management:**
```typescript
TelemetrySpan {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  parentSpanId?: string;
  attributes: SpanAttributes;
  events: SpanEvent[];
  status: 'unset' | 'ok' | 'error';
  errorMessage?: string;
}
```

**Key Methods:**
- `startSpan(name, attributes, parentSpanId)` - Begin span
- `endSpan(spanId, status, errorMessage)` - End span
- `addSpanEvent(spanId, eventName, attributes)` - Log event
- `setSpanAttributes(spanId, attributes)` - Update attributes
- `exportTraces()` - Export in OTel format
- `getAllTraces()` - Retrieve traces

#### Metrics Service
**File:** `src/ai/metrics.ts`

Prometheus-compatible metrics collection:

**Metric Types:**
1. **Counters**: Monotonically increasing (total queries, successes, failures)
2. **Gauges**: Current snapshot (last execution time, quality score)
3. **Histograms**: Value distributions (execution time, quality scores)

**Predefined Metrics:**
- `queries_total` - Total queries processed
- `queries_successful` - Successful queries
- `queries_failed` - Failed queries
- `execution_time_ms` - Histogram of execution times
- `quality_score` - Histogram of quality scores
- `last_execution_time_ms` - Latest execution time
- `last_quality_score` - Latest quality score

**Statistics:**
```typescript
{
  totalQueries: number;
  successRate: number;
  averageExecutionTime: number;
  medianExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  averageQualityScore: number;
}
```

#### Distributed Trace Collector
**File:** `src/ai/traces.ts`

Multi-format distributed tracing:

**Supported Formats:**
1. **Jaeger** - Native tracing backend
2. **Zipkin** - Distributed tracing platform
3. **OTLP** - OpenTelemetry Protocol

**Export Methods:**
- `exportJaeger()` - Jaeger JSON format
- `exportZipkin()` - Zipkin JSON format
- `exportOTLP()` - OpenTelemetry Protocol format

**Trace Structure:**
```typescript
ExportableTrace {
  traceID: string;
  processes: Record<string, ProcessInfo>;
  spans: ExportableSpan[];
}
```

## Data Flow

### Query Processing Flow

```
User Query
    ↓
[Intent Classifier] → Extract features, detect services/nodes
    ↓
[Query Router] → Classify intent, select strategy
    ↓
[Search Router Integration] → Execute search strategy
    ↓
[Quality Check Pipeline]
    ├→ [Result Validator] → Validate individual results
    ├→ [Quality Checker] → Assess 5 dimensions
    └→ Filter/refine results
    ↓
[Refinement Engine] (optional)
    ├→ Check quality score
    ├→ Analyze failures
    └→ Suggest query refinement
    ↓
[AIR Engine] → Compute automatic reward
    ↓
[Trace Collector] → Record complete POMDP trace
    ↓
[Trace Processor] → Convert to RL training format
    ↓
[Credit Assignment] → TD(λ) credit distribution
    ↓
[Node Value Calculator] → Update empirical performance
    ↓
Return Results to User
    ↓
[Telemetry Service] → Record spans
[Metrics Service] → Update counters/histograms
[Trace Collector] → Export distributed trace
```

## Integration Points

### 1. Search Pipeline Integration
- Connects to existing semantic search engine
- Provides intent-aware routing
- Receives quality feedback
- Records execution metrics

### 2. n8n Node Information
- Uses existing node database
- Extracts properties and operations
- Matches user queries to nodes
- Maintains node value scores

### 3. API Endpoints
- `/api/local-llm/hardware` - Hardware detection
- `/api/local-llm/nano-models` - Model information
- Search endpoints integrated with routing
- Metrics export endpoints

### 4. Docker Infrastructure
- vLLM services for inference
- Automatic health checking
- Bridge networking
- Persistent volumes for caching

## Configuration

All components support configuration through:
1. Constructor parameters
2. Environment variables
3. Default sensible values

Key configuration points:
- Hardware detection and model selection
- Quality thresholds and weights
- Refinement max iterations and improvement threshold
- Telemetry sampling rate
- Metrics export format
- Trace export endpoint and format

## Performance Characteristics

### Latency (typical):
- Intent classification: 5-20ms
- Semantic search: 50-200ms
- Quality checking: 20-50ms
- Total pipeline: 100-300ms

### Throughput:
- Embedding model: 100-500 req/s
- Generation model: 10-50 req/s
- Quality checks: 1000+ req/s

### Memory:
- Embedding model: 2-4GB
- Generation model: 8-16GB
- Application: 256-512MB

### Storage:
- Traces: ~1KB per trace
- Metrics: Negligible (streaming)
- Models: Pre-cached in volumes

## Security Considerations

1. **Authentication**: Bearer token for HTTP mode
2. **Data Privacy**: Traces/metrics can be anonymized
3. **Model Security**: vLLM runs in isolated containers
4. **Resource Limits**: Memory limits prevent DOS
5. **Error Handling**: Comprehensive error recovery

## Future Enhancements

1. **Multi-GPU Support**: Distribute models across GPUs
2. **Model Quantization**: Further reduce memory footprint
3. **Cache Warming**: Pre-load popular nodes
4. **Custom Training**: Fine-tune models on n8n data
5. **A/B Testing**: Compare strategy performance
6. **Federated Learning**: Distributed training across instances
