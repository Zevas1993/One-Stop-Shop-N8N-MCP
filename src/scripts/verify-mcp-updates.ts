import { MCPToolService } from "../services/mcp-tool-service";
import { NodeFilter } from "../core/node-filter";
import { ValidationGateway } from "../core/validation-gateway";
import { logger } from "../utils/logger";

// Mock NodeRepository
class MockNodeRepository {
  searchNodes(query: string, options: any) {
    if (query.includes("browserless")) {
      return [
        {
          nodeType: "n8n-nodes-browserless.browserless",
          displayName: "Browserless",
          description: "Browser automation",
          category: "action",
          package: "n8n-nodes-browserless",
        },
      ];
    }
    return [];
  }

  listNodes(filters: any) {
    return [];
  }

  getNode(nodeType: string) {
    return {
      nodeType,
      displayName: nodeType.split(".").pop(),
      description: "Mock node",
    };
  }
}

// Mock TemplateService
class MockTemplateService {}

// Mock NodeCatalog
class MockNodeCatalog {
  isReady() {
    return true;
  }
  hasNode(type: string) {
    return true;
  } // Pretend all nodes exist to test policy blocking
  getNode(type: string) {
    return { name: type, credentials: [] };
  }
}

async function verifyUpdates() {
  console.log("🔍 Verifying MCP Server Updates (with Mocks)...\n");

  // 1. Setup Dependencies
  const mockRepo = new MockNodeRepository() as any;
  const mockTemplateService = new MockTemplateService() as any;
  const mockCatalog = new MockNodeCatalog() as any;

  const toolService = new MCPToolService(mockRepo, mockTemplateService);
  const validationGateway = new ValidationGateway(
    mockCatalog,
    "http://localhost",
    ""
  );

  // Ensure strict policy
  process.env.ALLOW_COMMUNITY_NODES = "false";

  // 2. Verify Search Filtering
  console.log("📋 Test 1: Search Filtering");
  const searchResult = await toolService.searchNodes("browserless");

  if (searchResult.filteredByPolicy > 0) {
    console.log("✅ Success: Blocked nodes were filtered");
    console.log(`   Message: ${searchResult.policyMessage}`);
  } else {
    console.error("❌ Failed: Blocked nodes were NOT filtered");
    console.log("   Result:", JSON.stringify(searchResult, null, 2));
  }
  console.log("");

  // 3. Verify Node Info Blocking & Alternatives
  console.log("🚫 Test 2: Node Info Blocking");
  const nodeInfo = await toolService.getNodeInfoUnified({
    nodeType: "n8n-nodes-browserless.browserless",
  });

  if (nodeInfo.blockedByPolicy) {
    console.log("✅ Success: Node info request was blocked");
    console.log(`   Error: ${nodeInfo.error}`);
    console.log(`   Suggestion: ${nodeInfo.suggestion}`);
  } else {
    console.error("❌ Failed: Node info request was NOT blocked");
  }
  console.log("");

  // 4. Verify Alternatives in NodeFilter
  console.log("🔄 Test 3: Alternatives Logic");
  const nodeFilter = NodeFilter.getInstance();
  const alternatives = nodeFilter.getAlternatives(
    "n8n-nodes-browserless.browserless"
  );

  if (
    alternatives.length > 0 &&
    alternatives.includes("n8n-nodes-base.httpRequest")
  ) {
    console.log("✅ Success: Alternatives returned correctly");
    console.log("   Alternatives:", alternatives);
  } else {
    console.error("❌ Failed: Alternatives not found");
  }
  console.log("");

  // 5. Verify Validation Gateway
  console.log("🛡️ Test 4: Validation Gateway");
  const workflow = {
    nodes: [
      {
        name: "My Blocked Node",
        type: "n8n-nodes-browserless.browserless",
        typeVersion: 1,
        position: [0, 0],
      },
    ],
    connections: {},
  };

  const validation = await validationGateway.validate(workflow);

  const blockedError = validation.errors.find(
    (e) => e.code === "NODE_NOT_ALLOWED"
  );

  if (blockedError) {
    console.log("✅ Success: Workflow validation blocked the node");
    console.log(`   Message: ${blockedError.message}`);

    // Check for alternatives (using type assertion to avoid TS error if interface not updated in runtime context)
    const errorWithAlternatives = blockedError as any;
    if (
      errorWithAlternatives.alternatives &&
      errorWithAlternatives.alternatives.length > 0
    ) {
      console.log("✅ Success: Error includes alternatives");
      console.log("   Alternatives:", errorWithAlternatives.alternatives);
    } else {
      console.error("❌ Failed: Error missing alternatives");
    }
  } else {
    console.error("❌ Failed: Workflow validation did NOT block the node");
    console.log("   Errors:", validation.errors);
  }
}

verifyUpdates().catch(console.error);
