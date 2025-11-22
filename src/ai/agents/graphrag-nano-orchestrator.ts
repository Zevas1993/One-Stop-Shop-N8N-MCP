/**
 * GraphRAG Nano Agent Orchestrator
 * Coordinates pattern discovery, graph querying, and workflow generation
 *
 * Pipeline:
 * 1. PatternAgent → Discover workflow patterns from goal
 * 2. GraphRAGAgent → Query knowledge graph for node relationships
 * 3. WorkflowAgent → Generate n8n workflow from patterns + graph insights
 * 4. ValidatorAgent → Validate generated workflow
 */

import { BaseAgent, AgentConfig, AgentInput, AgentOutput } from "./base-agent";
import { PatternAgent, PatternMatch } from "./pattern-agent";
import { WorkflowAgent } from "./workflow-agent";
import { ValidatorAgent } from "./validator-agent";
import { SharedMemory } from "../shared-memory";
import { GraphRAGBridge, QueryGraphResult } from "../graphrag-bridge";
import { logger } from "../../utils/logger";

export interface NanoAgentPipelineConfig {
  enableGraphRAG: boolean;
  maxAgentRetries: number;
  agentTimeoutMs: number;
  shareGraphInsights: boolean;
}

export interface PipelineResult {
  success: boolean;
  goal: string;
  pattern: PatternMatch | null;
  graphInsights: QueryGraphResult | null;
  workflow: any | null;
  validationResult: any | null;
  executionStats: {
    totalTime: number;
    patternDiscoveryTime: number;
    graphQueryTime: number;
    workflowGenerationTime: number;
    validationTime: number;
  };
  errors: string[];
}

/**
 * GraphRAG-aware nano agent orchestrator
 * Runs agents sequentially with shared memory
 */
export class GraphRAGNanoOrchestrator {
  private patternAgent: PatternAgent;
  private workflowAgent: WorkflowAgent;
  private validatorAgent: ValidatorAgent;
  private sharedMemory: SharedMemory;
  private graphRag: GraphRAGBridge;
  private config: NanoAgentPipelineConfig;

  constructor(config?: Partial<NanoAgentPipelineConfig>) {
    // Initialize shared memory for agent coordination
    this.sharedMemory = new SharedMemory();

    // Initialize agents
    this.patternAgent = new PatternAgent(this.sharedMemory);
    this.workflowAgent = new WorkflowAgent(this.sharedMemory);
    this.validatorAgent = new ValidatorAgent(this.sharedMemory);

    // Initialize GraphRAG bridge
    this.graphRag = GraphRAGBridge.get();

    // Set configuration
    this.config = {
      enableGraphRAG: config?.enableGraphRAG ?? true,
      maxAgentRetries: config?.maxAgentRetries ?? 2,
      agentTimeoutMs: config?.agentTimeoutMs ?? 30000,
      shareGraphInsights: config?.shareGraphInsights ?? true,
    };

    logger.info(
      "[GraphRAG Orchestrator] Initialized with config:",
      this.config
    );
  }

  /**
   * Initialize all agents
   */
  async initialize(): Promise<void> {
    logger.info("[GraphRAG Orchestrator] Initializing agents...");

    // Initialize shared memory first
    await this.sharedMemory.initialize();

    await this.patternAgent.initialize();
    await this.workflowAgent.initialize();
    await this.validatorAgent.initialize();
    logger.info("[GraphRAG Orchestrator] All agents initialized");
  }

  /**
   * Execute full pipeline: pattern discovery → graph query → workflow generation → validation
   */
  async executePipeline(goal: string): Promise<PipelineResult> {
    const startTime = Date.now();
    const result: PipelineResult = {
      success: false,
      goal,
      pattern: null,
      graphInsights: null,
      workflow: null,
      validationResult: null,
      executionStats: {
        totalTime: 0,
        patternDiscoveryTime: 0,
        graphQueryTime: 0,
        workflowGenerationTime: 0,
        validationTime: 0,
      },
      errors: [],
    };

    try {
      // Step 1: Pattern Discovery
      logger.info(`[Pipeline] Step 1: Pattern discovery for goal: "${goal}"`);
      const patternStart = Date.now();
      const patternResult = await this.runPatternDiscovery(goal);
      result.executionStats.patternDiscoveryTime = Date.now() - patternStart;

      if (!patternResult.success) {
        result.errors.push(`Pattern discovery failed: ${patternResult.error}`);
        return result;
      }

      result.pattern = patternResult.result?.matchedPatterns?.[0] || null;
      logger.info(
        `[Pipeline] Pattern discovered: ${
          result.pattern?.patternName || "none"
        }`
      );

      // Step 2: GraphRAG Query (if enabled)
      if (this.config.enableGraphRAG && result.pattern) {
        logger.info(
          `[Pipeline] Step 2: Querying GraphRAG for node relationships`
        );
        const graphStart = Date.now();
        const graphResult = await this.queryGraphRAGForPattern(
          goal,
          result.pattern
        );
        result.executionStats.graphQueryTime = Date.now() - graphStart;

        if (graphResult) {
          result.graphInsights = graphResult;
          logger.info(
            `[Pipeline] GraphRAG returned ${
              graphResult.nodes?.length || 0
            } relevant nodes`
          );

          // Share graph insights with workflow agent
          if (this.config.shareGraphInsights) {
            await this.sharedMemory.set(
              "graph-insights",
              graphResult,
              "graphrag-orchestrator"
            );
            logger.debug(
              "[Pipeline] Shared graph insights with workflow agent"
            );
          }
        }
      }

      // Step 3: Workflow Generation
      logger.info(
        `[Pipeline] Step 3: Generating workflow from pattern + graph insights`
      );
      const workflowStart = Date.now();
      const workflowResult = await this.runWorkflowGeneration(
        goal,
        result.pattern
      );
      result.executionStats.workflowGenerationTime = Date.now() - workflowStart;

      if (!workflowResult.success) {
        result.errors.push(
          `Workflow generation failed: ${workflowResult.error}`
        );
        return result;
      }

      result.workflow = workflowResult.result?.workflow || null;
      logger.info(
        `[Pipeline] Workflow generated with ${
          result.workflow?.nodes?.length || 0
        } nodes`
      );

      // Step 4: Validation
      logger.info(`[Pipeline] Step 4: Validating generated workflow`);
      const validationStart = Date.now();
      const validationResult = await this.runValidation(goal, result.workflow);
      result.executionStats.validationTime = Date.now() - validationStart;

      if (!validationResult.success) {
        result.errors.push(`Validation failed: ${validationResult.error}`);
        return result;
      }

      result.validationResult = validationResult.result;
      logger.info(`[Pipeline] Validation passed`);

      // Success!
      result.success = true;
      result.executionStats.totalTime = Date.now() - startTime;

      logger.info(
        `[Pipeline] ✅ Complete pipeline succeeded in ${result.executionStats.totalTime}ms`
      );
      return result;
    } catch (error) {
      result.errors.push(
        `Pipeline error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      logger.error("[Pipeline] Pipeline error:", error);
      return result;
    }
  }

  /**
   * Step 1: Run pattern discovery agent
   */
  private async runPatternDiscovery(goal: string): Promise<AgentOutput> {
    try {
      const input: AgentInput = {
        goal,
        context: {
          timestamp: new Date().toISOString(),
          sourceType: "graphrag-orchestrator",
        },
      };

      const output = await this.patternAgent.execute(input);

      if (!output.success) {
        logger.warn("[Pattern Agent] Discovery failed:", output.error);
      }

      return output;
    } catch (error) {
      logger.error("[Pattern Agent] Execution error:", error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: 0,
      };
    }
  }

  /**
   * Step 2: Query GraphRAG for node relationships and pattern insights
   */
  private async queryGraphRAGForPattern(
    goal: string,
    pattern: PatternMatch
  ): Promise<QueryGraphResult | null> {
    if (!this.config.enableGraphRAG) {
      return null;
    }

    try {
      // Build intelligent query combining goal and pattern keywords
      const queryTerms = [
        goal,
        pattern.patternName,
        ...pattern.suggestedNodes.slice(0, 3), // Include first 3 suggested nodes
      ].join(" ");

      logger.debug(`[GraphRAG] Querying: "${queryTerms}"`);

      const result = await this.graphRag.queryGraph({
        text: queryTerms,
        top_k: 8, // Get more nodes for comprehensive understanding
      });

      logger.debug(
        `[GraphRAG] Returned ${result.nodes?.length || 0} nodes and ${
          result.edges?.length || 0
        } edges`
      );
      return result;
    } catch (error) {
      logger.error("[GraphRAG] Query error:", error);
      return null;
    }
  }

  /**
   * Step 3: Run workflow generation agent
   */
  private async runWorkflowGeneration(
    goal: string,
    pattern: PatternMatch | null
  ): Promise<AgentOutput> {
    try {
      const graphInsights = await this.sharedMemory.get("graph-insights");
      const input: AgentInput = {
        goal,
        context: {
          selectedPattern: pattern,
          timestamp: new Date().toISOString(),
          hasGraphInsights: graphInsights !== null,
        },
      };

      const output = await this.workflowAgent.execute(input);

      if (!output.success) {
        logger.warn("[Workflow Agent] Generation failed:", output.error);
      }

      return output;
    } catch (error) {
      logger.error("[Workflow Agent] Execution error:", error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: 0,
      };
    }
  }

  /**
   * Step 4: Run validation agent
   */
  private async runValidation(
    goal: string,
    workflow: any
  ): Promise<AgentOutput> {
    try {
      const input: AgentInput = {
        goal,
        context: {
          workflow,
          timestamp: new Date().toISOString(),
        },
      };

      const output = await this.validatorAgent.execute(input);

      if (!output.success) {
        logger.warn("[Validator Agent] Validation failed:", output.error);
      }

      return output;
    } catch (error) {
      logger.error("[Validator Agent] Execution error:", error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: 0,
      };
    }
  }

  /**
   * Get shared memory for inspection/debugging
   */
  getSharedMemory(): SharedMemory {
    return this.sharedMemory;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    logger.info("[GraphRAG Orchestrator] Cleaning up...");
    // Cleanup any resources if needed
  }
}
