import { WorkflowValidator } from "../services/workflow-validator";
import { NodeRepository } from "../database/node-repository";
// import { WorkflowJson } from "../services/workflow-validator";

// Mock NodeRepository
const mockRepo = {
  getNode: (type: string) => {
    // Simulate that the node exists in the DB (so we don't fail on "Unknown node type")
    return {
      name: type,
      displayName: type,
      version: 1,
      isVersioned: true,
      properties: [],
    };
  },
} as unknown as NodeRepository;

const validator = new WorkflowValidator(mockRepo);

const workflowWithCommunityNode: any = {
  name: "Community Node Test",
  nodes: [
    {
      id: "1",
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: "2",
      name: "Postgres Vector Store",
      type: "@n8n/n8n-nodes-langchain.vectorStorePostgres", // Community Node
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
    },
  ],
  connections: {
    "Manual Trigger": {
      main: [[{ node: "Postgres Vector Store", type: "main", index: 0 }]],
    },
  },
  settings: {},
};

async function run() {
  console.log("Validating workflow with community node...");
  const result = await validator.validateWorkflow(workflowWithCommunityNode);

  if (result.valid) {
    console.log(
      "❌ Validation PASSED (Unexpected). Community node was allowed."
    );
  } else {
    console.log("✅ Validation FAILED (Expected). Errors:");
    result.errors.forEach((e) => console.log(`- ${e.message}`));
  }
}

run();
