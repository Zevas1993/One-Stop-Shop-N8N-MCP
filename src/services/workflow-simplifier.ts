import { randomUUID } from "crypto";
import { NodeParser } from "./node-parser";
import { logger } from "../utils/logger";

export interface SimplifiedNode {
  id?: string;
  type: string;
  name?: string;
  parameters?: Record<string, any>;
  position?: [number, number];
  typeVersion?: number;
  credentials?: Record<string, any>;
}

export interface SimplifiedConnection {
  from: string; // Node ID or Name
  to: string; // Node ID or Name
  fromIndex?: number;
  toIndex?: number;
}

export interface SimplifiedWorkflow {
  name: string;
  nodes: SimplifiedNode[];
  connections?: SimplifiedConnection[];
}

export class WorkflowSimplifierService {
  constructor(private nodeParser: NodeParser) {}

  /**
   * Expand a simplified workflow into a full n8n workflow JSON
   */
  async expandWorkflow(simple: SimplifiedWorkflow): Promise<any> {
    logger.info(`Expanding simplified workflow: ${simple.name}`);

    // 1. Resolve Types & IDs & Layout
    const nodes = await Promise.all(
      simple.nodes.map(async (node, index) => {
        const resolvedType = await this.resolveType(node.type);

        // Generate ID if missing
        const id = node.id || randomUUID();

        // Generate Name if missing
        // Use ID if available (it's usually short in simplified DSL), otherwise Type + Index
        // Ensure it's a string
        const name =
          node.name || node.id || `${node.type.split(".").pop()}-${index}`;

        // Simple Auto-Layout: Horizontal chain
        const position = node.position || [100 + index * 250, 100];

        return {
          ...node,
          id,
          name,
          type: resolvedType,
          typeVersion: node.typeVersion || 1,
          position,
          parameters: node.parameters || {},
          credentials: node.credentials,
        };
      })
    );

    logger.info(
      `Expanded ${nodes.length} nodes. Names: ${nodes
        .map((n) => n.name)
        .join(", ")}`
    );

    // 2. Build Connections
    const connections: any = {};

    if (simple.connections) {
      for (const conn of simple.connections) {
        // Find source and target nodes
        // Match by ID first, then Name
        const fromNode = nodes.find(
          (n) => n.id === conn.from || n.name === conn.from
        );
        const toNode = nodes.find(
          (n) => n.id === conn.to || n.name === conn.to
        );

        if (!fromNode) {
          logger.warn(`Connection source not found: ${conn.from}`);
          continue;
        }
        if (!toNode) {
          logger.warn(`Connection target not found: ${conn.to}`);
          continue;
        }

        // Initialize connection object for source node
        if (!connections[fromNode.name]) {
          connections[fromNode.name] = { main: [] };
        }

        // Smart Connection Logic for AI Agents & Models
        // Determine output type (Source) and input type (Target)
        let connectionType = "main";
        let targetType = "main";

        const fromType = fromNode.type.toLowerCase();
        const toType = toNode.type.toLowerCase();

        const isSourceAgent =
          fromType.includes("aiagent") || fromType.includes("chain");
        const isSourceModel =
          fromType.includes("chatmodel") || fromType.includes("languagemodel");
        const isSourceMemory = fromType.includes("memory");

        const isTargetTool = toType.includes("tool");
        const isTargetMemory = toType.includes("memory");
        const isTargetOutput = toType.includes("outputparser");
        const isTargetAgent =
          toType.includes("aiagent") || toType.includes("chain");

        if (isSourceAgent) {
          if (isTargetTool) {
            connectionType = "ai_tool";
            targetType = "ai_tool"; // Tools usually accept ai_tool input
          } else if (isTargetMemory) {
            connectionType = "ai_memory";
            targetType = "ai_memory";
          } else if (isTargetOutput) {
            connectionType = "ai_outputParser";
            targetType = "ai_outputParser";
          }
        } else if (isSourceModel && isTargetAgent) {
          connectionType = "ai_languageModel";
          targetType = "ai_languageModel";
        } else if (isSourceMemory && isTargetAgent) {
          connectionType = "ai_memory";
          targetType = "ai_memory";
        }

        // Ensure output array exists for this connection type
        if (!connections[fromNode.name][connectionType]) {
          connections[fromNode.name][connectionType] = [];
        }

        const typeArray = connections[fromNode.name][connectionType];
        const outIndex = conn.fromIndex || 0;

        while (typeArray.length <= outIndex) {
          typeArray.push([]);
        }

        // Add connection
        typeArray[outIndex].push({
          node: toNode.name,
          type: targetType,
          index: conn.toIndex || 0,
        });
      }
    }

    return {
      name: simple.name,
      nodes,
      connections,
    };
  }

  /**
   * Resolve fuzzy node type to internal n8n type
   */
  private async resolveType(type: string): Promise<string> {
    // If it looks like a full type, return it
    if (type.includes("n8n-nodes-base.") || type.includes(".")) {
      return type;
    }

    // Try to find it using NodeParser
    try {
      const results = await this.nodeParser.searchNodes(type);
      if (results.length > 0) {
        // Use the top result
        // The search result 'name' is usually the suffix (e.g. 'scheduleTrigger')
        // We construct the full type.
        // Note: This assumes standard n8n nodes.
        // If NodeParser returned full type it would be better, but let's check.
        // Looking at NodeParser.searchNodes, it returns { name, displayName... }
        // The 'name' in the cache seems to be the suffix for built-in nodes.
        return `n8n-nodes-base.${results[0].name}`;
      }
    } catch (error) {
      logger.warn(`Failed to resolve type ${type}:`, error);
    }

    // Fallback: assume it's a base node
    return `n8n-nodes-base.${type}`;
  }
}
