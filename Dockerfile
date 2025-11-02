# syntax=docker/dockerfile:1.7

# Stage 1: Builder (Full dependencies for TypeScript compilation)
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native packages
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install ALL dependencies (including n8n packages needed for compilation)
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src ./src

# Build full TypeScript including GraphRAG learning system and HTTP server
RUN npx tsc

# Copy pre-built database if it exists locally (speeds up build)
COPY data ./data

# Stage 2: Runtime (with browser automation support)
FROM node:20-slim AS runtime
WORKDIR /app

# Install Docker CLI and ALL Playwright system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    libnspr4 \
    libnss3 \
    libasound2 \
    libxss1 \
    libglib2.0-0 \
    libnss3-dev \
    libgconf-2-4 \
    libxrandr2 \
    libasound2-dev \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libegl1 \
    libgl1 \
    libgles2 \
    xvfb \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy runtime-only package.json and add Puppeteer
COPY package.runtime.json package.json

# Install runtime dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install --production --no-audit --no-fund

# Install Puppeteer with bundled Chromium
RUN --mount=type=cache,target=/root/.npm \
    npm install puppeteer --no-audit --no-fund

# Copy built application and database from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Create GitHub cache directory for auto-updates
RUN mkdir -p /app/data/github-cache

# Copy Python backend for GraphRAG support
COPY python ./python

# Copy required files
COPY .env.example ./

# Create non-root user (Debian syntax)
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Install Puppeteer Chromium as nodejs user (bundled with package)
RUN npx puppeteer browsers install chrome

# Set Docker environment flag
ENV IS_DOCKER=true
ENV NODE_ENV=production

# Expose MCP port
EXPOSE 3000

# Note: No health check needed for MCP stdio mode

# Copy entry point script with execute permissions
COPY --chmod=755 docker/simple-entrypoint.sh ./

# Start unified n8n MCP server
CMD ["/bin/bash", "./simple-entrypoint.sh"]
