# Configuration Guide

This guide provides detailed information on configuring the n8n MCP Server.

## Environment Variables

The n8n MCP Server is configured using environment variables, which can be set in a `.env` file or directly in your environment.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `N8N_API_URL` | URL of the n8n API | `http://localhost:5678/api/v1` |
| `N8N_API_KEY` | API key for authenticating with n8n | `n8n_api_...` |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEBUG` | Enable debug logging | `false` | `true` or `false` |

## Creating a .env File

The simplest way to configure the server is to create a `.env` file in the directory where you'll run the server:

```bash
# Copy the example .env file
cp .env.example .env

# Edit the .env file with your settings
nano .env  # or use any text editor
```

Example `.env` file:

```env
# n8n MCP Server Environment Variables

# Required: URL of the n8n API
N8N_API_URL=http://localhost:5678/api/v1

# Required: API key for authenticating with n8n
N8N_API_KEY=your_n8n_api_key_here

# Optional: Set to 'true' to enable debug logging
DEBUG=false
```

## Generating an n8n API Key

To use the n8n MCP Server, you need an API key from your n8n instance:

1. Open your n8n instance in a browser
2. Go to **Settings** > **API** > **API Keys**
3. Click **Create** to create a new API key
4. Set appropriate **Scope** (recommended: `workflow:read workflow:write workflow:execute`)
5. Copy the key to your `.env` file

![Creating an n8n API Key](../images/n8n-api-key.png)

## Server Connection Options

By default, the n8n MCP Server listens on `stdin` and `stdout` for Model Context Protocol communications. This is the format expected by AI assistants using the MCP protocol.

## Configuring AI Assistants

To use the n8n MCP Server with AI assistants, you need to register it with your AI assistant platform. The exact method depends on the platform you're using.

### Using the MCP Installer

If you're using Claude or another assistant that supports the MCP Installer, you can register the server with:

```bash
# Install the MCP Installer
npx @anaisbetts/mcp-installer

# Register the server (if installed globally)
install_repo_mcp_server n8n-mcp-server

# Or register from a local installation
install_local_mcp_server path/to/n8n-mcp-server
```

### Manual Configuration

For platforms without an installer, you'll need to configure the connection according to the platform's documentation. Typically, this involves:

1. Specifying the path to the executable
2. Setting environment variables for the server
3. Configuring response formatting

## Verifying Configuration

To verify your configuration:

1. Start the server
2. Open your AI assistant
3. Try a simple command like "List all workflows in n8n"

If configured correctly, the assistant should be able to retrieve and display your workflows.

## Troubleshooting

If you encounter issues with your configuration, check:

- The `.env` file is in the correct location
- The n8n API URL is accessible from where the server is running
- The API key has the correct permissions
- Any firewalls or network restrictions that might block connections

For more specific issues, see the [Troubleshooting](./troubleshooting.md) guide.
