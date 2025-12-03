/**
 * Auto-Update Service
 *
 * Main service that coordinates version monitoring, change detection,
 * and GraphRAG updates to keep the knowledge base synchronized with n8n.
 */
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "./graphrag-bridge";
import { N8NVersionMonitor } from "./n8n-version-monitor";
import { ChangeDetector } from "./change-detector";
import { logger } from "../utils/logger";

export interface AutoUpdateConfig {
  versionCheckInterval?: number; // ms
  changeDetectionInterval?: number; // ms
  enableVersionMonitoring?: boolean;
  enableChangeDetection?: boolean;
}

export interface UpdateStatus {
  isRunning: boolean;
  lastVersionCheck?: Date | null;
  lastChangeDetection?: Date | null;
  currentVersion?: string | null;
  knownNodesCount?: number;
  lastUpdate?: Date | null;
}

export class AutoUpdateService {
  private versionMonitor: N8NVersionMonitor;
  private changeDetector: ChangeDetector;
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private status: UpdateStatus = {
    isRunning: false,
  };

  constructor(
    private n8nClient: N8nApiClient,
    private graphRAGBridge: GraphRAGBridge,
    private config: AutoUpdateConfig = {}
  ) {
    // Initialize version monitor
    this.versionMonitor = new N8NVersionMonitor(
      n8nClient,
      graphRAGBridge,
      logger,
      config.versionCheckInterval || 300000 // 5 minutes default
    );

    // Initialize change detector
    this.changeDetector = new ChangeDetector(n8nClient, graphRAGBridge, logger);
  }

  /**
   * Start the auto-update service
   */
  public start(): void {
    if (this.isRunning) {
      logger.info("Auto-update service already running");
      return;
    }

    this.isRunning = true;
    this.status.isRunning = true;
    logger.info("Starting auto-update service...");

    // Start version monitoring if enabled
    if (this.config.enableVersionMonitoring !== false) {
      this.versionMonitor.startMonitoring();
      logger.info("Version monitoring started");
    }

    // Set up periodic update cycle
    const updateInterval = this.config.changeDetectionInterval || 60000; // 1 minute default
    this.updateInterval = setInterval(() => {
      this.runUpdateCycle().catch((error) => {
        logger.error("Auto-update cycle failed:", error);
      });
    }, updateInterval);

    logger.info(`Auto-update service started (interval: ${updateInterval}ms)`);
  }

  /**
   * Stop the auto-update service
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.status.isRunning = false;

    // Stop version monitoring
    this.versionMonitor.stopMonitoring();

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    logger.info("Auto-update service stopped");
  }

  /**
   * Run a complete update cycle
   */
  private async runUpdateCycle(): Promise<void> {
    try {
      logger.debug("Running auto-update cycle...");

      // Update status
      this.status.lastChangeDetection = new Date();

      // Detect changes in node catalog
      const changeResult = await this.changeDetector.detectChanges();

      if (changeResult.hasChanges) {
        logger.info(
          `Detected ${changeResult.summary.totalChanges} changes in n8n catalog`
        );

        // Apply changes to GraphRAG
        await this.applyChangesToGraphRAG(changeResult);

        // Update status
        this.status.lastUpdate = new Date();
        this.status.knownNodesCount = this.changeDetector.getKnownNodesCount();
      } else {
        logger.debug("No changes detected in n8n catalog");
      }

      // Update version status
      this.status.lastVersionCheck = this.versionMonitor.getLastCheck();
      this.status.currentVersion = this.versionMonitor.getCurrentVersion();
    } catch (error) {
      logger.error("Auto-update cycle error:", error);
      throw new Error(
        `Auto-update cycle failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Apply detected changes to GraphRAG
   */
  private async applyChangesToGraphRAG(changeResult: any): Promise<void> {
    try {
      logger.info("Applying changes to GraphRAG...");

      // Convert changes to GraphRAG update format
      const graphRAGUpdate = this.convertChangesToGraphRAGFormat(changeResult);

      // Apply update through GraphRAG bridge
      await this.graphRAGBridge.applyUpdate(graphRAGUpdate);

      logger.info(
        `Successfully applied ${changeResult.summary.totalChanges} changes to GraphRAG`
      );

      // Invalidate cache to ensure fresh data
      await this.graphRAGBridge.invalidateCache();

      logger.info(
        "GraphRAG cache invalidated - knowledge graph will rebuild on next query"
      );
    } catch (error) {
      logger.error("Failed to apply changes to GraphRAG:", error);
      throw new Error(
        `GraphRAG update failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Convert change detection results to GraphRAG update format
   */
  private convertChangesToGraphRAGFormat(changeResult: any): {
    added: any[];
    modified: any[];
    removed: any[];
  } {
    const added: any[] = [];
    const modified: any[] = [];
    const removed: any[] = [];

    for (const change of changeResult.changes) {
      const nodeData = {
        id: change.nodeId,
        type: change.nodeType,
        version: change.newVersion || change.oldVersion,
        timestamp: change.timestamp,
      };

      switch (change.changeType) {
        case "added":
          added.push(nodeData);
          break;
        case "modified":
          modified.push({
            ...nodeData,
            oldVersion: change.oldVersion,
            newVersion: change.newVersion,
          });
          break;
        case "removed":
          removed.push(nodeData);
          break;
      }
    }

    return { added, modified, removed };
  }

  /**
   * Force immediate update cycle
   */
  public async forceUpdate(): Promise<void> {
    logger.info("Forcing immediate update cycle...");
    await this.runUpdateCycle();
  }

  /**
   * Get current update status
   */
  public getStatus(): UpdateStatus {
    return {
      ...this.status,
      lastVersionCheck: this.versionMonitor.getLastCheck(),
      lastChangeDetection: this.changeDetector.getLastDetectionTime(),
      currentVersion: this.versionMonitor.getCurrentVersion(),
      knownNodesCount: this.changeDetector.getKnownNodesCount(),
    };
  }

  /**
   * Reset known state (useful after major version changes)
   */
  public resetKnownState(): void {
    logger.info("Resetting known state...");
    this.changeDetector.resetKnownNodes();
    this.status.knownNodesCount = 0;
    logger.info(
      "Known state reset - next detection will be full catalog update"
    );
  }

  /**
   * Handle version change events
   */
  public async handleVersionChange(versionChange: any): Promise<void> {
    if (versionChange.isBreakingChange) {
      logger.warn("Handling breaking version change - resetting known state");
      this.resetKnownState();
      await this.forceUpdate();
    } else if (versionChange.isMajorChange) {
      logger.info("Handling major version change - forcing update");
      await this.forceUpdate();
    }
  }
}
