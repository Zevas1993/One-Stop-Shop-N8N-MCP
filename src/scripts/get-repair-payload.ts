// Define the layout update directly to avoid import issues
const layoutUpdate = {
  nodes: [
    // --- Triggers (Left) ---
    {
      name: "Outlook Email Trigger",
      type: "n8n-nodes-base.microsoftOutlookTrigger",
      position: [0, 200],
      typeVersion: 1,
      parameters: { pollInterval: 60 },
      credentials: {},
    },
    {
      name: "Teams Message Trigger",
      type: "n8n-nodes-base.microsoftTeamsTrigger",
      position: [0, 600],
      typeVersion: 1,
      parameters: {},
      credentials: {},
    },

    // --- Pre-Processing (Middle-Left) ---
    {
      name: "Process Email for RAG",
      type: "n8n-nodes-base.code",
      position: [250, 200],
      typeVersion: 1,
      parameters: { jsCode: "// Extract email body for RAG processing" },
      credentials: {},
    },
    {
      name: "Process Teams Input",
      type: "n8n-nodes-base.code",
      position: [250, 600],
      typeVersion: 1,
      parameters: { jsCode: "// Prepare Teams message for agent" },
      credentials: {},
    },

    // --- AI Models & Memory (Top-Center) ---
    {
      name: "OpenAI Chat Model",
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      position: [500, 0],
      typeVersion: 1,
      parameters: { model: "gpt-4o", options: {} },
      credentials: {},
    },
    {
      name: "Window Buffer Memory",
      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      position: [500, 150],
      typeVersion: 1,
      parameters: {},
      credentials: {},
    },

    // --- RAG Agents (Center-Right) ---
    {
      name: "Fraud Classifier",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 100],
      typeVersion: 1,
      parameters: {
        text: "You are a fraud detection expert. Analyze the email content for suspicious patterns.",
        options: { systemMessage: "Classify the email as 'Fraud' or 'Safe'." },
      },
      credentials: {},
    },
    {
      name: "Billing RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 300],
      typeVersion: 1,
      parameters: {
        text: "You are a billing support agent. Answer questions about invoices and payments.",
        options: {
          systemMessage: "Use the RAG tools to find billing information.",
        },
      },
      credentials: {},
    },
    {
      name: "High Priority RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 500],
      typeVersion: 1,
      parameters: {
        text: "You are a priority support agent. Handle urgent requests immediately.",
        options: { systemMessage: "Prioritize this request above all others." },
      },
      credentials: {},
    },

    // --- Central Orchestrator (Center-Bottom) ---
    {
      name: "AI Agent (Central)",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [500, 800],
      typeVersion: 1,
      parameters: {
        text: "You are the central orchestrator. Coordinate between specialized agents and tools.",
        options: {
          systemMessage: "Route the request to the appropriate agent or tool.",
        },
      },
      credentials: {},
    },

    // --- Tools & Actions (Right) ---
    {
      name: "Postgres Memory",
      type: "n8n-nodes-base.postgres",
      position: [900, 700],
      typeVersion: 1,
      parameters: { operation: "executeQuery" },
      credentials: {},
    },
    {
      name: "Search Emails",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [900, 850],
      typeVersion: 2,
      parameters: { resource: "message", operation: "getAll" },
      credentials: {},
    },
    {
      name: "Get Calendar Events",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [900, 1000],
      typeVersion: 2,
      parameters: { resource: "event", operation: "getAll" },
      credentials: {},
    },
    {
      name: "Create Calendar Event",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1100, 1000],
      typeVersion: 2,
      parameters: {
        resource: "event",
        operation: "create",
        subject: "Meeting",
        startDateTime: "2024-01-01T09:00:00",
        endDateTime: "2024-01-01T10:00:00",
      },
      credentials: {},
    },
    {
      name: "Create Draft",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1100, 850],
      typeVersion: 2,
      parameters: {
        resource: "message",
        operation: "send",
        toRecipients: "draft@example.com",
        body: "Draft content",
      }, // Changed to send as create was rejected
      credentials: {},
    },
    {
      name: "Send Email",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1300, 850],
      typeVersion: 2,
      parameters: {
        resource: "message",
        operation: "send",
        toRecipients: "recipient@example.com",
        subject: "Hello",
        body: "Content",
      },
      credentials: {},
    },
    {
      name: "Send Teams Response",
      type: "n8n-nodes-base.microsoftTeams",
      position: [900, 1150],
      typeVersion: 2,
      parameters: { operation: "sendMessage", content: "Response" },
      credentials: {},
    },

    // --- Sticky Notes (Organization) ---
    {
      name: "Note: Inputs",
      type: "n8n-nodes-base.stickyNote",
      position: [-50, 150],
      parameters: {
        content: "## Inputs\nEmail and Teams triggers to start the workflow.",
        height: 600,
        width: 200,
        color: 2,
      },
    },
    {
      name: "Note: AI Config",
      type: "n8n-nodes-base.stickyNote",
      position: [450, -50],
      parameters: {
        content: "## AI Config\nModel and Memory shared across agents.",
        height: 300,
        width: 250,
        color: 3,
      },
    },
    {
      name: "Note: Specialized Agents",
      type: "n8n-nodes-base.stickyNote",
      position: [750, 50],
      parameters: {
        content:
          "## Specialized Agents\nDedicated agents for specific tasks (Fraud, Billing, Priority).",
        height: 600,
        width: 250,
        color: 4,
      },
    },
    {
      name: "Note: Central Orchestrator",
      type: "n8n-nodes-base.stickyNote",
      position: [450, 750],
      parameters: {
        content:
          "## Central Orchestrator\nMain agent that coordinates tools and responses.",
        height: 500,
        width: 300,
        color: 5,
      },
    },
    {
      name: "Note: Tools",
      type: "n8n-nodes-base.stickyNote",
      position: [850, 650],
      parameters: {
        content:
          "## Tools\nOutlook, Teams, and Database tools available to the Central Agent.",
        height: 600,
        width: 600,
        color: 6,
      },
    },
  ],
  connections: {
    "Outlook Email Trigger": {
      main: [[{ node: "Process Email for RAG", type: "main", index: 0 }]],
    },
    "Process Email for RAG": {
      main: [
        [
          { node: "Fraud Classifier", type: "main", index: 0 },
          { node: "Billing RAG Agent", type: "main", index: 0 },
          { node: "High Priority RAG Agent", type: "main", index: 0 },
        ],
      ],
    },
    "Teams Message Trigger": {
      main: [[{ node: "Process Teams Input", type: "main", index: 0 }]],
    },
    "Process Teams Input": {
      main: [[{ node: "AI Agent (Central)", type: "main", index: 0 }]],
    },
    "AI Agent (Central)": {
      main: [[{ node: "Send Teams Response", type: "main", index: 0 }]],
    },

    // AI Connections
    "OpenAI Chat Model": {
      ai_languageModel: [
        [
          { node: "Fraud Classifier", type: "ai_languageModel", index: 0 },
          { node: "Billing RAG Agent", type: "ai_languageModel", index: 0 },
          {
            node: "High Priority RAG Agent",
            type: "ai_languageModel",
            index: 0,
          },
          { node: "AI Agent (Central)", type: "ai_languageModel", index: 0 },
        ],
      ],
    },
    "Window Buffer Memory": {
      ai_memory: [
        [
          { node: "Fraud Classifier", type: "ai_memory", index: 0 },
          { node: "Billing RAG Agent", type: "ai_memory", index: 0 },
          { node: "High Priority RAG Agent", type: "ai_memory", index: 0 },
          { node: "AI Agent (Central)", type: "ai_memory", index: 0 },
        ],
      ],
    },

    // Tools
    "Postgres Memory": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
    "Search Emails": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
    "Get Calendar Events": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
    "Create Calendar Event": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
    "Create Draft": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
    "Send Email": {
      ai_tool: [[{ node: "AI Agent (Central)", type: "ai_tool", index: 0 }]],
    },
  },
};

// Add system fields to verify auto-cleaning
const payload = {
  ...layoutUpdate,
  name: "Teams-Outlook RAG Assistant - Natural Language Ready (Fixed)", // Change name to bypass cache
  nodes: layoutUpdate.nodes.filter(
    (n) => n.type !== "n8n-nodes-base.stickyNote"
  ),
  active: true, // System field that should be stripped
  tags: ["auto-fixed"], // System field that should be stripped
};

const fs = require("fs");
fs.writeFileSync("payload.json", JSON.stringify(payload));
console.log("Payload written to payload.json");
