/**
 * Pattern Agent - Workflow Pattern Discovery Specialist
 * Identifies common patterns in user goals and matches them to workflow templates
 */

import { BaseAgent, AgentConfig, AgentInput, AgentOutput } from "./base-agent";
import { SharedMemory } from "../shared-memory";
import { Logger } from "../../utils/logger";

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

  constructor(sharedMemory: SharedMemory) {
    const config: AgentConfig = {
      id: "pattern-agent",
      name: "Pattern Discovery Agent",
      description: "Identifies workflow patterns matching user goals",
      role: "pattern-discovery",
      contextBudget: 12000, // 12K tokens for pattern analysis
      timeout: 30000, // 30 seconds max
    };

    super(config, sharedMemory);
    this.patterns = new Map();
    this.keywordIndex = new Map();
  }

  /**
   * Initialize pattern agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.loadPatterns();
    this.buildKeywordIndex();

    // Log that API schema knowledge is available for pattern matching
    if (this.apiSchemaKnowledge) {
      this.logger.info(
        "Pattern agent initialized with " +
          this.patterns.size +
          " patterns and official n8n API schema knowledge"
      );
    } else {
      this.logger.info(
        "Pattern agent initialized with " + this.patterns.size + " patterns"
      );
    }
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

      // Find matching patterns
      const matches = this.findMatchingPatterns(keywords);
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
  private findMatchingPatterns(keywords: string[]): PatternMatch[] {
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
