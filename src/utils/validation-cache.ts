/**
 * Validation Cache - Tracks validated workflows to enforce validation-first workflow
 */

interface ValidationCacheEntry {
  workflowHash: string;
  validatedAt: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class ValidationCache {
  private cache = new Map<string, ValidationCacheEntry>();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Generate a hash for a workflow to track validation state
   */
  private generateWorkflowHash(workflow: any): string {
    const key = JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes?.map((n: any) => ({ id: n.id, name: n.name, type: n.type })),
      connections: workflow.connections
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Record a validation result
   */
  recordValidation(workflow: any, result: { valid: boolean; errors: any[]; warnings: any[] }): string {
    const hash = this.generateWorkflowHash(workflow);
    
    this.cache.set(hash, {
      workflowHash: hash,
      validatedAt: Date.now(),
      valid: result.valid,
      errors: result.errors.map(e => e.message || e.toString()),
      warnings: result.warnings.map(w => w.message || w.toString())
    });

    return hash;
  }

  /**
   * Check if a workflow has been validated recently and is valid
   */
  isValidatedAndValid(workflow: any): { validated: boolean; valid: boolean; errors: string[]; age: number } {
    const hash = this.generateWorkflowHash(workflow);
    const entry = this.cache.get(hash);
    
    if (!entry) {
      return { validated: false, valid: false, errors: [], age: -1 };
    }

    const age = Date.now() - entry.validatedAt;
    
    // Check if validation is expired
    if (age > this.TTL_MS) {
      this.cache.delete(hash);
      return { validated: false, valid: false, errors: [], age };
    }

    return {
      validated: true,
      valid: entry.valid,
      errors: entry.errors,
      age
    };
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [hash, entry] of this.cache.entries()) {
      if (now - entry.validatedAt > this.TTL_MS) {
        this.cache.delete(hash);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalEntries: number; validEntries: number; invalidEntries: number } {
    this.cleanup();
    let validEntries = 0;
    let invalidEntries = 0;
    
    for (const entry of this.cache.values()) {
      if (entry.valid) {
        validEntries++;
      } else {
        invalidEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      invalidEntries
    };
  }
}

// Global validation cache instance
export const validationCache = new ValidationCache();