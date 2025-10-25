import { ToolDefinition } from '../types';
import { GraphRAGBridge, QueryGraphResult } from '../ai/graphrag-bridge';

export const graphRagTools: ToolDefinition[] = [
  {
    name: 'query_graph',
    description:
      'Graph-based retrieval from the locally cached n8n knowledge graph. Returns 3–5 relevant nodes, edges, and a concise subgraph summary (<1K tokens). Always uses the local cache; no live n8n calls.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query, e.g., "airtable high priority slack notification"',
        },
        top_k: {
          type: 'number',
          description: 'Max number of nodes to return (default 5).',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
];

export async function handleQueryGraph(args: { query: string; top_k?: number }): Promise<QueryGraphResult> {
  const bridge = GraphRAGBridge.get();
  const result = await bridge.queryGraph({ text: args.query, top_k: args.top_k });
  return result;
}

