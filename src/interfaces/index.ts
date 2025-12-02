/**
 * Interfaces Module
 * 
 * Exposes the n8n Co-Pilot core through different interfaces:
 * - MCP Interface: For AI agents (Claude, etc.)
 * - Open WebUI Interface: For human users via chat
 * 
 * Both interfaces use the same core with the same validation,
 * ensuring consistent behavior regardless of who's using the system.
 */

export * from './mcp-interface';
export * from './openwebui-interface';
