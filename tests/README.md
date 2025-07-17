# Testing System for n8n MCP Server

This directory contains the testing framework and tests for the n8n MCP Server project. The tests are organized in a hierarchical structure to match the project's architecture.

## Test Structure

- **unit/**: Unit tests for individual components
  - **api/**: Tests for API clients and services
  - **config/**: Tests for configuration handling
  - **errors/**: Tests for error handling
  - **resources/**: Tests for MCP resource handlers
    - **dynamic/**: Tests for dynamic resource handlers
    - **static/**: Tests for static resource handlers
  - **tools/**: Tests for MCP tool handlers
    - **workflow/**: Tests for workflow-related tools
    - **execution/**: Tests for execution-related tools
  - **utils/**: Tests for utility functions

- **integration/**: Integration tests for component interactions
  - Tests that verify multiple components work together correctly

- **e2e/**: End-to-end tests for full server functionality
  - Tests that simulate real-world usage scenarios

- **mocks/**: Mock data and utilities for testing
  - Reusable mock data and functions shared across tests

## Running Tests

The project uses Jest as the test runner with ESM support. The following npm scripts are available:

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file(s)
npm test -- tests/unit/api/client.test.ts

# Run tests matching a specific pattern
npm test -- -t "should format and return workflows"
```

## Writing Tests

### Test File Naming Convention

- All test files should end with `.test.ts`
- Test files should be placed in the same directory structure as the source files they test

### Test Organization

Each test file should follow this structure:

```typescript
/**
 * Description of what's being tested
 */

import '@jest/globals';
import { ComponentToTest } from '../../../src/path/to/component.js';
// Import other dependencies and mocks

// Mock dependencies
jest.mock('../../../src/path/to/dependency.js');

describe('ComponentName', () => {
  // Setup and teardown
  beforeEach(() => {
    // Common setup
  });
  
  afterEach(() => {
    // Common cleanup
  });
  
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      // ...
      
      // Act
      // ...
      
      // Assert
      expect(result).toBe(expectedValue);
    });
    
    // More test cases...
  });
  
  // More method tests...
});
```

### Testing Utilities

The project provides several testing utilities:

- **test-setup.ts**: Common setup for all tests
- **mocks/axios-mock.ts**: Utilities for mocking Axios HTTP requests
- **mocks/n8n-fixtures.ts**: Mock data for n8n API responses

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Mock Dependencies**: External dependencies should be mocked
3. **Descriptive Names**: Use descriptive test and describe names
4. **Arrange-Act-Assert**: Structure your tests with clear sections
5. **Coverage**: Aim for high test coverage, especially for critical paths
6. **Readability**: Write clear, readable tests that serve as documentation

## Extending the Test Suite

When adding new functionality to the project:

1. Create corresponding test files in the appropriate directory
2. Use existing mocks and utilities when possible
3. Create new mock data in `mocks/` for reusability
4. Update this README if you add new testing patterns or utilities

## Troubleshooting

If you encounter issues running the tests:

- Ensure you're using Node.js 20 or later
- Run `npm install` to ensure all dependencies are installed
- Check for ESM compatibility issues if importing CommonJS modules
- Use `console.log` or `console.error` for debugging (removed in production)
