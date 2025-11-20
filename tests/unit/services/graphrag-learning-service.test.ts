import {
  GraphRAGLearningService,
  WorkflowFeedback,
} from "../../../src/services/graphrag-learning-service";
import * as vllmClient from "../../../src/ai/vllm-client";

// Mock VLLMClient
jest.mock("../../../src/ai/vllm-client", () => {
  const originalModule = jest.requireActual("../../../src/ai/vllm-client");
  return {
    ...originalModule,
    createDualVLLMClients: jest.fn(),
    VLLMClient: jest.fn(),
  };
});

describe("GraphRAGLearningService", () => {
  let service: GraphRAGLearningService;
  let mockEmbeddingClient: any;
  let mockGenerationClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEmbeddingClient = {
      generateEmbedding: jest.fn().mockResolvedValue({
        embedding: Array(768).fill(0.1),
        modelId: "nomic-embed-text",
        processingTime: 100,
      }),
    };

    mockGenerationClient = {
      generateText: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          decisionType: "promote-pattern",
          confidence: 0.9,
          reasoning: "Test reasoning",
        }),
        tokens: 50,
        generationTime: 200,
        modelId: "qwen2.5:3b",
      }),
    };

    (vllmClient.createDualVLLMClients as jest.Mock).mockReturnValue({
      embedding: mockEmbeddingClient,
      generation: mockGenerationClient,
    });

    service = new GraphRAGLearningService();
  });

  it("should process workflow feedback using real LLM clients", async () => {
    const feedback: WorkflowFeedback = {
      executionId: "exec-1",
      workflowId: "wf-1",
      workflow: {
        nodes: [{ type: "n8n-nodes-base.httpRequest" }],
        connections: {},
      },
      feedback: {
        success: true,
        nodeCount: 1,
      },
    } as any;

    const result = await service.processWorkflowFeedback(feedback);

    expect(mockEmbeddingClient.generateEmbedding).toHaveBeenCalled();
    expect(mockGenerationClient.generateText).toHaveBeenCalled();
    expect(result.strategicAnalysis.decisionType).toBe("promote-pattern");
    expect(result.strategicAnalysis.overallConfidence).toBe(0.9);
  });
});
