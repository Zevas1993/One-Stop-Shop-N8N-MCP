/**
 * Workflow Field Cleaner Service
 * Removes system-managed fields that are read-only in the n8n API
 * Based on official n8n API schema v1.1.1
 */

import { Workflow } from '../types/n8n-api';
import { logger } from '../utils/logger';

/**
 * ALLOWLIST of fields the n8n API accepts for POST/PUT requests.
 * Aligned with the canonical cleanWorkflowForCreate/Update in n8n-validation.ts.
 * Any field NOT in this list is stripped.
 */
const ALLOWED_WORKFLOW_FIELDS = [
  'name', 'nodes', 'connections', 'settings',  // Required
  'staticData', 'pinData', 'meta',             // Optional user-settable
] as const;

/**
 * Strips all non-allowed fields from a workflow object.
 * Uses an allowlist approach (same as n8n-validation.ts) so new read-only
 * fields added by future n8n versions are automatically excluded.
 *
 * @param workflow - The workflow to clean
 * @returns Cleaned workflow with only API-acceptable fields
 */
export function stripReadOnlyFields(workflow: any): Partial<Workflow> {
  const cleaned: Record<string, any> = {};
  const strippedFields: string[] = [];

  for (const field of ALLOWED_WORKFLOW_FIELDS) {
    if (field in workflow) {
      cleaned[field] = workflow[field];
    }
  }

  // Log which fields were stripped
  for (const key of Object.keys(workflow)) {
    if (!(ALLOWED_WORKFLOW_FIELDS as readonly string[]).includes(key)) {
      strippedFields.push(key);
    }
  }

  if (strippedFields.length > 0) {
    logger.info(`[stripReadOnlyFields] Stripped non-allowed fields: ${strippedFields.join(', ')}`);
  }

  return cleaned as Partial<Workflow>;
}

/**
 * Checks if a workflow contains non-allowed (read-only / system-managed) fields.
 * Any key NOT in ALLOWED_WORKFLOW_FIELDS is considered read-only.
 *
 * @param workflow - The workflow to check
 * @returns Array of non-allowed field names found (empty if clean)
 */
export function findReadOnlyFields(workflow: any): string[] {
  const found: string[] = [];

  for (const key of Object.keys(workflow)) {
    if (!(ALLOWED_WORKFLOW_FIELDS as readonly string[]).includes(key)) {
      found.push(key);
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
