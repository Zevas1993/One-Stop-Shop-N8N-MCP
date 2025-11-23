/**
 * Base Agent Class for Multi-Agent System
 * Provides common functionality for all specialized agents
 */

import { SharedMemory } from '../shared-memory';
import { Logger } from '../../utils/logger';
import { APISchemaLoader } from '../knowledge/api-schema-loader';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  role: string;
  contextBudget: number; // Max tokens for this agent
  timeout: number; // Max execution time in ms
}

export interface AgentInput {
  goal: string;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  success: boolean;
  result: any;
  error?: string;
  executionTime: number;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface AgentTask {
  id: string;
  agentId: string;
  input: AgentInput;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: AgentOutput;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Base class for all agents
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected sharedMemory: SharedMemory;
  protected logger: Logger;
  protected isRunning = false;
  protected apiSchemaLoader: APISchemaLoader;
  protected apiSchemaKnowledge: string = '';

  constructor(config: AgentConfig, sharedMemory: SharedMemory) {
    this.config = config;
    this.sharedMemory = sharedMemory;
    this.logger = new Logger({ prefix: `Agent[${config.id}]` });
    this.apiSchemaLoader = APISchemaLoader.getInstance();
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing agent: ${this.config.name}`);

    // Load API schema knowledge
    try {
      this.apiSchemaKnowledge = await this.apiSchemaLoader.getAgentKnowledge();
      this.logger.debug('API schema knowledge loaded successfully');
    } catch (error) {
      this.logger.warn('Failed to load API schema knowledge', error);
      // Continue with empty knowledge - fallback will be used
    }

    // Subclasses can override for custom initialization
  }

  /**
   * Execute the agent's main task
   * Subclasses must implement this
   */
  abstract execute(input: AgentInput): Promise<AgentOutput>;

  /**
   * Process input with timeout and error handling
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    if (this.isRunning) {
      return {
        success: false,
        result: null,
        error: `Agent ${this.config.id} is already running`,
        executionTime: 0,
      };
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      this.logger.debug(`Processing input: ${JSON.stringify(input).substring(0, 100)}`);

      // Create task record
      const taskId = this.generateTaskId();
      const task: AgentTask = {
        id: taskId,
        agentId: this.config.id,
        input,
        status: 'running',
        createdAt: startTime,
        startedAt: Date.now(),
      };

      await this.sharedMemory.set(`task:${taskId}`, task, this.config.id);

      // Execute with timeout
      const output = await Promise.race([
        this.execute(input),
        this.createTimeout(this.config.timeout),
      ]);

      const executionTime = Date.now() - startTime;

      // Update task record
      task.status = 'completed';
      task.output = output;
      task.completedAt = Date.now();
      await this.sharedMemory.set(`task:${taskId}`, task, this.config.id);

      this.logger.info(`Task completed: ${taskId} (${executionTime}ms)`);

      return output;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Execution failed: ${errorMessage}`);

      return {
        success: false,
        result: null,
        error: errorMessage,
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get shared memory
   */
  protected getSharedMemory(): SharedMemory {
    return this.sharedMemory;
  }

  /**
   * Read from shared memory
   */
  protected async readMemory<T = any>(key: string): Promise<T | null> {
    return this.sharedMemory.get<T>(key);
  }

  /**
   * Write to shared memory
   */
  protected async writeMemory<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    return this.sharedMemory.set(key, value, this.config.id, ttl);
  }

  /**
   * Delete from shared memory
   */
  protected async deleteMemory(key: string): Promise<boolean> {
    return this.sharedMemory.delete(key, this.config.id);
  }

  /**
   * Query shared memory
   */
  protected async queryMemory(pattern?: string, maxAge?: number) {
    return this.sharedMemory.query({
      pattern,
      agentId: this.config.id,
      maxAge,
    });
  }

  /**
   * Get all memory for this agent
   */
  protected async getAgentMemory(): Promise<Record<string, any>> {
    return this.sharedMemory.getAgentMemory(this.config.id);
  }

  /**
   * Clear all memory for this agent
   */
  protected async clearAgentMemory(): Promise<number> {
    return this.sharedMemory.clearAgentMemory(this.config.id);
  }

  /**
   * Log debug message
   */
  protected debug(message: string, data?: any): void {
    this.logger.debug(message, data);
  }

  /**
   * Log info message
   */
  protected info(message: string, data?: any): void {
    this.logger.info(message, data);
  }

  /**
   * Log warning message
   */
  protected warn(message: string, data?: any): void {
    this.logger.warn(message, data);
  }

  /**
   * Log error message
   */
  protected error(message: string, err?: Error | any): void {
    this.logger.error(message, err);
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `${this.config.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent execution timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info(`Shutting down agent: ${this.config.name}`);
    // Subclasses can override for custom cleanup
  }

  /**
   * Get context-specific API schema guidance
   */
  protected async getApiGuidance(context: string): Promise<string> {
    try {
      return await this.apiSchemaLoader.getGuidanceFor(context);
    } catch (error) {
      this.logger.warn(`Failed to get API guidance for context: ${context}`, error);
      return '';
    }
  }

  /**
   * Get full API schema knowledge for use in prompts
   */
  protected getApiSchemaKnowledge(): string {
    return this.apiSchemaKnowledge;
  }
}

/**
 * Agent registry for managing multiple agents
 */
export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();
  private logger = new Logger({ prefix: 'AgentRegistry' });

  /**
   * Register an agent
   */
  register(agent: BaseAgent): void {
    const config = agent.getConfig();
    this.agents.set(config.id, agent);
    this.logger.info(`Registered agent: ${config.id} (${config.name})`);
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by role
   */
  getAgentsByRole(role: string): BaseAgent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.getConfig().role === role);
  }

  /**
   * Initialize all agents
   */
  async initializeAll(): Promise<void> {
    this.logger.info(`Initializing ${this.agents.size} agents`);

    for (const agent of this.agents.values()) {
      await agent.initialize();
    }

    this.logger.info('All agents initialized');
  }

  /**
   * Shutdown all agents
   */
  async shutdownAll(): Promise<void> {
    this.logger.info('Shutting down all agents');

    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }

    this.logger.info('All agents shut down');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    agents: Array<{
      id: string;
      name: string;
      role: string;
      contextBudget: number;
    }>;
  } {
    return {
      totalAgents: this.agents.size,
      agents: Array.from(this.agents.values()).map((agent) => {
        const config = agent.getConfig();
        return {
          id: config.id,
          name: config.name,
          role: config.role,
          contextBudget: config.contextBudget,
        };
      }),
    };
  }
}
