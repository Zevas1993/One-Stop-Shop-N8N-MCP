import { Logger } from "../utils/logger";

const logger = new Logger({ prefix: "[CredentialValidator]" });

export interface CredentialJson {
  id?: string;
  name: string;
  type: string;
  data: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CredentialValidationResult {
  valid: boolean;
  errors: string[];
}

export class CredentialValidator {
  /**
   * Validate a credential object against the n8n schema
   */
  validateCredential(credential: any): CredentialValidationResult {
    const result: CredentialValidationResult = {
      valid: true,
      errors: [],
    };

    // Check if it's an object
    if (!credential || typeof credential !== "object") {
      result.errors.push("Credential must be an object");
      result.valid = false;
      return result;
    }

    // Required fields
    const requiredFields = ["name", "type", "data"];
    for (const field of requiredFields) {
      if (!(field in credential)) {
        result.errors.push(`Missing required field: '${field}'`);
      }
    }

    // Validate 'data' is an object
    if (credential.data && typeof credential.data !== "object") {
      result.errors.push(
        "Field 'data' must be an object containing sensitive values"
      );
    }

    // Validate 'type' is a string
    if (credential.type && typeof credential.type !== "string") {
      result.errors.push(
        "Field 'type' must be a string (e.g., 'n8n-nodes-base.postgres')"
      );
    }

    // Validate 'name' is a string
    if (credential.name && typeof credential.name !== "string") {
      result.errors.push("Field 'name' must be a string");
    }

    // Check for forbidden fields (if any, though usually API ignores extra fields, but for strictness)
    // For now, we'll stick to required fields as per schema extraction.

    result.valid = result.errors.length === 0;
    return result;
  }
}
