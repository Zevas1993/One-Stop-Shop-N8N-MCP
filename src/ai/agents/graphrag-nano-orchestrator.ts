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
import { LLMAdapterInterface, createLLMAdapter } from "../llm-adapter";
import { logger } from "../../utils/logger";
import { getEventBus, EventBus, EventTypes } from "../event-bus";

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
  private eventBus: EventBus | null = null;

  constructor(
    config?: Partial<NanoAgentPipelineConfig>,
    llmAdapter?: LLMAdapterInterface
  ) {
    // Initialize shared memory for agent coordination
    this.sharedMemory = new SharedMemory();

    // Initialize agents with unified LLM adapter
    // If no adapter provided, create one (it will handle availability internally)
    const adapter = llmAdapter || createLLMAdapter();

    this.patternAgent = new PatternAgent(this.sharedMemory, adapter);
    this.workflowAgent = new WorkflowAgent(this.sharedMemory, adapter);
    this.validatorAgent = new ValidatorAgent(this.sharedMemory, adapter);

    // Initialize GraphRAG bridge
    this.graphRag = GraphRAGBridge.get();

    // Set configuration
    this.config = {
      enableGraphRAG: config?.enableGraphRAG ?? true,
      maxAgentRetries: config?.maxAgentRetries ?? 2,
      agentTimeoutMs: config?.agentTimeoutMs ?? 30000,
      shareGraphInsights: config?.shareGraphInsights ?? true,
    };

    // Log LLM availability
    if (adapter && adapter.isAvailable()) {
      logger.info("[GraphRAG Orchestrator] Initialized with LLM support");
    } else {
      logger.info(
        "[GraphRAG Orchestrator] Initialized without LLM support (rule-based fallback)"
      );
    }

    logger.info("[GraphRAG Orchestrator] Configuration:", this.config);
  }

  /**
   * Initialize all agents
   */
  async initialize(): Promise<void> {
    logger.info("[GraphRAG Orchestrator] Initializing agents...");

    // Initialize shared memory first
    await this.sharedMemory.initialize();

    // Initialize event bus
    this.eventBus = await getEventBus();

    await this.patternAgent.initialize();
    await this.workflowAgent.initialize();
    await this.validatorAgent.initialize();
    logger.info("[GraphRAG Orchestrator] All agents initialized");
  }

  /**
   * Execute full pipeline: pattern discovery → graph query → workflow generation → validation
   */
  async executePipeline(
    goal: string,
    context?: Record<string, any>
  ): Promise<PipelineResult> {
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

    // Publish pipeline started event
    if (this.eventBus) {
      await this.eventBus.publish(
        EventTypes.PIPELINE_STARTED,
        {
          goal,
          timestamp: new Date().toISOString(),
          config: this.config,
          context,
        },
        "graphrag-orchestrator"
      );
    }

    try {
      // Step 1: Pattern Discovery
      logger.info(`[Pipeline] Step 1: Pattern discovery for goal: "${goal}"`);
      const patternStart = Date.now();
      const patternResult = await this.runPatternDiscovery(goal, context);
      result.executionStats.patternDiscoveryTime = Date.now() - patternStart;

      if (!patternResult.success) {
        result.errors.push(`Pattern discovery failed: ${patternResult.error}`);
        return result;
      }

      // Extract pattern from agent result (agent returns "patterns", not "matchedPatterns")
      const patterns = patternResult.result?.patterns || [];
      result.pattern = patterns.length > 0 ? patterns[0] : null;
      logger.info(
        `[Pipeline] Pattern discovered: ${
          result.pattern?.patternName || "none"
        }`
      );

      // Publish pattern discovered event
      if (this.eventBus && result.pattern) {
        await this.eventBus.publish(
          EventTypes.PATTERN_DISCOVERED,
          {
            patternId: result.pattern.patternName, // Using name as ID for now
            patternName: result.pattern.patternName,
            description: result.pattern.description,
            confidence: result.pattern.confidence,
            nodeTypes: result.pattern.suggestedNodes,
          },
          "graphrag-orchestrator"
        );
      }

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

      // Publish workflow created event
      if (this.eventBus && result.workflow) {
        await this.eventBus.publish(
          EventTypes.WORKFLOW_CREATED,
          {
            name: result.workflow.name || "Generated Workflow",
            nodeCount: result.workflow.nodes?.length || 0,
            nodeTypes: result.workflow.nodes?.map((n: any) => n.type) || [],
            hasTrigger: result.workflow.nodes?.some(
              (n: any) =>
                n.type.includes("trigger") || n.type.includes("webhook")
            ),
            connectionCount: Object.keys(result.workflow.connections || {})
              .length,
          },
          "graphrag-orchestrator"
        );
      }

      // Step 4: Validation
      logger.info(`[Pipeline] Step 4: Validating generated workflow`);
      const validationStart = Date.now();
      const validationResult = await this.runValidation(goal, result.workflow);
      result.executionStats.validationTime = Date.now() - validationStart;

      if (!validationResult.success) {
        result.errors.push(`Validation failed: ${validationResult.error}`);

        // Publish validation failed event
        if (this.eventBus) {
          await this.eventBus.publish(
            EventTypes.VALIDATION_FAILED,
            {
              workflowName: result.workflow?.name || "Unknown",
              errors: [{ message: validationResult.error }],
              failedLayer: "validation-agent",
            },
            "graphrag-orchestrator"
          );
        }

        return result;
      }

      result.validationResult = validationResult.result;
      logger.info(`[Pipeline] Validation passed`);

      // Publish validation completed event
      if (this.eventBus) {
        await this.eventBus.publish(
          EventTypes.VALIDATION_COMPLETED,
          {
            workflowName: result.workflow?.name || "Unknown",
            valid: true,
            nodeCount: result.workflow?.nodes?.length || 0,
            passedLayers: ["schema", "nodes", "connections", "semantic"],
          },
          "graphrag-orchestrator"
        );
      }

      // Success!
      result.success = true;
      result.executionStats.totalTime = Date.now() - startTime;

      // Publish pipeline completed event
      if (this.eventBus) {
        await this.eventBus.publish(
          EventTypes.PIPELINE_COMPLETED,
          {
            goal,
            success: true,
            workflowName: result.workflow?.name || "Unknown",
            nodeCount: result.workflow?.nodes?.length || 0,
            executionStats: result.executionStats,
          },
          "graphrag-orchestrator"
        );
      }

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
      result.executionStats.totalTime = Date.now() - startTime;

      // Publish pipeline failed event
      if (this.eventBus) {
        await this.eventBus.publish(
          EventTypes.PIPELINE_FAILED,
          {
            goal,
            errors: result.errors,
            failedAt: "exception",
            executionStats: result.executionStats,
          },
          "graphrag-orchestrator"
        );
      }

      logger.error("[Pipeline] Pipeline error:", error);
      return result;
    }
  }

  /**
   * Step 1: Run pattern discovery agent
   */
  private async runPatternDiscovery(
    goal: string,
    context?: Record<string, any>
  ): Promise<AgentOutput> {
    try {
      const input: AgentInput = {
        goal,
        context: {
          timestamp: new Date().toISOString(),
          sourceType: "graphrag-orchestrator",
          ...context,
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
