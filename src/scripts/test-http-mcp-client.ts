#!/usr/bin/env ts-node
import { MCPClient } from '../utils/mcp-client';

async function main() {
  const url = process.env.MCP_HTTP_URL || 'http://localhost:3000/mcp';
  const token = process.env.MCP_AUTH_TOKEN || process.env.AUTH_TOKEN || '';
  const client = new MCPClient({ serverUrl: url, authToken: token, connectionType: 'http' });
  await client.connect();
  const tools = await client.listTools();
  console.log('tools/list ->', JSON.stringify(tools));
  // Try a small call if query_graph exists
  const hasQuery = (tools?.tools || []).some((t: any) => t.name === 'query_graph');
  if (hasQuery) {
    const res = await client.callTool('query_graph', { query: 'airtable slack notification', top_k: 3 });
    console.log('tools/call query_graph ->', JSON.stringify(res));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

