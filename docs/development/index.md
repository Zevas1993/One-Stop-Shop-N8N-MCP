# Development Guide

This section provides information for developers who want to understand, maintain, or extend the n8n MCP Server.

## Overview

The n8n MCP Server is built with TypeScript and implements the Model Context Protocol (MCP) to provide AI assistants with access to n8n workflows and executions. This development guide covers the architecture, extension points, and testing procedures.

## Topics

- [Architecture](./architecture.md): Overview of the codebase organization and design patterns
- [Extending the Server](./extending.md): Guide to adding new tools and resources
- [Testing](./testing.md): Information on testing procedures and writing tests

## Development Setup

To set up a development environment:

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/n8n-mcp-server.git
   cd n8n-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file for local development:
   ```bash
   cp .env.example .env
   # Edit the .env file with your n8n API credentials
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

This will compile the TypeScript code in watch mode, allowing you to make changes and see them take effect immediately.

## Project Structure

The project follows a modular structure:

```
n8n-mcp-server/
├── src/                  # Source code
│   ├── api/              # API client for n8n
│   ├── config/           # Configuration and environment settings
│   ├── errors/           # Error handling
│   ├── resources/        # MCP resources implementation
│   │   ├── static/       # Static resources
│   │   └── dynamic/      # Dynamic (parameterized) resources
│   ├── tools/            # MCP tools implementation
│   │   ├── workflow/     # Workflow management tools
│   │   └── execution/    # Execution management tools
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
└── build/                # Compiled output
```

## Build and Distribution

To build the project for distribution:

```bash
npm run build
```

This will compile the TypeScript code to JavaScript in the `build` directory and make the executable script file.

## Development Workflow

1. Create a feature branch for your changes
2. Make your changes and ensure tests pass
3. Update documentation as needed
4. Submit a pull request

For more detailed instructions on specific development tasks, see the linked guides.
