# Agentic GraphRAG: Real Issues Discovered via Live MCP Testing

**Date**: November 22, 2025
**Test Method**: Live MCP Server (not local test scripts)
**Test Client**: test-agentic-graphrag-detailed.js

---

## Critical Findings

### ✅ What's Working
1. MCP tools are registered and callable via CLI
2. Handlers execute without errors
3. Workflow generation produces valid JSON
4. Workflow validation works correctly
5. No runtime exceptions thrown

### ❌ What's Broken
1. **Pattern Discovery Returns `null`** - PatternAgent not finding patterns
2. **Graph Queries Return `null`** - GraphRAGBridge not executing/not returning results
3. **GraphRAG Insights Missing** - No knowledge graph integration in final workflow

---

## Test Evidence

### Live MCP Test Results

**Request**:
```json
{
  "goal": "Send message to Slack when webhook receives data",
  "enableGraphRAG": true,
  "shareInsights": true
}
```

**Response**:
```json
{
  "success": true,
  "pattern": null,              ❌ CRITICAL
  "graphInsights": null,        ❌ CRITICAL
  "workflow": { ... },          ✅ Generated (but generic)
  "executionStats": {
    "totalTime": 2,
    "patternDiscoveryTime": 1,
    "graphQueryTime": 0        ❌ No execution (0ms)
  }
}
```

### Analysis

| Component | Status | Evidence | Issue |
|-----------|--------|----------|-------|
| MCP Handler | ✅ Works | Tool callable, returns response | N/A |
| Pattern Agent | ❌ Fails | `pattern: null` | Not finding matches |
| Graph Bridge | ❌ Fails | `graphQueryTime: 0`, `graphInsights: null` | Not executing or querying |
| Workflow Gen | ⚠️ Fallback | Generates workflow without pattern | Works but not optimized |
| Validation | ✅ Works | `valid: true`, proper validation | N/A |

---

## Root Cause Analysis

### Issue #1: Pattern Discovery Returns Null

**What's happening:**
- PatternAgent.execute() is being called (1ms execution)
- It's returning null instead of PatternMatch objects
- No patterns are being found for ANY goal

**Why:**
Looking at the code flow:
1. Goal: "Send message to Slack when webhook receives data"
2. PatternAgent extracts keywords: ["send", "message", "slack", "webhook", "data"]
3. PatternAgent looks for matches in `this.patterns` Map
4. **Map is likely empty or keywords don't match any patterns**

**File**: `src/ai/agents/pattern-agent.ts`
**Method**: `findMatchingPatterns()`
**Line**: ~346

**Questions:**
- Where are patterns loaded from? (`loadPatterns()`)
- Are patterns being populated into the Map?
- Do the patterns in the database exist?

### Issue #2: GraphRAG Query Returns Null

**What's happening:**
- GraphRAGBridge.queryGraph() is not being called (0ms execution)
- graphInsights remains null
- No knowledge graph data in response

**Why:**
Looking at the orchestrator:
1. If `config.enableGraphRAG` is true, should call `queryGraphRAGForPattern()`
2. **But execution time is 0ms** = method isn't running at all

**File**: `src/ai/agents/graphrag-nano-orchestrator.ts`
**Method**: `executePipeline()` → `queryGraphRAGForPattern()`
**Line**: ~140-150

**Questions:**
- Why is graph query time 0ms?
- Is the condition `if (this.config.enableGraphRAG && result.pattern)` blocking it?
- If pattern is null, graph query is skipped!

### Issue #3: Workflow Generation Works Without Pattern

**What's happening:**
- WorkflowAgent generates valid workflow even without pattern
- Suggests it has fallback/default behavior
- But workflow is generic (Manual Trigger → Send Email)

**Why:**
WorkflowAgent probably has default template that works even with `pattern: null`

**File**: `src/ai/agents/workflow-agent.ts`

---

## The Real Problem: Dependency Chain Broken

```
Pattern Discovery (RETURNS NULL)
        ↓
Graph Query (SKIPPED - depends on pattern)
        ↓
Workflow Generation (USES DEFAULT FALLBACK)
        ↓
Validation (WORKS)
```

**The graph query depends on pattern discovery succeeding.**
**If patterns are null, graph queries don't run.**
**Without patterns, workflows use defaults.**

---

## What Needs to Happen

### Priority 1: Fix Pattern Discovery
- [ ] Debug PatternAgent.findMatchingPatterns()
- [ ] Check if patterns are being loaded from database
- [ ] Verify patterns Map is populated
- [ ] Test keyword extraction
- [ ] Add logging to see what patterns exist

### Priority 2: Fix Graph Query Dependency
- [ ] Make graph query NOT dependent on patterns
- [ ] OR fix pattern discovery first, then graph query will work
- [ ] OR use goal directly for graph query (don't wait for pattern match)

### Priority 3: Integrate Graph Insights into Workflow
- [ ] Pass graphInsights to WorkflowAgent
- [ ] Use graph nodes/edges to build better workflows
- [ ] Don't use default template when graph insights available

---

## Next Steps

### Immediate Investigation
1. Check if pattern database exists and has data
2. Add logging to PatternAgent.findMatchingPatterns()
3. Verify patterns are being loaded in initialize()
4. Check orchestrator config settings

### Test Commands
```bash
# View pattern database
sqlite3 data/nodes-v2.db "SELECT * FROM patterns LIMIT 5;"

# Check orchestrator initialization
npm run test:orchestrator

# Debug pattern loading
NODE_DEBUG=* npm start
```

### Files to Investigate
- `src/ai/agents/pattern-agent.ts` - Pattern loading & matching
- `src/ai/agents/graphrag-nano-orchestrator.ts` - Orchestration logic
- `src/ai/graphrag-bridge.ts` - Graph querying
- `python/backend/graph/lightrag_service.py` - Python backend

---

## Summary

The agentic GraphRAG system **looks functional at the handler level** but **is not actually performing intelligent operations**:

- ✅ Handlers respond without errors
- ❌ Pattern discovery is broken (returns null)
- ❌ Graph querying is broken (doesn't run)
- ⚠️ Workflows are generated using defaults (not AI-optimized)

**Status**: Not production-ready
**Root Cause**: Pattern/Graph pipeline broken
**Scope**: Critical agents not functioning

---

## Evidence Files
- `test-results.json` - Full MCP response
- `test-agentic-graphrag-live-v2.js` - Test client showing 4/4 tests pass (but data is null)
- `test-agentic-graphrag-detailed.js` - Detailed analysis

These show that while handlers execute and return valid JSON, the **intelligent components (pattern discovery, graph querying) are completely non-functional**.
