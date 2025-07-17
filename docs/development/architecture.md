# Architecture

This document describes the architectural design of the n8n MCP Server.

## Overview

The n8n MCP Server follows a layered architecture pattern that separates concerns and promotes maintainability. The main architectural layers are:

1. **Transport Layer**: Handles communication with AI assistants via the Model Context Protocol
2. **API Client Layer**: Interacts with the n8n API
3. **Tools Layer**: Implements executable operations as MCP tools
4. **Resources Layer**: Provides data access through URI-based resources
5. **Configuration Layer**: Manages environment variables and server settings
6. **Error Handling Layer**: Provides consistent error management and reporting

## System Components

![Architecture Diagram](../images/architecture.png.placeholder)

### Entry Point

The server entry point is defined in `src/index.ts`. This file:

1. Initializes the configuration from environment variables
2. Creates and configures the MCP server instance
3. Registers tool and resource handlers
4. Connects to the transport layer (typically stdio)

### Configuration

The configuration layer (`src/config/`) handles:

- Loading environment variables
- Validating required configuration
- Providing typed access to configuration values

The main configuration component is the `Environment` class, which validates and manages environment variables like `N8N_API_URL` and `N8N_API_KEY`.

### API Client

The API client layer (`src/api/`) provides a clean interface for interacting with the n8n API. It includes:

- `N8nClient`: The main client that encapsulates communication with n8n
- API-specific functionality divided by resource type (workflows, executions)
- Authentication handling using the n8n API key

The client uses Axios for HTTP requests and includes error handling specific to the n8n API responses.

### MCP Tools

The tools layer (`src/tools/`) implements the executable operations exposed to AI assistants. Each tool follows a common pattern:

1. A tool definition that specifies name, description, and input schema
2. A handler function that processes input parameters and executes the operation
3. Error handling for validation and execution errors

Tools are categorized by resource type:

- Workflow tools: Create, list, update, delete, activate, and deactivate workflows
- Execution tools: Run, list, and manage workflow executions

Each tool is designed to be independently testable and maintains a clean separation of concerns.

### MCP Resources

The resources layer (`src/resources/`) provides data access through URI-based templates. Resources are divided into two categories:

1. **Static Resources** (`src/resources/static/`): Fixed resources like workflow listings
2. **Dynamic Resources** (`src/resources/dynamic/`): Parameterized resources like specific workflow details

Each resource implements:
- URI pattern matching
- Content retrieval
- Error handling
- Response formatting

### Error Handling

The error handling layer (`src/errors/`) provides consistent error management across the server. It includes:

- Custom error types that map to MCP error codes
- Error translation functions to convert n8n API errors to MCP errors
- Common error patterns and handling strategies

## Data Flow

A typical data flow through the system:

1. AI assistant sends a request via stdin to the MCP server
2. Server routes the request to the appropriate handler based on the request type
3. Handler validates input and delegates to the appropriate tool or resource
4. Tool/resource uses the n8n API client to interact with n8n
5. Response is processed, formatted, and returned via stdout
6. AI assistant receives and processes the response

## Key Design Principles

### 1. Separation of Concerns

Each component has a single responsibility, making the codebase easier to understand, test, and extend.

### 2. Type Safety

TypeScript interfaces and types are used extensively to ensure type safety and provide better developer experience.

### 3. Error Handling

Comprehensive error handling ensures that errors are caught at the appropriate level and translated into meaningful messages for AI assistants.

### 4. Testability

The architecture supports unit testing by keeping components loosely coupled and maintaining clear boundaries between layers.

### 5. Extensibility

New tools and resources can be added without modifying existing code, following the open-closed principle.

## Implementation Patterns

### Factory Pattern

Used for creating client instances and tool handlers based on configuration.

### Adapter Pattern

The n8n API client adapts the n8n API to the internal representation used by the server.

### Strategy Pattern

Different resource handlers implement a common interface but provide different strategies for retrieving and formatting data.

### Decorator Pattern

Used to add cross-cutting concerns like logging and error handling to base functionality.

## Core Files and Their Purposes

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point, initializes and configures the server |
| `src/config/environment.ts` | Manages environment variables and configuration |
| `src/api/n8n-client.ts` | Main client for interacting with the n8n API |
| `src/tools/workflow/handler.ts` | Handles workflow-related tool requests |
| `src/tools/execution/handler.ts` | Handles execution-related tool requests |
| `src/resources/index.ts` | Registers and manages resource handlers |
| `src/resources/dynamic/workflow.ts` | Provides access to specific workflow resources |
| `src/resources/static/workflows.ts` | Provides access to workflow listings |
| `src/errors/index.ts` | Defines and manages error types and handling |

## Extension Points

To extend the server with new capabilities:

1. **Adding a new tool**: Create a new handler in the appropriate category under `src/tools/` and register it in the main server setup
2. **Adding a new resource**: Create a new resource handler in `src/resources/` and register it in the resource manager
3. **Supporting new n8n API features**: Extend the API client in `src/api/` to support new API endpoints or features

For detailed instructions on extending the server, see [Extending the Server](./extending.md).
