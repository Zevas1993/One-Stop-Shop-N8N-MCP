# Advanced Scenarios

This page demonstrates more complex examples of using the n8n MCP Server with AI assistants.

## Workflow Analysis and Optimization

### User Prompt

"Analyze my workflows and suggest optimizations."

### Assistant Actions

```javascript
// Get all workflows
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Get execution statistics
const stats = await accessMcpResource('n8n-mcp-server', 'n8n://execution-stats');

// Analyze each workflow in detail
const analysisResults = [];

for (const workflow of workflows) {
  // Get detailed workflow information
  const details = await useMcpTool('n8n-mcp-server', 'workflow_get', {
    id: workflow.id
  });
  
  // Get recent executions
  const executions = await useMcpTool('n8n-mcp-server', 'execution_list', {
    workflowId: workflow.id,
    limit: 10
  });
  
  // Analyze workflow structure
  const nodeCount = details.nodes.length;
  const nodeTypes = new Set(details.nodes.map(node => node.type));
  
  // Check for error patterns in executions
  const errorRate = executions.length > 0 
    ? executions.filter(e => e.status === "error").length / executions.length 
    : 0;
  
  // Check execution times
  const executionTimes = executions
    .filter(e => e.status === "success" && e.finishedAt && e.startedAt)
    .map(e => new Date(e.finishedAt) - new Date(e.startedAt));
  
  const avgExecutionTime = executionTimes.length > 0
    ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length / 1000
    : 0;
  
  // Generate optimization suggestions
  const suggestions = [];
  
  if (nodeCount > 15) {
    suggestions.push("Consider splitting into multiple workflows for better maintainability");
  }
  
  if (errorRate > 0.2) {
    suggestions.push("High error rate detected - review error handling and input validation");
  }
  
  if (avgExecutionTime > 30) {
    suggestions.push("Long execution time - check for bottlenecks or inefficient operations");
  }
  
  if (nodeTypes.has("n8n-nodes-base.httpRequest") && !nodeTypes.has("n8n-nodes-base.errorTrigger")) {
    suggestions.push("HTTP requests without error handling - consider adding error triggers");
  }
  
  analysisResults.push({
    id: workflow.id,
    name: workflow.name,
    nodeCount,
    errorRate,
    avgExecutionTime,
    suggestions
  });
}

// Format and present the analysis
let response = "# Workflow Analysis and Optimization Suggestions\n\n";

analysisResults.forEach(result => {
  response += `## ${result.name}\n\n`;
  response += `**Nodes:** ${result.nodeCount}\n`;
  response += `**Error Rate:** ${(result.errorRate * 100).toFixed(1)}%\n`;
  response += `**Avg. Execution Time:** ${result.avgExecutionTime.toFixed(1)} seconds\n\n`;
  
  if (result.suggestions.length > 0) {
    response += "**Optimization Suggestions:**\n";
    result.suggestions.forEach(suggestion => {
      response += `- ${suggestion}\n`;
    });
  } else {
    response += "No specific optimization suggestions for this workflow.\n";
  }
  
  response += "\n";
});

return response;
```

## Scheduled Workflow Management

### User Prompt

"Update all my scheduled workflows to run one hour later."

### Assistant Actions

```javascript
// Get all workflows
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Filter for scheduled workflows (those with a Schedule node)
const scheduledWorkflows = [];

for (const workflow of workflows) {
  // Get detailed workflow information
  const details = await useMcpTool('n8n-mcp-server', 'workflow_get', {
    id: workflow.id
  });
  
  // Look for Schedule Trigger nodes
  const scheduleNodes = details.nodes.filter(node => 
    node.type === "n8n-nodes-base.scheduleTrigger" || 
    node.type === "n8n-nodes-base.cron"
  );
  
  if (scheduleNodes.length > 0) {
    scheduledWorkflows.push({
      workflow: details,
      scheduleNodes
    });
  }
}

if (scheduledWorkflows.length === 0) {
  return "I couldn't find any workflows with scheduled triggers.";
}

// Process each scheduled workflow
const results = [];

for (const { workflow, scheduleNodes } of scheduledWorkflows) {
  // Create a copy of the workflow for modification
  const updatedWorkflow = { ...workflow };
  
  // Update each schedule node
  for (const scheduleNode of scheduleNodes) {
    const nodeIndex = updatedWorkflow.nodes.findIndex(n => n.id === scheduleNode.id);
    
    if (nodeIndex === -1) continue;
    
    // Copy the node for modification
    const updatedNode = { ...updatedWorkflow.nodes[nodeIndex] };
    
    // Handle different types of schedule configurations
    if (updatedNode.type === "n8n-nodes-base.scheduleTrigger") {
      if (updatedNode.parameters.cronExpression) {
        // Modify cron expression to run 1 hour later
        const cronParts = updatedNode.parameters.cronExpression.split(' ');
        if (cronParts.length === 5) {
          // Standard cron format: minute hour day month dayOfWeek
          const hour = parseInt(cronParts[1], 10);
          cronParts[1] = ((hour + 1) % 24).toString();
          updatedNode.parameters.cronExpression = cronParts.join(' ');
        }
      } else if (updatedNode.parameters.timeToRepeat) {
        // Handle specific time scheduling
        const time = updatedNode.parameters.timeToRepeat;
        if (time && time.split(':').length === 2) {
          const [hours, minutes] = time.split(':').map(part => parseInt(part, 10));
          const newHours = (hours + 1) % 24;
          updatedNode.parameters.timeToRepeat = `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
    } else if (updatedNode.type === "n8n-nodes-base.cron") {
      // Similar handling for cron node
      if (updatedNode.parameters.cronExpression) {
        const cronParts = updatedNode.parameters.cronExpression.split(' ');
        if (cronParts.length === 5) {
          const hour = parseInt(cronParts[1], 10);
          cronParts[1] = ((hour + 1) % 24).toString();
          updatedNode.parameters.cronExpression = cronParts.join(' ');
        }
      }
    }
    
    // Update the node in the workflow
    updatedWorkflow.nodes[nodeIndex] = updatedNode;
  }
  
  // Save the updated workflow
  const result = await useMcpTool('n8n-mcp-server', 'workflow_update', {
    id: workflow.id,
    nodes: updatedWorkflow.nodes,
    connections: updatedWorkflow.connections
  });
  
  results.push({
    name: workflow.name,
    updated: result.updatedAt
  });
}

// Format and present the results
let response = "# Updated Scheduled Workflows\n\n";
response += "I've updated the following workflows to run one hour later:\n\n";

results.forEach(result => {
  response += `- **${result.name}** (Updated: ${new Date(result.updated).toLocaleString()})\n`;
});

return response;
```

## Error Handling and Notification System

### User Prompt

"Set up a notification system for any workflow that fails."

### Assistant Actions

```javascript
// This scenario demonstrates creating a monitoring workflow that checks for failures
// and sends notifications

// First, check if a monitoring workflow already exists
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});
const existingMonitor = workflows.find(workflow => 
  workflow.name.toLowerCase().includes('workflow monitor') || 
  workflow.name.toLowerCase().includes('error notification')
);

if (existingMonitor) {
  return `You already have a monitoring workflow: "${existingMonitor.name}" (ID: ${existingMonitor.id}). Would you like me to update it instead?`;
}

// Create a new monitoring workflow
const monitorWorkflow = await useMcpTool('n8n-mcp-server', 'workflow_create', {
  name: "Workflow Error Notification System",
  active: false, // Start inactive until configured
  nodes: [
    {
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      position: [100, 300],
      parameters: {
        cronExpression: "*/15 * * * *" // Run every 15 minutes
      }
    },
    {
      name: "Get Failed Executions",
      type: "n8n-nodes-base.n8n",
      position: [300, 300],
      parameters: {
        resource: "execution",
        operation: "getAll",
        filters: {
          status: "error",
          // Look for executions in the last 15 minutes
          finished: {
            $gt: "={{$now.minus({ minutes: 15 }).toISOString()}}"
          }
        }
      }
    },
    {
      name: "Filter Empty",
      type: "n8n-nodes-base.filter",
      position: [500, 300],
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.length > 0 }}",
              operation: "equal",
              value2: true
            }
          ]
        }
      }
    },
    {
      name: "Format Notification",
      type: "n8n-nodes-base.function",
      position: [700, 300],
      parameters: {
        functionCode: `
// Function to format error notifications
const executions = items;
const now = new Date();

// Group by workflow
const workflowErrors = {};
for (const execution of executions) {
  const workflowId = execution.workflowId;
  const workflowName = execution.workflowData.name;
  
  if (!workflowErrors[workflowId]) {
    workflowErrors[workflowId] = {
      name: workflowName,
      errors: []
    };
  }
  
  workflowErrors[workflowId].errors.push({
    id: execution.id,
    time: execution.finished,
    error: execution.error?.message || "Unknown error"
  });
}

// Create notification text
let notificationText = "⚠️ Workflow Error Alert ⚠️\\n\\n";
notificationText += "The following workflows have failed:\\n\\n";

for (const [workflowId, data] of Object.entries(workflowErrors)) {
  notificationText += \`👉 \${data.name} (ID: \${workflowId})\\n\`;
  notificationText += \`   Failed executions: \${data.errors.length}\\n\`;
  
  // Add details about each failure
  data.errors.forEach(error => {
    const time = new Date(error.time).toLocaleString();
    notificationText += \`   - \${time}: \${error.error}\\n\`;
  });
  
  notificationText += "\\n";
}

notificationText += "Check your n8n dashboard for more details.";

return [{
  json: {
    text: notificationText,
    subject: \`n8n Alert: \${Object.keys(workflowErrors).length} Workflow(s) Failed\`,
    timestamp: now.toISOString()
  }
}];
`
      }
    },
    {
      name: "Send Email",
      type: "n8n-nodes-base.emailSend",
      position: [900, 300],
      parameters: {
        to: "{{$env.EMAIL_RECIPIENT}}", // Will need to be configured
        subject: "{{$json.subject}}",
        text: "{{$json.text}}"
      }
    }
  ],
  connections: {
    "Schedule Trigger": {
      main: [
        [
          {
            node: "Get Failed Executions",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Get Failed Executions": {
      main: [
        [
          {
            node: "Filter Empty",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Filter Empty": {
      main: [
        [
          {
            node: "Format Notification",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Format Notification": {
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
# Workflow Error Notification System Created

I've created a new workflow that will monitor for failed executions and send email notifications.

**Workflow ID:** ${monitorWorkflow.id}

## Configuration Needed:
1. The workflow is currently **inactive** - you'll need to activate it once configured
2. Set up the email configuration in n8n settings
3. Configure the "Send Email" node with your recipient email address

## How It Works:
- Runs every 15 minutes
- Checks for any workflows that failed in the last 15 minutes
- Groups failures by workflow and formats a notification
- Sends an email with details about the failures

You can customize the notification format, schedule, and notification method by editing the workflow in the n8n interface.
`;
```

## Data Migration Between Workflows

### User Prompt

"Help me move data from my 'Legacy CRM' workflow to my 'New CRM' workflow."

### Assistant Actions

```javascript
// Get all workflows
const workflows = await useMcpTool('n8n-mcp-server', 'workflow_list', {});

// Find the source and target workflows
const legacyWorkflow = workflows.find(w => w.name.toLowerCase().includes('legacy crm'));
const newWorkflow = workflows.find(w => w.name.toLowerCase().includes('new crm'));

if (!legacyWorkflow) {
  return "I couldn't find a workflow with 'Legacy CRM' in the name. Please check the exact name of your source workflow.";
}

if (!newWorkflow) {
  return "I couldn't find a workflow with 'New CRM' in the name. Please check the exact name of your target workflow.";
}

// Create a data migration workflow
const migrationWorkflow = await useMcpTool('n8n-mcp-server', 'workflow_create', {
  name: "Data Migration: Legacy CRM to New CRM",
  active: false, // Start inactive until confirmed
  nodes: [
    {
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      position: [100, 300],
      parameters: {}
    },
    {
      name: "Execute Legacy Workflow",
      type: "n8n-nodes-base.executeWorkflow",
      position: [300, 300],
      parameters: {
        workflowId: legacyWorkflow.id,
        options: {
          includeData: true
        }
      }
    },
    {
      name: "Transform Data",
      type: "n8n-nodes-base.function",
      position: [500, 300],
      parameters: {
        functionCode: `
// This is a placeholder transformation function that you'll need to customize
// based on the actual data structure of your workflows

const legacyData = items;
const transformedItems = [];

// Example transformation (modify based on your data structures)
for (const item of legacyData) {
  transformedItems.push({
    json: {
      // Map legacy fields to new fields
      customer_id: item.json.id,
      customer_name: item.json.fullName || \`\${item.json.firstName || ''} \${item.json.lastName || ''}\`.trim(),
      email: item.json.emailAddress || item.json.email,
      phone: item.json.phoneNumber || item.json.phone,
      notes: item.json.comments || item.json.notes || '',
      // Add migration metadata
      migrated_from_legacy: true,
      migration_date: new Date().toISOString()
    }
  });
}

return transformedItems;
`
      }
    },
    {
      name: "Execute New Workflow",
      type: "n8n-nodes-base.executeWorkflow",
      position: [700, 300],
      parameters: {
        workflowId: newWorkflow.id,
        options: {
          includeData: true
        }
      }
    },
    {
      name: "Migration Summary",
      type: "n8n-nodes-base.function",
      position: [900, 300],
      parameters: {
        functionCode: `
// Create a summary of the migration
const results = items;
const totalItems = items.length;
const successItems = items.filter(item => !item.json.error).length;
const errorItems = totalItems - successItems;

return [
  {
    json: {
      summary: "Migration Complete",
      total_records: totalItems,
      successful_records: successItems,
      failed_records: errorItems,
      completion_time: new Date().toISOString()
    }
  }
];
`
      }
    }
  ],
  connections: {
    "Manual Trigger": {
      main: [
        [
          {
            node: "Execute Legacy Workflow",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Execute Legacy Workflow": {
      main: [
        [
          {
            node: "Transform Data",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Transform Data": {
      main: [
        [
          {
            node: "Execute New Workflow",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Execute New Workflow": {
      main: [
        [
          {
            node: "Migration Summary",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  }
});

return `
# Data Migration Workflow Created

I've created a new workflow to migrate data from "${legacyWorkflow.name}" to "${newWorkflow.name}".

**Migration Workflow ID:** ${migrationWorkflow.id}

## Important Notes:
1. The workflow is currently **inactive** - activate it only when you're ready to perform the migration
2. The data transformation is a placeholder - you'll need to edit the "Transform Data" function node to map fields correctly based on your specific data structures
3. This is a one-time migration workflow - run it manually when you're ready to migrate the data

## Next Steps:
1. Open the workflow in the n8n interface
2. Edit the "Transform Data" function to correctly map your data fields
3. Test the workflow with a small sample if possible
4. Activate and run the workflow to perform the migration
5. Check the migration summary for results

Would you like me to help you customize the data transformation based on the specific fields in your CRM workflows?
`;
```

These examples demonstrate more advanced usage patterns for the n8n MCP Server. For integration with other systems, see the [Integration Examples](./integration-examples.md) page.
