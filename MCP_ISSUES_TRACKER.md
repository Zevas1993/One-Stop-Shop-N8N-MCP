# MCP Server Issues Tracker

**Last Updated:** October 31, 2025
**Status:** Active - Issues being logged during workflow building

---

## Critical Issues (Blocking Workflow Creation)

### Issue #1: n8n API Strict Validation on Workflow Creation
**File:** [API_VALIDATION_ISSUES.md](./API_VALIDATION_ISSUES.md)
**Status:** 🔴 DOCUMENTED - Awaiting implementation
**Severity:** CRITICAL
**Impact:** Agents waste tokens discovering validation constraints

**Issues:**
- Missing `settings` property causes 400 error
- Extra properties like `active`, `description`, `tags` rejected
- Node type validation missing
- Connection format not validated early
- Required parameters not checked before deployment

**Action Items:**
- [ ] Update `n8n_create_workflow` tool description with strict property list
- [ ] Add `validateWorkflowSchema()` function to workflow validator
- [ ] Create new `n8n_validate_workflow_schema` tool
- [ ] Document exact API requirements in tool descriptions
- [ ] Add automatic `settings` generation if missing

**Related Files:**
- `src/mcp/tools.ts` - Tool definitions
- `src/mcp/server.ts` - Tool handlers
- `src/services/workflow-validator.ts` - Validation logic

---

### Issue #2: Tool Registration/Lazy Initialization Timing
**Status:** 🟡 IDENTIFIED - From previous session
**Severity:** HIGH
**Impact:** Some tools return "Unknown tool" errors

**Details:**
- Some tools work: `get_node_info`, `get_node_essentials`
- Some tools fail: `search_nodes`, `list_nodes`, `validate_workflow`
- Error: "Unknown tool" from MCP server

**Hypothesis:**
- Tool registration happens after LazyInitializationManager completes
- Timing issue causes tools to be unavailable initially
- May need to delay tool registration or batch registration

**Action Items:**
- [ ] Investigate `LazyInitializationManager` timing
- [ ] Check tool registration order in `server.ts`
- [ ] Test all tools after server fully initializes
- [ ] Consider moving initialization earlier or making it blocking

**Related Files:**
- `src/mcp/server.ts` - Server initialization
- `src/utils/lazy-initialization-manager.ts` - Initialization logic

---

### Issue #2.5: MCP Server Memory Pressure / Cache Eviction
**Status:** 🟠 DISCOVERED - October 31, 2025
**Severity:** HIGH
**Impact:** Server becomes unstable, tools unavailable

**Details:**
- MCP server logs: `[Cache] Memory pressure detected (12.3MB/14.4MB), evicted 0 entries`
- Repeated memory pressure warnings indicate cache management issue
- Server becomes unresponsive under memory pressure
- May prevent initialization completion

**Symptoms:**
```
[Cache] Memory pressure detected (12.3MB/14.4MB), evicted 0 entries
[Cache] Memory pressure detected (12.3MB/14.4MB), evicted 0 entries
[Cache] Memory pressure detected (12.3MB/14.4MB), evicted 0 entries
```

**Action Items:**
- [ ] Investigate cache eviction logic - why evicted entries = 0?
- [ ] Check memory limits are being calculated correctly
- [ ] Add memory diagnostic logging
- [ ] Consider pre-allocation strategy
- [ ] Test with lower memory configurations

**Related Files:**
- `src/utils/cache-manager.ts` - Cache implementation
- `src/services/node-documentation-service.ts` - Service that uses cache

---

## High Priority Issues (Affecting Functionality)

### Issue #3: API Key Management & Expiration
**Status:** 🟡 DISCOVERED - During workflow deployment
**Severity:** HIGH
**Impact:** Old API keys fail with 401 errors

**Details:**
- API key in `.env` file was expired/invalid
- Had to query database directly to find valid key
- No clear error message about key expiration

**Action Items:**
- [ ] Document API key management in README
- [ ] Add tool to validate current API key status
- [ ] Provide guidance on key rotation/renewal
- [ ] Add health check that validates API key first

**Related Files:**
- `.env` - Configuration file
- `src/services/n8n-manager.ts` - API integration

---

### Issue #4: Database Restoration & Backup Management
**Status:** 🟡 DISCOVERED - n8n database corruption
**Severity:** MEDIUM (but critical when it happens)
**Impact:** n8n fails to start with schema errors

**Details:**
- Restored database from backup: `n8n-working-20250730_010702/n8n_working_backup.tar.gz`
- Schema error: "SQLITE_ERROR: no such column: User.role"
- Recovery required manual database restoration

**Action Items:**
- [ ] Document backup locations in README
- [ ] Create automated backup verification script
- [ ] Add database health check on startup
- [ ] Document recovery procedures

**Related Files:**
- `C:\Users\Chris Boyd\.n8n\database.sqlite`
- `C:\Users\Chris Boyd\Documents\backups\`

---

## Medium Priority Issues (Improving Experience)

### Issue #5: Node Type Naming Conventions
**Status:** 🟡 DISCOVERED - During workflow design
**Severity:** MEDIUM
**Impact:** Agents make mistakes with node names

**Details:**
- Correct format: `n8n-nodes-base.webhook`
- Common mistake: `webhook` (missing prefix)
- No upfront validation of node type names

**Action Items:**
- [ ] Add node type auto-completion in tool descriptions
- [ ] Validate node types against database before accepting
- [ ] Provide helpful suggestions: "Did you mean 'n8n-nodes-base.webhook'?"
- [ ] Document all valid node type prefixes

**Valid Prefixes:**
- `n8n-nodes-base.*` - Base n8n nodes (525+ nodes)
- `@n8n/n8n-nodes-langchain.*` - LangChain integration nodes
- Community nodes - Various prefixes

---

### Issue #6: Workflow Structure Validation Missing
**Status:** 🟡 DISCOVERED - Need schema validation
**Severity:** MEDIUM
**Impact:** Invalid workflows deploy without early feedback

**Details:**
- No validation of minimum viable workflow (at least 2 nodes)
- No validation of connection references (nodes must exist)
- No validation of parameter types/formats
- Validation only happens at execution time

**Action Items:**
- [ ] Add minimum node count validation (2+)
- [ ] Validate all connection references exist
- [ ] Check parameter types match node schema
- [ ] Provide validation report BEFORE deployment

---

### Issue #7: Connection Format Documentation
**Status:** 🟡 DISCOVERED - Format errors during building
**Severity:** MEDIUM
**Impact:** Agents create broken workflow connections

**Details:**
- Complex connection format not well documented
- Common mistakes:
  - Using node ID instead of node name
  - Wrong output index
  - Missing "main" wrapper
  - Incorrect type value

**Valid Format:**
```json
{
  "Source Node Name": {
    "main": [
      [
        { "node": "Target Node Name", "type": "main", "index": 0 }
      ]
    ]
  }
}
```

**Action Items:**
- [ ] Add clear connection format documentation
- [ ] Show examples in tool descriptions
- [ ] Provide validation tool for connection structure
- [ ] Add helpful error messages with correct format

---

## Low Priority Issues (Polish & Docs)

### Issue #8: Tool Parameter Documentation
**Status:** 🟢 DOCUMENTATION
**Severity:** LOW
**Impact:** Agents struggle with optional vs required parameters

**Details:**
- Parameters marked as optional but some are effectively required
- No clear guidance on common parameter combinations
- Examples would help significantly

**Action Items:**
- [ ] Document required parameter combinations per node
- [ ] Add examples for common configurations
- [ ] Clarify when optional parameters are actually needed
- [ ] Create configuration templates

---

### Issue #9: Error Messages Could Be More Helpful
**Status:** 🟢 DOCUMENTATION
**Severity:** LOW
**Impact:** Agents waste time debugging errors

**Details:**
- Generic error messages don't help with diagnosis
- No suggestions for how to fix issues
- Could include valid alternatives

**Action Items:**
- [ ] Improve error messages with context
- [ ] Add suggestions for common mistakes
- [ ] Include examples of valid configurations
- [ ] Link to relevant documentation

---

### Issue #10: Performance Monitoring
**Status:** 🟢 FUTURE ENHANCEMENT
**Severity:** LOW
**Impact:** No visibility into API performance

**Details:**
- No tracking of API response times
- No monitoring of failed requests
- No rate limit warnings

**Action Items:**
- [ ] Add request timing telemetry
- [ ] Monitor API error rates
- [ ] Warn when approaching rate limits
- [ ] Log slow requests for analysis

---

### Issue #11: Cache Memory Calculation May Be Incorrect
**Status:** 🟡 DISCOVERED - October 31, 2025
**Severity:** HIGH
**Impact:** Memory pressure detection and eviction are ineffective

**Details:**
- In `enhanced-cache.ts`, memory calculation uses `estimateSize(value) / (1024 * 1024)`
- No `estimateSize()` function shown in examined code
- If estimation is wrong, currentMemoryMB will be inaccurate
- This explains why "evicted 0 entries" - cache may think it has no room

**Evidence:**
```typescript
// Line 117-121 in enhanced-cache.ts
const entrySizeMB = this.estimateSize(value) / (1024 * 1024);
if (this.currentMemoryMB + entrySizeMB > this.maxMemoryMB) {
  this.evictUntilSpaceAvailable(entrySizeMB);
}
```

**Problem:**
- `estimateSize()` implementation not visible - may return 0 or incorrect values
- If returns 0, currentMemoryMB never increases
- Eviction logic thinks cache is empty, so "evicted 0 entries"
- Cache keeps growing despite memory warnings

**Action Items:**
- [ ] Find and examine `estimateSize()` implementation
- [ ] Verify size calculation is accurate
- [ ] Add logging to track memory calculations
- [ ] Test with known object sizes
- [ ] Consider using Buffer.byteLength() for JSON objects

**Related Files:**
- `src/utils/enhanced-cache.ts` - Cache implementation with missing estimateSize()

---

### Issue #12: Potential Race Condition in Concurrent Cache Operations
**Status:** 🟡 DISCOVERED - October 31, 2025
**Severity:** MEDIUM
**Impact:** Concurrent tool calls may corrupt cache state

**Details:**
- Cache uses synchronous Map operations
- Memory pressure check happens every 30 seconds (line 42-44)
- Tool calls from multiple agents may race with eviction
- No locking mechanism for concurrent access

**Symptoms:**
- Multiple simultaneous tool calls could increment/decrement currentMemoryMB incorrectly
- Eviction runs while tools are accessing cache
- Memory counter may fall out of sync with actual cache size

**Example Race Condition:**
```
Thread 1: tool call starts, reads currentMemoryMB = 100
Thread 2: memory check triggers, evicts entries, sets currentMemoryMB = 50
Thread 1: adds 50MB entry, sets currentMemoryMB = 150 (should be 100!)
```

**Action Items:**
- [ ] Add synchronization for concurrent operations
- [ ] Use async/await with proper locking
- [ ] Add mutex for critical sections
- [ ] Document concurrency guarantees
- [ ] Test with concurrent tool calls

**Related Files:**
- `src/utils/enhanced-cache.ts` - No locking mechanism

---

### Issue #13: No Error Handling in Cache Memory Check Loop
**Status:** 🟡 DISCOVERED - October 31, 2025
**Severity:** MEDIUM
**Impact:** Memory check loop may crash silently

**Details:**
- Memory pressure check runs every 30 seconds (line 42-44)
- Uses `setInterval()` with no error handling
- If `checkMemoryPressure()` throws, interval continues running
- No way to clear interval if error occurs

**Code:**
```typescript
// Line 42-44 - No error handling!
setInterval(() => {
  this.checkMemoryPressure();
}, 30 * 1000);
```

**Risks:**
- Eviction logic error crashes silently
- Memory leak in interval itself
- Error never logged properly
- Server continues running in broken state

**Action Items:**
- [ ] Wrap interval callback in try/catch
- [ ] Store interval ID for cleanup
- [ ] Log eviction errors properly
- [ ] Add shutdown hook to clear intervals
- [ ] Monitor interval health

**Related Files:**
- `src/utils/enhanced-cache.ts` line 42-44

---

### Issue #14: Multiple Cache Instances Not Coordinated
**Status:** 🟡 DISCOVERED - October 31, 2025
**Severity:** MEDIUM
**Impact:** Total memory usage may exceed limits significantly

**Details:**
- Multiple cache instances: nodeInfoCache, searchCache, templateCache, queryCache
- Each has its own EnhancedCache instance with separate limits
- All memory pressure checks run independently
- No global memory coordination

**Example Problem:**
- maxMemoryMB calculated per cache = 1000MB (for 32GB system)
- 4 caches × 1000MB = 4000MB total usage
- But system thinks each cache has only 1000MB limit
- Total memory can balloon to 4GB+

**Action Items:**
- [ ] Implement global memory manager for all caches
- [ ] Share memory budget across caches
- [ ] Coordinate eviction policies
- [ ] Track total cache memory usage
- [ ] Add global memory pressure alerts

**Related Files:**
- `src/utils/enhanced-cache-manager.ts` - Multiple cache coordination
- `src/utils/query-cache.ts` - Global cache instances

---

### Issue #15: MCP Server Mode Selection Logic May Be Flawed
**Status:** 🟡 DISCOVERED - October 31, 2025
**Severity:** MEDIUM
**Impact:** Wrong server mode may start causing confusion

**Details:**
- Server mode defaults to 'consolidated' (line 28 in index.ts)
- But "consolidated" uses SimpleConsolidatedMCPServer
- This may not have all 42 tools available
- Agents may not have access to expected tools

**Code:**
```typescript
// Line 28 - 'consolidated' is default
let mode = process.env.MCP_MODE || 'consolidated';
// Line 68-71 - But consolidated uses different server
else if (mode === 'consolidated') {
  const server = new SimpleConsolidatedMCPServer();
  await server.run();
}
```

**Problem:**
- Users don't know which mode is running
- "consolidated" may be stripped-down version
- Full n8n API tools not available
- No clear warning which tools are available

**Action Items:**
- [ ] Document what each mode provides
- [ ] Log available tools on startup
- [ ] Make mode selection more explicit
- [ ] Add tool inventory check
- [ ] Provide warnings for limited modes

**Related Files:**
- `src/mcp/index.ts` - Mode selection logic
- `src/mcp/server-simple-consolidated.ts` - Consolidated server implementation

---

## Issue Template for Future Issues

When discovering new issues, use this template:

```markdown
### Issue #XX: [Short Description]
**Status:** [🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW / 🟢 DOCUMENTATION / 🟢 FUTURE]
**Severity:** [CRITICAL / HIGH / MEDIUM / LOW]
**Impact:** [What does this affect?]

**Details:**
[What is the problem?]

**Action Items:**
- [ ] Action 1
- [ ] Action 2

**Related Files:**
- `file/path.ts`
- `file/path.ts`
```

---

## Summary Table

| Issue | Status | Severity | Type | Impact |
|-------|--------|----------|------|--------|
| n8n API Strict Validation | 🔴 DOCUMENTED | CRITICAL | API Constraint | Agents waste tokens |
| Tool Registration Timing | 🟡 IDENTIFIED | HIGH | Timing Issue | Tools unavailable |
| Memory Pressure/Cache Eviction | 🟠 DISCOVERED | HIGH | Memory Management | Server won't init |
| API Key Expiration | 🟡 DISCOVERED | HIGH | Credential Mgmt | 401 errors |
| Cache Memory Calculation | 🟡 DISCOVERED | HIGH | Calculation Error | Eviction ineffective |
| Database Corruption | 🟡 DISCOVERED | MEDIUM | Data Integrity | Server won't start |
| Race Condition in Cache | 🟡 DISCOVERED | MEDIUM | Concurrency | State corruption |
| No Error in Memory Loop | 🟡 DISCOVERED | MEDIUM | Error Handling | Silent crashes |
| Multiple Cache Coordination | 🟡 DISCOVERED | MEDIUM | Memory Mgmt | Unbounded growth |
| Server Mode Selection | 🟡 DISCOVERED | MEDIUM | Configuration | Wrong tools |
| Node Type Naming | 🟡 DISCOVERED | MEDIUM | Validation | Agent mistakes |
| Workflow Validation | 🟡 DISCOVERED | MEDIUM | Schema | Invalid deployments |
| Connection Format | 🟡 DISCOVERED | MEDIUM | Documentation | Broken connections |
| Parameter Docs | 🟢 DOCUMENTATION | LOW | Docs | Agent confusion |
| Error Messages | 🟢 DOCUMENTATION | LOW | UX | Debugging difficulty |
| Performance Monitoring | 🟢 FUTURE | LOW | Monitoring | No visibility |

---

## Implementation Priority

### Phase 1: CRITICAL BLOCKERS (v2.7.4 - MUST FIX NOW)
**Est. Time:** 6-8 hours
**Blocking:** MCP server initialization, all workflow testing

1. **Fix Memory Cache Issue (#2.5, #11)** - Server won't start
   - Find and examine `estimateSize()` function
   - Verify memory calculations are correct
   - Add diagnostic logging
   - Fix eviction logic that shows "evicted 0 entries"

2. **Fix API Validation (#1)** - All workflows fail
   - Add schema validation before API calls
   - Prevent agents from wasting tokens on retries
   - Validate workflow structure, node types, connections

3. **Fix Tool Registration (#2)** - Tools unavailable
   - Investigate lazy initialization timing
   - Ensure all 42 tools are registered before server ready
   - Add tool availability check on startup

**Files to Modify:**
- `src/utils/enhanced-cache.ts` - Fix memory calculations and eviction
- `src/mcp/tools.ts` - Update tool descriptions with requirements
- `src/mcp/server.ts` - Fix tool registration timing
- `src/services/workflow-validator.ts` - Add schema validation

### Phase 2: HIGH PRIORITY (v2.7.5 - 1-2 weeks)
**Est. Time:** 8-12 hours

1. **Fix Cache Concurrency Issues (#12, #13)** - State corruption risk
   - Add locking mechanism for concurrent operations
   - Wrap interval callback in try/catch
   - Add proper error handling

2. **Fix Multiple Cache Coordination (#14)** - Memory unbounded growth
   - Implement global memory manager
   - Coordinate eviction across all cache instances
   - Track total cache usage

3. **Fix API Key Management (#3)**
   - Add API key validation on startup
   - Provide clear error messages for expired keys
   - Document key rotation process

4. **Fix Server Mode Selection (#15)**
   - Document what each mode provides
   - Log available tools on startup
   - Add tool inventory check

**Files to Modify:**
- `src/utils/enhanced-cache.ts` - Add locking and error handling
- `src/utils/enhanced-cache-manager.ts` - Global memory coordination
- `src/mcp/index.ts` - Better mode documentation
- `src/services/n8n-manager.ts` - API key validation

### Phase 3: MEDIUM PRIORITY (v2.7.6 - Sprint 1)
**Est. Time:** 12-16 hours

1. **Fix Database Handling (#4)**
2. **Complete Workflow Validation (#6)**
3. **Improve Error Messages (#9, #13)**

**Files to Modify:**
- `src/services/workflow-validator.ts` - Complete validation
- `src/mcp/server.ts` - Better error messages
- Tool descriptions - Clear documentation

### Phase 4: LOW PRIORITY (v2.8.0 - Backlog)
**Est. Time:** 4-8 hours

1. **Add Performance Monitoring (#10)**
2. **Create Debugging Tools**
3. **Add Telemetry**

---

## Next Steps

1. **Immediate (This Session):**
   - Continue workflow building despite issues
   - Document any NEW issues found
   - Complete the Email Manager workflow example

2. **High Priority (Next Session):**
   - Implement Issue #1: API validation
   - Fix Issue #2: Tool registration timing
   - Document Issue #3: API key management

3. **Medium Priority (Sprint 1):**
   - Implement Issue #4: Database health checks
   - Resolve Issue #5: Node type validation
   - Complete Issue #6: Workflow validation

4. **Low Priority (Backlog):**
   - Improve Issue #7: Error messages
   - Enhance Issue #8: Documentation
   - Add Issue #10: Monitoring

---

**Tracking:** All issues documented for implementation in Phase 5.4+
**Session:** Workflow Building - Email Manager (Outlook + Teams)
**Created:** October 31, 2025
