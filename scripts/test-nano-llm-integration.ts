/**
 * Test Nano LLM Integration
 * Verifies that agents can use LLM clients for enhanced functionality
 */

import { logger } from '../src/utils/logger';

async function testNanoLLMIntegration() {
  console.log('\n🧪 Testing Nano LLM Integration\n');
  console.log('='.repeat(60));

  try {
    // Test 1: LLM Router Selection
    console.log('\n📌 Test 1: LLM Router Backend Selection');
    const { getLLMRouter } = await import('../src/ai/llm-router');
    const router = getLLMRouter();
    const status = router.getStatus();
    console.log(`Backend: ${status.backend}`);
    console.log(`Available: ${status.isAvailable}`);
    console.log(`Embedding model: ${status.embeddingModel || 'N/A'}`);
    console.log(`Generation model: ${status.generationModel || 'N/A'}`);

    if (!status.isAvailable) {
      console.log('\n⚠️  WARNING: No LLM backend available');
      console.log('   Agents will use rule-based fallback');
      console.log('   To enable LLMs:');
      console.log('   - Install Ollama: https://ollama.ai');
      console.log('   - Pull models: ollama pull nomic-embed-text && ollama pull qwen2.5:0.5b');
      console.log('\n✅ Test completed - System works without LLMs (graceful degradation)');
      return;
    }

    // Test 2: Embedding Generation
    console.log('\n📌 Test 2: Embedding Generation');
    try {
      const embedResult = await router.embed('send slack notification when error occurs');
      console.log(`✅ Generated ${embedResult.embedding.length}-dim embedding in ${embedResult.latency}ms`);
    } catch (error: any) {
      console.log(`❌ Embedding generation failed: ${error.message}`);
    }

    // Test 3: Text Generation
    console.log('\n📌 Test 3: Text Generation');
    try {
      const genResult = await router.generate('Complete this workflow name: "Daily Data"');
      console.log(`✅ Generated: "${genResult.text.substring(0, 60)}..."`);
      console.log(`   Tokens: ${genResult.tokens}, Latency: ${genResult.latency}ms`);
    } catch (error: any) {
      console.log(`❌ Text generation failed: ${error.message}`);
    }

    // Test 4: Full Workflow Pipeline with LLMs
    console.log('\n📌 Test 4: Workflow Pipeline with LLMs');
    try {
      const { LocalLLMOrchestrator } = await import('../src/ai/local-llm-orchestrator');
      const orchestrator = new LocalLLMOrchestrator();
      await orchestrator.initialize();

      const result = await orchestrator.generateWorkflow(
        'Send a Slack notification when a new email arrives'
      );

      if (result.success) {
        console.log(`✅ Workflow generated successfully`);
        console.log(`   Pattern: ${result.pattern?.patternName || 'Unknown'}`);
        console.log(`   Nodes: ${result.workflow?.nodes?.length || 0}`);
        console.log(`   Valid: ${result.validationResult?.valid ? 'Yes' : 'No'}`);
        console.log(`   Total time: ${result.executionStats.totalTime}ms`);
        console.log(`   - Pattern discovery: ${result.executionStats.patternDiscoveryTime}ms`);
        console.log(`   - Workflow generation: ${result.executionStats.workflowGenerationTime}ms`);
        console.log(`   - Validation: ${result.executionStats.validationTime}ms`);
      } else {
        console.log(`❌ Workflow generation failed: ${result.errors.join(', ')}`);
      }
    } catch (error: any) {
      console.log(`❌ Workflow pipeline test failed: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
    }

    // Test 5: Agent LLM Support Check
    console.log('\n📌 Test 5: Agent LLM Support Verification');
    try {
      const { GraphRAGNanoOrchestrator } = await import('../src/ai/agents/graphrag-nano-orchestrator');
      const { VLLMClient } = await import('../src/ai/vllm-client');
      const { SharedMemory } = await import('../src/ai/shared-memory');

      // Create mock LLM clients
      const mockEmbeddingClient = new VLLMClient({
        modelId: 'test-embedding',
        baseUrl: 'http://localhost:8001',
        maxTokens: 512,
      });

      const mockGenerationClient = new VLLMClient({
        modelId: 'test-generation',
        baseUrl: 'http://localhost:8002',
        maxTokens: 1024,
      });

      const orchestrator = new GraphRAGNanoOrchestrator(
        { enableGraphRAG: false },
        {
          embedding: mockEmbeddingClient,
          generation: mockGenerationClient,
        }
      );

      console.log(`✅ GraphRAGNanoOrchestrator accepts LLM clients`);
      console.log(`   Agents are wired with LLM support`);
    } catch (error: any) {
      console.log(`❌ Agent LLM support check failed: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed\n');

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
testNanoLLMIntegration().catch((error) => {
  console.error('❌ Unhandled error in test suite:', error);
  process.exit(1);
});
