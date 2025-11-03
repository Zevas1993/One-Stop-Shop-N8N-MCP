#!/bin/bash

###############################################################################
# n8n MCP Server - Smart Auto-Rebuild Entrypoint
#
# This script detects the n8n version from the shared n8n container,
# compares it to the last known version, and automatically rebuilds
# the nodes.db if a version change is detected.
#
# Works with docker-compose setup where n8n and MCP share volumes.
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 n8n MCP Server - Starting with Auto-Rebuild${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Configuration
N8N_PACKAGE_JSON="/shared/n8n-modules/n8n/package.json"
STORED_VERSION_FILE="/app/data/.n8n-versions"
MAX_RETRIES=30
RETRY_INTERVAL=2

# Create data directory if it doesn't exist
mkdir -p /app/data

echo -e "${YELLOW}🔍 Detecting n8n version from shared volume...${NC}"
echo ""

# Function to get n8n version
get_n8n_version() {
  if [ -f "$N8N_PACKAGE_JSON" ]; then
    grep '"version"' "$N8N_PACKAGE_JSON" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/'
  fi
}

# Function to wait for n8n volume to be available
wait_for_n8n() {
  local retry_count=0

  while [ ! -f "$N8N_PACKAGE_JSON" ] && [ $retry_count -lt $MAX_RETRIES ]; do
    retry_count=$((retry_count + 1))
    remaining=$((MAX_RETRIES - retry_count))

    if [ $retry_count -eq 1 ]; then
      echo -e "${YELLOW}⏳ Waiting for n8n container to initialize... (${remaining}s remaining)${NC}"
    fi

    sleep $RETRY_INTERVAL
  done

  if [ ! -f "$N8N_PACKAGE_JSON" ]; then
    echo -e "${RED}❌ ERROR: n8n volume not available after ${MAX_RETRIES}s${NC}"
    echo -e "${RED}   Check that n8n container is running and volume is mounted correctly${NC}"
    echo ""
    echo -e "${YELLOW}📋 Diagnostic info:${NC}"
    echo "   Looking for: $N8N_PACKAGE_JSON"
    ls -la /shared/ 2>/dev/null || echo "   /shared directory not found"
    return 1
  fi

  return 0
}

# Wait for n8n to be available
if ! wait_for_n8n; then
  echo -e "${YELLOW}⚠️  Proceeding without n8n rebuild (n8n will be available on next start)${NC}"
  CURRENT_VERSION="unavailable"
else
  CURRENT_VERSION=$(get_n8n_version)
fi

if [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "unavailable" ]; then
  echo -e "${GREEN}✅ Found n8n version: ${CURRENT_VERSION}${NC}"
else
  echo -e "${YELLOW}⚠️  Could not determine n8n version${NC}"
fi

# Get stored version
if [ -f "$STORED_VERSION_FILE" ]; then
  STORED_VERSION=$(cat "$STORED_VERSION_FILE")
  echo -e "${BLUE}📝 Last rebuild was with: ${STORED_VERSION}${NC}"
else
  STORED_VERSION="none"
  echo -e "${YELLOW}📝 No previous build found (first time running)${NC}"
fi

echo ""

# Check if rebuild is needed
if [ "$CURRENT_VERSION" != "unavailable" ]; then
  if [ "$CURRENT_VERSION" = "$STORED_VERSION" ]; then
    echo -e "${GREEN}✅ Version match! Using cached nodes.db${NC}"
    echo ""
  else
    echo -e "${YELLOW}⚠️  Version mismatch detected!${NC}"
    echo -e "   Current n8n: ${CURRENT_VERSION}"
    echo -e "   Cached with: ${STORED_VERSION}"
    echo ""
    echo -e "${BLUE}🔄 Rebuilding nodes.db to sync with n8n ${CURRENT_VERSION}...${NC}"
    echo ""

    # Create symlink to n8n modules for npm rebuild
    # The rebuild script needs access to n8n packages
    mkdir -p /app/node_modules

    # Try to symlink if not already done
    if [ ! -L /app/node_modules/n8n ]; then
      if [ -d "/shared/n8n-modules/node_modules" ]; then
        ln -sf /shared/n8n-modules/node_modules/* /app/node_modules/ 2>/dev/null || true
      fi
    fi

    # Run the rebuild
    if npm run rebuild; then
      echo ""
      echo -e "${GREEN}✅ Rebuild successful!${NC}"

      # Store the new version
      echo "$CURRENT_VERSION" > "$STORED_VERSION_FILE"
      echo -e "${GREEN}✅ Stored n8n version: ${CURRENT_VERSION}${NC}"
    else
      echo ""
      echo -e "${RED}❌ Rebuild failed! Attempting to continue with existing database...${NC}"
      echo -e "${YELLOW}⚠️  Some new n8n nodes may not be available until rebuild succeeds${NC}"
    fi

    echo ""
  fi
else
  echo -e "${YELLOW}⚠️  Skipping rebuild (n8n not yet available)${NC}"
  echo -e "${YELLOW}   Rebuild will occur on next container start when n8n is available${NC}"
  echo ""
fi

# Display startup information
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🧠 Nano LLM Learning System${NC}"
echo -e "   ├─ Embedding Model (Neural Graph Semanticist)"
echo -e "   └─ Generation Model (Graph Update Strategist)"
echo ""
echo -e "${GREEN}📚 GraphRAG Backend${NC}"
echo -e "   ├─ Pattern Discovery & Evidence Tracking"
echo -e "   ├─ Semantic Search & Entity Extraction"
echo -e "   └─ Persistent Graph Storage"
echo ""
echo -e "${GREEN}⚙️  MCP Server Mode: stdio${NC}"
echo -e "   └─ Claude Desktop Compatible"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Starting MCP server...${NC}"
echo ""

# Start the MCP server
exec node /app/dist/mcp/index.js
