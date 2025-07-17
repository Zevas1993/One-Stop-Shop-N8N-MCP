# Extending the Server

This guide explains how to extend the n8n MCP Server with new functionality.

## Overview

The n8n MCP Server is designed to be extensible, allowing developers to add new tools and resources without modifying existing code. This extensibility makes it easy to support new n8n features or customize the server for specific use cases.

## Adding a New Tool

Tools in the MCP server represent executable operations that AI assistants can use. To add a new tool, follow these steps:

### 1. Define the Tool Interface

Create a new TypeScript interface that defines the input parameters for your tool:

```typescript
// src/types/tools/my-tool.ts
export interface MyToolParams {
  param1: string;
  param2?: number; // Optional parameter
}
```

### 2. Create the Tool Handler

Create a new file for your tool in the appropriate category under `src/tools/`:

```typescript
// src/tools/category/my-tool.ts
import { ToolCallResponse, ToolDefinition } from '@modelcontextprotocol/sdk/types.js';
import { N8nClient } from '../../api/n8n-client.js';
import { MyToolParams } from '../../types/tools/my-tool.js';

// Define the tool
export function getMyToolDefinition(): ToolDefinition {
  return {
    name: 'my_tool',
    description: 'Description of what my tool does',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of param1'
        },
        param2: {
          type: 'number',
          description: 'Description of param2'
        }
      },
      required: ['param1']
    }
  };
}

// Implement the tool handler
export async function handleMyTool(
  client: N8nClient,
  params: MyToolParams
): Promise<ToolCallResponse> {
  try {
    // Implement the tool logic here
    // Use the N8nClient to interact with n8n

    // Return the response
    return {
      content: [
        {
          type: 'text',
          text: 'Result of the operation'
        }
      ]
    };
  } catch (error) {
    // Handle errors
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}
```

### 3. Register the Tool in the Handler

Update the main handler file for your tool category (e.g., `src/tools/category/handler.ts`):

```typescript
// src/tools/category/handler.ts
import { getMyToolDefinition, handleMyTool } from './my-tool.js';

// Add your tool to the tools object
export const categoryTools = {
  // ... existing tools
  my_tool: {
    definition: getMyToolDefinition,
    handler: handleMyTool
  }
};
```

### 4. Add Handler to Main Server

Update the main tool handler registration in `src/index.ts`:

```typescript
// src/index.ts
import { categoryTools } from './tools/category/handler.js';

// In the server initialization
const server = new Server(
  {
    name: 'n8n-mcp-server',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {
        // ... existing categories
        category: true
      }
    }
  }
);

// Register tool handlers
Object.entries(categoryTools).forEach(([name, { definition, handler }]) => {
  server.setToolHandler(definition(), async (request) => {
    return await handler(client, request.params.arguments as any);
  });
});
```

### 5. Add Unit Tests

Create unit tests for your new tool:

```typescript
// tests/unit/tools/category/my-tool.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { getMyToolDefinition, handleMyTool } from '../../../../src/tools/category/my-tool.js';

describe('My Tool', () => {
  describe('getMyToolDefinition', () => {
    it('should return the correct tool definition', () => {
      const definition = getMyToolDefinition();
      
      expect(definition.name).toBe('my_tool');
      expect(definition.description).toBeTruthy();
      expect(definition.inputSchema).toBeDefined();
      expect(definition.inputSchema.properties).toHaveProperty('param1');
      expect(definition.inputSchema.required).toEqual(['param1']);
    });
  });
  
  describe('handleMyTool', () => {
    it('should handle valid parameters', async () => {
      const mockClient = {
        // Mock the necessary client methods
      };
      
      const result = await handleMyTool(mockClient as any, {
        param1: 'test value'
      });
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBeTruthy();
    });
    
    it('should handle errors properly', async () => {
      const mockClient = {
        // Mock client that throws an error
        someMethod: jest.fn().mockRejectedValue(new Error('Test error'))
      };
      
      const result = await handleMyTool(mockClient as any, {
        param1: 'test value'
      });
      
      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain('Error');
    });
  });
});
```

## Adding a New Resource

Resources in the MCP server provide data access through URI-based templates. To add a new resource, follow these steps:

### 1. Create a Static Resource (No Parameters)

For a resource that doesn't require parameters:

```typescript
// src/resources/static/my-resource.ts
import { McpError, ReadResourceResponse } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode } from '../../errors/error-codes.js';
import { N8nClient } from '../../api/n8n-client.js';

export const MY_RESOURCE_URI = 'n8n://my-resource';

export async function handleMyResourceRequest(
  client: N8nClient
): Promise<ReadResourceResponse> {
  try {
    // Implement the resource logic
    // Use the N8nClient to interact with n8n
    
    // Return the response
    return {
      contents: [
        {
          uri: MY_RESOURCE_URI,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              // Resource data
              property1: 'value1',
              property2: 'value2'
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to retrieve resource: ${error.message}`
    );
  }
}
```

### 2. Create a Dynamic Resource (With Parameters)

For a resource that requires parameters:

```typescript
// src/resources/dynamic/my-resource.ts
import { McpError, ReadResourceResponse } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode } from '../../errors/error-codes.js';
import { N8nClient } from '../../api/n8n-client.js';

export const MY_RESOURCE_URI_TEMPLATE = 'n8n://my-resource/{id}';

export function matchMyResourceUri(uri: string): { id: string } | null {
  const match = uri.match(/^n8n:\/\/my-resource\/([^/]+)$/);
  if (!match) return null;
  
  return {
    id: decodeURIComponent(match[1])
  };
}

export async function handleMyResourceRequest(
  client: N8nClient,
  uri: string
): Promise<ReadResourceResponse> {
  const params = matchMyResourceUri(uri);
  if (!params) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid URI format: ${uri}`
    );
  }
  
  try {
    // Implement the resource logic using params.id
    // Use the N8nClient to interact with n8n
    
    // Return the response
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              // Resource data with the specific ID
              id: params.id,
              property1: 'value1',
              property2: 'value2'
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to retrieve resource: ${error.message}`
    );
  }
}
```

### 3. Register Resources in the Handler Files

Update the resource handler registration:

#### For Static Resources

```typescript
// src/resources/static/index.ts
import { MY_RESOURCE_URI, handleMyResourceRequest } from './my-resource.js';

export const staticResources = {
  // ... existing static resources
  [MY_RESOURCE_URI]: handleMyResourceRequest
};
```

#### For Dynamic Resources

```typescript
// src/resources/dynamic/index.ts
import { MY_RESOURCE_URI_TEMPLATE, matchMyResourceUri, handleMyResourceRequest } from './my-resource.js';

export const dynamicResourceMatchers = [
  // ... existing dynamic resource matchers
  {
    uriTemplate: MY_RESOURCE_URI_TEMPLATE,
    match: matchMyResourceUri,
    handler: handleMyResourceRequest
  }
];
```

### 4. Add Resource Listings

Update the resource listing functions:

```typescript
// src/resources/index.ts
// Update the resource templates listing
export function getResourceTemplates() {
  return [
    // ... existing templates
    {
      uriTemplate: MY_RESOURCE_URI_TEMPLATE,
      name: 'My Resource',
      description: 'Description of my resource'
    }
  ];
}

// Update the static resources listing
export function getStaticResources() {
  return [
    // ... existing resources
    {
      uri: MY_RESOURCE_URI,
      name: 'My Resource List',
      description: 'List of all my resources'
    }
  ];
}
```

### 5. Add Unit Tests

Create tests for your new resource:

```typescript
// tests/unit/resources/static/my-resource.test.ts
// or
// tests/unit/resources/dynamic/my-resource.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import {
  MY_RESOURCE_URI,
  handleMyResourceRequest
} from '../../../../src/resources/static/my-resource.js';

describe('My Resource', () => {
  it('should return resource data', async () => {
    const mockClient = {
      // Mock the necessary client methods
    };
    
    const response = await handleMyResourceRequest(mockClient as any);
    
    expect(response.contents).toHaveLength(1);
    expect(response.contents[0].uri).toBe(MY_RESOURCE_URI);
    expect(response.contents[0].mimeType).toBe('application/json');
    
    const data = JSON.parse(response.contents[0].text);
    expect(data).toHaveProperty('property1');
    expect(data).toHaveProperty('property2');
  });
  
  it('should handle errors properly', async () => {
    const mockClient = {
      // Mock client that throws an error
      someMethod: jest.fn().mockRejectedValue(new Error('Test error'))
    };
    
    await expect(handleMyResourceRequest(mockClient as any))
      .rejects
      .toThrow('Failed to retrieve resource');
  });
});
```

## Extending the API Client

If you need to add support for new n8n API features, extend the N8nClient class:

### 1. Add New Methods to the Client

```typescript
// src/api/n8n-client.ts
export class N8nClient {
  // ... existing methods
  
  // Add new methods
  async myNewApiMethod(param1: string): Promise<any> {
    try {
      const response = await this.httpClient.get(`/endpoint/${param1}`);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }
}
```

### 2. Add Type Definitions

```typescript
// src/types/api.ts
// Add types for API responses and requests
export interface MyApiResponse {
  id: string;
  name: string;
  // Other properties
}

export interface MyApiRequest {
  param1: string;
  param2?: number;
}
```

### 3. Add Tests for the New API Methods

```typescript
// tests/unit/api/n8n-client.test.ts
describe('N8nClient', () => {
  // ... existing tests
  
  describe('myNewApiMethod', () => {
    it('should call the correct API endpoint', async () => {
      // Set up mock Axios
      axiosMock.onGet('/endpoint/test').reply(200, {
        id: '123',
        name: 'Test'
      });
      
      const client = new N8nClient({
        apiUrl: 'http://localhost:5678/api/v1',
        apiKey: 'test-api-key'
      });
      
      const result = await client.myNewApiMethod('test');
      
      expect(result).toEqual({
        id: '123',
        name: 'Test'
      });
    });
    
    it('should handle errors correctly', async () => {
      // Set up mock Axios
      axiosMock.onGet('/endpoint/test').reply(404, {
        message: 'Not found'
      });
      
      const client = new N8nClient({
        apiUrl: 'http://localhost:5678/api/v1',
        apiKey: 'test-api-key'
      });
      
      await expect(client.myNewApiMethod('test'))
        .rejects
        .toThrow('Resource not found');
    });
  });
});
```

## Best Practices for Extensions

1. **Follow the Existing Patterns**: Try to follow the patterns already established in the codebase.
2. **Type Safety**: Use TypeScript types and interfaces to ensure type safety.
3. **Error Handling**: Implement comprehensive error handling in all extensions.
4. **Testing**: Write thorough tests for all new functionality.
5. **Documentation**: Document your extensions, including JSDoc comments for all public methods.
6. **Backward Compatibility**: Ensure that your extensions don't break existing functionality.

## Example: Adding Support for n8n Tags

Here's a complete example of adding support for n8n tags:

### API Client Extension

```typescript
// src/api/n8n-client.ts
export class N8nClient {
  // ... existing methods
  
  // Add tag methods
  async getTags(): Promise<Tag[]> {
    try {
      const response = await this.httpClient.get('/tags');
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }
  
  async createTag(data: CreateTagRequest): Promise<Tag> {
    try {
      const response = await this.httpClient.post('/tags', data);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }
  
  async deleteTag(id: string): Promise<void> {
    try {
      await this.httpClient.delete(`/tags/${id}`);
    } catch (error) {
      this.handleApiError(error);
    }
  }
}
```

### Type Definitions

```typescript
// src/types/api.ts
export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagRequest {
  name: string;
}
```

### Tool Implementations

```typescript
// src/tools/tag/list.ts
export function getTagListToolDefinition(): ToolDefinition {
  return {
    name: 'tag_list',
    description: 'List all tags in n8n',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  };
}

export async function handleTagList(
  client: N8nClient,
  params: any
): Promise<ToolCallResponse> {
  try {
    const tags = await client.getTags();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tags, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing tags: ${error.message}`
        }
      ],
      isError: true
    };
  }
}
```

### Resource Implementation

```typescript
// src/resources/static/tags.ts
export const TAGS_URI = 'n8n://tags';

export async function handleTagsRequest(
  client: N8nClient
): Promise<ReadResourceResponse> {
  try {
    const tags = await client.getTags();
    
    return {
      contents: [
        {
          uri: TAGS_URI,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              tags,
              count: tags.length
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to retrieve tags: ${error.message}`
    );
  }
}
```

### Integration

Register the new tools and resources in the appropriate handler files, and update the main server initialization to include them.

By following these patterns, you can extend the n8n MCP Server to support any n8n feature or add custom functionality tailored to your specific needs.
