# Contributing to n8n MCP Server

Thank you for your interest in contributing to the n8n MCP Server! This guide will help you get started with development and understand our contribution process.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Areas for Contribution](#areas-for-contribution)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and professional in all interactions.

### Our Standards

- **Be Respectful**: Treat everyone with respect and kindness
- **Be Collaborative**: Work together and help each other
- **Be Professional**: Keep discussions focused and productive
- **Be Inclusive**: Welcome contributors of all backgrounds and skill levels

## Getting Started

### Prerequisites

- **Node.js**: v16.19.1 or higher (v22+ recommended)
- **npm**: v8 or higher
- **Git**: For version control
- **TypeScript**: Knowledge of TypeScript is helpful
- **n8n**: Familiarity with n8n workflows is beneficial

### Quick Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/One-Stop-Shop-N8N-MCP.git
cd One-Stop-Shop-N8N-MCP

# 3. Add upstream remote
git remote add upstream https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP.git

# 4. Install dependencies
npm install

# 5. Build the project
npm run build

# 6. Initialize the database
npm run rebuild:local

# 7. Run tests
npm test
```

## Development Setup

### VSCode (Recommended)

The project includes preconfigured VSCode settings:

1. Install recommended extensions (`.vscode/extensions.json`)
2. Use included debug configurations (`.vscode/launch.json`)
3. Enable format on save (already configured)

### Environment Configuration

Create a `.env` file:

```env
# Development settings
NODE_ENV=development
MCP_LOG_LEVEL=debug

# Database
NODE_DB_PATH=./data/nodes.db
REBUILD_ON_START=false

# n8n API (optional)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here
```

### Running in Development

```bash
# Watch mode with auto-rebuild
npm run dev

# Run specific server mode
npm run start:consolidated  # 8-tool interface (recommended)
npm run start:legacy        # 60+ tool interface
npm run start:http          # HTTP server mode

# Run with debugger (VSCode)
# Use F5 or the Debug panel
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.spec.ts

# Run with coverage
npm test -- --coverage

# Type checking
npm run typecheck

# Benchmark (if performance-related)
npm run benchmark
```

### 4. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add new workflow validation feature"
```

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/my-new-feature

# Create a Pull Request on GitHub
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test suites
npm run test:essentials           # Essential tools
npm run test:workflow-validation  # Workflow validation
npm run test:n8n-manager         # n8n API integration
npm run test:templates           # Template system

# Integration tests
npm run test:single-session      # HTTP server
```

### Writing Tests

Use Jest for testing:

```typescript
import { describe, it, expect } from '@jest/globals';
import { MyService } from '../services/my-service';

describe('MyService', () => {
  it('should do something', () => {
    const service = new MyService();
    const result = service.doSomething();
    expect(result).toBe(expected);
  });

  it('should handle errors', () => {
    const service = new MyService();
    expect(() => service.throwError()).toThrow();
  });
});
```

### Test Coverage Goals

- **Overall**: 50% minimum
- **Critical paths**: 80%+ coverage
- **New features**: 70%+ coverage

## Code Style

### TypeScript Guidelines

```typescript
// Use explicit types
function processNode(nodeName: string): NodeInfo {
  // Implementation
}

// Use interfaces for objects
interface NodeConfig {
  name: string;
  version: number;
  enabled: boolean;
}

// Use async/await (not callbacks)
async function fetchData(): Promise<Data> {
  return await api.getData();
}

// Use const for immutable values
const MAX_RETRIES = 3;

// Use descriptive names
const nodeDocumentationService = new NodeDocumentationService();
```

### File Organization

```
src/
├── services/      # Business logic
├── mcp/          # MCP server and tools
├── database/     # Database operations
├── utils/        # Utility functions
├── plugins/      # Plugin system
└── scripts/      # CLI scripts
```

### Import Order

```typescript
// 1. External dependencies
import * as fs from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// 2. Internal modules
import { logger } from '../utils/logger.js';
import { NodeDocumentationService } from '../services/node-documentation-service.js';

// 3. Types
import type { NodeInfo, WorkflowValidation } from '../types.js';
```

### Comments

```typescript
/**
 * Validates a workflow before deployment
 *
 * @param workflow - The workflow to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export async function validateWorkflow(
  workflow: Workflow,
  options: ValidationOptions
): Promise<ValidationResult> {
  // Implementation
}
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Build system changes
- **ci**: CI/CD changes
- **chore**: Other changes (dependencies, etc.)

### Examples

```bash
feat(validation): add typeVersion validation for nodes

- Validates typeVersion is present on versioned nodes
- Returns error with correct version to use
- Warns on outdated versions

Closes #123

fix(http-server): resolve stream consumption issue

The Express json() middleware was consuming the request stream,
preventing the MCP server from reading it. Removed middleware
and implemented direct JSON-RPC parsing.

Fixes #456

docs(plugin): add plugin development guide

Added comprehensive guide covering:
- Plugin structure and API
- Lifecycle hooks
- Custom tools
- Configuration
- Examples
```

## Pull Request Process

### Before Submitting

- [ ] Code follows project style
- [ ] Tests pass (`npm test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Documentation updated
- [ ] Commits follow conventional commit format
- [ ] No merge conflicts

### PR Template

The project includes a PR template. Fill out all sections:

1. **Description**: What and why
2. **Type of Change**: Feature, bug fix, etc.
3. **Testing**: How you tested
4. **Checklist**: Complete the checklist

### Review Process

1. **Automated Checks**: CI/CD runs tests and type checking
2. **Code Review**: Maintainers review your code
3. **Feedback**: Address review comments
4. **Approval**: PR approved by maintainer
5. **Merge**: Maintainer merges your PR

### Getting Your PR Merged Faster

- Keep PRs focused (one feature/fix per PR)
- Write clear descriptions
- Respond to feedback promptly
- Add tests for new features
- Update documentation
- Follow code style

## Project Structure

```
n8n-mcp/
├── src/
│   ├── services/           # Core business logic
│   │   ├── node-documentation-service.ts
│   │   ├── workflow-validator.ts
│   │   └── ...
│   ├── mcp/                # MCP server implementation
│   │   ├── server.ts
│   │   ├── server-simple-consolidated.ts
│   │   ├── tools.ts
│   │   └── tools-consolidated.ts
│   ├── database/           # Database layer
│   │   ├── node-repository.ts
│   │   ├── database-adapter.ts
│   │   └── schema.sql
│   ├── plugins/            # Plugin system
│   │   ├── plugin-loader.ts
│   │   ├── types.ts
│   │   └── example-plugin.ts
│   ├── utils/              # Utility functions
│   │   ├── logger.ts
│   │   └── console-manager.ts
│   └── scripts/            # CLI tools
│       ├── rebuild.ts
│       ├── validate.ts
│       └── benchmark.js
├── docs/                   # Documentation
├── tests/                  # Test files
├── .vscode/                # VSCode configuration
├── .github/                # GitHub templates and workflows
└── docker/                 # Docker configuration
```

## Areas for Contribution

### High Priority

- [ ] Increase test coverage to 50%
- [ ] Add more workflow templates
- [ ] Improve error messages
- [ ] Performance optimizations
- [ ] Documentation improvements

### New Features

- [ ] Additional validation profiles
- [ ] More AI tool detection
- [ ] Enhanced caching system
- [ ] Metrics and monitoring
- [ ] Plugin marketplace

### Bug Fixes

Check [GitHub Issues](https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/issues) for:
- Bugs labeled `bug`
- Issues labeled `good first issue`
- Issues labeled `help wanted`

### Documentation

- API documentation
- Tutorial videos
- Example workflows
- Plugin guides
- Deployment guides

### Testing

- Unit tests
- Integration tests
- E2E tests
- Performance tests
- Security tests

## Getting Help

### Resources

- **Documentation**: [GETTING-STARTED.md](./GETTING-STARTED.md)
- **Plugin Guide**: [docs/PLUGIN_DEVELOPMENT.md](./docs/PLUGIN_DEVELOPMENT.md)
- **Architecture**: [CLAUDE.md](./CLAUDE.md)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)

### Communication

- **Issues**: [GitHub Issues](https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/discussions)
- **Bug Reports**: Use issue template
- **Feature Requests**: Use issue template

### Questions?

- Check existing issues and discussions first
- Create a new discussion for questions
- Tag maintainers if urgent

## Recognition

Contributors will be:
- Listed in README.md
- Mentioned in release notes
- Credited in commit history

Thank you for contributing to n8n MCP Server! 🎉

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
