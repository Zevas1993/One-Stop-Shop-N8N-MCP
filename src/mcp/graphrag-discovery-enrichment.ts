/**
 * GraphRAG Discovery Enrichment Module (Phase 4 Enhancement)
 *
 * Enriches node discovery and template matching with GraphRAG semantic knowledge,
 * enabling pattern-aware recommendations and relationship-based suggestions.
 *
 * Key Features:
 * 1. Semantic relationship suggestions from GraphRAG
 * 2. Pattern-based node combinations and sequences
 * 3. Confidence scoring for recommendations
 * 4. Context-aware suggestions based on workflow goals
 */

import { logger } from "../utils/logger";
import { getHandlerSharedMemory } from "./handler-shared-memory";
import { NodeRepository } from "../database/node-repository";

export interface EnrichedNodeInfo {
  nodeType: string;
  nodeName: string;
  description: string;

  // GraphRAG Enrichments
  relatedNodes: RelatedNode[];
  commonPatterns: WorkflowPattern[];
  successRate: number;
  complexity: "simple" | "moderate" | "complex";

  // Semantic Information
  semanticRelationships: SemanticRelationship[];
  usageContext: string[];
  alternativeNodes: AlternativeNode[];
}

export interface RelatedNode {
  nodeType: string;
  nodeName: string;
  relationship: string;
  confidence: number;
  frequency: number; // How often they appear together
}

export interface WorkflowPattern {
  patternId: string;
  name: string;
  description: string;
  nodes: string[];
  successRate: number;
  complexity: number;
  tags: string[];
}

export interface SemanticRelationship {
  type: "predecessor" | "successor" | "parallel" | "alternative";
  relatedNode: string;
  strength: number; // 0-1 confidence
  reasoning: string;
}

export interface AlternativeNode {
  nodeType: string;
  nodeName: string;
  reason: string;
  tradeoffs: string; // What you gain/lose
}

export interface EnrichedTemplate {
  templateId: string;
  name: string;
  description: string;

  // Original Template Info
  nodes: string[];
  connections: any;

  // GraphRAG Enrichments
  patterns: WorkflowPattern[];
  relatedWorkflows: RelatedTemplate[];
  usefulness: number; // 0-1
  tags: string[];
  complexity: number;
  successRate: number;

  // Semantic Information
  semanticTags: string[];
  goalAlignment: GoalAlignment[];
}

export interface RelatedTemplate {
  templateId: string;
  name: string;
  similarity: number;
  relationship: string;
}

export interface GoalAlignment {
  goal: string;
  alignment: number; // 0-1
  reasoning: string;
}

export class GraphRAGDiscoveryEnrichment {
  private repository: NodeRepository;
  private cachePrefix = "discovery-enrichment";
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(repository: NodeRepository) {
    this.repository = repository;
  }

  /**
   * Enrich a node with GraphRAG knowledge
   */
  async enrichNodeInfo(
    nodeType: string,
    baseInfo: any
  ): Promise<EnrichedNodeInfo> {
    try {
      // Check cache first
      const cached = await this.getEnrichedNodeFromCache(nodeType);
      if (cached) {
        logger.debug(`[GraphRAGEnrichment] Cache hit for node ${nodeType}`);
        return cached;
      }

      // Get GraphRAG insights
      const memory = await getHandlerSharedMemory();
      const graphInsights = await memory.get("graphrag-insights");

      // PHASE 4: Calculate base success rate then apply confidence boost/penalty
      const baseSuccessRate = await this.calculateNodeSuccessRate(nodeType);
      const adjustedSuccessRate = this.adjustConfidenceForNodeType(nodeType, baseSuccessRate);

      const enriched: EnrichedNodeInfo = {
        nodeType,
        nodeName: baseInfo.displayName || nodeType,
        description: baseInfo.description || "",

        // Fetch related nodes from GraphRAG (already boosted/penalized in getRelatedNodes)
        relatedNodes: await this.getRelatedNodes(nodeType, graphInsights),

        // Fetch patterns from GraphRAG
        commonPatterns: await this.getCommonPatterns(nodeType, graphInsights),

        // PHASE 4: Use adjusted success rate (built-in nodes boosted, Code nodes penalized)
        successRate: adjustedSuccessRate,

        // Determine complexity
        complexity: this.calculateNodeComplexity(baseInfo),

        // Get semantic relationships
        semanticRelationships: await this.getSemanticRelationships(nodeType, graphInsights),

        // Get usage context
        usageContext: await this.getUsageContext(nodeType, graphInsights),

        // Get alternative nodes
        alternativeNodes: await this.getAlternativeNodes(nodeType, graphInsights),
      };

      // Cache the enriched info
      await this.cacheEnrichedNode(nodeType, enriched);

      return enriched;
    } catch (error) {
      logger.warn(`[GraphRAGEnrichment] Failed to enrich node ${nodeType}`, error as Error);
      // Return basic info without enrichments
      return {
        nodeType,
        nodeName: baseInfo.displayName || nodeType,
        description: baseInfo.description || "",
        relatedNodes: [],
        commonPatterns: [],
        successRate: 0.5,
        complexity: "simple",
        semanticRelationships: [],
        usageContext: [],
        alternativeNodes: [],
      };
    }
  }

  /**
   * Enrich template matching with pattern knowledge
   */
  async enrichTemplate(
    templateId: string,
    baseTemplate: any
  ): Promise<EnrichedTemplate> {
    try {
      // Check cache first
      const cached = await this.getEnrichedTemplateFromCache(templateId);
      if (cached) {
        logger.debug(`[GraphRAGEnrichment] Cache hit for template ${templateId}`);
        return cached;
      }

      // Get GraphRAG insights
      const memory = await getHandlerSharedMemory();
      const graphInsights = await memory.get("graphrag-insights");
      const patternInsights = await memory.query({
        pattern: "pattern:*",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      const enriched: EnrichedTemplate = {
        templateId,
        name: baseTemplate.name || `Template ${templateId}`,
        description: baseTemplate.description || "",
        nodes: baseTemplate.nodes || [],
        connections: baseTemplate.connections || {},

        // Fetch patterns used in template
        patterns: await this.extractTemplatePatterns(baseTemplate, graphInsights),

        // Find related workflows
        relatedWorkflows: await this.getRelatedTemplates(templateId, baseTemplate, graphInsights),

        // Calculate usefulness
        usefulness: await this.calculateTemplateUsefulness(templateId, baseTemplate),

        // Generate tags
        tags: await this.generateTemplateTags(baseTemplate, graphInsights),

        // Calculate complexity
        complexity: this.calculateTemplateComplexity(baseTemplate),

        // Get success rate
        successRate: await this.calculateTemplateSuccessRate(templateId),

        // Get semantic tags
        semanticTags: await this.generateSemanticTags(baseTemplate, graphInsights),

        // Align with common goals
        goalAlignment: await this.getGoalAlignment(baseTemplate, graphInsights),
      };

      // Cache the enriched template
      await this.cacheEnrichedTemplate(templateId, enriched);

      return enriched;
    } catch (error) {
      logger.warn(`[GraphRAGEnrichment] Failed to enrich template ${templateId}`, error as Error);
      // Return basic template without enrichments
      return {
        templateId,
        name: baseTemplate.name || `Template ${templateId}`,
        description: baseTemplate.description || "",
        nodes: baseTemplate.nodes || [],
        connections: baseTemplate.connections || {},
        patterns: [],
        relatedWorkflows: [],
        usefulness: 0.5,
        tags: [],
        complexity: 0,
        successRate: 0.5,
        semanticTags: [],
        goalAlignment: [],
      };
    }
  }

  /**
   * Get related nodes from GraphRAG
   * ENHANCED (Phase 4): Boost built-in nodes, penalize Code nodes
   */
  private async getRelatedNodes(
    nodeType: string,
    graphInsights: any
  ): Promise<RelatedNode[]> {
    try {
      if (!graphInsights || !graphInsights.relationships) {
        return [];
      }

      const related = graphInsights.relationships
        .filter((rel: any) => rel.sourceNode === nodeType)
        .map((rel: any) => {
          const baseConfidence = rel.confidence || 0.7;

          // PHASE 4: Apply confidence adjustments based on node type
          const adjustedConfidence = this.adjustConfidenceForNodeType(
            rel.targetNode,
            baseConfidence
          );

          return {
            nodeType: rel.targetNode,
            nodeName: rel.targetName || rel.targetNode,
            relationship: rel.type,
            confidence: adjustedConfidence,
            frequency: rel.frequency || 0,
          };
        })
        // Sort by confidence (built-in nodes will now rank higher)
        .sort((a: RelatedNode, b: RelatedNode) => b.confidence - a.confidence)
        .slice(0, 10);

      return related;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get related nodes", error as Error);
      return [];
    }
  }

  /**
   * Adjust confidence score based on node type
   * PHASE 4: Boost built-in nodes (1.5x), penalize Code nodes (0.5x)
   */
  private adjustConfidenceForNodeType(nodeType: string, baseConfidence: number): number {
    const isCodeNode = nodeType === 'n8n-nodes-base.code' ||
                       nodeType === 'code' ||
                       nodeType.includes('.code');

    const isBuiltinNode = !isCodeNode && (
      nodeType.startsWith('n8n-nodes-base.') ||
      nodeType.startsWith('@n8n/')
    );

    if (isCodeNode) {
      // Penalize Code nodes: reduce confidence by 50%
      logger.debug(`[GraphRAGEnrichment] Penalizing Code node: ${nodeType} (${baseConfidence} → ${baseConfidence * 0.5})`);
      return Math.max(baseConfidence * 0.5, 0.1); // Floor at 0.1
    }

    if (isBuiltinNode) {
      // Boost built-in nodes: increase confidence by 50%
      logger.debug(`[GraphRAGEnrichment] Boosting built-in node: ${nodeType} (${baseConfidence} → ${baseConfidence * 1.5})`);
      return Math.min(baseConfidence * 1.5, 1.0); // Cap at 1.0
    }

    // No adjustment for other nodes
    return baseConfidence;
  }

  /**
   * Get common patterns for a node
   */
  private async getCommonPatterns(
    nodeType: string,
    graphInsights: any
  ): Promise<WorkflowPattern[]> {
    try {
      if (!graphInsights || !graphInsights.patterns) {
        return [];
      }

      const patterns = graphInsights.patterns
        .filter((p: any) => p.nodes.includes(nodeType))
        .slice(0, 5)
        .map((p: any) => ({
          patternId: p.id,
          name: p.name,
          description: p.description || "",
          nodes: p.nodes,
          successRate: p.successRate || 0.8,
          complexity: p.complexity || 0,
          tags: p.tags || [],
        }));

      return patterns;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get common patterns", error as Error);
      return [];
    }
  }

  /**
   * Get semantic relationships
   */
  private async getSemanticRelationships(
    nodeType: string,
    graphInsights: any
  ): Promise<SemanticRelationship[]> {
    try {
      if (!graphInsights || !graphInsights.semanticRelationships) {
        return [];
      }

      const relationships = graphInsights.semanticRelationships
        .filter((rel: any) => rel.source === nodeType)
        .slice(0, 10)
        .map((rel: any) => ({
          type: rel.relationshipType,
          relatedNode: rel.target,
          strength: rel.strength || 0.5,
          reasoning: rel.reasoning || "",
        }));

      return relationships;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get semantic relationships", error as Error);
      return [];
    }
  }

  /**
   * Get usage context
   */
  private async getUsageContext(
    nodeType: string,
    graphInsights: any
  ): Promise<string[]> {
    try {
      if (!graphInsights || !graphInsights.usageContext) {
        return [];
      }

      return graphInsights.usageContext
        .filter((ctx: any) => ctx.node === nodeType)
        .map((ctx: any) => ctx.context)
        .slice(0, 5);
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get usage context", error as Error);
      return [];
    }
  }

  /**
   * Get alternative nodes
   */
  private async getAlternativeNodes(
    nodeType: string,
    graphInsights: any
  ): Promise<AlternativeNode[]> {
    try {
      if (!graphInsights || !graphInsights.alternatives) {
        return [];
      }

      return graphInsights.alternatives
        .filter((alt: any) => alt.node === nodeType)
        .slice(0, 3)
        .map((alt: any) => ({
          nodeType: alt.alternative,
          nodeName: alt.alternativeName || alt.alternative,
          reason: alt.reason || "",
          tradeoffs: alt.tradeoffs || "",
        }));
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get alternative nodes", error as Error);
      return [];
    }
  }

  /**
   * Extract patterns from a template
   */
  private async extractTemplatePatterns(
    template: any,
    graphInsights: any
  ): Promise<WorkflowPattern[]> {
    try {
      const templateNodes = template.nodes || [];
      const patterns: WorkflowPattern[] = [];

      if (!graphInsights || !graphInsights.patterns) {
        return patterns;
      }

      graphInsights.patterns.forEach((pattern: any) => {
        const matches = pattern.nodes.filter((n: string) => templateNodes.includes(n)).length;
        const coverage = matches / pattern.nodes.length;

        if (coverage > 0.5) {
          patterns.push({
            patternId: pattern.id,
            name: pattern.name,
            description: pattern.description || "",
            nodes: pattern.nodes,
            successRate: pattern.successRate || 0.8,
            complexity: pattern.complexity || 0,
            tags: pattern.tags || [],
          });
        }
      });

      return patterns.slice(0, 5);
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to extract template patterns", error as Error);
      return [];
    }
  }

  /**
   * Get related templates
   */
  private async getRelatedTemplates(
    templateId: string,
    template: any,
    graphInsights: any
  ): Promise<RelatedTemplate[]> {
    try {
      if (!graphInsights || !graphInsights.templates) {
        return [];
      }

      const templateNodes = new Set(template.nodes || []);

      const related = graphInsights.templates
        .filter((t: any) => t.id !== templateId)
        .map((t: any) => {
          const otherNodes = new Set(t.nodes || []);
          const common = new Set([...templateNodes].filter((n) => otherNodes.has(n)));
          const similarity = common.size / Math.max(templateNodes.size, otherNodes.size);

          return {
            templateId: t.id,
            name: t.name,
            similarity,
            relationship: similarity > 0.7 ? "highly-related" : "similar",
          };
        })
        .filter((t: any) => t.similarity > 0.3)
        .slice(0, 5);

      return related;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get related templates", error as Error);
      return [];
    }
  }

  /**
   * Calculate success rate for a node
   */
  private async calculateNodeSuccessRate(nodeType: string): Promise<number> {
    try {
      const memory = await getHandlerSharedMemory();
      const executions = await memory.query({
        pattern: `execution:${nodeType}:*`,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      if (executions.length === 0) {
        return 0.7; // Default confidence for unknown nodes
      }

      const successful = executions.filter((e: any) => e.value?.success).length;
      return successful / executions.length;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to calculate node success rate", error as Error);
      return 0.7;
    }
  }

  /**
   * Calculate node complexity
   */
  private calculateNodeComplexity(
    nodeInfo: any
  ): "simple" | "moderate" | "complex" {
    const propertyCount = (nodeInfo.properties || []).length;
    const operationCount = (nodeInfo.operations || []).length;
    const totalFields = propertyCount + operationCount;

    if (totalFields < 5) return "simple";
    if (totalFields < 15) return "moderate";
    return "complex";
  }

  /**
   * Calculate template usefulness
   */
  private async calculateTemplateUsefulness(
    templateId: string,
    template: any
  ): Promise<number> {
    try {
      // Factor in: number of valid nodes, complexity, success rate
      const nodeCount = (template.nodes || []).length;
      const nodeQuality = Math.min(nodeCount / 5, 1); // 5+ nodes = max quality
      const successRate = await this.calculateTemplateSuccessRate(templateId);

      return (nodeQuality + successRate) / 2;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to calculate template usefulness", error as Error);
      return 0.5;
    }
  }

  /**
   * Calculate template success rate
   */
  private async calculateTemplateSuccessRate(templateId: string): Promise<number> {
    try {
      const memory = await getHandlerSharedMemory();
      const executions = await memory.query({
        pattern: `template:${templateId}:*`,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      if (executions.length === 0) {
        return 0.7;
      }

      const successful = executions.filter((e: any) => e.value?.success).length;
      return successful / executions.length;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to calculate template success rate", error as Error);
      return 0.7;
    }
  }

  /**
   * Calculate template complexity
   */
  private calculateTemplateComplexity(template: any): number {
    const nodeCount = (template.nodes || []).length;
    const connectionCount = Object.keys(template.connections || {}).length;
    const avgConnectionsPerNode = connectionCount / Math.max(nodeCount, 1);

    // Complexity = node count + connection density
    return Math.min(nodeCount / 10 + avgConnectionsPerNode / 2, 1);
  }

  /**
   * Generate template tags
   */
  private async generateTemplateTags(
    template: any,
    graphInsights: any
  ): Promise<string[]> {
    try {
      const tags: Set<string> = new Set();

      // Add node-based tags
      (template.nodes || []).forEach((node: string) => {
        if (node.includes("trigger") || node.includes("webhook")) tags.add("trigger");
        if (node.includes("transform") || node.includes("code")) tags.add("transform");
        if (node.includes("output") || node.includes("webhook")) tags.add("output");
        if (node.includes("http") || node.includes("api")) tags.add("api");
      });

      // Add pattern-based tags
      if (graphInsights && graphInsights.patterns) {
        graphInsights.patterns.forEach((p: any) => {
          if (this.templateMatchesPattern(template, p)) {
            p.tags?.forEach((tag: string) => tags.add(tag));
          }
        });
      }

      return Array.from(tags).slice(0, 10);
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to generate template tags", error as Error);
      return [];
    }
  }

  /**
   * Generate semantic tags
   */
  private async generateSemanticTags(
    template: any,
    graphInsights: any
  ): Promise<string[]> {
    try {
      const tags: Set<string> = new Set();

      if (graphInsights && graphInsights.semanticTags) {
        (template.nodes || []).forEach((node: string) => {
          graphInsights.semanticTags
            .filter((tag: any) => tag.appliesTo?.includes(node))
            .forEach((tag: any) => tags.add(tag.tag));
        });
      }

      return Array.from(tags).slice(0, 10);
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to generate semantic tags", error as Error);
      return [];
    }
  }

  /**
   * Get goal alignment
   */
  private async getGoalAlignment(
    template: any,
    graphInsights: any
  ): Promise<GoalAlignment[]> {
    try {
      if (!graphInsights || !graphInsights.goals) {
        return [];
      }

      const alignment: GoalAlignment[] = graphInsights.goals
        .map((goal: any) => ({
          goal: goal.name,
          alignment: this.calculateGoalAlignment(template, goal),
          reasoning: `Uses ${(template.nodes || []).length} nodes with relevant capabilities`,
        }))
        .filter((a: any) => a.alignment > 0.3)
        .sort((a: any, b: any) => b.alignment - a.alignment)
        .slice(0, 5);

      return alignment;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get goal alignment", error as Error);
      return [];
    }
  }

  /**
   * Calculate goal alignment
   */
  private calculateGoalAlignment(template: any, goal: any): number {
    const templateNodes = new Set(template.nodes || []);
    const goalNodes = new Set(goal.nodes || []);
    const common = new Set([...templateNodes].filter((n) => goalNodes.has(n)));

    return Math.min(common.size / Math.max(templateNodes.size, 1), 1);
  }

  /**
   * Check if template matches a pattern
   */
  private templateMatchesPattern(template: any, pattern: any): boolean {
    const templateNodes = new Set(template.nodes || []);
    const patternNodes = new Set(pattern.nodes || []);
    const common = new Set([...templateNodes].filter((n) => patternNodes.has(n)));

    return common.size / patternNodes.size > 0.5;
  }

  /**
   * Cache enriched node info
   */
  private async cacheEnrichedNode(nodeType: string, info: EnrichedNodeInfo): Promise<void> {
    try {
      const memory = await getHandlerSharedMemory();
      await memory.set(
        `${this.cachePrefix}:node:${nodeType}`,
        info,
        "discovery-enrichment",
        this.cacheTTL
      );
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to cache enriched node", error as Error);
    }
  }

  /**
   * Cache enriched template
   */
  private async cacheEnrichedTemplate(
    templateId: string,
    template: EnrichedTemplate
  ): Promise<void> {
    try {
      const memory = await getHandlerSharedMemory();
      await memory.set(
        `${this.cachePrefix}:template:${templateId}`,
        template,
        "discovery-enrichment",
        this.cacheTTL
      );
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to cache enriched template", error as Error);
    }
  }

  /**
   * Get enriched node from cache
   */
  private async getEnrichedNodeFromCache(nodeType: string): Promise<EnrichedNodeInfo | null> {
    try {
      const memory = await getHandlerSharedMemory();
      const cached = await memory.get(`${this.cachePrefix}:node:${nodeType}`);
      return cached as EnrichedNodeInfo | null;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get enriched node from cache", error as Error);
      return null;
    }
  }

  /**
   * Get enriched template from cache
   */
  private async getEnrichedTemplateFromCache(
    templateId: string
  ): Promise<EnrichedTemplate | null> {
    try {
      const memory = await getHandlerSharedMemory();
      const cached = await memory.get(`${this.cachePrefix}:template:${templateId}`);
      return cached as EnrichedTemplate | null;
    } catch (error) {
      logger.debug("[GraphRAGEnrichment] Failed to get enriched template from cache", error as Error);
      return null;
    }
  }
}

/**
 * Singleton instance
 */
let enrichmentService: GraphRAGDiscoveryEnrichment | null = null;

/**
 * Get or create the enrichment service
 */
export function getGraphRAGDiscoveryEnrichment(
  repository: NodeRepository
): GraphRAGDiscoveryEnrichment {
  if (!enrichmentService) {
    enrichmentService = new GraphRAGDiscoveryEnrichment(repository);
    logger.info("[GraphRAGEnrichment] Initialized discovery enrichment service");
  }
  return enrichmentService;
}
