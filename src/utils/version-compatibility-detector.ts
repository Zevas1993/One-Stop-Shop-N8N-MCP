/**
 * Issue #11: Version Compatibility Detection
 *
 * Auto-detects and warns on version mismatches between:
 * - MCP server version vs n8n instance version
 * - Node versions in workflows vs n8n node types database
 * - Workflow node typeVersion vs latest available
 *
 * Provides clear guidance when versions don't match to prevent
 * unexpected behavior and workflow incompatibilities.
 */

import { logger } from './logger';

/**
 * Version information with compatibility status
 */
export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  isPrerelease: boolean;
  prereleaseTag?: string;
}

/**
 * Compatibility check result
 */
export interface CompatibilityWarning {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  context: {
    [key: string]: any;
  };
  suggestedAction?: string;
}

/**
 * Version compatibility configuration
 */
export interface VersionCompatibilityConfig {
  minN8nVersion: string;           // Minimum supported n8n version
  maxN8nVersion?: string;          // Maximum tested n8n version
  targetN8nVersion: string;        // Recommended n8n version
  supportedNodeVersions: {
    [nodeType: string]: {
      minVersion: number;
      maxVersion: number;
      recommended: number;
    };
  };
}

/**
 * Default version compatibility configuration
 * Based on testing with n8n v1.97.1
 */
export const DEFAULT_COMPATIBILITY_CONFIG: VersionCompatibilityConfig = {
  minN8nVersion: '1.0.0',
  targetN8nVersion: '1.97.1',
  supportedNodeVersions: {
    'n8n-nodes-base.httpRequest': {
      minVersion: 1,
      maxVersion: 5,
      recommended: 5,
    },
    'n8n-nodes-base.code': {
      minVersion: 1,
      maxVersion: 3,
      recommended: 3,
    },
    'n8n-nodes-base.webhook': {
      minVersion: 1,
      maxVersion: 2,
      recommended: 2,
    },
    'n8n-nodes-base.start': {
      minVersion: 1,
      maxVersion: 1,
      recommended: 1,
    },
    'n8n-nodes-base.jsonParse': {
      minVersion: 1,
      maxVersion: 2,
      recommended: 2,
    },
  },
};

/**
 * Parse version string into components
 * Examples: "1.97.1", "1.97.1-rc.1", "1.0.0-beta"
 */
export function parseVersion(versionString: string): VersionInfo {
  const trimmed = versionString.trim().replace(/^v/, '');

  // Split on first dash to separate base version from prerelease
  const [baseVersion, prerelease] = trimmed.split('-');

  // Parse base version
  const [majorStr = '0', minorStr = '0', patchStr = '0'] = baseVersion.split('.');
  const major = parseInt(majorStr, 10) || 0;
  const minor = parseInt(minorStr, 10) || 0;
  const patch = parseInt(patchStr, 10) || 0;

  return {
    version: versionString,
    major,
    minor,
    patch,
    isPrerelease: !!prerelease,
    prereleaseTag: prerelease,
  };
}

/**
 * Compare two versions
 * Returns: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
 */
export function compareVersions(v1: VersionInfo, v2: VersionInfo): number {
  if (v1.major !== v2.major) {
    return v1.major < v2.major ? -1 : 1;
  }

  if (v1.minor !== v2.minor) {
    return v1.minor < v2.minor ? -1 : 1;
  }

  if (v1.patch !== v2.patch) {
    return v1.patch < v2.patch ? -1 : 1;
  }

  // If both are prerelease, compare tags
  if (v1.isPrerelease && v2.isPrerelease) {
    return (v1.prereleaseTag || '').localeCompare(v2.prereleaseTag || '');
  }

  // Release version is greater than prerelease
  if (v1.isPrerelease) return -1;
  if (v2.isPrerelease) return 1;

  return 0;
}

/**
 * Check if version is within acceptable range
 */
export function isVersionInRange(
  version: VersionInfo,
  minVersion: VersionInfo,
  maxVersion?: VersionInfo
): boolean {
  if (compareVersions(version, minVersion) < 0) {
    return false;
  }

  if (maxVersion && compareVersions(version, maxVersion) > 0) {
    return false;
  }

  return true;
}

/**
 * Version compatibility detector
 */
class VersionCompatibilityDetector {
  private config: VersionCompatibilityConfig;
  private detectedN8nVersion?: VersionInfo;
  private warnings: Map<string, CompatibilityWarning> = new Map();

  constructor(config: VersionCompatibilityConfig = DEFAULT_COMPATIBILITY_CONFIG) {
    this.config = config;
  }

  /**
   * Set detected n8n version
   */
  setN8nVersion(versionString: string): void {
    this.detectedN8nVersion = parseVersion(versionString);
    logger.info('n8n version detected', {
      version: versionString,
      parsed: this.detectedN8nVersion,
    });

    // Check compatibility
    this.checkN8nVersionCompatibility();
  }

  /**
   * Get detected n8n version
   */
  getN8nVersion(): VersionInfo | undefined {
    return this.detectedN8nVersion;
  }

  /**
   * Check n8n version compatibility
   */
  private checkN8nVersionCompatibility(): void {
    if (!this.detectedN8nVersion) {
      return;
    }

    const minVersion = parseVersion(this.config.minN8nVersion);
    const targetVersion = parseVersion(this.config.targetN8nVersion);
    const detectedVersion = this.detectedN8nVersion;

    // Check if version is below minimum
    if (compareVersions(detectedVersion, minVersion) < 0) {
      this.addWarning({
        severity: 'error',
        code: 'N8N_VERSION_TOO_OLD',
        message: `n8n version ${detectedVersion.version} is below minimum supported version ${minVersion.version}`,
        context: {
          detectedVersion: detectedVersion.version,
          minimumVersion: minVersion.version,
          difference: `${minVersion.major}.${minVersion.minor}.${minVersion.patch}`,
        },
        suggestedAction: `Upgrade n8n to at least version ${this.config.minN8nVersion}`,
      });
    }

    // Check if version is above tested maximum (if configured)
    if (
      this.config.maxN8nVersion &&
      compareVersions(detectedVersion, parseVersion(this.config.maxN8nVersion)) > 0
    ) {
      this.addWarning({
        severity: 'warning',
        code: 'N8N_VERSION_NOT_TESTED',
        message: `n8n version ${detectedVersion.version} is newer than tested version ${this.config.maxN8nVersion}`,
        context: {
          detectedVersion: detectedVersion.version,
          testedVersion: this.config.maxN8nVersion,
        },
        suggestedAction: 'Test workflows thoroughly; some features may behave differently',
      });
    }

    // Check if version is behind recommended
    if (compareVersions(detectedVersion, targetVersion) < 0) {
      this.addWarning({
        severity: 'info',
        code: 'N8N_VERSION_OUTDATED',
        message: `n8n version ${detectedVersion.version} is behind recommended version ${targetVersion.version}`,
        context: {
          detectedVersion: detectedVersion.version,
          recommendedVersion: targetVersion.version,
        },
        suggestedAction: `Consider upgrading to ${this.config.targetN8nVersion} for best compatibility`,
      });
    }
  }

  /**
   * Check if node type version is compatible
   */
  checkNodeVersion(nodeType: string, typeVersion: number): CompatibilityWarning[] {
    const warnings: CompatibilityWarning[] = [];
    const nodeConfig = this.config.supportedNodeVersions[nodeType];

    if (!nodeConfig) {
      // Node type not in our compatibility database
      logger.debug('Node type not in compatibility database', {
        nodeType,
      });
      return warnings;
    }

    // Check if typeVersion is below minimum
    if (typeVersion < nodeConfig.minVersion) {
      const warning: CompatibilityWarning = {
        severity: 'warning',
        code: 'NODE_VERSION_TOO_OLD',
        message: `Node ${nodeType} typeVersion ${typeVersion} is below minimum supported version ${nodeConfig.minVersion}`,
        context: {
          nodeType,
          typeVersion,
          minimumVersion: nodeConfig.minVersion,
        },
        suggestedAction: `Update node to use typeVersion ${nodeConfig.minVersion} or higher`,
      };
      warnings.push(warning);
    }

    // Check if typeVersion is above maximum
    if (typeVersion > nodeConfig.maxVersion) {
      const warning: CompatibilityWarning = {
        severity: 'warning',
        code: 'NODE_VERSION_NOT_SUPPORTED',
        message: `Node ${nodeType} typeVersion ${typeVersion} exceeds maximum supported version ${nodeConfig.maxVersion}`,
        context: {
          nodeType,
          typeVersion,
          maximumVersion: nodeConfig.maxVersion,
        },
        suggestedAction: `Downgrade node typeVersion to ${nodeConfig.maxVersion} or check n8n version`,
      };
      warnings.push(warning);
    }

    // Check if using older than recommended
    if (typeVersion < nodeConfig.recommended) {
      const warning: CompatibilityWarning = {
        severity: 'info',
        code: 'NODE_VERSION_OUTDATED',
        message: `Node ${nodeType} typeVersion ${typeVersion} is behind recommended version ${nodeConfig.recommended}`,
        context: {
          nodeType,
          typeVersion,
          recommendedVersion: nodeConfig.recommended,
        },
        suggestedAction: `Consider updating node typeVersion to ${nodeConfig.recommended}`,
      };
      warnings.push(warning);
    }

    return warnings;
  }

  /**
   * Check workflow compatibility
   */
  checkWorkflowCompatibility(workflow: {
    nodes: Array<{
      type: string;
      typeVersion?: number;
    }>;
  }): CompatibilityWarning[] {
    const allWarnings: CompatibilityWarning[] = [];

    for (const node of workflow.nodes || []) {
      const nodeWarnings = this.checkNodeVersion(node.type, node.typeVersion || 1);
      allWarnings.push(...nodeWarnings);
    }

    return allWarnings;
  }

  /**
   * Add warning to internal collection
   */
  private addWarning(warning: CompatibilityWarning): void {
    const key = `${warning.code}:${warning.context.nodeType || 'n8n'}`;
    if (!this.warnings.has(key)) {
      this.warnings.set(key, warning);
      logger.warn(`Compatibility warning: ${warning.code}`, warning);
    }
  }

  /**
   * Get all collected warnings
   */
  getWarnings(): CompatibilityWarning[] {
    return Array.from(this.warnings.values());
  }

  /**
   * Get warnings by severity
   */
  getWarningsBySeverity(severity: 'info' | 'warning' | 'error'): CompatibilityWarning[] {
    return this.getWarnings().filter((w) => w.severity === severity);
  }

  /**
   * Clear warnings
   */
  clearWarnings(): void {
    this.warnings.clear();
  }

  /**
   * Check if any errors exist
   */
  hasErrors(): boolean {
    return this.getWarningsBySeverity('error').length > 0;
  }

  /**
   * Get summary of compatibility status
   */
  getSummary(): {
    n8nVersion?: string;
    isCompatible: boolean;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    summary: string;
  } {
    const errors = this.getWarningsBySeverity('error');
    const warnings = this.getWarningsBySeverity('warning');
    const infos = this.getWarningsBySeverity('info');

    let summary = '';
    if (errors.length > 0) {
      summary = `${errors.length} critical compatibility issue(s) found`;
    } else if (warnings.length > 0) {
      summary = `${warnings.length} compatibility warning(s) found`;
    } else if (infos.length > 0) {
      summary = `${infos.length} compatibility notice(s)`;
    } else {
      summary = 'All versions compatible';
    }

    return {
      n8nVersion: this.detectedN8nVersion?.version,
      isCompatible: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: infos.length,
      summary,
    };
  }

  /**
   * Update compatibility configuration
   */
  updateConfig(config: Partial<VersionCompatibilityConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('Version compatibility config updated', { config: this.config });
  }
}

// Singleton instance
const globalVersionDetector = new VersionCompatibilityDetector();

/**
 * Export helper functions
 */
export { VersionCompatibilityDetector, globalVersionDetector };

/**
 * Set detected n8n version
 */
export function setN8nVersion(versionString: string): void {
  globalVersionDetector.setN8nVersion(versionString);
}

/**
 * Get detected n8n version
 */
export function getN8nVersion(): VersionInfo | undefined {
  return globalVersionDetector.getN8nVersion();
}

/**
 * Check node version compatibility
 */
export function checkNodeVersion(nodeType: string, typeVersion: number): CompatibilityWarning[] {
  return globalVersionDetector.checkNodeVersion(nodeType, typeVersion);
}

/**
 * Check workflow compatibility
 */
export function checkWorkflowCompatibility(workflow: {
  nodes: Array<{
    type: string;
    typeVersion?: number;
  }>;
}): CompatibilityWarning[] {
  return globalVersionDetector.checkWorkflowCompatibility(workflow);
}

/**
 * Get all compatibility warnings
 */
export function getCompatibilityWarnings(): CompatibilityWarning[] {
  return globalVersionDetector.getWarnings();
}

/**
 * Get warnings by severity
 */
export function getWarningsBySeverity(
  severity: 'info' | 'warning' | 'error'
): CompatibilityWarning[] {
  return globalVersionDetector.getWarningsBySeverity(severity);
}

/**
 * Check if any compatibility errors exist
 */
export function hasCompatibilityErrors(): boolean {
  return globalVersionDetector.hasErrors();
}

/**
 * Get compatibility summary
 */
export function getCompatibilitySummary(): {
  n8nVersion?: string;
  isCompatible: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  summary: string;
} {
  return globalVersionDetector.getSummary();
}

/**
 * Clear all warnings
 */
export function clearCompatibilityWarnings(): void {
  globalVersionDetector.clearWarnings();
}

/**
 * Update compatibility configuration
 */
export function updateCompatibilityConfig(
  config: Partial<VersionCompatibilityConfig>
): void {
  globalVersionDetector.updateConfig(config);
}
