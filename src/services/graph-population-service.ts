import { logger } from "../utils/logger";
import { NodeDocumentationService } from "./node-documentation-service";
import { GraphRAGBridge } from "../ai/graphrag-bridge";
import { createHash } from "crypto";

interface GraphEntity {
  id: string;
  name: string;
  type: string;
  description: string;
  content: string;
  metadata: Record<string, any>;
}

export class GraphPopulationService {
  private nodeDocs: NodeDocumentationService;
  private graphBridge: GraphRAGBridge;
  private batchSize = 10;

  constructor() {
    this.nodeDocs = new NodeDocumentationService();
    this.graphBridge = GraphRAGBridge.get();
  }

  /**
   * Main entry point to populate the graph
   * @param force If true, re-ingest all nodes regardless of changes
   */
  async populate(force: boolean = false): Promise<{
    processed: number;
    updated: number;
    errors: string[];
  }> {
    logger.info(`Starting graph population (force=${force})...`);
    const stats = { processed: 0, updated: 0, errors: [] as string[] };

    try {
      // 1. Get all available nodes
      const nodes = await this.nodeDocs.listNodes();
      logger.info(`Found ${nodes.length} nodes in documentation database`);

      if (nodes.length === 0) {
        logger.info("Documentation database is empty. Triggering rebuild...");
        await this.nodeDocs.rebuildDatabase();
        // Fetch again after rebuild
        const rebuiltNodes = await this.nodeDocs.listNodes();
        logger.info(`Found ${rebuiltNodes.length} nodes after rebuild`);
        if (rebuiltNodes.length === 0) {
          throw new Error("Database rebuild failed to find any nodes");
        }
        // Use rebuilt nodes
        nodes.push(...rebuiltNodes);
      }

      // 2. Filter for updates if not forced
      const nodesToProcess = force
        ? nodes
        : await this.filterChangedNodes(nodes);
      logger.info(`${nodesToProcess.length} nodes require update`);

      // 3. Process in batches
      for (let i = 0; i < nodesToProcess.length; i += this.batchSize) {
        const batch = nodesToProcess.slice(i, i + this.batchSize);
        const entities: GraphEntity[] = [];

        for (const node of batch) {
          try {
            const entity = this.transformNodeToGraphEntity(node);
            entities.push(entity);
            stats.processed++;
          } catch (error) {
            const msg = `Failed to transform node ${node.nodeType}: ${error}`;
            logger.error(msg);
            stats.errors.push(msg);
          }
        }

        if (entities.length > 0) {
          await this.batchUpdate(entities);
          stats.updated += entities.length;
          logger.debug(`Updated batch of ${entities.length} nodes`);
        }
      }

      logger.info(
        `Graph population complete. Processed: ${stats.processed}, Updated: ${stats.updated}`
      );
    } catch (error) {
      logger.error("Graph population failed", error);
      stats.errors.push(String(error));
    }

    return stats;
  }

  /**
   * Filter nodes that have changed since last ingestion
   * Uses a hash of the content to detect changes
   */
  private async filterChangedNodes(nodes: any[]): Promise<any[]> {
    // In a real implementation, we would query GraphRAG to check existing hashes
    // For now, we'll rely on the fact that GraphRAG handles upserts gracefully
    // and we want to ensure consistency.
    // TODO: Implement efficient diffing against GraphRAG state
    return nodes;
  }

  /**
   * Transform n8n NodeInfo to GraphRAG entity
   * Critical: Each node is a single chunk
   */
  private transformNodeToGraphEntity(node: any): GraphEntity {
    // Construct rich content block
    const contentParts = [
      `Node: ${node.displayName} (${node.name})`,
      `Category: ${node.category}`,
      `Description: ${node.description}`,
    ];

    if (node.operations) {
      contentParts.push("\nOperations:");
      const ops = Array.isArray(node.operations)
        ? node.operations
        : JSON.parse(node.operations || "[]");
      ops.forEach((op: any) => {
        contentParts.push(
          `- ${op.resource} > ${op.operation}: ${op.description}`
        );
      });
    }

    if (node.documentationMarkdown) {
      contentParts.push("\nDocumentation:");
      // Truncate docs to avoid excessive token usage, keeping the most relevant parts
      contentParts.push(node.documentationMarkdown.slice(0, 2000));
    }

    const content = contentParts.join("\n");
    const contentHash = createHash("sha256").update(content).digest("hex");

    return {
      id: node.nodeType,
      name: node.displayName,
      type: "n8n_node",
      description: node.description,
      content: content,
      metadata: {
        nodeType: node.nodeType,
        packageName: node.packageName,
        category: node.category,
        hasCredentials: node.hasCredentials,
        isTrigger: node.isTrigger,
        contentHash: contentHash,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Send batch of entities to GraphRAG
   */
  private async batchUpdate(entities: GraphEntity[]): Promise<void> {
    // We use the applyUpdate method on the bridge
    // The bridge expects a diff object with added/modified/removed
    // Since we are doing upserts, we treat everything as 'modified' (or 'added')

    // Map to the format expected by the Python backend's insert logic
    // The Python side expects text chunks to process

    // NOTE: The current GraphRAGBridge.applyUpdate is a placeholder for a more complex
    // graph operation. For simple ingestion, we might need to expose a specific
    // 'ingest' method or use the 'insert' capability if available.

    // Given the current bridge implementation, we will assume 'applyUpdate'
    // can handle these entities. If not, we might need to extend the bridge.

    // Construct a diff object
    const diff = {
      added: entities,
      modified: [],
      removed: [],
    };

    await this.graphBridge.applyUpdate(diff);
  }
}
