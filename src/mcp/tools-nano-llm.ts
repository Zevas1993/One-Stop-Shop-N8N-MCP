import { ToolDefinition } from '../types';

/**
 * Nano LLM Pipeline Tools
 * Provides access to the complete dual-nano LLM system with intent routing, quality assurance, and learning
 */
export const nanoLLMTools: ToolDefinition[] = [
  {
    name: 'nano_llm_query',
    description: `🤖 INTELLIGENT NODE SEARCH with intent routing, quality assurance, and learning.

This is the primary interface to the dual-nano LLM system which:
1. Understands your query intent (direct lookup, semantic search, workflow pattern, property search, integration, recommendation)
2. Routes to optimal search strategy
3. Validates and assesses result quality (5 dimensions: quantity, relevance, coverage, diversity, metadata)
4. Automatically refines queries up to 3 times if needed
5. Learns from results via reinforcement learning with TD(λ) credit assignment
6. Returns results with quality scores and node performance tiers (gold/silver/bronze/standard)

Use this when you need intelligent node recommendations with guaranteed quality. The system learns and improves over time.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Your question about n8n nodes. Examples: "How do I use the HTTP Request node?", "I need to send data to Slack", "What authentication methods does Google Sheets support?"',
        },
        userExpertise: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'expert'],
          description: 'Your expertise level. Affects result complexity and suggestions. Default: intermediate',
          default: 'intermediate',
        },
        returnTier: {
          type: 'boolean',
          description: 'Include node performance tier (gold/silver/bronze/standard) based on historical usage. Default: true',
          default: true,
        },
        returnMetrics: {
          type: 'boolean',
          description: 'Include system observability metrics and trace ID for debugging. Default: false',
          default: false,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'nano_llm_observability',
    description: `📊 GET SYSTEM OBSERVABILITY: View metrics, traces, and statistics from the nano LLM system.

Returns:
- Prometheus-compatible metrics (counters, gauges, histograms)
- Distributed traces (Jaeger/Zipkin format)
- System statistics (traces collected, nodes valued, strategies evaluated)

Use for monitoring system health, debugging issues, and understanding system behavior.`,
    inputSchema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'boolean',
          description: 'Include Prometheus metrics. Default: true',
          default: true,
        },
        traces: {
          type: 'boolean',
          description: 'Include distributed traces. Default: false (traces can be large)',
          default: false,
        },
        statistics: {
          type: 'boolean',
          description: 'Include system statistics. Default: true',
          default: true,
        },
        format: {
          type: 'string',
          enum: ['jaeger', 'zipkin', 'otlp'],
          description: 'Trace export format. Default: jaeger',
          default: 'jaeger',
        },
      },
    },
  },
  {
    name: 'nano_llm_node_values',
    description: `⭐ GET NODE PERFORMANCE TIERS: View empirically-derived node valuations from the learning system.

Returns performance tiers for n8n nodes based on:
- Success rates from real usage
- Temporal difference (TD) learning credit assignment
- Quality scores from past queries
- Execution efficiency

Tiers: gold (>= 0.80), silver (0.60-0.79), bronze (0.40-0.59), standard (< 0.40)

Use to understand which nodes perform best for your use cases and to build workflows with proven, reliable nodes.`,
    inputSchema: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['gold', 'silver', 'bronze', 'standard', 'all'],
          description: 'Filter by performance tier. "all" returns all nodes. Default: all',
          default: 'all',
        },
        limit: {
          type: 'number',
          description: 'Limit results (default 50)',
          default: 50,
        },
        sortBy: {
          type: 'string',
          enum: ['value_score', 'success_rate', 'quality_score', 'efficiency'],
          description: 'Sort results by this metric. Default: value_score',
          default: 'value_score',
        },
      },
    },
  },
];

/**
 * Export for server integration
 */
export function getNanoLLMTools(): ToolDefinition[] {
  return nanoLLMTools;
}
