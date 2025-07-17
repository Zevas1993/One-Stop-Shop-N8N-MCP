# Installation Guide

This guide covers the installation process for the n8n MCP Server.

## Prerequisites

- Before installing the n8n MCP Server, ensure you have:

- Node.js 20 or later installed
- An n8n instance running and accessible via HTTP/HTTPS
- API access enabled on your n8n instance
- An API key with appropriate permissions (see [Configuration](./configuration.md))

## Option 1: Install from npm (Recommended)

The easiest way to install the n8n MCP Server is from npm:

```bash
npm install -g n8n-mcp-server
```

This will install the server globally, making the `n8n-mcp-server` command available in your terminal.

## Option 2: Install from Source

For development purposes or to use the latest features, you can install from source:

```bash
# Clone the repository
git clone https://github.com/yourusername/n8n-mcp-server.git
cd n8n-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Install globally
npm install -g .
```

## Verifying Installation

Once installed, you can verify the installation by running:

```bash
n8n-mcp-server --version
```

This should display the version number of the installed n8n MCP Server.

## Next Steps

After installation, you'll need to:

1. [Configure the server](./configuration.md) by setting up environment variables
2. Run the server
3. Register the server with your AI assistant platform

## Upgrading

To upgrade a global installation from npm:

```bash
npm update -g n8n-mcp-server
```

To upgrade a source installation:

```bash
# Navigate to the repository directory
cd n8n-mcp-server

# Pull the latest changes
git pull

# Install dependencies and rebuild
npm install
npm run build

# If installed globally, reinstall
npm install -g .
