/**
 * Debug Workflow Generation
 * Helps identify why workflows are failing to generate
 */

import { LocalLLMOrchestrator } from '../src/ai/local-llm-orchestrator';

async function debugWorkflowGeneration() {
  console.log('\n🔍 Debugging Workflow Generation\n');

  try {
    const orchestrator = new LocalLLMOrchestrator();
    await orchestrator.initialize();
    console.log('✅ Orchestrator initialized\n');

    const testGoal = 'Send a Slack notification when an error occurs';
    console.log(`Testing goal: "${testGoal}"\n`);

    console.log('Calling generateWorkflow...');
    const result = await orchestrator.generateWorkflow(testGoal);

    console.log('\n📊 Raw Result:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n📋 Result Analysis:');
    console.log(`- success: ${result.success}`);
    console.log(`- workflow: ${result.workflow ? 'exists' : 'null/undefined'}`);
    console.log(`- pattern: ${result.pattern ? 'exists' : 'null/undefined'}`);
    console.log(`- validationResult: ${result.validationResult ? 'exists' : 'null/undefined'}`);
    console.log(`- errors: ${result.errors ? result.errors.length : 0}`);

    if (result.workflow) {
      console.log(`\n✅ Workflow generated:`);
      console.log(`   Name: ${result.workflow.name}`);
      console.log(`   Nodes: ${result.workflow.nodes?.length || 0}`);
      console.log(`   Connections: ${Object.keys(result.workflow.connections || {}).length}`);
    }

    if (result.errors && result.errors.length > 0) {
      console.log(`\n❌ Errors found:`);
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

debugWorkflowGeneration();
