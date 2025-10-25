import axios from 'axios';
import { MCPClient } from '../../../src/utils/mcp-client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MCPClient HTTP mode - malformed JSON-RPC', () => {
  it('throws on non-object response', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: 'not-json' } as any);
    const client = new MCPClient({ serverUrl: 'http://localhost:3000/mcp', connectionType: 'http' });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/Invalid JSON-RPC response/);
  });

  it('throws on missing jsonrpc 2.0', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { result: {} } } as any);
    const client = new MCPClient({ serverUrl: 'http://localhost:3000/mcp', connectionType: 'http' });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/missing jsonrpc 2.0/);
  });

  it('throws on missing result', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { jsonrpc: '2.0' } } as any);
    const client = new MCPClient({ serverUrl: 'http://localhost:3000/mcp', connectionType: 'http' });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/missing result/);
  });
});

