# syntax=docker/dockerfile:1.7

# ============================================================================
# n8n Co-Pilot MCP Server - Docker Image
# 
# Supports two modes:
# - MCP (stdio): For Claude Desktop integration
# - HTTP: For Open WebUI and direct API access
#
# Build: docker build -t n8n-mcp:latest .
# Run MCP: docker run -it --rm -e N8N_API_URL -e N8N_API_KEY n8n-mcp:latest
# Run HTTP: docker run -d -p 3001:3001 -e MCP_MODE=http -e N8N_API_URL -e N8N_API_KEY n8n-mcp:latest
# ============================================================================

# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native packages (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (dev + prod)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npx tsc

# Stage 2: Production Runtime
FROM node:20-slim AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for production install
COPY package.json package-lock.json ./

# Install production dependencies only
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production --no-audit --no-fund

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy data directory if exists (for pre-built databases)
COPY --chown=node:node data* ./data/

# Create non-root user directories
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user
USER node

# Environment defaults
ENV NODE_ENV=production
ENV MCP_MODE=stdio
ENV PORT=3001
ENV N8N_API_URL=http://localhost:5678
ENV OLLAMA_URL=http://localhost:11434

# Expose HTTP port (only used in HTTP mode)
EXPOSE 3001

# Health check for HTTP mode
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the Co-Pilot
# Use MCP_MODE=http for HTTP server, default is stdio for Claude Desktop
CMD ["node", "dist/main.js"]
