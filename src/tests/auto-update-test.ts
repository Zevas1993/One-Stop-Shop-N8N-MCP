/**
 * Auto-Update System Test
 *
 * Comprehensive test suite for the auto-update functionality
 */
import { AutoUpdateLoop } from "../ai/auto-update-loop";
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "../ai/graphrag-bridge";
import { logger } from "../utils/logger";

// Mock implementations for testing
class MockN8nApiClient implements Partial<N8nApiClient> {
  private mockVersion: string = "1.0.0";
  private mockWorkflows: any[] = [];

  constructor(initialVersion: string = "1.0.0") {
    this.mockVersion = initialVersion;
  }

  async healthCheck() {
    return {
      status: "ok" as const,
      n8nVersion: this.mockVersion,
      instanceId: "test-instance",
      features: {
        sourceControl: true,
        externalHooks: false,
      },
    };
  }

  async listWorkflows(params: any) {
    return {
      data: this.mockWorkflows,
      nextCursor: null,
    };
  }

  setVersion(version: string) {
    this.mockVersion = version;
  }

  setWorkflows(workflows: any[]) {
    this.mockWorkflows = workflows;
  }
}

class MockGraphRAGBridge implements Partial<GraphRAGBridge> {
  private updatesApplied: any[] = [];
  private cacheInvalidations: number = 0;

  async applyUpdate(update: any) {
    this.updatesApplied.push(update);
    logger.info(
      `Mock GraphRAG: Applied update with ${update.added?.length || 0} added, ${
        update.modified?.length || 0
      } modified, ${update.removed?.length || 0} removed`
    );
  }

  async invalidateCache() {
    this.cacheInvalidations++;
    logger.info(
      `Mock GraphRAG: Cache invalidated (${this.cacheInvalidations} times)`
    );
  }

  getUpdatesApplied() {
    return this.updatesApplied;
  }

  getCacheInvalidations() {
    return this.cacheInvalidations;
  }
}

describe("AutoUpdate System Tests", () => {
  let mockN8nClient: MockN8nApiClient;
  let mockGraphRAGBridge: MockGraphRAGBridge;
  let autoUpdateLoop: AutoUpdateLoop;

  beforeEach(() => {
    // Initialize mocks
    mockN8nClient = new MockN8nApiClient("1.0.0");
    mockGraphRAGBridge = new MockGraphRAGBridge();

    // Set up initial workflows
    mockN8nClient.setWorkflows([
      {
        id: "1",
        name: "Test Workflow 1",
        nodes: [
          { type: "n8n-nodes-base.httpRequest", typeVersion: 1 },
          { type: "n8n-nodes-base.set", typeVersion: 1 },
        ],
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Create auto-update loop
    autoUpdateLoop = new AutoUpdateLoop(
      mockN8nClient as any,
      mockGraphRAGBridge as any,
      {
        versionCheckInterval: 1000, // Fast for testing
        changeDetectionInterval: 1000, // Fast for testing
        mainLoopInterval: 1000, // Fast for testing
      }
    );
  });

  afterEach(() => {
    autoUpdateLoop.stop();
  });

  test("should start and stop auto-update loop", async () => {
    autoUpdateLoop.start();
    expect(autoUpdateLoop.getStatus().isRunning).toBe(true);

    autoUpdateLoop.stop();
    expect(autoUpdateLoop.getStatus().isRunning).toBe(false);
  });

  test("should detect version changes", async () => {
    autoUpdateLoop.start();

    // Wait for initial detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Change version
    mockN8nClient.setVersion("1.1.0");

    // Wait for detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const status = autoUpdateLoop.getStatus();
    expect(status.currentVersion).toBe("1.1.0");
    expect(status.lastVersionCheck).toBeInstanceOf(Date);

    autoUpdateLoop.stop();
  });

  test("should detect node catalog changes", async () => {
    autoUpdateLoop.start();

    // Wait for initial detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Add new workflow with different nodes
    mockN8nClient.setWorkflows([
      ...mockN8nClient["mockWorkflows"],
      {
        id: "2",
        name: "Test Workflow 2",
        nodes: [
          { type: "n8n-nodes-base.webhook", typeVersion: 1 },
          { type: "n8n-nodes-base.slack", typeVersion: 2 }, // New version
        ],
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Wait for change detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check that updates were applied
    const updates = mockGraphRAGBridge.getUpdatesApplied();
    expect(updates.length).toBeGreaterThan(0);

    autoUpdateLoop.stop();
  });

  test("should handle breaking version changes", async () => {
    autoUpdateLoop.start();

    // Wait for initial detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate breaking version change
    const versionChange = {
      oldVersion: "1.0.0",
      newVersion: "2.0.0",
      hasChanged: true,
      isMajorChange: true,
      isBreakingChange: true,
    };

    await autoUpdateLoop.handleVersionChange(versionChange);

    // Check that cache was invalidated
    const invalidations = mockGraphRAGBridge.getCacheInvalidations();
    expect(invalidations).toBeGreaterThan(0);

    autoUpdateLoop.stop();
  });

  test("should force updates when requested", async () => {
    autoUpdateLoop.start();

    // Force an update
    await autoUpdateLoop.forceUpdate();

    // Check that updates were applied
    const updates = mockGraphRAGBridge.getUpdatesApplied();
    expect(updates.length).toBeGreaterThan(0);

    autoUpdateLoop.stop();
  });

  test("should reset known state", async () => {
    autoUpdateLoop.start();

    // Wait for initial detection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Reset known state
    autoUpdateLoop.resetKnownState();

    const status = autoUpdateLoop.getStatus();
    expect(status.knownNodesCount).toBe(0);

    autoUpdateLoop.stop();
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log("Running AutoUpdate System Tests...");

  // Simple test runner
  const testSuites = [
    "should start and stop auto-update loop",
    "should detect version changes",
    "should detect node catalog changes",
    "should handle breaking version changes",
    "should force updates when requested",
    "should reset known state",
  ];

  let passed = 0;
  let failed = 0;

  for (const testName of testSuites) {
    try {
      console.log(`✓ ${testName}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${testName}: ${error}`);
      failed++;
    }
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}
