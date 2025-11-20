/**
 * GraphRAG Learning Service
 *
 * Orchestrates the Nano LLM-driven learning pipeline for intelligent GraphRAG updates.
 * Coordinates between:
 * - Embedding Model (Neural Graph Semanticist): Semantic understanding and relationship discovery
 * - Generation Model (Graph Update Strategist): Intelligent promotion decisions and graph updates
 *
 * The service receives workflow execution feedback, passes it through both Nano LLMs,
 * and applies high-confidence updates to the GraphRAG neural knowledge graph.
 */

import { logger } from "../utils/logger";
import { createEmbeddingSystemPrompt } from "../prompts/embedding-model-system-prompt";
import { createGenerationSystemPrompt } from "../prompts/generation-model-system-prompt";
import { OllamaClient, createDualOllamaClients } from "../ai/ollama-client";

export interface WorkflowFeedback {
  executionId: string;
  workflowId: string;
  userId: string;
  timestamp: string;
  workflow: {
    nodes: any[];
    connections: any;
  };
  feedback: {
    success: boolean;
    executionTime: number;
    nodeCount: number;
    userFeedback?: string;
    userSatisfaction?: number; // 1-5 scale
    semanticIntent?: string;
  };
}

export interface EmbeddingAnalysis {
  executionId: string;
  analysisTimestamp: string;
  patternAnalysis: {
    detectedArchetype: string;
    semanticIntent: string;
    complexity: "simple" | "moderate" | "complex";
    confidence: number;
  };
  embeddings: {
    patternEmbedding: number[];
    dimension: number;
    normalized: boolean;
  };
  nodeRelationships: Array<{
    sourceNode: string;
    targetNode: string;
    relationshipType: string;
    strength: number;
    semanticMeaning: string;
  }>;
  clusterAssignment: {
    primaryCluster: string;
    clusterSimilarity: number;
    secondaryCluster?: string;
    secondarySimilarity?: number;
  };
  performanceMetrics: {
    executionSuccess: boolean;
    semanticStability: number;
    confidenceScore: number;
    recommendedForPromotion: boolean;
  };
  warnings: string[];
}

export interface GraphUpdateDecision {
  executionId: string;
  strategicAnalysis: {
    timestamp: string;
    decisionType:
      | "promote-pattern"
      | "demote-pattern"
      | "update-relationship"
      | "flag-conflict"
      | "no-action";
    overallConfidence: number;
  };
  updateOperations: Array<{
    operationType: string;
    operationId: string;
    patternId?: string;
    patternName?: string;
    archetype?: string;
    promotion?: any;
    sourceNodeType?: string;
    targetNodeType?: string;
    relationshipType?: string;
    confidence: number;
    reasoning: string;
  }>;
  strategicReasoning: {
    patternScore: any;
    promotionCriteria: {
      meetSuccessRate: boolean;
      meetFrequency: boolean;
      meetConfidence: boolean;
      noConflicts: boolean;
      semanticallySound: boolean;
    };
  };
  warnings: string[];
  notes: string[];
  expectedImpact: {
    description: string;
    affectedNodeTypes: string[];
    estimatedBenefitScore: number;
  };
}

export interface LearningProgress {
  patternsDiscovered: number;
  patternsPromoted: number;
  pendingPatterns: number;
  successRate: number;
  avgConfidenceScore: number;
  lastUpdateTimestamp: string;
  recentUpdates: Array<{
    patternName: string;
    decision: string;
    confidence: number;
    timestamp: string;
  }>;
}

export class GraphRAGLearningService {
  private embeddingModelName: string;
  private generationModelName: string;
  private embeddingDimension: number;
  private embeddingSystemPrompt: string;
  private generationSystemPrompt: string;

  // Real LLM Clients
  private embeddingClient: OllamaClient;
  private generationClient: OllamaClient;

  // Learning state tracking
  private learningState: LearningProgress = {
    patternsDiscovered: 0,
    patternsPromoted: 0,
    pendingPatterns: 0,
    successRate: 0,
    avgConfidenceScore: 0,
    lastUpdateTimestamp: new Date().toISOString(),
    recentUpdates: [],
  };

  // Pattern history for decision-making
  private patternHistory: Map<string, any> = new Map();

  constructor(
    embeddingModelName: string = "nomic-embed-text",
    generationModelName: string = "qwen2.5:3b",
    embeddingDimension: number = 768,
    ollamaBaseUrl: string = "http://ollama:11434"
  ) {
    this.embeddingModelName = embeddingModelName;
    this.generationModelName = generationModelName;
    this.embeddingDimension = embeddingDimension;

    // Initialize system prompts
    this.embeddingSystemPrompt = createEmbeddingSystemPrompt(
      embeddingModelName,
      embeddingDimension
    );
    this.generationSystemPrompt =
      createGenerationSystemPrompt(generationModelName);

    // Initialize Dual Ollama Clients
    const clients = createDualOllamaClients(
      embeddingModelName,
      generationModelName,
      ollamaBaseUrl,
      ollamaBaseUrl
    );
    this.embeddingClient = clients.embedding;
    this.generationClient = clients.generation;

    logger.info("GraphRAG Learning Service initialized", {
      embeddingModel: embeddingModelName,
      generationModel: generationModelName,
      embeddingDimension,
      mode: "active-llm",
    });
  }

  /**
   * Process workflow execution feedback through the Nano LLM learning pipeline
   *
   * @param feedback - The workflow execution feedback to process
   * @returns Update decisions to apply to GraphRAG
   */
  async processWorkflowFeedback(
    feedback: WorkflowFeedback
  ): Promise<GraphUpdateDecision> {
    const startTime = Date.now();
    logger.info("Processing workflow feedback", {
      executionId: feedback.executionId,
      workflowId: feedback.workflowId,
      success: feedback.feedback.success,
    });

    try {
      // Stage 1: Embedding Model Analysis (Neural Graph Semanticist)
      const embeddingAnalysis = await this.runEmbeddingModelAnalysis(feedback);
      logger.debug("Embedding model analysis complete", {
        executionId: feedback.executionId,
        archetype: embeddingAnalysis.patternAnalysis.detectedArchetype,
        confidence: embeddingAnalysis.patternAnalysis.confidence,
      });

      // Stage 2: Generation Model Decision (Graph Update Strategist)
      const updateDecision = await this.runGenerationModelAnalysis(
        feedback,
        embeddingAnalysis
      );
      logger.debug("Generation model analysis complete", {
        executionId: feedback.executionId,
        decision: updateDecision.strategicAnalysis.decisionType,
        confidence: updateDecision.strategicAnalysis.overallConfidence,
      });

      // Update learning state
      this.updateLearningState(updateDecision, feedback);

      const duration = Date.now() - startTime;
      logger.info("Workflow feedback processing complete", {
        executionId: feedback.executionId,
        duration,
        decision: updateDecision.strategicAnalysis.decisionType,
        confidence: updateDecision.strategicAnalysis.overallConfidence,
      });

      return updateDecision;
    } catch (error) {
      logger.error("Error processing workflow feedback", {
        executionId: feedback.executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stage 1: Run Embedding Model Analysis
   * The Embedding Model acts as Neural Graph Semanticist
   */
  private async runEmbeddingModelAnalysis(
    feedback: WorkflowFeedback
  ): Promise<EmbeddingAnalysis> {
    const workflowText = JSON.stringify(feedback.workflow);
    let embeddings: number[] = [];
    let confidence = 0.0;

    try {
      // Generate real embedding via Ollama
      const response = await this.embeddingClient.generateEmbedding(
        workflowText
      );
      embeddings = response.embedding; // Single embedding returned
      confidence = 0.95; // High confidence if model call succeeds
    } catch (error) {
      logger.warn("Failed to generate real embedding, falling back to mock", {
        error,
      });
      embeddings = this.generateMockEmbedding(
        feedback.workflowId,
        this.embeddingDimension
      );
      confidence = 0.5; // Lower confidence for mock
    }

    // Analyze relationships (heuristic for now, could be LLM-enhanced)
    const relationships = this.discoverNodeRelationships(
      feedback.workflow.nodes,
      feedback.workflow.connections
    );

    const analysis: EmbeddingAnalysis = {
      executionId: feedback.executionId,
      analysisTimestamp: new Date().toISOString(),
      patternAnalysis: {
        detectedArchetype: this.detectWorkflowArchetype(
          feedback.workflow.nodes.map((n: any) => n.type)
        ),
        semanticIntent: feedback.feedback.semanticIntent || "unknown",
        complexity: this.calculateComplexity(feedback.workflow.nodes),
        confidence: this.calculateEmbeddingConfidence(feedback, relationships),
      },
      embeddings: {
        patternEmbedding: embeddings,
        dimension: embeddings.length,
        normalized: true,
      },
      nodeRelationships: relationships,
      clusterAssignment: {
        primaryCluster: "cluster-" + feedback.workflowId.substring(0, 4),
        clusterSimilarity: 0.85,
      },
      performanceMetrics: {
        executionSuccess: feedback.feedback.success,
        semanticStability: this.calculateSemanticStability(feedback),
        confidenceScore: confidence,
        recommendedForPromotion: confidence > 0.85 && feedback.feedback.success,
      },
      warnings: this.detectEmbeddingWarnings(feedback),
    };

    return analysis;
  }

  /**
   * Stage 2: Run Generation Model Analysis
   * The Generation Model acts as Graph Update Strategist
   */
  private async runGenerationModelAnalysis(
    feedback: WorkflowFeedback,
    embeddingAnalysis: EmbeddingAnalysis
  ): Promise<GraphUpdateDecision> {
    try {
      // Construct prompt for the Generation Model
      const prompt = `
      Analyze this workflow execution and recommend GraphRAG updates.

      Workflow Context:
      - ID: ${feedback.workflowId}
      - Success: ${feedback.feedback.success}
      - Node Count: ${feedback.feedback.nodeCount}
      - Archetype: ${embeddingAnalysis.patternAnalysis.detectedArchetype}

      Embedding Analysis:
      - Confidence: ${embeddingAnalysis.patternAnalysis.confidence}
      - Relationships: ${JSON.stringify(
        embeddingAnalysis.nodeRelationships.map((r) => r.semanticMeaning)
      )}

      Task:
      Determine if this pattern should be promoted to the knowledge graph.
      Return a JSON object with:
      - decisionType: "promote-pattern" | "update-relationship" | "no-action"
      - confidence: number (0.0-1.0)
      - reasoning: string
      `;

      // Call Generation Model
      const response = await this.generationClient.generateText(prompt, {
        temperature: 0.2,
        maxTokens: 500,
      });

      // Parse JSON response (naive parsing, could be more robust)
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);

        // Map LLM decision to internal structure
        return {
          executionId: feedback.executionId,
          strategicAnalysis: {
            timestamp: new Date().toISOString(),
            decisionType: decision.decisionType || "no-action",
            overallConfidence: decision.confidence || 0.5,
          },
          updateOperations: [], // Would be populated based on decision
          strategicReasoning: {
            patternScore: {}, // Placeholder
            promotionCriteria: {
              meetSuccessRate: feedback.feedback.success,
              meetFrequency: true,
              meetConfidence: decision.confidence > 0.8,
              noConflicts: true,
              semanticallySound: true,
            },
          },
          warnings: [],
          notes: [decision.reasoning],
          expectedImpact: {
            description: "LLM determined impact",
            affectedNodeTypes: [],
            estimatedBenefitScore: 0.5,
          },
        };
      }
    } catch (error) {
      logger.warn("Generation model failed, falling back to heuristic", {
        error,
      });
    }

    // Fallback to heuristic decision making
    const patternInfo = this.getOrCreatePatternInfo(
      this.generatePatternId(feedback.workflow),
      feedback,
      embeddingAnalysis
    );
    this.updatePatternMetrics(patternInfo, feedback);

    const decision = this.makePromotionDecision(
      patternInfo,
      embeddingAnalysis,
      feedback
    );
    const operations = this.generateUpdateOperations(
      decision,
      patternInfo,
      embeddingAnalysis,
      feedback
    );
    const conflicts = this.detectConflicts(operations, embeddingAnalysis);

    return {
      executionId: feedback.executionId,
      strategicAnalysis: {
        timestamp: new Date().toISOString(),
        decisionType: decision.type as any,
        overallConfidence: decision.confidence,
      },
      updateOperations: operations,
      strategicReasoning: {
        patternScore: decision.patternScore,
        promotionCriteria: {
          meetSuccessRate: patternInfo.successRate >= 0.8,
          meetFrequency: patternInfo.observationCount >= 3,
          meetConfidence: embeddingAnalysis.patternAnalysis.confidence >= 0.85,
          noConflicts: conflicts.length === 0,
          semanticallySound: decision.semanticallySound,
        },
      },
      warnings: conflicts,
      notes: decision.notes,
      expectedImpact: {
        description: decision.impactDescription,
        affectedNodeTypes: embeddingAnalysis.nodeRelationships.flatMap((r) => [
          r.sourceNode,
          r.targetNode,
        ]),
        estimatedBenefitScore: decision.benefitScore,
      },
    };
  }

  /**
   * Make intelligent promotion decision based on quality thresholds
   */
  private makePromotionDecision(
    patternInfo: any,
    embeddingAnalysis: EmbeddingAnalysis,
    feedback: WorkflowFeedback
  ): any {
    const successRate = patternInfo.successRate || 0;
    const observationCount = patternInfo.observationCount || 0;
    const embeddingConfidence = embeddingAnalysis.patternAnalysis.confidence;
    const userSatisfaction = feedback.feedback.userSatisfaction || 0;

    // Calculate pattern score
    const patternScore = {
      successRateWeight: { value: successRate, weight: 0.4 },
      frequencyWeight: {
        value: Math.min(observationCount / 10, 1.0),
        weight: 0.2,
      },
      semanticStabilityWeight: {
        value: embeddingAnalysis.performanceMetrics.semanticStability,
        weight: 0.2,
      },
      userSatisfactionWeight: { value: userSatisfaction / 5.0, weight: 0.2 },
      finalScore:
        successRate * 0.4 +
        Math.min(observationCount / 10, 1.0) * 0.2 +
        embeddingAnalysis.performanceMetrics.semanticStability * 0.2 +
        (userSatisfaction / 5.0) * 0.2,
    };

    // Determine decision type
    let decisionType = "no-action";
    let confidence = 0;
    let impactDescription = "Pattern requires more observation";
    let benefitScore = 0;
    let semanticallySound = true;

    // PROMOTE: All quality thresholds met
    if (
      successRate >= 0.8 &&
      observationCount >= 3 &&
      embeddingConfidence >= 0.85 &&
      patternScore.finalScore >= 0.85
    ) {
      decisionType = "promote-pattern";
      confidence = patternScore.finalScore;
      impactDescription = `Promote ${
        embeddingAnalysis.patternAnalysis.detectedArchetype
      } pattern to knowledge graph with ${(confidence * 100).toFixed(
        0
      )}% confidence`;
      benefitScore = 0.9;
    }
    // UPDATE: Strengthen existing relationships
    else if (
      observationCount >= 5 &&
      successRate >= 0.75 &&
      embeddingConfidence >= 0.8
    ) {
      decisionType = "update-relationship";
      confidence = Math.min(embeddingConfidence, patternScore.finalScore);
      impactDescription =
        "Update relationship confidence scores based on new evidence";
      benefitScore = 0.7;
    }
    // HOLD: Insufficient data
    else if (observationCount < 3) {
      decisionType = "no-action";
      confidence = patternScore.finalScore;
      impactDescription = `Pattern needs ${
        3 - observationCount
      } more observation(s) before promotion`;
      benefitScore = 0;
    }
    // REJECT: Below quality thresholds
    else {
      decisionType = "no-action";
      confidence = 0;
      impactDescription =
        "Pattern does not meet quality thresholds for promotion";
      benefitScore = 0;

      if (successRate < 0.8) {
        impactDescription += ` (success rate ${(successRate * 100).toFixed(
          0
        )}% < 80%)`;
      }
    }

    return {
      type: decisionType,
      confidence,
      patternScore,
      semanticallySound,
      impactDescription,
      benefitScore,
      notes: [
        `Pattern observed ${observationCount} times with ${(
          successRate * 100
        ).toFixed(0)}% success rate`,
        `Embedding confidence: ${(embeddingConfidence * 100).toFixed(0)}%`,
        `User satisfaction: ${((userSatisfaction / 5.0) * 100).toFixed(0)}%`,
      ],
    };
  }

  /**
   * Generate GraphRAG update operations based on decision
   */
  private generateUpdateOperations(
    decision: any,
    patternInfo: any,
    embeddingAnalysis: EmbeddingAnalysis,
    feedback: WorkflowFeedback
  ): Array<any> {
    const operations: any[] = [];

    if (decision.type === "promote-pattern") {
      // Promote the pattern
      operations.push({
        operationType: "promote-pattern",
        operationId: `op-${Date.now()}-0`,
        patternId: patternInfo.patternId,
        patternName: embeddingAnalysis.patternAnalysis.detectedArchetype,
        archetype: embeddingAnalysis.patternAnalysis.detectedArchetype,
        promotion: {
          fromStatus: "pending",
          toStatus: "promoted",
          confidenceScore: decision.confidence,
          evidence: decision.notes,
        },
        confidence: decision.confidence,
        reasoning: `Pattern meets all promotion criteria with ${(
          decision.confidence * 100
        ).toFixed(0)}% confidence`,
      });

      // Add node relationships
      let opIndex = 1;
      for (const relationship of embeddingAnalysis.nodeRelationships) {
        operations.push({
          operationType: "add-relationship",
          operationId: `op-${Date.now()}-${opIndex++}`,
          sourceNodeType: relationship.sourceNode,
          targetNodeType: relationship.targetNode,
          relationshipType: relationship.relationshipType,
          confidence: relationship.strength,
          reasoning: relationship.semanticMeaning,
        });
      }
    } else if (decision.type === "update-relationship") {
      // Update existing relationship confidence scores
      for (const relationship of embeddingAnalysis.nodeRelationships) {
        operations.push({
          operationType: "update-relationship",
          operationId: `op-${Date.now()}-rel-${relationship.sourceNode}-${
            relationship.targetNode
          }`,
          sourceNodeType: relationship.sourceNode,
          targetNodeType: relationship.targetNode,
          relationshipType: relationship.relationshipType,
          confidence: relationship.strength,
          reasoning: `Strengthened by new evidence: ${relationship.semanticMeaning}`,
        });
      }
    }

    return operations;
  }

  /**
   * Detect conflicts with existing patterns
   */
  private detectConflicts(
    operations: any[],
    embeddingAnalysis: EmbeddingAnalysis
  ): string[] {
    const conflicts: string[] = [];

    // In production, this would check against existing GraphRAG patterns
    // For now, we just validate semantic soundness
    if (
      !this.isSemanticallySoundCombination(embeddingAnalysis.nodeRelationships)
    ) {
      conflicts.push(
        "Semantic conflict detected: Node combination may not be semantically valid"
      );
    }

    return conflicts;
  }

  /**
   * Helper: Detect workflow archetype from node types
   */
  private detectWorkflowArchetype(nodeTypes: string[]): string {
    const nodeString = nodeTypes.join("|");

    if (
      nodeString.includes("webhook") &&
      (nodeString.includes("slack") || nodeString.includes("email"))
    ) {
      return "notification-trigger";
    } else if (
      nodeString.includes("httpRequest") ||
      nodeString.includes("http")
    ) {
      if (nodeString.includes("slack") || nodeString.includes("email")) {
        return "api-to-notification";
      }
      return "api-fetch";
    } else if (
      nodeString.includes("webhook") &&
      nodeString.includes("httpRequest")
    ) {
      return "webhook-http-chain";
    } else if (nodeTypes.length > 3) {
      return "complex-orchestration";
    } else {
      return "simple-pipeline";
    }
  }

  /**
   * Helper: Generate mock embeddings (in production, vLLM would do this)
   */
  private generateMockEmbedding(
    patternKey: string,
    dimension: number
  ): number[] {
    const embedding: number[] = [];
    let hash = 0;

    // Simple hash of pattern key
    for (let i = 0; i < patternKey.length; i++) {
      hash = (hash << 5) - hash + patternKey.charCodeAt(i);
      hash |= 0;
    }

    // Generate deterministic but pseudo-random embeddings
    for (let i = 0; i < dimension; i++) {
      const value = Math.sin((hash + i) * 0.12) * 0.5;
      embedding.push(value);
    }

    // L2-normalize
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    return embedding.map((x) => x / norm);
  }

  /**
   * Helper: Discover node relationships from workflow structure
   */
  private discoverNodeRelationships(nodes: any[], connections: any): any[] {
    const relationships: any[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.name, n]));

    // Analyze connections to discover relationships
    for (const [sourceName, sourceConns] of Object.entries(connections || {})) {
      const sourceNode = nodeMap.get(sourceName);
      if (!sourceNode || !sourceConns) continue;

      const conns = sourceConns as any;
      if (conns.main && Array.isArray(conns.main)) {
        for (const connGroup of conns.main) {
          if (Array.isArray(connGroup)) {
            for (const conn of connGroup) {
              const targetNode = nodeMap.get(conn.node);
              if (targetNode) {
                relationships.push({
                  sourceNode: sourceNode.type,
                  targetNode: targetNode.type,
                  relationshipType: "direct-connection",
                  strength: 0.9,
                  semanticMeaning: `${sourceNode.type} flows to ${targetNode.type}`,
                });
              }
            }
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Helper: Calculate embedding confidence score
   */
  private calculateEmbeddingConfidence(
    feedback: any,
    relationships: any[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost for successful execution
    if (feedback.success) {
      confidence += 0.2;
    }

    // Boost for explicit user feedback
    if (feedback.userFeedback && feedback.userFeedback.includes("✅")) {
      confidence += 0.15;
    }

    // Boost for high user satisfaction
    if (feedback.userSatisfaction && feedback.userSatisfaction >= 4) {
      confidence += 0.15;
    }

    // Normalize
    return Math.min(confidence, 1.0);
  }

  /**
   * Helper: Calculate workflow complexity
   */
  private calculateComplexity(nodes: any[]): "simple" | "moderate" | "complex" {
    if (nodes.length <= 2) return "simple";
    if (nodes.length <= 5) return "moderate";
    return "complex";
  }

  /**
   * Helper: Calculate semantic stability
   */
  private calculateSemanticStability(feedback: any): number {
    // Higher stability when execution is consistent
    if (feedback.success && feedback.userSatisfaction >= 4) {
      return 0.9;
    } else if (feedback.success) {
      return 0.75;
    } else {
      return 0.5;
    }
  }

  /**
   * Helper: Detect warnings from embedding analysis
   */
  private detectEmbeddingWarnings(feedback: any): string[] {
    const warnings: string[] = [];

    if (!feedback.success) {
      warnings.push("Execution failed - pattern may not be reliable");
    }

    if (feedback.userSatisfaction && feedback.userSatisfaction < 3) {
      warnings.push("Low user satisfaction - pattern may need refinement");
    }

    if (feedback.executionTime > 10) {
      warnings.push("High execution time - pattern may need optimization");
    }

    return warnings;
  }

  /**
   * Helper: Generate pattern ID from workflow
   */
  private generatePatternId(workflow: any): string {
    const nodes = workflow.nodes.map((n: any) => n.type).join("|");
    return `pattern-${Buffer.from(nodes).toString("base64").slice(0, 16)}`;
  }

  /**
   * Helper: Get or create pattern info
   */
  private getOrCreatePatternInfo(
    patternId: string,
    feedback: any,
    analysis: any
  ): any {
    if (!this.patternHistory.has(patternId)) {
      this.patternHistory.set(patternId, {
        patternId,
        archetype: analysis.patternAnalysis.detectedArchetype,
        firstObserved: new Date().toISOString(),
        observationCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgExecutionTime: 0,
        userSatisfactionAvg: 0,
      });
    }

    return this.patternHistory.get(patternId)!;
  }

  /**
   * Helper: Update pattern metrics
   */
  private updatePatternMetrics(patternInfo: any, feedback: any): void {
    patternInfo.observationCount++;

    if (feedback.feedback.success) {
      patternInfo.successCount++;
    } else {
      patternInfo.failureCount++;
    }

    patternInfo.successRate =
      patternInfo.successCount / patternInfo.observationCount;

    // Update averages
    if (patternInfo.avgExecutionTime === 0) {
      patternInfo.avgExecutionTime = feedback.feedback.executionTime;
    } else {
      patternInfo.avgExecutionTime =
        (patternInfo.avgExecutionTime * (patternInfo.observationCount - 1) +
          feedback.feedback.executionTime) /
        patternInfo.observationCount;
    }

    if (feedback.feedback.userSatisfaction) {
      if (patternInfo.userSatisfactionAvg === 0) {
        patternInfo.userSatisfactionAvg = feedback.feedback.userSatisfaction;
      } else {
        patternInfo.userSatisfactionAvg =
          (patternInfo.userSatisfactionAvg *
            (patternInfo.observationCount - 1) +
            feedback.feedback.userSatisfaction) /
          patternInfo.observationCount;
      }
    }
  }

  /**
   * Helper: Check if node combination is semantically sound
   */
  private isSemanticallySoundCombination(relationships: any[]): boolean {
    // In production, this would validate against n8n node type compatibility
    // For now, just check that relationships exist and make sense
    return relationships.length > 0;
  }

  /**
   * Helper: Update learning state
   */
  private updateLearningState(
    decision: GraphUpdateDecision,
    feedback: any
  ): void {
    // Update counters
    this.learningState.patternsDiscovered++;

    if (decision.strategicAnalysis.decisionType === "promote-pattern") {
      this.learningState.patternsPromoted++;
      this.learningState.recentUpdates.unshift({
        patternName: decision.expectedImpact.description,
        decision: "PROMOTED",
        confidence: decision.strategicAnalysis.overallConfidence,
        timestamp: new Date().toISOString(),
      });
    } else if (decision.strategicAnalysis.decisionType === "no-action") {
      this.learningState.pendingPatterns++;
    }

    // Keep only last 10 updates
    this.learningState.recentUpdates = this.learningState.recentUpdates.slice(
      0,
      10
    );

    // Update aggregate metrics
    this.learningState.lastUpdateTimestamp = new Date().toISOString();
    this.learningState.avgConfidenceScore =
      (this.learningState.avgConfidenceScore *
        (this.learningState.patternsDiscovered - 1) +
        decision.strategicAnalysis.overallConfidence) /
      this.learningState.patternsDiscovered;
  }

  /**
   * Get current learning progress
   */
  getLearningProgress(): LearningProgress {
    return { ...this.learningState };
  }

  /**
   * Reset learning state (for testing)
   */
  resetLearningState(): void {
    this.learningState = {
      patternsDiscovered: 0,
      patternsPromoted: 0,
      pendingPatterns: 0,
      successRate: 0,
      avgConfidenceScore: 0,
      lastUpdateTimestamp: new Date().toISOString(),
      recentUpdates: [],
    };
    this.patternHistory.clear();
  }
}
