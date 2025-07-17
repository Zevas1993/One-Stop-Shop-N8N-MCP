# Troubleshooting Guide

This guide addresses common issues you might encounter when setting up and using the n8n MCP Server.

## Connection Issues

### Cannot Connect to n8n API

**Symptoms:** 
- Error messages mentioning "Connection refused" or "Cannot connect to n8n API"
- Timeout errors when trying to use MCP tools

**Possible Solutions:**
1. **Verify n8n is running:**
   - Ensure your n8n instance is running and accessible
   - Try accessing the n8n URL in a browser

2. **Check n8n API URL:**
   - Verify the `N8N_API_URL` in your `.env` file
   - Make sure it includes the full path (e.g., `http://localhost:5678/api/v1`)
   - Check for typos or incorrect protocol (http vs https)

3. **Network Configuration:**
   - If running on a different machine, ensure there are no firewall rules blocking access
   - Check if n8n is configured to allow remote connections

4. **HTTPS/SSL Issues:**
   - If using HTTPS, ensure certificates are valid
   - For self-signed certificates, you may need to set up additional configuration

### Authentication Failures

**Symptoms:**
- "Authentication failed" or "Invalid API key" messages
- 401 or 403 HTTP status codes

**Possible Solutions:**
1. **Verify API Key:**
   - Check that the `N8N_API_KEY` in your `.env` file matches the one in n8n
   - Create a new API key if necessary

2. **Check API Key Permissions:**
   - Ensure the API key has appropriate scopes/permissions
   - Required scopes: `workflow:read workflow:write workflow:execute`

3. **n8n API Settings:**
   - Verify that API access is enabled in n8n settings
   - Check if there are IP restrictions on API access

## MCP Server Issues

### Server Crashes or Exits Unexpectedly

**Symptoms:**
- The MCP server stops running unexpectedly
- Error messages in logs or console output

**Possible Solutions:**
1. **Check Node.js Version:**
   - Ensure you're using Node.js 20 or later
   - Check with `node --version`

2. **Check Environment Variables:**
   - Ensure all required environment variables are set
   - Verify the format of the environment variables

3. **View Debug Logs:**
   - Set `DEBUG=true` in your `.env` file
   - Check the console output for detailed error messages

4. **Memory Issues:**
   - If running on a system with limited memory, increase available memory
   - Check for memory leaks or high consumption patterns

### AI Assistant Cannot Communicate with MCP Server

**Symptoms:**
- AI assistant reports it cannot connect to the MCP server
- Tools are not available in the assistant interface

**Possible Solutions:**
1. **Verify Server Registration:**
   - Ensure the server is properly registered with your AI assistant platform
   - Check the configuration settings for the MCP server in your assistant

2. **Server Running Check:**
   - Verify the MCP server is running
   - Check that it was started with the correct environment

3. **Restart Components:**
   - Restart the MCP server
   - Refresh the AI assistant interface
   - If using a managed AI assistant, check platform status

## Tool-Specific Issues

### Workflow Operations Fail

**Symptoms:**
- Cannot list, create, or update workflows
- Error messages about missing permissions

**Possible Solutions:**
1. **API Key Scope:**
   - Ensure your API key has `workflow:read` and `workflow:write` permissions
   - Create a new key with appropriate permissions if needed

2. **n8n Version:**
   - Check if your n8n version supports all the API endpoints being used
   - Update n8n to the latest version if possible

3. **Workflow Complexity:**
   - Complex workflows with custom nodes may not work correctly
   - Try with simpler workflows to isolate the issue

### Execution Operations Fail

**Symptoms:**
- Cannot execute workflows or retrieve execution data
- Execution starts but fails to complete

**Possible Solutions:**
1. **API Key Scope:**
   - Ensure your API key has the `workflow:execute` permission
   - Create a new key with appropriate permissions if needed

2. **Workflow Status:**
   - Check if the target workflow is active
   - Verify the workflow executes correctly in the n8n interface

3. **Workflow Inputs:**
   - Ensure all required inputs for workflow execution are provided
   - Check the format of input data

## Getting More Help

If you're still experiencing issues after trying these troubleshooting steps:

1. **Check GitHub Issues:**
   - Look for similar issues in the [GitHub repository](https://github.com/yourusername/n8n-mcp-server/issues)
   - Create a new issue with detailed information about your problem

2. **Submit Logs:**
   - Enable debug logging with `DEBUG=true`
   - Include relevant logs when seeking help

3. **Community Support:**
   - Ask in the n8n community forums
   - Check MCP-related discussion groups
