/**
 * Workflow Field Cleaner Service
 * Removes system-managed fields that are read-only in the n8n API
 * Based on official n8n API schema v1.1.1
 */

import { Workflow } from '../types/n8n-api';
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
  const optionalFields = ['staticData', 'pinData', 'meta', 'shared', 'active'];
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
