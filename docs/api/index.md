# API Reference

This section provides a comprehensive reference for the n8n MCP Server API, including all available tools and resources.

## Overview

The n8n MCP Server implements the Model Context Protocol (MCP) to provide AI assistants with access to n8n workflows and executions. The API is divided into two main categories:

1. **Tools**: Executable functions that can perform operations on n8n, such as creating workflows or starting executions.
2. **Resources**: Data sources that provide information about workflows and executions.

## API Architecture

The n8n MCP Server follows a clean separation of concerns:

- **Client Layer**: Handles communication with the n8n API
- **Transport Layer**: Implements the MCP protocol for communication with AI assistants
- **Tools Layer**: Exposes executable operations to AI assistants
- **Resources Layer**: Provides data access through URI-based resources

All API interactions are authenticated using the n8n API key configured in your environment.

## Available Tools

The server provides tools for managing workflows and executions:

- [Workflow Tools](./workflow-tools.md): Create, list, update, and delete workflows
- [Execution Tools](./execution-tools.md): Execute workflows and manage workflow executions

## Available Resources

The server provides resources for accessing workflow and execution data:

- [Static Resources](./static-resources.md): Fixed resources like workflow listings or execution statistics
- [Dynamic Resources](./dynamic-resources.md): Parameterized resources for specific workflows or executions

## Understanding Input Schemas

Each tool has an input schema that defines the expected parameters. These schemas follow the JSON Schema format and are automatically provided to AI assistants to enable proper parameter validation and suggestion.

Example input schema for the `workflow_get` tool:

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "The ID of the workflow to retrieve"
    }
  },
  "required": ["id"]
}
```

## Error Handling

All API operations can return errors in a standardized format. Common error scenarios include:

- Authentication failures (invalid or missing API key)
- Resource not found (workflow or execution doesn't exist)
- Permission issues (API key doesn't have required permissions)
- Input validation errors (missing or invalid parameters)

Error responses include detailed messages to help troubleshoot issues.

## Next Steps

Explore the detailed documentation for each category:

- [Workflow Tools](./workflow-tools.md)
- [Execution Tools](./execution-tools.md)
- [Static Resources](./static-resources.md)
- [Dynamic Resources](./dynamic-resources.md)
