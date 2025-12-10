import { WorkflowValidator } from '../../src/services/workflow-validator";
import { NodeRepository } from '../../src/database/node-repository";

// Mock NodeRepository
const mockRepo = {
  getNode: (type: string) => {
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

const workflowWithAiNodes: any = {
  name: "AI Node Test",
  nodes: [
    {
      id: "1",
      name: "AI Agent",
      type: "@n8n/n8n-nodes-langchain.agent", // Should be ALLOWED
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: "2",
      name: "Some Random Community Node",
      type: "n8n-nodes-community.random", // Should be BLOCKED
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
    },
  ],
  connections: {},
  settings: {},
};

async function run() {
  console.log("Validating workflow with AI nodes...");
  const result = await validator.validateWorkflow(workflowWithAiNodes);

  console.log("Validation Result:", result.valid ? "VALID" : "INVALID");
  result.errors.forEach((e) => console.log(`- [${e.type}] ${e.message}`));
}

run();
