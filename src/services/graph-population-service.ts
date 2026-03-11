import { logger } from "../utils/logger";
import { NodeRepository } from "../database/node-repository";
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
  private repository: NodeRepository;
  private graphBridge: GraphRAGBridge;
  private batchSize = 10;

  constructor(repository: NodeRepository) {
    this.repository = repository;
    this.graphBridge = GraphRAGBridge.get();
  }

  /**
   * Main entry point to populate the graph
   * @param force If true, re-ingest all nodes regardless of changes
   */
  async populate(force: boolean = false): Promise<{
    processed: number;
    updated: number;
    relationships: number;
    errors: string[];
  }> {
    logger.info(`Starting graph population (force=${force})...`);
    const stats = { processed: 0, updated: 0, relationships: 0, errors: [] as string[] };

    try {
      // 1. Get all available nodes from NodeRepository
      const nodes = this.repository.searchNodes('');
      logger.info(`Found ${nodes.length} nodes in database`);

      if (nodes.length === 0) {
        throw new Error("No nodes found in database. Run 'npm run rebuild' to populate the node database first.");
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
            // Get full node info (with operations, documentation) for richer graph content
            const fullNode = this.repository.getNode(node.nodeType);
            const entity = this.transformNodeToGraphEntity(fullNode || node);
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

      // 4. Build relationships between nodes
      try {
        logger.info("Building relationships between graph nodes...");
        const relResult = await this.graphBridge.buildRelationships();
        if (relResult.ok) {
          stats.relationships = relResult.relationships_stored || 0;
          logger.info(`Built ${stats.relationships} relationships`);
        } else {
          stats.errors.push(`Relationship building failed: ${(relResult as any).error || "unknown"}`);
        }
      } catch (relError) {
        const msg = `Failed to build relationships: ${relError}`;
        logger.error(msg);
        stats.errors.push(msg);
      }

      logger.info(
        `Graph population complete. Processed: ${stats.processed}, Updated: ${stats.updated}, Relationships: ${stats.relationships}`
      );
    } catch (error) {
      logger.error("Graph population failed", error);
      stats.errors.push(String(error));
    }

    return stats;
  }

  /**
   * Filter nodes that have changed since last ingestion
   */
  private async filterChangedNodes(nodes: any[]): Promise<any[]> {
    // GraphRAG handles upserts gracefully — return all nodes
    return nodes;
  }

  /**
   * Transform n8n node data to GraphRAG entity
   */
  private transformNodeToGraphEntity(node: any): GraphEntity {
    const displayName = node.displayName || node.display_name || node.nodeType;
    const description = node.description || "";
    const category = node.category || "Unknown";
    const nodeType = node.nodeType || node.node_type;
    const packageName = node.package || node.packageName || node.package_name || "";

    // Construct rich content block
    const contentParts = [
      `Node: ${displayName} (${nodeType})`,
      `Category: ${category}`,
      `Description: ${description}`,
    ];

    // Operations (from getNode() full result)
    const operations = node.operations;
    if (operations && Array.isArray(operations) && operations.length > 0) {
      contentParts.push("\nOperations:");
      operations.forEach((op: any) => {
        if (op.resource && op.operation) {
          contentParts.push(
            `- ${op.resource} > ${op.operation}: ${op.description || ""}`
          );
        }
      });
    }

    // Documentation (from getNode() — stored as `documentation` in schema.sql)
    const docs = node.documentation || node.documentationMarkdown;
    if (docs) {
      contentParts.push("\nDocumentation:");
      contentParts.push(docs.slice(0, 2000));
    }

    const content = contentParts.join("\n");
    const contentHash = createHash("sha256").update(content).digest("hex");

    return {
      id: nodeType,
      name: displayName,
      type: "n8n_node",
      description: description,
      content: content,
      metadata: {
        nodeType: nodeType,
        packageName: packageName,
        category: category,
        hasCredentials: !!(node.credentials && node.credentials.length > 0) || !!node.hasCredentials,
        isTrigger: !!node.isTrigger,
        contentHash: contentHash,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Send batch of entities to GraphRAG
   */
  private async batchUpdate(entities: GraphEntity[]): Promise<void> {
    const diff = {
      added: entities,
      modified: [],
      removed: [],
    };

    await this.graphBridge.applyUpdate(diff);
  }
}
