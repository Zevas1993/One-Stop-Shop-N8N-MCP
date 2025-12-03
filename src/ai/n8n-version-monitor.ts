/**
 * n8n Version Monitor Service
 *
 * Monitors the connected n8n instance for version changes and triggers
 * appropriate updates to the MCP server and GraphRAG knowledge base.
 */
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "./graphrag-bridge";
import { logger } from "../utils/logger";

export interface VersionInfo {
  version: string;
  buildId?: string;
  timestamp?: string;
  features?: string[];
}

export interface VersionChange {
  oldVersion: string | null;
  newVersion: string;
  hasChanged: boolean;
  isMajorChange: boolean;
  isBreakingChange: boolean;
}

export class N8NVersionMonitor {
  private currentVersion: string | null = null;
  private lastCheck: Date | null = null;
  private checkInterval: number;
  private isMonitoring: boolean = false;
  private monitorTimeout: NodeJS.Timeout | null = null;

  constructor(
    private n8nClient: N8nApiClient,
    private graphRAGBridge: GraphRAGBridge,
    private logger: any,
    checkInterval: number = 300000 // 5 minutes default
  ) {
    this.checkInterval = checkInterval;
  }

  /**
   * Start continuous version monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.info("Version monitoring already running");
      return;
    }

    this.isMonitoring = true;
    this.logger.info(
      `Starting n8n version monitoring (interval: ${this.checkInterval}ms)`
    );

    // Initial check
    this.checkVersion().catch((error) => {
      this.logger.error("Initial version check failed:", error);
    });

    // Set up periodic checking
    this.monitorTimeout = setInterval(() => {
      this.checkVersion().catch((error) => {
        this.logger.error("Periodic version check failed:", error);
      });
    }, this.checkInterval);
  }

  /**
   * Stop version monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitorTimeout) {
      clearInterval(this.monitorTimeout);
      this.monitorTimeout = null;
    }
    this.logger.info("n8n version monitoring stopped");
  }

  /**
   * Check current n8n version and detect changes
   */
  public async checkVersion(): Promise<VersionChange> {
    try {
      this.logger.debug("Checking n8n version...");

      // Get current version from n8n API
      const currentVersionInfo = await this.fetchCurrentVersion();

      // Compare with cached version
      const versionChange = this.compareVersions(currentVersionInfo.version);

      if (versionChange.hasChanged) {
        this.logger.info(
          `n8n version changed: ${this.currentVersion || "unknown"} → ${
            versionChange.newVersion
          }`
        );

        // Update cached version
        this.currentVersion = versionChange.newVersion;
        this.lastCheck = new Date();

        // Trigger knowledge graph rebuild if breaking change
        if (versionChange.isBreakingChange) {
          this.logger.warn(
            "Breaking version change detected - triggering full knowledge graph rebuild"
          );
          await this.graphRAGBridge.invalidateCache();
        } else if (versionChange.isMajorChange) {
          this.logger.info(
            "Major version change detected - triggering incremental update"
          );
          await this.graphRAGBridge.invalidateCache();
        }
      } else {
        this.logger.debug(`n8n version unchanged: ${versionChange.newVersion}`);
      }

      return versionChange;
    } catch (error) {
      this.logger.error("Version check failed:", error);
      throw new Error(
        `Version monitoring failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Fetch current version from n8n API
   */
  private async fetchCurrentVersion(): Promise<VersionInfo> {
    try {
      // Use the available healthCheck method to get version info
      const healthResponse = await this.n8nClient.healthCheck();

      // Extract version from health response
      if (healthResponse && healthResponse.n8nVersion) {
        return {
          version: healthResponse.n8nVersion,
          buildId: healthResponse.instanceId || undefined,
          timestamp: new Date().toISOString(),
          features: healthResponse.features
            ? Object.keys(healthResponse.features)
            : undefined,
        };
      }

      // Fallback: try to get version from workflow list (older n8n versions)
      try {
        const workflowsResponse = await this.n8nClient.listWorkflows({
          limit: 1,
        });
        // Some n8n versions include version info in workflow responses
        if (
          workflowsResponse &&
          workflowsResponse.data &&
          workflowsResponse.data.length > 0
        ) {
          // Check if any workflow has version info
          const firstWorkflow = workflowsResponse.data[0];
          if (firstWorkflow && firstWorkflow.versionId) {
            return {
              version: firstWorkflow.versionId,
              timestamp: new Date().toISOString(),
            };
          }
        }
      } catch (fallbackError) {
        this.logger.debug("Workflow version fallback failed:", fallbackError);
      }

      throw new Error("All version detection endpoints failed");
    } catch (error) {
      this.logger.error("Failed to fetch n8n version:", error);
      throw new Error(
        `Version detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Compare versions and determine change type
   */
  private compareVersions(newVersion: string): VersionChange {
    const oldVersion = this.currentVersion;

    // Simple version comparison (could be enhanced with semver)
    const hasChanged = oldVersion !== newVersion;
    const isMajorChange =
      hasChanged && this.isMajorVersionChange(oldVersion, newVersion);
    const isBreakingChange =
      hasChanged && this.isBreakingChange(oldVersion, newVersion);

    return {
      oldVersion,
      newVersion,
      hasChanged,
      isMajorChange,
      isBreakingChange,
    };
  }

  /**
   * Check if version change is major (X.0.0 changes)
   */
  private isMajorVersionChange(
    oldVersion: string | null,
    newVersion: string
  ): boolean {
    if (!oldVersion) return true; // First version detection is considered major

    try {
      const oldParts = oldVersion.split(".").map((part) => parseInt(part) || 0);
      const newParts = newVersion.split(".").map((part) => parseInt(part) || 0);

      // Major version change (first number)
      return oldParts[0] !== newParts[0];
    } catch (error) {
      this.logger.warn("Version comparison failed, assuming major change");
      return true;
    }
  }

  /**
   * Check if version change is breaking (based on known breaking versions)
   */
  private isBreakingChange(
    oldVersion: string | null,
    newVersion: string
  ): boolean {
    // Known breaking version changes in n8n
    const breakingChanges = [
      { from: "0.200.0", to: "1.0.0" }, // Major architecture change
      { from: "1.12.0", to: "1.13.0" }, // Node structure changes
      { from: "1.22.0", to: "1.23.0" }, // API changes
    ];

    if (!oldVersion) return false;

    // Check if this change is in our breaking changes list
    const change = breakingChanges.find(
      (c) =>
        (c.from === oldVersion && c.to === newVersion) ||
        this.isVersionBetween(oldVersion, c.from, c.to)
    );

    return !!change;
  }

  /**
   * Check if version is between two versions
   */
  private isVersionBetween(version: string, from: string, to: string): boolean {
    try {
      const compare = (a: string, b: string) => {
        const aParts = a.split(".").map((p) => parseInt(p) || 0);
        const bParts = b.split(".").map((p) => parseInt(p) || 0);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal > bVal) return 1;
          if (aVal < bVal) return -1;
        }
        return 0;
      };

      return compare(version, from) >= 0 && compare(version, to) <= 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current monitored version
   */
  public getCurrentVersion(): string | null {
    return this.currentVersion;
  }

  /**
   * Get last check timestamp
   */
  public getLastCheck(): Date | null {
    return this.lastCheck;
  }

  /**
   * Force immediate version check
   */
  public async forceCheck(): Promise<VersionChange> {
    return this.checkVersion();
  }
}
