import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import axios from 'axios';
import {
  CallToolRequest,
  ListToolsRequest,
  ListResourcesRequest,
  ReadResourceRequest,
  ListPromptsRequest,
  GetPromptRequest,
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface MCPClientConfig {
  serverUrl: string;
  authToken?: string;
  connectionType: 'http' | 'websocket' | 'stdio';
}

export class MCPClient {
  private client: Client;
  private config: MCPClientConfig;
  private connected: boolean = false;
  private httpMode: boolean = false;
  private requestId: number = 1;

  constructor(config: MCPClientConfig) {
    this.config = config;
    this.client = new Client(
      {
        name: 'n8n-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    let transport;
    
    switch (this.config.connectionType) {
      case 'websocket':
        const wsUrl = this.config.serverUrl.replace(/^http/, 'ws');
        transport = new WebSocketClientTransport(new URL(wsUrl));
        break;
      
      case 'stdio':
        // For stdio, the serverUrl should be the command to execute
        const [command, ...args] = this.config.serverUrl.split(' ');
        transport = new StdioClientTransport({
          command,
          args,
        });
        break;
      
      default:
        // HTTP mode: we don't create an SDK transport; we'll use raw JSON-RPC over HTTP
        this.httpMode = true;
        this.connected = true;
        return;
    }

    await this.client.connect(transport);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  async listTools(): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('tools/list');
    }
    return await this.client.request(
      { method: 'tools/list' } as ListToolsRequest,
      ListToolsResultSchema
    );
  }

  async callTool(name: string, args: any): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('tools/call', { name, arguments: args });
    }
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      } as CallToolRequest,
      CallToolResultSchema
    );
  }

  async listResources(): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('resources/list');
    }
    return await this.client.request(
      { method: 'resources/list' } as ListResourcesRequest,
      ListResourcesResultSchema
    );
  }

  async readResource(uri: string): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('resources/read', { uri });
    }
    return await this.client.request(
      {
        method: 'resources/read',
        params: {
          uri,
        },
      } as ReadResourceRequest,
      ReadResourceResultSchema
    );
  }

  async listPrompts(): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('prompts/list');
    }
    return await this.client.request(
      { method: 'prompts/list' } as ListPromptsRequest,
      ListPromptsResultSchema
    );
  }

  async getPrompt(name: string, args?: any): Promise<any> {
    await this.ensureConnected();
    if (this.httpMode) {
      return await this.httpRequest('prompts/get', { name, arguments: args });
    }
    return await this.client.request(
      {
        method: 'prompts/get',
        params: {
          name,
          arguments: args,
        },
      } as GetPromptRequest,
      GetPromptResultSchema
    );
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  private async httpRequest(method: string, params?: any): Promise<any> {
    const id = this.requestId++;
    const url = this.config.serverUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    const response = await axios.post(url, payload, { headers, validateStatus: () => true });
    if (response.status === 401) {
      throw new Error('Unauthorized: invalid or missing AUTH token');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = response.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON-RPC response: not an object');
    }
    if (data.error) {
      const message = data.error?.message || 'Unknown JSON-RPC error';
      throw new Error(message);
    }
    if (!('jsonrpc' in data) || data.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC response: missing jsonrpc 2.0');
    }
    if (!('result' in data)) {
      throw new Error('Invalid JSON-RPC response: missing result');
    }
    return data.result;
  }
}
