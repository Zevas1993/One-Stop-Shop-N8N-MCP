# API Compliance Fixes Implementation Guide

**Priority**: CRITICAL
**Time Estimate**: 3-4 hours
**Blocking**: Production deployment
**Document**: Detailed step-by-step code changes to make MCP server fully API compliant

---

## Overview

Based on the official n8n API schema (api-1.json), the MCP server is missing critical field sanitization that causes workflow corruption. This guide provides exact code changes needed.

---

## Fix 1: Create Field Cleaner Service

**File**: `src/services/workflow-field-cleaner.ts` (NEW)
**Time**: 30 minutes
**Purpose**: Reusable function to strip read-only fields from workflows

Create this new file:

```typescript
/**
 * Workflow Field Cleaner Service
 * Removes system-managed fields that are read-only in the n8n API
 * Based on official n8n API schema v1.1.1
 */

import { Workflow } from '../types';
import { logger } from '../utils/logger';

/**
 * Fields that are READ-ONLY in n8n API
 * These are managed by n8n and must never be sent in POST/PUT requests
 */
const READ_ONLY_FIELDS = [
  'id',              // System-generated workflow ID
  'active',          // Managed by activate/deactivate endpoints
  'createdAt',       // System timestamp
  'updatedAt',       // System timestamp
  'tags',            // Managed via separate /tags endpoints
  'versionId',       // Version tracking (inferred)
  'triggerCount',    // Generated from execution history
  'isArchived',      // System state flag
] as const;

/**
 * Fields that may contain data but should be handled carefully
 * These are optional fields that API may or may not accept depending on context
 */
const OPTIONAL_SYSTEM_FIELDS = [
  'description',     // Typically read-only in APIs
] as const;

/**
 * Strips all read-only fields from a workflow object
 * Returns a new object with only API-acceptable fields
 *
 * @param workflow - The workflow to clean
 * @returns Cleaned workflow with only settable fields
 */
export function stripReadOnlyFields(workflow: any): Partial<Workflow> {
  const cleaned: Record<string, any> = {};

  // Required fields (must always be present)
  const requiredFields = ['name', 'nodes', 'connections', 'settings'];
  for (const field of requiredFields) {
    if (field in workflow) {
      cleaned[field] = workflow[field];
    }
  }

  // Optional user-settable fields
  const optionalFields = ['staticData', 'pinData', 'meta', 'shared'];
  for (const field of optionalFields) {
    if (field in workflow) {
      cleaned[field] = workflow[field];
    }
  }

  // Explicitly exclude read-only fields
  const readOnlyFound: string[] = [];
  for (const field of READ_ONLY_FIELDS) {
    if (field in workflow && workflow[field] !== undefined && workflow[field] !== null) {
      readOnlyFound.push(field);
    }
  }

  if (readOnlyFound.length > 0) {
    logger.info(`[stripReadOnlyFields] Removed system-managed fields: ${readOnlyFound.join(', ')}`);
  }

  return cleaned as Partial<Workflow>;
}

/**
 * Checks if a workflow contains read-only fields
 * Useful for validation before API calls
 *
 * @param workflow - The workflow to check
 * @returns Array of read-only field names found (empty if clean)
 */
export function findReadOnlyFields(workflow: any): string[] {
  const found: string[] = [];

  for (const field of READ_ONLY_FIELDS) {
    if (field in workflow && workflow[field] !== undefined && workflow[field] !== null) {
      found.push(field);
    }
  }

  return found;
}

/**
 * Validates that a workflow is clean (no read-only fields)
 * Returns validation result
 *
 * @param workflow - The workflow to validate
 * @returns { valid: boolean, fields: string[] }
 */
export function validateFieldCompliance(workflow: any): {
  valid: boolean;
  readOnlyFieldsFound: string[];
  message?: string;
} {
  const readOnlyFieldsFound = findReadOnlyFields(workflow);

  return {
    valid: readOnlyFieldsFound.length === 0,
    readOnlyFieldsFound,
    message: readOnlyFieldsFound.length > 0
      ? `Workflow contains ${readOnlyFieldsFound.length} read-only field(s): ${readOnlyFieldsFound.join(', ')}`
      : 'Workflow is API compliant (no read-only fields)',
  };
}

/**
 * Cleans a workflow ensuring API compliance
 * Used when workflows are fetched (may have system fields) and need to be sent back
 *
 * @param workflow - The workflow to clean
 * @param options - Optional configuration
 * @returns Cleaned workflow safe for API
 */
export function cleanWorkflowForAPIOperation(
  workflow: any,
  options: {
    includeOptionalFields?: boolean;
  } = {}
): Partial<Workflow> {
  const { includeOptionalFields = true } = options;

  // Strip read-only fields
  const cleaned = stripReadOnlyFields(workflow);

  // Optionally handle optional system fields
  if (!includeOptionalFields) {
    // Remove optional fields if caller doesn't want them
    delete (cleaned as any).description;
  }

  return cleaned;
}

/**
 * Generates a detailed error message for API compliance violations
 *
 * @param workflow - The non-compliant workflow
 * @returns Human-readable error message
 */
export function generateComplianceErrorMessage(workflow: any): string {
  const violations = findReadOnlyFields(workflow);

  if (violations.length === 0) {
    return 'Workflow is API compliant';
  }

  const detail = violations
    .map(field => {
      const value = workflow[field];
      return `  - ${field}: ${typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : value}`;
    })
    .join('\n');

  return (
    `❌ Workflow contains ${violations.length} read-only field(s) that cannot be sent to n8n API:\n` +
    detail +
    `\n\nThese are system-managed fields. Use handleCleanWorkflow() to remove them.`
  );
}
```

---

## Fix 2: Add Validation Rule to WorkflowValidator

**File**: `src/services/workflow-validator.ts`
**Time**: 30 minutes
**Purpose**: Validate that workflows don't have read-only fields

Find the WorkflowValidator class and add this validation rule:

```typescript
import { validateFieldCompliance, findReadOnlyFields } from './workflow-field-cleaner';

// In WorkflowValidator class, add this method:

/**
 * Validates that workflow doesn't contain read-only fields
 * These fields should never be sent to the n8n API
 */
private validateFieldCompliance(workflow: Workflow): ValidationError[] {
  const errors: ValidationError[] = [];

  const readOnlyFieldsFound = findReadOnlyFields(workflow);
  if (readOnlyFieldsFound.length > 0) {
    errors.push({
      type: 'FIELD_COMPLIANCE',
      level: 'error',
      message: `Workflow contains system-managed fields: ${readOnlyFieldsFound.join(', ')}`,
      details: {
        readOnlyFields: readOnlyFieldsFound,
        description: 'These are read-only fields managed by n8n and cannot be sent in API requests',
      },
      suggestion: 'Use handleCleanWorkflow() to remove system-managed fields before updating',
      node: undefined,
      data: undefined,
    });
  }

  return errors;
}

// In the main validateWorkflow method, add this call:

async validateWorkflow(
  workflow: Workflow,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // ... existing validation code ...

  // NEW: Add field compliance validation
  const fieldErrors = this.validateFieldCompliance(workflow);
  errors.push(...fieldErrors);

  // ... rest of method ...
}
```

---

## Fix 3: Fix handleCreateWorkflow

**File**: `src/mcp/handlers-n8n-manager.ts`
**Location**: Lines 134-215, in handleCreateWorkflow function
**Time**: 15 minutes
**Purpose**: Strip read-only fields before creating workflow in n8n

Replace the workflow creation call:

```typescript
// BEFORE (Line 189-194):
const result = await client.createWorkflow(input);

// AFTER:
import { stripReadOnlyFields } from '../services/workflow-field-cleaner';

// ... in handleCreateWorkflow function:

// CRITICAL: Strip read-only fields before sending to n8n API
const cleanedInput = stripReadOnlyFields(input);

logger.info(`[handleCreateWorkflow] Creating workflow: ${input.name}`);
const result = await client.createWorkflow(cleanedInput);
```

**Full Updated Section** (lines 185-200):

```typescript
  logger.info(`[handleCreateWorkflow] Creating workflow: ${input.name}`);

  // CRITICAL: Strip read-only fields before sending to API
  // These fields (id, active, createdAt, etc.) are managed by n8n
  // and should never be sent in POST requests
  const cleanedInput = stripReadOnlyFields(input);

  // Create in n8n
  const result = await client.createWorkflow(cleanedInput);

  logger.info(`[handleCreateWorkflow] Workflow created: ${result.id}`);

  return {
    success: true,
    data: result,
    message: `✅ Workflow "${result.name}" created successfully`,
  };
```

---

## Fix 4: Fix handleUpdateWorkflow

**File**: `src/mcp/handlers-n8n-manager.ts`
**Location**: Lines 412-474, in handleUpdateWorkflow function
**Time**: 30 minutes
**Purpose**: Clean fetched workflow before merging and sending back to API

This is the most critical fix because it prevents perpetuation of corruption.

Find the section where the workflow is merged (around lines 437-463):

```typescript
// BEFORE (PROBLEMATIC):
const current = await client.getWorkflow(id);

let fullWorkflow = updateData as Partial<Workflow>;
let workflowToValidate = updateData;

if (!updateData.nodes || !updateData.connections) {
  // Fetch current workflow if only partial update
  fullWorkflow = {
    ...current,        // ❌ PROBLEM: current may have system-managed fields
    ...updateData,
  };
  workflowToValidate = fullWorkflow;
}

// Validate
// ... validation code ...

// Update
const result = await client.updateWorkflow(id, fullWorkflow);  // ❌ System fields sent back


// AFTER (FIXED):
import { stripReadOnlyFields } from '../services/workflow-field-cleaner';

// Fetch current workflow
const current = await client.getWorkflow(id);

// CRITICAL: Strip system-managed fields from current workflow
// This prevents perpetuation of corruption if workflow is corrupted
const cleanedCurrent = stripReadOnlyFields(current);

let fullWorkflow = updateData as Partial<Workflow>;
let workflowToValidate = updateData;

if (!updateData.nodes || !updateData.connections) {
  // Fetch current workflow if only partial update
  fullWorkflow = {
    ...cleanedCurrent,  // ✅ FIXED: Use cleaned version
    ...updateData,
  };
  workflowToValidate = fullWorkflow;
}

// Validate
// ... validation code ...

// CRITICAL: Clean again before sending to API
const cleanedWorkflow = stripReadOnlyFields(fullWorkflow);

// Update
const result = await client.updateWorkflow(id, cleanedWorkflow);  // ✅ Clean fields sent
```

---

## Fix 5: Add Deployment Gate to handleActivateWorkflow

**File**: `src/mcp/handlers-n8n-manager.ts`
**Location**: Lines 561-604, in handleActivateWorkflow function
**Time**: 1 hour
**Purpose**: Validate workflow before activation to prevent broken workflows going live

Replace the function with this enhanced version:

```typescript
export async function handleActivateWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();

    const { id, active } = z
      .object({
        id: z.string(),
        active: z.boolean(),
      })
      .parse(args);

    // CRITICAL: Pre-deployment validation before activation
    if (active === true) {
      logger.info(`[handleActivateWorkflow] Running pre-deployment validation for ${id}`);

      // Fetch the workflow to validate
      const workflow = await client.getWorkflow(id);

      // Step 1: Check field compliance
      const fieldCompliance = validateFieldCompliance(workflow);
      if (!fieldCompliance.valid) {
        return {
          success: false,
          error: '🚨 DEPLOYMENT BLOCKED: Workflow contains system-managed fields',
          details: {
            message: 'The workflow has system fields that prevent activation',
            readOnlyFields: fieldCompliance.readOnlyFieldsFound,
            suggestion: 'Use n8n_clean_workflow to remove system-managed fields, then retry activation',
          },
        };
      }

      // Step 2: Run strict validation
      const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
      const validationResult = await validator.validateWorkflow(workflow, {
        validateNodes: true,
        validateConnections: true,
        validateExpressions: true,
        profile: 'strict',
      });

      if (!validationResult.valid) {
        return {
          success: false,
          error: '🚨 DEPLOYMENT BLOCKED: Workflow validation failed',
          details: {
            message: 'The Agentic GraphRAG system detected structural errors',
            reason: 'Workflow has issues that would cause failures in production',
            errors: validationResult.errors,
            suggestions: validationResult.suggestions,
            validationStats: validationResult.statistics,
          },
        };
      }

      // Step 3: Check deployment readiness (triggers, connections, etc.)
      const deploymentChecks = performDeploymentReadinessChecks(workflow);
      if (!deploymentChecks.ready) {
        return {
          success: false,
          error: '⚠️ DEPLOYMENT WARNING: Workflow has potential issues',
          details: deploymentChecks.issues,
        };
      }

      logger.info(`[handleActivateWorkflow] Pre-deployment validation passed for ${id}`);
    }

    // Only activate if validation passed
    const result = await client.activateWorkflow(id, active);

    const status = active ? 'activated' : 'deactivated';
    return {
      success: true,
      data: result,
      message: `✅ Workflow successfully ${status}`,
    };
  } catch (error) {
    logger.error('[handleActivateWorkflow] Error:', error);
    return {
      success: false,
      error: `Failed to ${(args as any).active ? 'activate' : 'deactivate'} workflow`,
      details: { error: String(error) },
    };
  }
}

// Helper function for deployment checks
function performDeploymentReadinessChecks(workflow: Workflow): {
  ready: boolean;
  issues?: Record<string, any>;
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check 1: Has trigger nodes?
  const hasTrigger = workflow.nodes.some(n => {
    const normalized = n.type.replace('n8n-nodes-base.', 'nodes-base.');
    return (
      normalized.toLowerCase().includes('trigger') ||
      normalized.toLowerCase().includes('webhook')
    );
  });

  if (!hasTrigger) {
    issues.push('❌ Workflow has no trigger nodes - cannot be executed automatically');
  }

  // Check 2: Has action nodes?
  const hasAction = workflow.nodes.filter(n => !n.disabled).length > 1;
  if (!hasAction) {
    warnings.push('⚠️ Workflow only has trigger, no action nodes');
  }

  // Check 3: Check for orphaned nodes
  const connectedNames = new Set<string>();
  Object.values(workflow.connections).forEach(conn => {
    if ((conn as any).main) {
      (conn as any).main.flat().forEach((c: any) => {
        if (c && c.node) connectedNames.add(c.node);
      });
    }
  });

  const orphaned = workflow.nodes.filter(n =>
    !connectedNames.has(n.name) && !n.disabled &&
    !n.type.includes('trigger')
  );

  if (orphaned.length > 0) {
    issues.push(`❌ Found ${orphaned.length} orphaned nodes not connected to workflow`);
  }

  // Check 4: Check for disabled nodes
  const disabledCount = workflow.nodes.filter(n => n.disabled).length;
  if (disabledCount > 0) {
    warnings.push(`⚠️ Workflow has ${disabledCount} disabled nodes - they won't execute`);
  }

  return {
    ready: issues.length === 0,
    issues: {
      blockers: issues,
      warnings: warnings,
      totalChecks: 4,
      passedChecks: 4 - issues.length,
    },
  };
}
```

---

## Fix 6: Register handleCleanWorkflow as MCP Tool

**File**: `src/mcp/server-modern.ts` (or equivalent tool registration)
**Time**: 15 minutes
**Purpose**: Make the cleanup tool available to users

Find where other n8n workflow tools are registered (look for `n8n_activate_workflow`, `n8n_update_workflow`, etc.) and add:

```typescript
// Workflow Recovery Tool
this.server.tool(
  "n8n_clean_workflow",
  "Clean a broken workflow by removing system-managed fields that prevent updates or activation",
  {
    id: z.string().describe("Workflow ID to clean"),
  },
  async (args) => {
    this.ensureN8nConfigured();
    const nodeRepository = await this.getNodeRepository();
    return this.formatResponse(
      await n8nHandlers.handleCleanWorkflow(args, nodeRepository)
    );
  }
);
```

---

## Fix 7: Wire ValidatorAgent into Handlers (Optional but Recommended)

**File**: `src/mcp/handlers-n8n-manager.ts`
**Time**: 2 hours (can be done after Priority 1)
**Purpose**: Add intelligent Agentic GraphRAG validation

This adds the smart validation layer. Implementation details provided in TIER1_INTEGRATION_IMPLEMENTATION.md (Item 4).

---

## Testing Each Fix

### Test Fix 1 & 2: Field Cleaner and Validation
```bash
# Create test script to verify field stripping
npm run build

# Test:
# const cleaned = stripReadOnlyFields({ id: '123', name: 'Test', ...other fields });
# Should not have 'id' field
```

### Test Fix 3: handleCreateWorkflow
```bash
# Try to create workflow with system-managed fields
npm run build

# Test call to n8n_create_workflow with:
# { name: "Test", nodes: [...], connections: {...}, settings: {...}, id: "fake-id" }

# Expected:
# - id field stripped before API call
# - Workflow created successfully
# - No system fields in created workflow
```

### Test Fix 4: handleUpdateWorkflow
```bash
# Try to update existing workflow
# Workflow might have system fields from n8n

# Test call to n8n_update_workflow

# Expected:
# - System fields from current workflow cleaned before merge
# - Update succeeds
# - No system field corruption perpetuated
```

### Test Fix 5: Deployment Gate
```bash
# Try to activate broken workflow
npm run build

# Test call to n8n_activate_workflow with broken workflow ID

# Expected:
# - Pre-deployment validation runs
# - If broken → "DEPLOYMENT BLOCKED" error
# - Error message shows specific issues
# - Activation prevented
```

### Test Fix 6: Tool Registration
```bash
# Check if tool is registered
npm run build

# Verify n8n_clean_workflow appears in tool list
# Call it with a workflow ID
# Should clean and return results
```

---

## Deployment Checklist

Before considering the MCP server production-ready:

- [ ] All fixes implemented
- [ ] `npm run build` succeeds with no errors
- [ ] All 6 fixes tested individually
- [ ] Test with your broken 21-node workflow:
  - [ ] Call n8n_clean_workflow → returns cleaned workflow
  - [ ] Try to create new workflow with system fields → rejected
  - [ ] Update workflow → system fields removed
  - [ ] Try to activate broken workflow → blocked
- [ ] No regressions in other handlers
- [ ] Error messages are clear and actionable

---

## Summary

These 6 fixes address the root cause of workflow corruption:

1. **Fix 1-2**: Provide field sanitization capabilities
2. **Fix 3-4**: Apply sanitization at creation and update points
3. **Fix 5**: Prevent broken workflows from going live
4. **Fix 6**: Give users recovery capability
5. **Fix 7**: Add intelligent validation (bonus)

**Total Time**: 3-4 hours
**Impact**: Eliminates workflow corruption from system-managed fields
**Result**: Production-ready MCP server

---

**Status**: Ready for implementation
**Next**: Begin with Fix 1, then progress through all 6 fixes in order
