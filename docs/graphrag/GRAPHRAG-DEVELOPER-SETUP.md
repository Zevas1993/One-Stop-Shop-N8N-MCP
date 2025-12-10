# GraphRAG Developer Setup Guide

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19
**Audience:** Contributors, developers extending GraphRAG

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Setup](#repository-setup)
3. [Development Environment](#development-environment)
4. [Building and Testing](#building-and-testing)
5. [Development Workflow](#development-workflow)
6. [Extending GraphRAG](#extending-graphrag)
7. [Debugging](#debugging)

---

## Prerequisites

### Required Software

```bash
# Node.js 18+ (use nvm for version management)
# macOS
brew install nvm
nvm install 18
nvm use 18

# Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18

# Windows
# Download from https://nodejs.org/ or use chocolatey
choco install nodejs

# Verify
node --version  # Should be 18+
npm --version   # Should be 9+

# Python 3.8+ (use pyenv for version management)
# macOS
brew install pyenv
pyenv install 3.11.0
pyenv local 3.11.0

# Linux
sudo apt-get install python3.11

# Windows
# Download from python.org

# Verify
python3 --version  # Should be 3.8+
pip3 --version
```

### Recommended Tools

```bash
# Git
git --version  # Should be 2.30+

# Docker (for containerized testing)
docker --version

# VS Code with extensions
# - Python (pylance)
# - ESLint
# - Prettier
# - Jest Runner

# Optional: NVM for Node version management
# Optional: PyEnv for Python version management
```

---

## Repository Setup

### Clone and Install

```bash
# 1. Clone the repository
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp

# 2. Install Node.js dependencies
npm install

# 3. Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# or
.\venv\Scripts\activate  # Windows

# 4. Install Python dependencies
pip install -r python/requirements-graphrag.txt

# 5. Build TypeScript
npm run build

# 6. Copy environment template
cp .env.example .env
# Edit .env with your settings
```

### Directory Structure

```
n8n-mcp/
├── src/
│   ├── mcp/              # MCP server implementation
│   ├── services/         # Business logic services
│   ├── database/         # Database access layer
│   ├── utils/            # Utilities and helpers
│   ├── ai/               # GraphRAG and AI features (NEW)
│   │   ├── graphrag-bridge.ts
│   │   ├── shared-memory.ts
│   │   └── agents/
│   └── index.ts
├── python/
│   ├── backend/
│   │   └── graph/
│   │       ├── lightrag_service.py
│   │       ├── entity_extractor.py
│   │       └── incremental_updater.py
│   └── requirements-graphrag.txt
├── scripts/              # Build and deployment scripts
│   ├── n8n_discovery.py
│   ├── initial_graph_builder.py
│   ├── auto_updater.py
│   └── ...
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/                 # Documentation
├── package.json
└── tsconfig.json
```

---

## Development Environment

### VS Code Setup

Create `.vscode/settings.json`:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "python.formatting.provider": "black",
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["tests"],
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[python]": {
    "editor.defaultFormatter": "ms-python.python",
    "editor.formatOnSave": true
  },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/__pycache__": true,
    "**/.pytest_cache": true
  }
}
```

Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/mcp/index.js",
      "restart": true,
      "console": "integratedTerminal",
      "env": {
        "DEBUG_MCP": "true",
        "NODE_ENV": "development"
      }
    },
    {
      "name": "Debug GraphRAG Bridge",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/ai/graphrag-bridge.ts",
      "restart": true,
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Python Backend",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/python/backend/graph/lightrag_service.py",
      "console": "integratedTerminal",
      "env": {
        "PYTHONUNBUFFERED": "1",
        "GRAPH_DIR": "${workspaceFolder}/data/graph"
      }
    }
  ]
}
```

### Environment Variables

Create `.env` for development:

```bash
# Development configuration
NODE_ENV=development
MCP_MODE=stdio
DEBUG_MCP=true
METRICS_GRAPHRAG=true

# GraphRAG
GRAPH_DIR=./data/graph
GRAPH_PYTHON=python3
BRIDGE_CACHE_MAX=50

# n8n (optional, for testing)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=n8n_api_xxx...

# Logging
LOG_LEVEL=debug
```

---

## Building and Testing

### Build Commands

```bash
# Build TypeScript
npm run build

# Build with source maps (for debugging)
npm run build:dev

# Watch mode (auto-rebuild on file changes)
npm run build:watch

# Build and start
npm run start

# Clean build
rm -rf dist
npm run build
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test graphrag-bridge.test.ts

# Run with coverage
npm test -- --coverage

# Run Python tests
pytest tests/

# Run Python tests with coverage
pytest --cov=python tests/
```

### Test Organization

```
tests/
├── unit/
│   ├── ai/
│   │   ├── graphrag-bridge.test.ts
│   │   ├── shared-memory.test.ts
│   │   └── agents.test.ts
│   ├── services/
│   └── utils/
├── integration/
│   ├── graph-building.test.ts
│   ├── n8n-api.test.ts
│   └── claude-desktop.test.ts
├── fixtures/
│   ├── mock-nodes.ts
│   ├── mock-workflows.ts
│   └── test-data.ts
└── conftest.py  # pytest configuration
```

### Database Setup

```bash
# Initialize empty database
npm run db:init

# Rebuild database from n8n
npm run rebuild

# Rebuild with optimization
npm run rebuild:optimized

# Validate database
npm run validate
```

### Graph Setup (Development)

```bash
# Discover local n8n instance
python3 scripts/n8n_discovery.py

# Build initial graph (from n8n)
python3 scripts/initial_graph_builder.py

# Or build with limited nodes (faster)
python3 scripts/initial_graph_builder.py --limit 100

# Verify graph
npm run graphrag:status

# Test graph queries
npm run metrics:snapshot
```

---

## Development Workflow

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature
# or
git checkout -b fix/my-bug

# Make changes, test, commit
git add .
git commit -m "feat: add my feature"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

### Commit Message Convention

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (no logic changes)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Build, dependencies

**Example:**
```
feat(graphrag): add xRAG compression support

- Implement xRAG compressor service
- Add selective semantic compression
- Support for quantization (int8)
- Reduce context tokens by 99.98%

Closes #123
```

### Code Review Checklist

Before submitting a pull request:

```bash
# 1. Build successfully
npm run build

# 2. All tests pass
npm test

# 3. No TypeScript errors
npm run typecheck

# 4. No linting errors
npm run lint

# 5. Code formatted correctly
npm run format

# 6. Documentation updated
# - README.md
# - docs/*.md
# - Code comments

# 7. Environment variables documented
# - .env.example updated
# - GRAPHRAG-CONFIGURATION.md updated
```

---

## Extending GraphRAG

### Adding a New MCP Tool

**File:** `src/mcp/tools-graphrag.ts`

```typescript
// 1. Define tool in tools array
{
  name: "my_new_tool",
  description: "Description of what the tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Description of param1"
      }
    },
    required: ["param1"]
  }
}

// 2. Implement handler in src/mcp/handlers-graphrag.ts
case "my_new_tool":
  return await handleMyNewTool(args);

async function handleMyNewTool(args: MyToolArgs): Promise<any> {
  try {
    const result = await graphBridge.queryGraph(args.query);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 3. Add tests in tests/unit/ai/graphrag-bridge.test.ts
test("my_new_tool returns correct results", async () => {
  const bridge = new GraphRAGBridge();
  await bridge.start();

  const result = await bridge.queryGraph("test query");

  expect(result).toHaveProperty("results");
  expect(result.results).toHaveLength(5);
});
```

### Adding a New Service

**File:** `src/services/my-service.ts`

```typescript
import { Logger } from "../utils/logger";

export class MyService {
  private logger = new Logger("MyService");

  constructor() {
    this.logger.info("MyService initialized");
  }

  async myMethod(input: string): Promise<string> {
    this.logger.debug(`Processing: ${input}`);

    try {
      const result = await this.processData(input);
      this.logger.info(`Success: ${result}`);
      return result;
    } catch (error) {
      this.logger.error("Error processing data", error);
      throw error;
    }
  }

  private async processData(input: string): Promise<string> {
    // Implementation
    return input.toUpperCase();
  }
}

// Export singleton
export const myService = new MyService();
```

### Adding a Python Utility

**File:** `python/backend/graph/my_utility.py`

```python
import logging
from pathlib import Path
import json

logger = logging.getLogger(__name__)

class MyUtility:
    def __init__(self):
        self.logger = logger
        self.logger.info("MyUtility initialized")

    def process(self, data: dict) -> dict:
        """Process data and return result."""
        try:
            result = self._internal_process(data)
            self.logger.info(f"Processed {len(data)} items")
            return result
        except Exception as e:
            self.logger.error(f"Error processing data: {e}")
            raise

    def _internal_process(self, data: dict) -> dict:
        # Implementation
        return {k: v.upper() if isinstance(v, str) else v for k, v in data.items()}

# Create singleton
my_utility = MyUtility()
```

### Adding Tests

**TypeScript Test:** `tests/unit/ai/my-feature.test.ts`

```typescript
import { MyFeature } from "../../../src/ai/my-feature";

describe("MyFeature", () => {
  let feature: MyFeature;

  beforeEach(() => {
    feature = new MyFeature();
  });

  describe("initialization", () => {
    it("should initialize successfully", () => {
      expect(feature).toBeDefined();
    });
  });

  describe("myMethod", () => {
    it("should return expected result", async () => {
      const result = await feature.myMethod("test");
      expect(result).toBe("TEST");
    });

    it("should handle errors gracefully", async () => {
      await expect(feature.myMethod(null)).rejects.toThrow();
    });
  });
});
```

**Python Test:** `tests/test_my_utility.py`

```python
import pytest
from python.backend.graph.my_utility import MyUtility

class TestMyUtility:
    @pytest.fixture
    def utility(self):
        return MyUtility()

    def test_initialization(self, utility):
        assert utility is not None

    def test_process(self, utility):
        data = {"name": "test", "value": 123}
        result = utility.process(data)

        assert result["name"] == "TEST"
        assert result["value"] == 123

    def test_process_error_handling(self, utility):
        with pytest.raises(Exception):
            utility.process(None)
```

---

## Debugging

### Debug Bridge Communication

```bash
# Enable verbose logging
export DEBUG_MCP=true
export METRICS_GRAPHRAG=true

# Start server
npm run start

# In another terminal, test bridge
npm run graphrag:test-health
npm run metrics:snapshot
```

### Debug Python Backend

```bash
# Run backend directly with verbose output
PYTHONUNBUFFERED=1 python3 -u python/backend/graph/lightrag_service.py

# Test with sample JSON-RPC call
cat << 'EOF' | python3 python/backend/graph/lightrag_service.py
{"jsonrpc": "2.0", "method": "query_graph", "params": {"text": "slack"}, "id": 1}
EOF
```

### Debug with VS Code

Press `F5` to start debugging using the `.vscode/launch.json` configurations.

### Inspect Subprocess Communication

```bash
# Log all stdio
npm run start 2>&1 | tee debug.log

# Monitor subprocess
# In another terminal:
watch -n1 'ps aux | grep lightrag'

# Check if process is responsive
ps aux | grep lightrag
# Look for CPU/memory usage
```

### Memory Profiling

```bash
# Node.js heap snapshot
node --expose-gc dist/mcp/index.js
# In REPL: global.gc()

# Python memory profiling
python3 -m memory_profiler python/backend/graph/lightrag_service.py

# Monitor while running
# Linux
watch -n0.5 'ps aux | grep "node\|python" | grep -v grep'
```

### Performance Profiling

```bash
# Node.js CPU profile
node --prof dist/mcp/index.js
# Then process
node --prof-process isolate-*.log > profile.txt

# Python profiling
python3 -m cProfile python/backend/graph/lightrag_service.py

# Memory leaks
node --trace-warnings dist/mcp/index.js
```

---

## Important Development Notes

### Code Style

- Use TypeScript strict mode (no `any` types)
- Use async/await, avoid callback hell
- Add JSDoc comments for public APIs
- Use meaningful variable names

### Error Handling

- Always wrap async operations in try/catch
- Log errors with context
- Return meaningful error messages to clients
- Never expose internal paths in error messages

### Performance

- Cache frequently accessed data
- Avoid blocking operations in hot paths
- Use batch operations where possible
- Monitor memory usage

### Security

- Validate all inputs
- Don't log sensitive information (tokens, API keys)
- Use environment variables for secrets
- Use HTTPS in production (HTTP mode)

### Documentation

- Update README.md for major changes
- Add JSDoc comments to functions
- Update .env.example for new env vars
- Document new features in CHANGELOG.md

---

## Useful Commands

```bash
# List all npm scripts
npm run

# Run specific script
npm run build

# Run with specific Node options
NODE_OPTIONS="--max-old-space-size=4096" npm run start

# Install specific version
npm install package@1.2.3

# Update dependencies
npm update
npm audit fix

# Clean install
rm -rf node_modules
npm install

# Python commands
python3 -m pip install --upgrade pip
pip install -r requirements.txt
python3 -m pytest tests/ -v
```

---

## Getting Help

- **Documentation:** See [docs/](../docs/)
- **Issues:** https://github.com/n8n-io/n8n-mcp/issues
- **Discussions:** https://github.com/n8n-io/n8n-mcp/discussions
- **Code examples:** See [tests/](../tests/) directory

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Complete Developer Setup Guide
