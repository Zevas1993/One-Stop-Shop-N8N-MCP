/**
 * Pattern Agent - Workflow Pattern Discovery Specialist
 * Identifies common patterns in user goals and matches them to workflow templates
 */

import { BaseAgent, AgentConfig, AgentInput, AgentOutput } from "./base-agent";
import { SharedMemory } from "../shared-memory";
import { Logger } from "../../utils/logger";
import { LLMAdapterInterface } from "../llm-adapter";

export interface PatternMatch {
  patternId: string;
  patternName: string;
  description: string;
  confidence: number; // 0-1
  matchedKeywords: string[];
  suggestedNodes: string[];
  complexity: "simple" | "medium" | "complex";
}

/**
 * Pattern Agent for discovering workflow patterns
 */
export class PatternAgent extends BaseAgent {
  private patterns: Map<string, WorkflowPattern>;
  private keywordIndex: Map<string, string[]>;
  private patternEmbeddings: Map<string, number[]>; // Pre-computed embeddings for semantic matching

  constructor(sharedMemory: SharedMemory, llmAdapter?: LLMAdapterInterface) {
    const config: AgentConfig = {
      id: "pattern-agent",
      name: "Pattern Discovery Agent",
      description:
        "Identifies workflow patterns matching user goals using semantic similarity",
      role: "pattern-discovery",
      contextBudget: 12000, // 12K tokens for pattern analysis
      timeout: 30000, // 30 seconds max
    };

    super(config, sharedMemory, llmAdapter);
    this.patterns = new Map();
    this.keywordIndex = new Map();
    this.patternEmbeddings = new Map();
  }

  /**
   * Initialize pattern agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.loadPatterns();
    this.buildKeywordIndex();

    // Pre-compute embeddings for patterns if LLM available
    if (this.hasLLMSupport().embedding) {
      await this.precomputePatternEmbeddings();
      this.logger.info(
        "Pattern agent initialized with " +
          this.patterns.size +
          " patterns (semantic matching enabled via nano LLM)"
      );
    } else {
      this.logger.info(
        "Pattern agent initialized with " +
          this.patterns.size +
          " patterns (keyword matching only - no LLM)"
      );
    }
  }

  /**
   * Pre-compute embeddings for all patterns (for fast semantic matching)
   */
  private async precomputePatternEmbeddings(): Promise<void> {
    this.logger.debug("Pre-computing embeddings for patterns...");

    for (const [patternId, pattern] of this.patterns.entries()) {
      // Create rich text representation of pattern
      const patternText = `${pattern.name}: ${
        pattern.description
      }. Keywords: ${pattern.keywords.join(", ")}`;

      const embedding = await this.generateEmbedding(patternText);
      if (embedding) {
        this.patternEmbeddings.set(patternId, embedding);
      }
    }

    this.logger.debug(
      `Pre-computed ${this.patternEmbeddings.size} pattern embeddings`
    );
  }

  /**
   * Execute pattern discovery
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Pattern discovery for goal: ${input.goal}`);

      // Extract keywords from goal
      const keywords = this.extractKeywords(input.goal);
      this.logger.debug(`Extracted keywords: ${keywords.join(", ")}`);

      // Find matching patterns (now async for semantic matching)
      const matches = await this.findMatchingPatterns(keywords);
      this.logger.info(`Found ${matches.length} matching patterns`);
      if (matches.length > 0) {
        this.logger.info(
          `Top match: ${matches[0].patternName} (${matches[0].confidence})`
        );
      }

      if (matches.length === 0) {
        return {
          success: true,
          result: {
            matched: false,
            message: "No matching patterns found",
            suggestedApproach: "Build custom workflow",
          },
          executionTime: Date.now() - startTime,
        };
      }

      // Sort by confidence
      matches.sort((a, b) => b.confidence - a.confidence);

      // Store top match in shared memory
      if (matches.length > 0) {
        const topMatch = matches[0];
        await this.sharedMemory.set(
          "selected-pattern",
          {
            patternId: topMatch.patternId,
            patternName: topMatch.patternName,
            confidence: topMatch.confidence,
            selectedAt: Date.now(),
          },
          this.config.id,
          300000 // 5 minutes TTL
        );

        this.logger.info(
          `Selected pattern: ${topMatch.patternName} (confidence: ${topMatch.confidence})`
        );
      }

      return {
        success: true,
        result: {
          matched: true,
          patterns: matches,
          recommendation: matches[0],
        },
        executionTime: Date.now() - startTime,
        tokensUsed: Math.min(
          keywords.length * 100 + matches.length * 500,
          this.config.contextBudget
        ),
      };
    } catch (error) {
      this.logger.error("Pattern discovery failed", error as Error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract keywords from goal with stemming for plurals
   */
  private extractKeywords(goal: string): string[] {
    const normalized = goal.toLowerCase().trim();
    const words = normalized.split(/\s+/);

    // Filter out common words
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "i",
      "you",
      "it",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "can",
      "must",
    ]);

    return words
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .map((word) => this.stemWord(word)) // Apply stemming for plurals/variants
      .slice(0, 10); // Limit to 10 keywords
  }

  /**
   * Simple stemming to handle plurals and common suffixes
   */
  private stemWord(word: string): string {
    // Remove common plural/verb suffixes
    if (word.endsWith("ies")) {
      return word.slice(0, -3) + "y";
    } else if (word.endsWith("es")) {
      return word.slice(0, -2);
    } else if (word.endsWith("s") && !word.endsWith("ss")) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Find patterns matching keywords
   */
  private async findMatchingPatterns(
    keywords: string[]
  ): Promise<PatternMatch[]> {
    // If LLM available and we have keywords, use semantic matching
    if (this.hasLLMSupport().embedding && keywords.length > 0) {
      const semanticMatches = await this.findMatchingPatternsSemantically(
        keywords.join(" ")
      );
      if (semanticMatches.length > 0) {
        this.logger.debug(
          `Semantic matching found ${semanticMatches.length} patterns`
        );
        return semanticMatches;
      }
      // If semantic matching fails, fall through to keyword matching
      this.logger.debug(
        "Semantic matching returned no results, falling back to keyword matching"
      );
    }

    // Keyword-based matching (fallback or when no LLM)
    const matches: Map<string, PatternMatch> = new Map();

    // Find patterns matching keywords
    for (const keyword of keywords) {
      const patternIds = this.keywordIndex.get(keyword) || [];

      for (const patternId of patternIds) {
        const pattern = this.patterns.get(patternId);
        if (!pattern) continue;

        if (!matches.has(patternId)) {
          matches.set(patternId, {
            patternId,
            patternName: pattern.name,
            description: pattern.description,
            confidence: 0,
            matchedKeywords: [],
            suggestedNodes: pattern.nodes,
            complexity: pattern.complexity,
          });
        }

        const match = matches.get(patternId)!;
        match.confidence = Math.min(1, match.confidence + 0.2);
        match.matchedKeywords.push(keyword);
      }
    }

    // Only return matches with minimum confidence (lowered threshold to catch single-keyword matches)
    return Array.from(matches.values()).filter((m) => m.confidence >= 0.2);
  }

  /**
   * Find matching patterns using semantic similarity
   */
  private async findMatchingPatternsSemantically(
    query: string
  ): Promise<PatternMatch[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) {
        this.logger.debug(
          "Failed to generate query embedding, falling back to keyword matching"
        );
        return [];
      }

      const matches: PatternMatch[] = [];

      // Compare query embedding with pre-computed pattern embeddings
      for (const [patternId, pattern] of this.patterns.entries()) {
        const patternEmbedding = this.patternEmbeddings.get(patternId);
        if (!patternEmbedding) {
          this.logger.debug(`No embedding for pattern ${patternId}, skipping`);
          continue;
        }

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          patternEmbedding
        );

        // Use semantic threshold (0.3 = 30% similarity)
        if (similarity > 0.3) {
          matches.push({
            patternId,
            patternName: pattern.name,
            description: pattern.description,
            confidence: similarity, // Use similarity as confidence score
            matchedKeywords: [], // Not applicable for semantic matching
            suggestedNodes: pattern.nodes,
            complexity: pattern.complexity,
          });
        }
      }

      // Sort by confidence (similarity) descending
      matches.sort((a, b) => b.confidence - a.confidence);

      this.logger.debug(
        `Semantic matching found ${matches.length} patterns with >30% similarity`
      );
      return matches;
    } catch (error) {
      this.logger.warn("Semantic pattern matching failed:", error);
      return [];
    }
  }

  /**
   * Load workflow patterns
   */
  private loadPatterns(): void {
    const patterns: WorkflowPattern[] = [
      {
        id: "slack-notification",
        name: "Slack Notification",
        description: "Send messages to Slack channel",
        keywords: ["slack", "message", "notification", "alert"],
        nodes: ["n8n-nodes-base.slack", "n8n-nodes-base.webhook"],
        complexity: "simple",
      },
      {
        id: "email-workflow",
        name: "Email Workflow",
        description: "Send emails with templates and attachments",
        keywords: ["email", "mail", "send", "message"],
        nodes: ["n8n-nodes-base.sendemail", "n8n-nodes-base.httprequest"],
        complexity: "simple",
      },
      {
        id: "data-transformation",
        name: "Data Transformation",
        description: "Transform and process data",
        keywords: ["transform", "convert", "process", "data", "json"],
        nodes: [
          "n8n-nodes-base.set",
          "n8n-nodes-base.code",
          "n8n-nodes-base.aitransform",
        ],
        complexity: "medium",
      },
      {
        id: "api-integration",
        name: "API Integration",
        description: "Connect to external APIs",
        keywords: ["api", "http", "request", "fetch", "external"],
        nodes: ["n8n-nodes-base.httprequest", "n8n-nodes-base.set"],
        complexity: "medium",
      },
      {
        id: "database-crud",
        name: "Database Operations",
        description: "Create, read, update, delete database records",
        keywords: [
          "database",
          "sql",
          "create",
          "read",
          "update",
          "delete",
          "crud",
        ],
        nodes: [
          "n8n-nodes-base.mysql",
          "n8n-nodes-base.postgres",
          "n8n-nodes-base.set",
        ],
        complexity: "medium",
      },
      {
        id: "conditional-flow",
        name: "Conditional Workflow",
        description: "Branch workflow based on conditions",
        keywords: ["if", "condition", "when", "check", "filter"],
        nodes: [
          "n8n-nodes-base.if",
          "n8n-nodes-base.switch",
          "n8n-nodes-base.split",
        ],
        complexity: "medium",
      },
      {
        id: "error-handling",
        name: "Error Handling",
        description: "Handle errors and retry logic",
        keywords: ["error", "retry", "fail", "catch", "exception"],
        nodes: [
          "n8n-nodes-base.errortrigger",
          "n8n-nodes-base.stopanderror",
          "n8n-nodes-base.if",
        ],
        complexity: "medium",
      },
      {
        id: "scheduling",
        name: "Scheduled Execution",
        description: "Run workflow on schedule",
        keywords: ["schedule", "cron", "daily", "weekly", "hourly", "timer"],
        nodes: ["n8n-nodes-base.scheduletrigger", "n8n-nodes-base.wait"],
        complexity: "simple",
      },
      {
        id: "file-operations",
        name: "File Operations",
        description: "Read, write, and manage files",
        keywords: ["file", "upload", "download", "read", "write", "store"],
        nodes: [
          "n8n-nodes-base.readwritefile",
          "n8n-nodes-base.converttofile",
          "n8n-nodes-base.httprequest",
        ],
        complexity: "medium",
      },
      {
        id: "multi-step-workflow",
        name: "Multi-Step Workflow",
        description: "Complex workflow with multiple steps",
        keywords: ["workflow", "process", "pipeline", "steps", "chain"],
        nodes: [
          "n8n-nodes-base.set",
          "n8n-nodes-base.httprequest",
          "n8n-nodes-base.switch",
        ],
        complexity: "complex",
      },
    ];

    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Build keyword index for fast lookup
   */
  private buildKeywordIndex(): void {
    for (const [patternId, pattern] of this.patterns.entries()) {
      for (const keyword of pattern.keywords) {
        const normalized = keyword.toLowerCase();
        if (!this.keywordIndex.has(normalized)) {
          this.keywordIndex.set(normalized, []);
        }
        this.keywordIndex.get(normalized)!.push(patternId);
      }
    }
  }
}

/**
 * Internal pattern definition
 */
interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  nodes: string[];
  complexity: "simple" | "medium" | "complex";
}
