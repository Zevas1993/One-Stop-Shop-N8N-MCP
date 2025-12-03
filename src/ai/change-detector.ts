/**
 * Change Detection Engine
 *
 * Detects changes in n8n node catalog and triggers appropriate updates
 * to the GraphRAG knowledge base.
 */
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "./graphrag-bridge";
import { logger } from "../utils/logger";

export interface NodeChange {
  nodeId: string;
  nodeType: string;
  changeType: "added" | "modified" | "removed";
  oldVersion?: string;
  newVersion?: string;
  timestamp: string;
}

export interface ChangeDetectionResult {
  hasChanges: boolean;
  changes: NodeChange[];
  summary: {
    added: number;
    modified: number;
    removed: number;
    totalChanges: number;
  };
}

export class ChangeDetector {
  private lastDetectionTime: Date | null = null;
  private knownNodes: Map<string, { version: string; timestamp: string }> =
    new Map();

  constructor(
    private n8nClient: N8nApiClient,
    private graphRAGBridge: GraphRAGBridge,
    private logger: any
  ) {}

  /**
   * Detect changes in n8n node catalog
   */
  public async detectChanges(): Promise<ChangeDetectionResult> {
    try {
      this.logger.debug("Starting change detection...");

      // Get current node catalog from n8n
      const currentNodes = await this.fetchCurrentNodeCatalog();

      // Compare with known nodes
      const changes = this.compareNodeCatalogs(currentNodes);

      // Update known nodes with current state
      this.updateKnownNodes(currentNodes);

      this.lastDetectionTime = new Date();

      return {
        hasChanges: changes.length > 0,
        changes,
        summary: this.calculateChangeSummary(changes),
      };
    } catch (error) {
      this.logger.error("Change detection failed:", error);
      throw new Error(
        `Change detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Fetch current node catalog from n8n
   */
  private async fetchCurrentNodeCatalog(): Promise<
    Map<string, { version: string; timestamp: string }>
  > {
    try {
      // Get all workflows to extract node information
      const workflowsResponse = await this.n8nClient.listWorkflows({
        limit: 1000,
      });

      const currentNodes = new Map<
        string,
        { version: string; timestamp: string }
      >();

      // Extract node information from workflows
      for (const workflow of workflowsResponse.data) {
        for (const node of workflow.nodes) {
          const nodeKey = `${node.type}:${node.typeVersion || "1"}`;
          currentNodes.set(nodeKey, {
            version: node.typeVersion?.toString() || "1",
            timestamp: workflow.updatedAt || new Date().toISOString(),
          });
        }
      }

      this.logger.debug(`Fetched ${currentNodes.size} nodes from n8n catalog`);
      return currentNodes;
    } catch (error) {
      this.logger.error("Failed to fetch node catalog:", error);
      throw new Error(
        `Node catalog fetch failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Compare current node catalog with known nodes
   */
  private compareNodeCatalogs(
    currentNodes: Map<string, { version: string; timestamp: string }>
  ): NodeChange[] {
    const changes: NodeChange[] = [];
    const now = new Date().toISOString();

    // Check for added or modified nodes
    for (const [nodeKey, currentInfo] of currentNodes.entries()) {
      const knownInfo = this.knownNodes.get(nodeKey);

      if (!knownInfo) {
        // New node added
        changes.push({
          nodeId: nodeKey,
          nodeType: nodeKey.split(":")[0],
          changeType: "added",
          newVersion: currentInfo.version,
          timestamp: now,
        });
      } else if (knownInfo.version !== currentInfo.version) {
        // Node version changed
        changes.push({
          nodeId: nodeKey,
          nodeType: nodeKey.split(":")[0],
          changeType: "modified",
          oldVersion: knownInfo.version,
          newVersion: currentInfo.version,
          timestamp: now,
        });
      }
    }

    // Check for removed nodes
    for (const [nodeKey, knownInfo] of this.knownNodes.entries()) {
      if (!currentNodes.has(nodeKey)) {
        // Node removed
        changes.push({
          nodeId: nodeKey,
          nodeType: nodeKey.split(":")[0],
          changeType: "removed",
          oldVersion: knownInfo.version,
          timestamp: now,
        });
      }
    }

    return changes;
  }

  /**
   * Update known nodes with current catalog
   */
  private updateKnownNodes(
    currentNodes: Map<string, { version: string; timestamp: string }>
  ): void {
    // Replace known nodes with current state
    this.knownNodes = new Map(currentNodes);
  }

  /**
   * Calculate change summary statistics
   */
  private calculateChangeSummary(
    changes: NodeChange[]
  ): ChangeDetectionResult["summary"] {
    const summary = {
      added: 0,
      modified: 0,
      removed: 0,
      totalChanges: changes.length,
    };

    for (const change of changes) {
      switch (change.changeType) {
        case "added":
          summary.added++;
          break;
        case "modified":
          summary.modified++;
          break;
        case "removed":
          summary.removed++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get last detection time
   */
  public getLastDetectionTime(): Date | null {
    return this.lastDetectionTime;
  }

  /**
   * Reset known nodes (useful after major version changes)
   */
  public resetKnownNodes(): void {
    this.knownNodes.clear();
    this.lastDetectionTime = null;
    this.logger.info(
      "Known nodes reset - next detection will be full catalog update"
    );
  }

  /**
   * Get current known nodes count
   */
  public getKnownNodesCount(): number {
    return this.knownNodes.size;
  }
}
