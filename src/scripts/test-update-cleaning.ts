import { handleUpdateWorkflow } from "../mcp/handlers-n8n-manager";
import { NodeRepository } from "../database/node-repository";
import { logger } from "../utils/logger";

// Mock dependencies
const mockRepository = {
  findNode: async () => ({ name: "mock-node", inputs: [], outputs: [] }),
  findAll: async () => [],
} as unknown as NodeRepository;

// Mock N8nApiClient (we can't easily mock the singleton, but we can try to intercept or just rely on validation logic failing later if API is not configured, which is fine as we want to test the cleaning logic first)
// Actually, since we can't easily mock the singleton client inside the module without rewiring,
// we will rely on the fact that validation happens BEFORE the API call.
// If the cleaning works, validation should proceed. If it fails due to "API not configured", that means cleaning passed!
// If cleaning fails, validation will throw "Property 'id' is not allowed..." error.

async function testUpdateCleaning() {
  console.log("Starting testUpdateCleaning...");

  const dirtyInput = {
    id: "test-workflow-id",
    name: "Test Workflow",
    nodes: [
      {
        parameters: {},
        id: "d9b2b6b8-6b8b-4b8b-8b8b-8b8b8b8b8b8b",
        name: "Start",
        type: "n8n-nodes-base.start",
        typeVersion: 1,
        position: [250, 300],
      },
    ],
    connections: {},
    // SYSTEM FIELDS THAT SHOULD BE STRIPPED
    createdAt: "2023-01-01T00:00:00.000Z",
    updatedAt: "2023-01-01T00:00:00.000Z",
    active: true,
    tags: ["tag1"],
    versionId: "v1",
    triggerCount: 0,
    shared: false,
    isArchived: false,
  };

  try {
    // We expect this to fail at the API call stage (because no API client),
    // BUT it should NOT fail at the validation stage with "Property ... is not allowed".
    await handleUpdateWorkflow(dirtyInput, mockRepository);
  } catch (error: any) {
    // We are looking for the error. If it's "API not configured" or similar, it means validation passed (or at least didn't block due to system fields).
    // If it returns a validation error about "createdAt", then the fix failed.
    console.log("Caught error:", error);
  }

  // Since handleUpdateWorkflow returns a promise that resolves to McpToolResponse, it might not throw.
  const result = await handleUpdateWorkflow(dirtyInput, mockRepository);
  console.log("Result:", JSON.stringify(result, null, 2));

  if (result.success === false) {
    if (
      result.error &&
      result.error.includes("Property 'createdAt' is not allowed")
    ) {
      console.error("FAIL: System fields were NOT cleaned!");
    } else if (
      result.error &&
      result.error.includes("n8n API client not configured")
    ) {
      console.log(
        "PASS: System fields were cleaned (failed at API step as expected)."
      );
    } else {
      console.log("Result error:", result.error);
      // It might fail validation for other reasons (like missing node type in repo), but as long as it's not the system fields, we are good.
      if (result.details && (result.details as any).errors) {
        const errors = (result.details as any).errors;
        const systemFieldErrors = errors.filter((e: any) =>
          e.message.includes("is not allowed")
        );
        if (systemFieldErrors.length > 0) {
          console.error(
            "FAIL: System fields were NOT cleaned!",
            systemFieldErrors
          );
        } else {
          console.log("PASS: Validation failed but NOT due to system fields.");
        }
      }
    }
  }
}

testUpdateCleaning().catch(console.error);
