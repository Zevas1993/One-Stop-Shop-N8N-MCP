/**
 * Auto-Update Main Loop
 *
 * Main entry point for the auto-update system that integrates
 * version monitoring, change detection, and GraphRAG updates.
 */
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "./graphrag-bridge";
import { AutoUpdateService } from "./auto-update-service";
import { logger } from "../utils/logger";

export class AutoUpdateLoop {
  private autoUpdateService: AutoUpdateService;
  private isRunning: boolean = false;
  private mainLoopInterval: NodeJS.Timeout | null = null;

  constructor(
    private n8nClient: N8nApiClient,
    private graphRAGBridge: GraphRAGBridge,
    private config: any = {}
  ) {
    // Initialize auto-update service
    this.autoUpdateService = new AutoUpdateService(
      n8nClient,
      graphRAGBridge,
      config
    );
  }

  /**
   * Start the auto-update main loop
   */
  public start(): void {
    if (this.isRunning) {
      logger.info("Auto-update loop already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting auto-update main loop...");

    // Start the auto-update service
    this.autoUpdateService.start();

    // Set up main loop for periodic status checks and maintenance
    const mainLoopInterval = this.config.mainLoopInterval || 300000; // 5 minutes default
    this.mainLoopInterval = setInterval(() => {
      this.runMaintenance().catch((error) => {
        logger.error("Maintenance cycle failed:", error);
      });
    }, mainLoopInterval);

    logger.info(
      `Auto-update main loop started (maintenance interval: ${mainLoopInterval}ms)`
    );
  }

  /**
   * Stop the auto-update main loop
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    logger.info("Stopping auto-update main loop...");

    // Stop the auto-update service
    this.autoUpdateService.stop();

    // Clear main loop interval
    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
      this.mainLoopInterval = null;
    }

    logger.info("Auto-update main loop stopped");
  }

  /**
   * Run maintenance tasks
   */
  private async runMaintenance(): Promise<void> {
    try {
      logger.debug("Running auto-update maintenance...");

      // Get current status
      const status = this.autoUpdateService.getStatus();
      logger.debug("Current auto-update status:", status);

      // Check if we need to force an update based on time elapsed
      const lastUpdate = status.lastUpdate;
      if (lastUpdate && this.shouldForceUpdate(lastUpdate)) {
        logger.info("Forcing update due to maintenance schedule");
        await this.autoUpdateService.forceUpdate();
      }

      // Log maintenance completion
      logger.debug("Auto-update maintenance completed");
    } catch (error) {
      logger.error("Maintenance failed:", error);
      throw new Error(
        `Maintenance failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Determine if we should force an update based on maintenance schedule
   */
  private shouldForceUpdate(lastUpdate: Date): boolean {
    // Force update if last update was more than maintenance interval ago
    const maintenanceInterval =
      this.config.maintenanceForceUpdateInterval || 3600000; // 1 hour default
    const now = new Date();
    return now.getTime() - lastUpdate.getTime() > maintenanceInterval;
  }

  /**
   * Force immediate update cycle
   */
  public async forceUpdate(): Promise<void> {
    logger.info("Forcing immediate update cycle from main loop");
    await this.autoUpdateService.forceUpdate();
  }

  /**
   * Get current auto-update status
   */
  public getStatus(): any {
    return this.autoUpdateService.getStatus();
  }

  /**
   * Handle version change events from external sources
   */
  public async handleVersionChange(versionChange: any): Promise<void> {
    logger.info("Handling version change event in main loop");
    await this.autoUpdateService.handleVersionChange(versionChange);
  }

  /**
   * Reset known state (useful after major version changes)
   */
  public resetKnownState(): void {
    logger.info("Resetting known state from main loop");
    this.autoUpdateService.resetKnownState();
  }
}
