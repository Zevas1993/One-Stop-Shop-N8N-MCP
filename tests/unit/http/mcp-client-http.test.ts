import axios from 'axios';
import { MCPClient } from '../../../src/utils/mcp-client';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MCPClient HTTP mode', () => {
  it('returns error on 401 unauthorized', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 401, data: {} } as any);
    const client = new MCPClient({ serverUrl: 'http://localhost:3000/mcp', connectionType: 'http', authToken: '' });
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/Unauthorized/);
  });

  it('returns result when backend returns success', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { jsonrpc: '2.0', result: { tools: [] }, id: 1 } } as any);
    const client = new MCPClient({ serverUrl: 'http://localhost:3000/mcp', connectionType: 'http', authToken: 'token' });
    await client.connect();
    const res = await client.listTools();
    expect(res).toHaveProperty('tools');
  });
});

