# Execution Tools

This page documents the tools available for managing n8n workflow executions.

## Overview

Execution tools allow AI assistants to execute n8n workflows and manage execution records. These tools provide a natural language interface to n8n's execution capabilities, allowing workflows to be run, monitored, and their results accessed.

## Available Tools

### run_webhook

Executes a workflow via webhook with optional input data.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "workflowName": {
      "type": "string",
      "description": "Name of the workflow to execute (e.g., \"hello-world\")"
    },
    "data": {
      "type": "object",
      "description": "Input data to pass to the webhook"
    },
    "headers": {
      "type": "object",
      "description": "Additional headers to send with the request"
    }
  },
  "required": ["workflowName"]
}
```

**Example Usage:**

```javascript
// Execute webhook with data
const webhookResult = await useRunWebhook({
  workflowName: "hello-world",
  data: {
    prompt: "Good morning!"
  }
});

// Execute webhook with additional headers
const webhookWithHeaders = await useRunWebhook({
  workflowName: "hello-world",
  data: {
    prompt: "Hello with custom header"
  },
  headers: {
    "X-Custom-Header": "CustomValue"
  }
});
```

**Response:**

```javascript
{
  "status": 200,
  "statusText": "OK",
  "data": {
    // Response data from the webhook
  }
}
```

**Note:** 
- Authentication for the webhook is automatically handled using the environment variables `N8N_WEBHOOK_USERNAME` and `N8N_WEBHOOK_PASSWORD`.
- The tool automatically prefixes the `workflowName` with `webhook/` to create the full webhook path. For example, if you provide `hello-world` as the workflow name, the tool will call `{baseUrl}/webhook/hello-world`.


### execution_run

Executes a workflow with optional input data.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "workflowId": {
      "type": "string",
      "description": "ID of the workflow to execute"
    },
    "data": {
      "type": "object",
      "description": "Input data to pass to the workflow"
    },
    "waitForCompletion": {
      "type": "boolean",
      "description": "Whether to wait for the workflow to complete before returning",
      "default": false
    }
  },
  "required": ["workflowId"]
}
```

**Example Usage:**

```javascript
// Execute without waiting
const execution = await useExecutionRun({
  workflowId: "1234abc"
});

// Execute with input data
const executionWithData = await useExecutionRun({
  workflowId: "1234abc",
  data: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com"
  }
});

// Execute and wait for completion
const completedExecution = await useExecutionRun({
  workflowId: "1234abc",
  waitForCompletion: true
});
```

**Response (when waitForCompletion: false):**

```javascript
{
  "executionId": "exec789",
  "status": "running",
  "startedAt": "2025-03-12T16:30:00.000Z"
}
```

**Response (when waitForCompletion: true):**

```javascript
{
  "executionId": "exec789",
  "status": "success", // Or "error" if execution failed
  "startedAt": "2025-03-12T16:30:00.000Z",
  "finishedAt": "2025-03-12T16:30:05.000Z",
  "data": {
    // Output data from the workflow execution
  }
}
```

### execution_get

Retrieves details of a specific execution.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "executionId": {
      "type": "string",
      "description": "ID of the execution to retrieve"
    }
  },
  "required": ["executionId"]
}
```

**Example Usage:**

```javascript
const execution = await useExecutionGet({
  executionId: "exec789"
});
```

**Response:**

```javascript
{
  "id": "exec789",
  "workflowId": "1234abc",
  "workflowName": "Test Workflow 1",
  "status": "success", // Or "error", "running", "waiting", etc.
  "startedAt": "2025-03-12T16:30:00.000Z",
  "finishedAt": "2025-03-12T16:30:05.000Z",
  "mode": "manual",
  "data": {
    "resultData": {
      // Output data from the workflow execution
    },
    "executionData": {
      // Detailed execution data including node inputs/outputs
    },
    "metadata": {
      // Execution metadata
    }
  }
}
```

### execution_list

Lists executions for a specific workflow.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "workflowId": {
      "type": "string",
      "description": "ID of the workflow to get executions for"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of executions to return",
      "default": 20
    },
    "status": {
      "type": "string",
      "description": "Filter by execution status",
      "enum": ["success", "error", "running", "waiting"]
    }
  },
  "required": ["workflowId"]
}
```

**Example Usage:**

```javascript
// List all executions for a workflow
const executions = await useExecutionList({
  workflowId: "1234abc"
});

// List with limit
const limitedExecutions = await useExecutionList({
  workflowId: "1234abc",
  limit: 5
});

// List only successful executions
const successfulExecutions = await useExecutionList({
  workflowId: "1234abc",
  status: "success"
});
```

**Response:**

```javascript
[
  {
    "id": "exec789",
    "workflowId": "1234abc",
    "status": "success",
    "startedAt": "2025-03-12T16:30:00.000Z",
    "finishedAt": "2025-03-12T16:30:05.000Z",
    "mode": "manual"
  },
  {
    "id": "exec456",
    "workflowId": "1234abc",
    "status": "error",
    "startedAt": "2025-03-11T14:20:00.000Z",
    "finishedAt": "2025-03-11T14:20:10.000Z",
    "mode": "manual"
  }
]
```

### execution_delete

Deletes an execution record.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "executionId": {
      "type": "string",
      "description": "ID of the execution to delete"
    }
  },
  "required": ["executionId"]
}
```

**Example Usage:**

```javascript
await useExecutionDelete({
  executionId: "exec789"
});
```

**Response:**

```javascript
{
  "success": true
}
```

### execution_stop

Stops a running execution.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "executionId": {
      "type": "string",
      "description": "ID of the execution to stop"
    }
  },
  "required": ["executionId"]
}
```

**Example Usage:**

```javascript
await useExecutionStop({
  executionId: "exec789"
});
```

**Response:**

```javascript
{
  "success": true,
  "status": "cancelled",
  "stoppedAt": "2025-03-12T16:32:00.000Z"
}
```

## Execution Status Codes

Executions can have the following status codes:

| Status | Description |
|--------|-------------|
| `running` | The execution is currently in progress |
| `success` | The execution completed successfully |
| `error` | The execution failed with an error |
| `waiting` | The execution is waiting for a webhook or other event |
| `cancelled` | The execution was manually stopped |

## Error Handling

All execution tools can return the following errors:

| Error | Description |
|-------|-------------|
| Authentication Error | The provided API key is invalid or missing |
| Not Found Error | The requested workflow or execution does not exist |
| Validation Error | The input parameters are invalid or incomplete |
| Permission Error | The API key does not have permission to perform the operation |
| Server Error | An unexpected error occurred on the n8n server |

## Best Practices

- Check if a workflow is active before attempting to execute it
- Use `waitForCompletion: true` for short-running workflows, but be cautious with long-running workflows
- Always handle potential errors when executing workflows
- Filter executions by status to find problematic runs
- Use execution IDs from `execution_run` responses to track workflow progress
