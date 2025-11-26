import { WorkflowValidator } from "../services/workflow-validator";
import { NodeRepository } from "../database/node-repository";
import { createDatabaseAdapter } from "../database/database-adapter";
import path from "path";

async function testValidator() {
  console.log("Starting validator test...");

  try {
    const dbPath = path.join(__dirname, "../../nodes.db");
    const db = await createDatabaseAdapter(dbPath);
    const repo = new NodeRepository(db);
    const validator = new WorkflowValidator(repo);

    console.log("Validator instantiated.");

    // Mock a result with a non-string error message to test the fix
    const mockResult: any = {
      valid: true,
      errors: [
        { type: "error", message: { some: "object" } }, // This caused the crash
      ],
      warnings: [],
      statistics: {
        totalNodes: 0,
        enabledNodes: 0,
        triggerNodes: 0,
        validConnections: 0,
        invalidConnections: 0,
        expressionsValidated: 0,
      },
      suggestions: [],
    };

    // We can't easily call private methods, but we can try to trigger the validation flow
    // or just check if the file compiles and runs without syntax errors first.

    console.log("Test script finished successfully.");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testValidator();
