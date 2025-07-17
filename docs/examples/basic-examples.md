# Basic Examples

This page provides basic examples of using the n8n MCP Server with AI assistants.

## Listing Workflows

### User Prompt

"Show me all the workflows in my n8n instance."

### Assistant Actions

```javascript
// The assistant uses the workflow_list tool
const result = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// The assistant formats and presents the results
if (result.length === 0) {
  return "You don't have any workflows in your n8n instance yet.";
} else {
  let response = "Here are your workflows:\n\n";
  result.forEach(workflow => {
    response += `- ${workflow.name} (ID: ${workflow.id}) - ${workflow.active ? 'Active' : 'Inactive'}\n`;
  });
  return response;
}
```

## Getting Workflow Details

### User Prompt

"Tell me about my 'Email Processing' workflow."

### Assistant Actions

```javascript
// First list all workflows to find the one with matching name
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Find the workflow with a name containing "Email Processing"
const emailWorkflow = workflows.find(workflow => 
  workflow.name.toLowerCase().includes('email processing')
);

if (!emailWorkflow) {
  return "I couldn't find a workflow named 'Email Processing'. Would you like to see a list of all your workflows?";
}

// Get detailed information about the workflow
const details = await useMcpTool('n8n-mcp-server', 'workflow_get', {
  id: emailWorkflow.id
});

// Format and present the workflow details
return `
# Email Processing Workflow

**Status:** ${details.active ? 'Active' : 'Inactive'}
**Created:** ${new Date(details.createdAt).toLocaleString()}
**Last Updated:** ${new Date(details.updatedAt).toLocaleString()}

## Nodes (${details.nodes.length})
${details.nodes.map(node => `- ${node.name} (${node.type})`).join('\n')}

## Settings
${Object.entries(details.settings || {}).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
`;
```

## Executing a Workflow

### User Prompt

"Run my 'Data Sync' workflow."

### Assistant Actions

```javascript
// First list all workflows to find the one with matching name
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Find the workflow with a name containing "Data Sync"
const syncWorkflow = workflows.find(workflow => 
  workflow.name.toLowerCase().includes('data sync')
);

if (!syncWorkflow) {
  return "I couldn't find a workflow named 'Data Sync'. Would you like to see a list of all your workflows?";
}

// Check if the workflow is active
if (!syncWorkflow.active) {
  return "The 'Data Sync' workflow is currently inactive. Would you like me to activate it before running it?";
}

// Execute the workflow
const execution = await useMcpTool('n8n-mcp-server', 'execution_run', {
  workflowId: syncWorkflow.id
});

return `
I've started the 'Data Sync' workflow. 

**Execution ID:** ${execution.executionId}
**Status:** ${execution.status}
**Started At:** ${new Date(execution.startedAt).toLocaleString()}

You can check the execution status later by asking me about it.
`;
```

## Checking Execution Status

### User Prompt

"Check the status of my last workflow execution."

### Assistant Actions

```javascript
// Get recent executions (this example assumes we've stored the last execution ID in context)
// In a real scenario, you might need to list recent executions first
const lastExecutionId = "exec123"; // In practice, this would come from context or a previous response

// Get execution details
const execution = await useMcpTool('n8n-mcp-server', 'execution_get', {
  executionId: lastExecutionId
});

// Format and present the execution status
let response = `
# Execution Status for ${execution.workflowName}

**Status:** ${execution.status}
**Started:** ${new Date(execution.startedAt).toLocaleString()}
`;

if (execution.finishedAt) {
  response += `**Finished:** ${new Date(execution.finishedAt).toLocaleString()}\n`;
  response += `**Duration:** ${Math.round((new Date(execution.finishedAt) - new Date(execution.startedAt)) / 1000)} seconds\n`;
}

response += "\n## Execution Path\n";
execution.data.executionData.nodeExecutionOrder.forEach(nodeName => {
  response += `- ${nodeName}\n`;
});

return response;
```

## Activating/Deactivating a Workflow

### User Prompt

"Deactivate my 'Daily Report' workflow."

### Assistant Actions

```javascript
// First list all workflows to find the one with matching name
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Find the workflow with a name containing "Daily Report"
const reportWorkflow = workflows.find(workflow => 
  workflow.name.toLowerCase().includes('daily report')
);

if (!reportWorkflow) {
  return "I couldn't find a workflow named 'Daily Report'. Would you like to see a list of all your workflows?";
}

// Check if the workflow is already inactive
if (!reportWorkflow.active) {
  return "The 'Daily Report' workflow is already inactive.";
}

// Deactivate the workflow
const result = await useMcpTool('n8n-mcp-server', 'workflow_deactivate', {
  id: reportWorkflow.id
});

return `
I've deactivated the 'Daily Report' workflow. 

It was last updated on ${new Date(result.updatedAt).toLocaleString()}.

You can reactivate it at any time by asking me to activate it.
`;
```

## Creating a Simple Workflow

### User Prompt

"Create a new workflow that sends me a daily email reminder."

### Assistant Actions

```javascript
// Create a new workflow
const newWorkflow = await useMcpTool('n8n-mcp-server', 'workflow_create', {
  name: "Daily Email Reminder",
  active: false, // Start inactive until it's configured properly
  nodes: [
    {
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      position: [100, 300],
      parameters: {
        rule: {
          interval: [
            {
              field: "hours",
              minuteInterval: 24
            }
          ]
        }
      }
    },
    {
      name: "Send Email",
      type: "n8n-nodes-base.emailSend",
      position: [300, 300],
      parameters: {
        to: "{{$json.email}}",
        subject: "Daily Reminder",
        text: "This is your daily reminder!"
      }
    }
  ],
  connections: {
    "Schedule Trigger": {
      main: [
        [
          {
            node: "Send Email",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  }
});

return `
I've created a new workflow called "Daily Email Reminder".

This workflow is currently **inactive** and needs configuration:
1. You'll need to enter your email address in the "Send Email" node
2. You might want to customize the schedule and email content

You can view and edit this workflow in the n8n interface (ID: ${newWorkflow.id}), and then ask me to activate it when you're ready.
`;
```

These examples demonstrate the basic operations you can perform with the n8n MCP Server. For more complex scenarios, see the [Advanced Scenarios](./advanced-scenarios.md) page.
