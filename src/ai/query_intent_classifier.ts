/**
 * Query Intent Classifier
 * Deep intent classification for edge cases and multi-label classification
 * Provides confidence scoring and alternative intent suggestions
 */

import { logger } from '../utils/logger';
import { QueryIntent } from './query_router';

/**
 * Detailed intent classification result
 */
export interface ClassificationResult {
  primaryIntent: QueryIntent;
  primaryConfidence: number;
  secondaryIntents: Array<{
    intent: QueryIntent;
    confidence: number;
  }>;
  features: ClassificationFeatures;
  reasoning: string;
}

/**
 * Classification features extracted from query
 */
export interface ClassificationFeatures {
  queryLength: number;
  hasNounPhrases: boolean;
  hasVerbPhrases: boolean;
  hasQuestionMarkS: boolean;
  hasActionWords: boolean;
  hasTechnicalTerms: boolean;
  mentionedServices: string[];
  mentionedNodes: string[];
}

/**
 * Intent classifier context (for iterative refinement)
 */
export interface ClassificationContext {
  conversationHistory: string[];
  previousIntents: QueryIntent[];
  userProfile?: {
    expertise: 'beginner' | 'intermediate' | 'expert';
    preferredNodes: string[];
  };
}

/**
 * Query Intent Classifier - Deep classification with multi-label support
 */
export class QueryIntentClassifier {
  private technicalTerms: Set<string> = new Set();
  private actionVerbs: Set<string> = new Set();
  private knownNodes: Map<string, string> = new Map(); // node name -> category
  private knownServices: Set<string> = new Set();

  constructor() {
    this.initializeTechnicalTerms();
    this.initializeActionVerbs();
    this.initializeKnownNodes();
    this.initializeKnownServices();

    logger.info('[IntentClassifier] Initialized with deep classification capabilities');
  }

  /**
   * Initialize technical terms
   */
  private initializeTechnicalTerms(): void {
    this.technicalTerms = new Set([
      'api',
      'webhook',
      'payload',
      'authentication',
      'token',
      'bearer',
      'oauth',
      'json',
      'xml',
      'regex',
      'xpath',
      'sql',
      'database',
      'query',
      'response',
      'request',
      'header',
      'parameter',
      'expression',
      'javascript',
      'typescript',
      'condition',
      'loop',
      'iteration',
      'variable',
      'mapping',
      'transform',
      'filter',
      'reduce',
      'aggregate',
      'join',
      'merge',
      'split',
      'concatenate',
    ]);
  }

  /**
   * Initialize action verbs
   */
  private initializeActionVerbs(): void {
    this.actionVerbs = new Set([
      'send',
      'receive',
      'fetch',
      'get',
      'post',
      'put',
      'delete',
      'update',
      'create',
      'modify',
      'transform',
      'process',
      'validate',
      'convert',
      'parse',
      'extract',
      'filter',
      'map',
      'sort',
      'group',
      'aggregate',
      'merge',
      'split',
      'join',
      'connect',
      'integrate',
      'sync',
      'publish',
      'subscribe',
      'trigger',
      'execute',
      'run',
      'schedule',
    ]);
  }

  /**
   * Initialize known n8n nodes
   */
  private initializeKnownNodes(): void {
    this.knownNodes = new Map([
      // HTTP
      ['http', 'http'],
      ['http request', 'http'],
      ['webhook', 'webhook'],

      // Data
      ['spreadsheet', 'spreadsheet'],
      ['google sheets', 'spreadsheet'],
      ['csv', 'data-format'],
      ['json', 'data-format'],
      ['xml', 'data-format'],

      // Communication
      ['slack', 'communication'],
      ['email', 'communication'],
      ['gmail', 'communication'],
      ['sendgrid', 'communication'],
      ['mailchimp', 'communication'],
      ['teams', 'communication'],
      ['discord', 'communication'],

      // CRM
      ['salesforce', 'crm'],
      ['hubspot', 'crm'],

      // Database
      ['mysql', 'database'],
      ['postgres', 'database'],
      ['mongodb', 'database'],
      ['sqlite', 'database'],

      // Code
      ['code', 'code'],
      ['function', 'code'],
      ['javascript', 'code'],
      ['typescript', 'code'],

      // Control Flow
      ['if', 'control'],
      ['switch', 'control'],
      ['loop', 'control'],
      ['merge', 'control'],

      // Schedule
      ['schedule', 'schedule'],
      ['cron', 'schedule'],
      ['interval', 'schedule'],
    ]);
  }

  /**
   * Initialize known services
   */
  private initializeKnownServices(): void {
    this.knownServices = new Set([
      'google',
      'slack',
      'salesforce',
      'hubspot',
      'stripe',
      'paypal',
      'github',
      'gitlab',
      'aws',
      'azure',
      'gcp',
      'twilio',
      'sendgrid',
      'mailchimp',
      'shopify',
      'wordpress',
      'discord',
      'teams',
      'notion',
      'airtable',
    ]);
  }

  /**
   * Classify query with deep analysis
   */
  async classify(
    query: string,
    context?: ClassificationContext
  ): Promise<ClassificationResult> {
    logger.debug('[IntentClassifier] Starting deep classification for query:', query.substring(0, 100));

    // Extract features
    const features = this.extractFeatures(query);

    // Score each intent
    const intentScores = this.scoreIntents(query, features, context);

    // Sort by confidence
    const sortedIntents = Array.from(intentScores.entries())
      .map(([intent, score]) => ({ intent, score }))
      .sort((a, b) => b.score - a.score);

    const primaryIntent = sortedIntents[0];
    const secondaryIntents = sortedIntents.slice(1, 3).filter((x) => x.score > 0.2);

    const reasoning = this.generateReasoning(query, features, primaryIntent, context);

    logger.debug('[IntentClassifier] Classification complete:', {
      primaryIntent: primaryIntent.intent,
      primaryConfidence: primaryIntent.score,
      secondaryCount: secondaryIntents.length,
    });

    return {
      primaryIntent: primaryIntent.intent,
      primaryConfidence: primaryIntent.score,
      secondaryIntents: secondaryIntents.map((x) => ({
        intent: x.intent,
        confidence: x.score,
      })),
      features,
      reasoning,
    };
  }

  /**
   * Extract features from query
   */
  private extractFeatures(query: string): ClassificationFeatures {
    const lowerQuery = query.toLowerCase();
    const words = query.split(/\s+/);

    // Check for mentioned services
    const mentionedServices: string[] = [];
    for (const service of this.knownServices) {
      if (lowerQuery.includes(service)) {
        mentionedServices.push(service);
      }
    }

    // Check for mentioned nodes
    const mentionedNodes: string[] = [];
    for (const [node, _category] of this.knownNodes) {
      if (lowerQuery.includes(node.toLowerCase())) {
        mentionedNodes.push(node);
      }
    }

    // Count features
    let technicalCount = 0;
    for (const word of words) {
      if (this.technicalTerms.has(word.toLowerCase())) {
        technicalCount++;
      }
    }

    let actionCount = 0;
    for (const word of words) {
      if (this.actionVerbs.has(word.toLowerCase())) {
        actionCount++;
      }
    }

    return {
      queryLength: query.length,
      hasNounPhrases: this.detectNounPhrases(query),
      hasVerbPhrases: this.detectVerbPhrases(query),
      hasQuestionMarkS: query.includes('?'),
      hasActionWords: actionCount > 0,
      hasTechnicalTerms: technicalCount > 0,
      mentionedServices,
      mentionedNodes,
    };
  }

  /**
   * Detect noun phrases (simple heuristic)
   */
  private detectNounPhrases(query: string): boolean {
    // Look for common noun phrase patterns
    const nounPhrasePatterns = [
      /\b(the|a|an)\s+\w+\s+\w+/i,
      /\w+\s+(node|trigger|action|workflow|automation)/i,
    ];

    return nounPhrasePatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Detect verb phrases (simple heuristic)
   */
  private detectVerbPhrases(query: string): boolean {
    // Look for common verb phrase patterns
    const verbPatterns = [/\b(how\s+to|can\s+i|i\s+want\s+to|need\s+to)\b/i, /\b(send|receive|fetch|post|get|create|update)\s+\w+/i];

    return verbPatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Score each intent based on features
   */
  private scoreIntents(
    query: string,
    features: ClassificationFeatures,
    context?: ClassificationContext
  ): Map<QueryIntent, number> {
    const scores = new Map<QueryIntent, number>();
    const lowerQuery = query.toLowerCase();

    // Direct Node Lookup
    let directScore = 0;
    if (features.mentionedNodes.length > 0) directScore += 0.8;
    if (/\b(use|configure|setup|how.*node)\b/i.test(query)) directScore += 0.3;
    if (features.queryLength < 100) directScore += 0.1; // Short, specific queries
    if (context?.previousIntents.includes(QueryIntent.DIRECT_NODE_LOOKUP)) directScore += 0.1;
    scores.set(QueryIntent.DIRECT_NODE_LOOKUP, Math.min(directScore, 1));

    // Semantic Query
    let semanticScore = 0;
    if (features.hasActionWords && !features.mentionedNodes.length) semanticScore += 0.5;
    if (features.hasTechnicalTerms) semanticScore += 0.3;
    if (/\b(how|way|can|should)\b.*\b(to|do|send|receive|process)\b/i.test(query)) semanticScore += 0.4;
    scores.set(QueryIntent.SEMANTIC_QUERY, Math.min(semanticScore, 1));

    // Workflow Pattern
    let workflowScore = 0;
    if (/\b(workflow|automation|notification|integration|pipeline)\b/i.test(query)) workflowScore += 0.6;
    if (/\b(from|to|trigger|when)\b.*\b(send|notify|alert)\b/i.test(query)) workflowScore += 0.5;
    if (features.mentionedServices.length > 0) workflowScore += 0.3;
    scores.set(QueryIntent.WORKFLOW_PATTERN, Math.min(workflowScore, 1));

    // Property Search
    let propertyScore = 0;
    if (/\b(property|option|setting|parameter|field|authentication|config)\b/i.test(query)) propertyScore += 0.6;
    if (/\b(what|which).*\b(setting|option|field)\b/i.test(query)) propertyScore += 0.4;
    if (features.mentionedNodes.length > 0 && propertyScore > 0) propertyScore += 0.2;
    scores.set(QueryIntent.PROPERTY_SEARCH, Math.min(propertyScore, 1));

    // Integration Task
    let integrationScore = 0;
    if (features.mentionedServices.length > 0) integrationScore += 0.7;
    if (/\b(connect|integrate|sync|authenticate|api)\b/i.test(query)) integrationScore += 0.5;
    if (/\b(access|permission|token|api[_-]?key)\b/i.test(query)) integrationScore += 0.4;
    scores.set(QueryIntent.INTEGRATION_TASK, Math.min(integrationScore, 1));

    // Recommendation
    let recommendationScore = 0;
    if (/\b(best|good|better|right|recommended|compare|difference)\b/i.test(query)) recommendationScore += 0.6;
    if (/\b(csv|json|database|spreadsheet|file).*\b(read|write|process)\b/i.test(query)) recommendationScore += 0.5;
    if (features.queryLength > 150) recommendationScore += 0.1; // Longer, complex queries
    scores.set(QueryIntent.RECOMMENDATION, Math.min(recommendationScore, 1));

    // Context-based boost
    if (context?.previousIntents.length) {
      const lastIntent = context.previousIntents[context.previousIntents.length - 1];
      const currentScore = scores.get(lastIntent) || 0;
      scores.set(lastIntent, Math.min(currentScore + 0.15, 1)); // Small boost for continuity
    }

    return scores;
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    query: string,
    features: ClassificationFeatures,
    primary: { intent: QueryIntent; score: number },
    context?: ClassificationContext
  ): string {
    const reasons: string[] = [];

    if (features.mentionedNodes.length > 0) {
      reasons.push(`Found node references: ${features.mentionedNodes.join(', ')}`);
    }

    if (features.mentionedServices.length > 0) {
      reasons.push(`Service integrations mentioned: ${features.mentionedServices.join(', ')}`);
    }

    if (features.hasActionWords) {
      reasons.push('Query contains action-oriented language');
    }

    if (features.hasTechnicalTerms) {
      reasons.push('Query contains technical terminology');
    }

    if (features.hasQuestionMarkS) {
      reasons.push('Query is phrased as a question');
    }

    if (context?.previousIntents.length) {
      reasons.push(`Following previous intent: ${context.previousIntents[context.previousIntents.length - 1]}`);
    }

    reasons.push(`High confidence: ${(primary.score * 100).toFixed(0)}%`);

    return reasons.join('; ');
  }

  /**
   * Analyze query for specific node-related information
   */
  analyzeNodeQuery(query: string): {
    targetNode?: string;
    targetProperty?: string;
    targetAction?: string;
  } {
    const lowerQuery = query.toLowerCase();
    let targetNode: string | undefined;
    let targetProperty: string | undefined;
    let targetAction: string | undefined;

    // Find target node
    for (const [node, _category] of this.knownNodes) {
      if (lowerQuery.includes(node.toLowerCase())) {
        targetNode = node;
        break;
      }
    }

    // Find target property
    const propertyPatterns = [
      /\b(property|option|setting|parameter|field|config)[\s:]+([\w\-]+)/i,
      /\b(authentication|auth|api[_-]?key|token|credential)\b/i,
    ];

    for (const pattern of propertyPatterns) {
      const match = query.match(pattern);
      if (match) {
        targetProperty = match[match.length - 1];
        break;
      }
    }

    // Find target action
    for (const verb of this.actionVerbs) {
      if (lowerQuery.includes(verb)) {
        targetAction = verb;
        break;
      }
    }

    return { targetNode, targetProperty, targetAction };
  }

  /**
   * Get classifier configuration
   */
  getClassifierConfig(): {
    technicalTermsCount: number;
    actionVerbsCount: number;
    knownNodesCount: number;
    knownServicesCount: number;
  } {
    return {
      technicalTermsCount: this.technicalTerms.size,
      actionVerbsCount: this.actionVerbs.size,
      knownNodesCount: this.knownNodes.size,
      knownServicesCount: this.knownServices.size,
    };
  }
}

/**
 * Factory function to create intent classifier
 */
export function createIntentClassifier(): QueryIntentClassifier {
  return new QueryIntentClassifier();
}
