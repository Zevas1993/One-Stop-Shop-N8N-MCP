/**
 * GraphRAG Orchestrator - Multi-Agent Workflow Orchestration
 * Coordinates Pattern Agent → Workflow Agent → Validator Agent pipeline
 */

import { PatternAgent } from './agents/pattern-agent';
import { WorkflowAgent } from './agents/workflow-agent';
import { ValidatorAgent } from './agents/validator-agent';
import { SharedMemory, getSharedMemory } from './shared-memory';
import { Logger } from '../utils/logger';

export interface OrchestrationRequest {
  goal: string;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
  allowRetry?: boolean;
  maxRetries?: number;
}

export interface OrchestrationResult {
  success: boolean;
  goal: string;
  workflow?: any;
  validationResult?: any;
  executionTime: number;
  tokensUsed: number;
  stages: StageResult[];
  errors?: string[];
}

export interface StageResult {
  stage: 'pattern-discovery' | 'workflow-generation' | 'validation';
  success: boolean;
  executionTime: number;
  tokensUsed: number;
  result?: any;
  error?: string;
}

/**
 * Orchestrator for managing multi-agent workflow
 */
export class GraphRAGOrchestrator {
  private sharedMemory: SharedMemory | null = null;
  private patternAgent: PatternAgent | null = null;
  private workflowAgent: WorkflowAgent | null = null;
  private validatorAgent: ValidatorAgent | null = null;
  private logger: Logger;
  private initialized = false;

  constructor() {
    this.logger = new Logger({ prefix: 'GraphRAGOrchestrator' });
  }

  /**
   * Initialize orchestrator with all agents
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing GraphRAG Orchestrator');

      // Initialize shared memory
      this.sharedMemory = await getSharedMemory();
      this.logger.info('Shared memory initialized');

      // Initialize agents
      this.patternAgent = new PatternAgent(this.sharedMemory);
      await this.patternAgent.initialize();
      this.logger.info('Pattern Agent initialized');

      this.workflowAgent = new WorkflowAgent(this.sharedMemory);
      await this.workflowAgent.initialize();
      this.logger.info('Workflow Agent initialized');

      this.validatorAgent = new ValidatorAgent(this.sharedMemory);
      await this.validatorAgent.initialize();
      this.logger.info('Validator Agent initialized');

      this.initialized = true;
      this.logger.info('GraphRAG Orchestrator initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize GraphRAG Orchestrator', error as Error);
      throw error;
    }
  }

  /**
   * Execute full orchestration pipeline
   */
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const errors: string[] = [];
    let totalTokensUsed = 0;

    try {
      if (!this.initialized) {
        throw new Error('Orchestrator not initialized. Call initialize() first.');
      }

      this.logger.info(`Starting orchestration for goal: ${request.goal}`);

      // Stage 1: Pattern Discovery
      const patternResult = await this.executePatternStage(request);
      stages.push(patternResult);
      totalTokensUsed += patternResult.tokensUsed;

      if (!patternResult.success) {
        errors.push(`Pattern discovery failed: ${patternResult.error}`);
        return {
          success: false,
          goal: request.goal,
          executionTime: Date.now() - startTime,
          tokensUsed: totalTokensUsed,
          stages,
          errors,
        };
      }

      this.logger.info('Pattern discovery completed successfully');

      // Stage 2: Workflow Generation
      const workflowResult = await this.executeWorkflowStage(request);
      stages.push(workflowResult);
      totalTokensUsed += workflowResult.tokensUsed;

      if (!workflowResult.success) {
        errors.push(`Workflow generation failed: ${workflowResult.error}`);
        return {
          success: false,
          goal: request.goal,
          executionTime: Date.now() - startTime,
          tokensUsed: totalTokensUsed,
          stages,
          errors,
        };
      }

      this.logger.info('Workflow generation completed successfully');

      // Stage 3: Validation
      const validationResult = await this.executeValidationStage(request);
      stages.push(validationResult);
      totalTokensUsed += validationResult.tokensUsed;

      // Check validation result
      if (!validationResult.success) {
        errors.push(`Validation failed: ${validationResult.error}`);

        // Determine if we should retry
        const shouldRetry = request.allowRetry !== false && (request.maxRetries || 0) > 0;

        if (shouldRetry) {
          this.logger.info('Validation failed, attempting retry with modified goal');
          // In a production system, we would modify the goal and retry
          // For now, we'll return the failure
        }

        return {
          success: false,
          goal: request.goal,
          executionTime: Date.now() - startTime,
          tokensUsed: totalTokensUsed,
          stages,
          errors,
        };
      }

      // Retrieve final workflow from shared memory
      const workflowData = await this.sharedMemory!.get('generated-workflow');
      const finalWorkflow = workflowData?.workflow;

      this.logger.info(`Orchestration completed successfully in ${Date.now() - startTime}ms`);

      return {
        success: true,
        goal: request.goal,
        workflow: finalWorkflow,
        validationResult: validationResult.result?.validationResult,
        executionTime: Date.now() - startTime,
        tokensUsed: totalTokensUsed,
        stages,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Orchestration failed', error as Error);
      errors.push(errorMessage);

      return {
        success: false,
        goal: request.goal,
        executionTime: Date.now() - startTime,
        tokensUsed: totalTokensUsed,
        stages,
        errors,
      };
    }
  }

  /**
   * Execute pattern discovery stage
   */
  private async executePatternStage(request: OrchestrationRequest): Promise<StageResult> {
    const startTime = Date.now();

    try {
      if (!this.patternAgent) {
        throw new Error('Pattern Agent not initialized');
      }

      this.logger.debug('Executing pattern discovery stage');

      const result = await this.patternAgent.execute({
        goal: request.goal,
        context: request.context,
        metadata: request.metadata,
      });

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          stage: 'pattern-discovery',
          success: false,
          executionTime,
          tokensUsed: result.tokensUsed || 0,
          error: result.error,
        };
      }

      return {
        stage: 'pattern-discovery',
        success: true,
        executionTime,
        tokensUsed: result.tokensUsed || 0,
        result: result.result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Pattern discovery stage failed', error as Error);

      return {
        stage: 'pattern-discovery',
        success: false,
        executionTime: Date.now() - startTime,
        tokensUsed: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute workflow generation stage
   */
  private async executeWorkflowStage(request: OrchestrationRequest): Promise<StageResult> {
    const startTime = Date.now();

    try {
      if (!this.workflowAgent) {
        throw new Error('Workflow Agent not initialized');
      }

      this.logger.debug('Executing workflow generation stage');

      const result = await this.workflowAgent.execute({
        goal: request.goal,
        context: request.context,
        metadata: request.metadata,
      });

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          stage: 'workflow-generation',
          success: false,
          executionTime,
          tokensUsed: result.tokensUsed || 0,
          error: result.error,
        };
      }

      return {
        stage: 'workflow-generation',
        success: true,
        executionTime,
        tokensUsed: result.tokensUsed || 0,
        result: result.result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Workflow generation stage failed', error as Error);

      return {
        stage: 'workflow-generation',
        success: false,
        executionTime: Date.now() - startTime,
        tokensUsed: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute validation stage
   */
  private async executeValidationStage(request: OrchestrationRequest): Promise<StageResult> {
    const startTime = Date.now();

    try {
      if (!this.validatorAgent) {
        throw new Error('Validator Agent not initialized');
      }

      this.logger.debug('Executing validation stage');

      const result = await this.validatorAgent.execute({
        goal: request.goal,
        context: request.context,
        metadata: request.metadata,
      });

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          stage: 'validation',
          success: false,
          executionTime,
          tokensUsed: result.tokensUsed || 0,
          error: result.error,
        };
      }

      // Check if validation was actually successful (not just execution success)
      const validationResult = result.result?.validationResult;

      if (validationResult && !validationResult.valid) {
        const errorSummary = `Validation found ${validationResult.errors.length} error(s) and ${validationResult.warnings.length} warning(s)`;
        return {
          stage: 'validation',
          success: false,
          executionTime,
          tokensUsed: result.tokensUsed || 0,
          error: errorSummary,
          result: result.result,
        };
      }

      return {
        stage: 'validation',
        success: true,
        executionTime,
        tokensUsed: result.tokensUsed || 0,
        result: result.result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Validation stage failed', error as Error);

      return {
        stage: 'validation',
        success: false,
        executionTime: Date.now() - startTime,
        tokensUsed: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get orchestration status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    agentsReady: boolean;
    sharedMemoryStats?: any;
  }> {
    try {
      const stats = await this.sharedMemory?.getStats();

      return {
        initialized: this.initialized,
        agentsReady: this.patternAgent !== null && this.workflowAgent !== null && this.validatorAgent !== null,
        sharedMemoryStats: stats,
      };
    } catch (error) {
      this.logger.error('Failed to get orchestrator status', error as Error);
      return {
        initialized: this.initialized,
        agentsReady: false,
      };
    }
  }

  /**
   * Clear orchestration state from shared memory
   */
  async clearState(): Promise<void> {
    try {
      if (!this.sharedMemory) {
        throw new Error('Shared memory not initialized');
      }

      this.logger.info('Clearing orchestration state');

      await this.sharedMemory.delete('selected-pattern', 'orchestrator');
      await this.sharedMemory.delete('generated-workflow', 'orchestrator');
      await this.sharedMemory.delete('workflow-validation-result', 'orchestrator');

      this.logger.info('Orchestration state cleared');
    } catch (error) {
      this.logger.error('Failed to clear orchestration state', error as Error);
      throw error;
    }
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down GraphRAG Orchestrator');

      if (this.sharedMemory) {
        await this.sharedMemory.close();
        this.sharedMemory = null;
      }

      this.patternAgent = null;
      this.workflowAgent = null;
      this.validatorAgent = null;
      this.initialized = false;

      this.logger.info('GraphRAG Orchestrator shutdown complete');
    } catch (error) {
      this.logger.error('Error during orchestrator shutdown', error as Error);
      throw error;
    }
  }
}

/**
 * Create and initialize a new orchestrator
 */
export async function createOrchestrator(): Promise<GraphRAGOrchestrator> {
  const orchestrator = new GraphRAGOrchestrator();
  await orchestrator.initialize();
  return orchestrator;
}
