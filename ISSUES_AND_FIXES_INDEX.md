# Issues & Fixes Index

**Purpose:** Central tracking of all MCP server issues discovered during testing and development
**Status:** Active - Issues being collected for v2.7.4+ implementation

---

## Quick Navigation

### Critical Issues (Must Fix Now)
- [API_VALIDATION_ISSUES.md](./API_VALIDATION_ISSUES.md) - n8n API is strict about workflow creation format

### All Issues
- [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md) - Comprehensive issue list with status tracking

---

## Summary by Category

### API/Integration Issues
1. **n8n API Strict Validation** - [API_VALIDATION_ISSUES.md](./API_VALIDATION_ISSUES.md)
   - Missing `settings` property
   - Forbidden extra properties
   - No node type validation
   - Connection format not validated
   - Required parameters not checked

2. **Tool Registration Timing** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-2-tool-registrationlazy-initialization-timing)
   - Some tools unavailable on first call
   - "Unknown tool" errors

3. **API Key Expiration** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-3-api-key-management--expiration)
   - Keys in .env can be expired
   - 401 errors without clear messaging

### Data/System Issues
4. **Database Corruption** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-4-database-restoration--backup-management)
   - Schema errors prevent n8n startup
   - Manual recovery needed

### Workflow Building Issues
5. **Node Type Naming** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-5-node-type-naming-conventions)
   - Prefix confusion (`webhook` vs `n8n-nodes-base.webhook`)
   - No validation upfront

6. **Workflow Validation** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-6-workflow-structure-validation-missing)
   - No minimum node validation
   - Connection references not checked
   - Parameter types not validated

7. **Connection Format** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-7-connection-format-documentation)
   - Complex format confuses agents
   - Common mistakes not caught

### Documentation/UX Issues
8. **Parameter Documentation** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-8-tool-parameter-documentation)
   - Optional vs required unclear
   - No usage examples

9. **Error Messages** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-9-error-messages-could-be-more-helpful)
   - Generic errors don't help
   - No suggestions for fixes

10. **Performance Monitoring** - [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md#issue-10-performance-monitoring)
    - No visibility into API performance
    - Rate limits not monitored

---

## Implementation Priority

### Phase 1: Critical (v2.7.4 - Blocking)
**Est. Time:** 4-6 hours
1. Fix API validation issue (#1) - Prevents all workflows
2. Fix tool registration timing (#2) - Prevents tool discovery

**Files to Modify:**
- `src/mcp/tools.ts` - Update tool descriptions
- `src/mcp/server.ts` - Fix tool registration
- `src/services/workflow-validator.ts` - Add schema validation

### Phase 2: High Priority (v2.7.5 - 1-2 weeks)
**Est. Time:** 8-12 hours
1. Fix API key management (#3)
2. Fix database handling (#4)
3. Add node type validation (#5)

**Files to Modify:**
- `src/services/n8n-manager.ts` - API key validation
- `src/services/node-documentation-service.ts` - Node validation
- `src/mcp/server.ts` - Health checks

### Phase 3: Medium Priority (v2.7.6 - Sprint 1)
**Est. Time:** 12-16 hours
1. Complete workflow validation (#6)
2. Improve error messages (#7, #9)
3. Enhance parameter docs (#8)

**Files to Modify:**
- `src/services/workflow-validator.ts` - Complete validation
- `src/mcp/server.ts` - Better error messages
- Tool descriptions - Clear documentation

### Phase 4: Low Priority (v2.8.0 - Backlog)
**Est. Time:** 4-8 hours
1. Add performance monitoring (#10)
2. Create debugging tools
3. Add telemetry

---

## Implementation Checklist

### For Each Issue:
- [ ] Create GitHub issue with full description
- [ ] Assign to developer/sprint
- [ ] Link to documentation file
- [ ] Add test cases
- [ ] Update tool descriptions
- [ ] Test with actual agent workflows
- [ ] Document fix in CHANGELOG.md
- [ ] Close issue when complete

---

## Testing Strategy

After implementing fixes, test with:

1. **Unit Tests** - Validation functions work correctly
2. **Integration Tests** - API returns correct errors
3. **Agent Testing** - Real agents can build workflows without wasting tokens
4. **Edge Cases** - Invalid inputs handled gracefully

### Test Scenarios:
```
✅ Create workflow with missing 'settings' → Gets helpful error before API call
✅ Create workflow with forbidden properties → Gets helpful error before API call
✅ Create workflow with invalid node type → Gets suggestions for correct type
✅ Create workflow with invalid connection → Gets format example
✅ Register all MCP tools on startup → All tools available immediately
✅ Validate expired API key → Clear error message with recovery steps
✅ Handle database corruption → Clear error with recovery instructions
```

---

## Related Documents

- [API_VALIDATION_ISSUES.md](./API_VALIDATION_ISSUES.md) - Detailed API constraint analysis
- [MCP_ISSUES_TRACKER.md](./MCP_ISSUES_TRACKER.md) - Full issue descriptions and tracking
- [CLAUDE.md](./CLAUDE.md) - Project overview and architecture
- [CHANGELOG.md](./CHANGELOG.md) - Version history

---

## Session Information

**Session:** Workflow Building - Email Manager (Outlook + Teams)
**Date:** October 31, 2025
**Created By:** Claude Code
**Next Step:** Continue workflow building while logging any additional issues

---

## Feedback Loop

When agents build workflows:
1. ✅ Log any errors or confusing messages
2. ✅ Note wasted tokens on retries
3. ✅ Document workarounds discovered
4. ✅ Add to MCP_ISSUES_TRACKER.md
5. ✅ Prioritize high-impact issues
6. ✅ Fix before next session

---

**This index is living documentation. Update as new issues are discovered.**

---

## Session: October 31, 2025 - Workflow Building & Issue Discovery

### Workflow Built
✅ **AI Email Manager - Outlook & Teams** (7-node workflow)
- Ready for deployment once critical issues fixed
- Uses 0 Code nodes (all built-in nodes only)
- Full Teams → AI Analysis → Email workflow

### Issues Discovered
✅ **15 Total Issues** documented with code examples
- 3 Critical (blocking)
- 2 High (affecting functionality)
- 7 Medium (causing data corruption)
- 3 Low (polish/docs)

### Root Causes Found
✅ **Memory cache broken** - estimateSize() calculation incorrect
✅ **API validation missing** - agents waste tokens on retries
✅ **Tool registration timing** - some tools unavailable on startup
✅ **Race conditions** - concurrent cache operations unsynchronized
✅ **Cache coordination** - multiple instances unbounded growth

### Documentation Created
- DISCOVERED_ISSUES_SUMMARY.md - Quick reference (this session)
- MCP_ISSUES_TRACKER.md - Complete issue details (updated)
- API_VALIDATION_ISSUES.md - n8n API constraints analysis
- SESSION_SUMMARY_WORKFLOW_BUILDING.md - Session breakdown

### Key Files Identified for Fixes
1. src/utils/enhanced-cache.ts - Memory calculation & eviction
2. src/mcp/tools.ts - Tool descriptions with requirements
3. src/services/workflow-validator.ts - Schema validation
4. src/mcp/server.ts - Tool registration
5. src/utils/enhanced-cache-manager.ts - Global memory coordination
