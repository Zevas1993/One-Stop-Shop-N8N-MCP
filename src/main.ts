/**
 * n8n Co-Pilot MCP Server
 *
 * A stateless extension of n8n that provides:
 * - Live node catalog sync from connected n8n instance
 * - Bulletproof validation (nothing broken reaches n8n)
 * - Dual interface: MCP for AI agents, HTTP for humans (Open WebUI)
 * - Embedded LLM with dual-model architecture (embedding + generation)
 * - Event-driven multi-agent system with knowledge management
 *
 * Usage:
 *   npx n8n-mcp                    # Start in MCP mode (for Claude Desktop)
 *   npx n8n-mcp --http             # Start in HTTP mode (for Open WebUI)
 *   npx n8n-mcp --http --port 3001 # Custom port
 *
 * Environment Variables:
 *   N8N_API_URL     - n8n instance URL (default: http://localhost:5678)
 *   N8N_API_KEY     - n8n API key (required for most features)
 *   OLLAMA_URL      - Ollama URL for LLM (default: http://localhost:11434)
 *   AUTH_TOKEN      - Authentication token for HTTP mode
 *   PORT            - HTTP server port (default: 3001)
 */

import dotenv from "dotenv";
// Always try to load .env file - this provides defaults for local development
// Use override: true to ensure .env values take precedence (fixes Windows # character issue)
try {
  dotenv.config({ override: true });
} catch (e) {
  // Ignore errors if .env doesn't exist
}

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logger } from "./utils/logger";
import { initCore, getCore } from "./core";
import {
  initAISystem,
  getAISystemStatus,
  shutdownAISystem,
  getLLMRouter,
  getKnowledgeAgent,
} from "./ai";
import { startMCPInterface } from "./interfaces/mcp-interface";
import {
  createOpenWebUIRouter,
  generateOpenWebUIPipeline,
} from "./interfaces/openwebui-interface";
import { NodeFilter } from "./core/node-filter";

// Initialize NodeFilter early to load configuration
try {
  const nodeFilter = NodeFilter.getInstance();
  logger.info(
    `[Main] Node restrictions: ${
      nodeFilter.isCommunityNodesAllowed()
        ? "Community Nodes Allowed"
        : "Built-in Nodes Only"
    }`
  );
} catch (e) {
  logger.warn("[Main] Failed to initialize NodeFilter:", e);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ServerConfig {
  mode: "mcp" | "http";
  port: number;
  n8nUrl: string;
  n8nApiKey: string;
  ollamaUrl: string;
  authToken: string;
  enableDryRun: boolean;
  enableLearning: boolean;
}

function getConfig(): ServerConfig {
  const args = process.argv.slice(2);
  const isHttp = args.includes("--http") || process.env.MCP_MODE === "http";
  const portArg = args.find((a) => a.startsWith("--port="));

  return {
    mode: isHttp ? "http" : "mcp",
    port: portArg
      ? parseInt(portArg.split("=")[1])
      : parseInt(process.env.PORT || "3001"),
    n8nUrl: process.env.N8N_API_URL || "http://localhost:5678",
    n8nApiKey: process.env.N8N_API_KEY || "",
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    authToken: process.env.AUTH_TOKEN || "",
    enableDryRun: process.env.ENABLE_DRY_RUN !== "false",
    enableLearning: process.env.ENABLE_LEARNING !== "false",
  };
}

// ============================================================================
// HTTP SERVER
// ============================================================================

async function startHttpServer(config: ServerConfig): Promise<void> {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow Open WebUI integration
    })
  );

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: { error: "Too many requests, please try again later" },
    })
  );

  // Body parsing
  app.use(express.json({ limit: "10mb" }));

  // Authentication middleware (if AUTH_TOKEN is set)
  if (config.authToken) {
    app.use((req, res, next) => {
      // Skip auth for health check and Open WebUI manifest
      if (req.path === "/health" || req.path === "/openwebui/manifest") {
        return next();
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing authorization header" });
      }

      const token = authHeader.substring(7);
      if (token !== config.authToken) {
        return res.status(403).json({ error: "Invalid token" });
      }

      next();
    });
  }

  // Health check endpoint
  app.get("/health", (req, res) => {
    try {
      const core = getCore();
      const aiStatus = getAISystemStatus();

      res.json({
        status: "ok",
        ready: core.isReady(),
        ...core.getStatus(),
        ai: aiStatus,
      });
    } catch (error: any) {
      res.json({
        status: "error",
        ready: false,
        error: error.message,
      });
    }
  });

  // Mount Open WebUI routes
  app.use("/openwebui", createOpenWebUIRouter());

  // API endpoints for direct access
  app.post("/api/workflow", async (req, res) => {
    try {
      const core = getCore();
      const result = await core.createWorkflow(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/workflow/:id", async (req, res) => {
    try {
      const core = getCore();
      const workflow = await core.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/validate", async (req, res) => {
    try {
      const core = getCore();
      const result = await core.validateWorkflow(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/nodes/search", async (req, res) => {
    try {
      const core = getCore();
      const query = (req.query.q as string) || "";
      const nodes = core.searchNodes(query);
      res.json({
        count: nodes.length,
        nodes: nodes.slice(0, 50).map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 150),
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/status", (req, res) => {
    try {
      const core = getCore();
      const aiStatus = getAISystemStatus();
      res.json({
        core: core.getStatus(),
        ai: aiStatus,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // LLM endpoints
  app.post("/api/llm/generate", async (req, res) => {
    try {
      const llmRouter = getLLMRouter();
      if (!llmRouter.isAvailable()) {
        return res.status(503).json({ error: "LLM not available" });
      }

      const result = await llmRouter.generate(req.body.prompt, {
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens,
        system: req.body.system,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/llm/chat", async (req, res) => {
    try {
      const llmRouter = getLLMRouter();
      if (!llmRouter.isAvailable()) {
        return res.status(503).json({ error: "LLM not available" });
      }

      const result = await llmRouter.chat(req.body.messages, {
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/llm/embed", async (req, res) => {
    try {
      const llmRouter = getLLMRouter();
      if (!llmRouter.isAvailable()) {
        return res.status(503).json({ error: "LLM not available" });
      }

      const result = await llmRouter.embed(req.body.text);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Knowledge endpoints
  app.post("/api/knowledge/search", async (req, res) => {
    try {
      const agent = getKnowledgeAgent();
      const results = await agent.search({
        query: req.body.query,
        category: req.body.category,
        type: req.body.type,
        limit: req.body.limit,
      });
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/knowledge/status", async (req, res) => {
    try {
      const agent = getKnowledgeAgent();
      res.json(agent.getStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate Open WebUI pipeline code
  app.get("/api/openwebui-pipeline", (req, res) => {
    const serverUrl = `http://localhost:${config.port}`;
    const pipeline = generateOpenWebUIPipeline(serverUrl);
    res.type("text/plain").send(pipeline);
  });

  // Start server
  app.listen(config.port, () => {
    logger.info(`[HTTP] Server running on http://localhost:${config.port}`);
    logger.info(
      `[HTTP] Open WebUI integration: http://localhost:${config.port}/openwebui`
    );
    logger.info(`[HTTP] Health check: http://localhost:${config.port}/health`);

    if (!config.authToken) {
      logger.warn("[HTTP] ⚠️  No AUTH_TOKEN set - server is unprotected!");
    }
  });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const config = getConfig();

  // In MCP mode, EVERYTHING must go to stderr to avoid breaking JSON-RPC on stdout
  const logFn = config.mode === "mcp" ? console.error : console.log;
  logFn("");
  logFn("╔════════════════════════════════════════════════════════════╗");
  logFn("║              n8n Co-Pilot MCP Server v3.0.0                ║");
  logFn("║                                                            ║");
  logFn("║  Stateless • Validated • Live Sync • LLM-Powered          ║");
  logFn("╚════════════════════════════════════════════════════════════╝");
  logFn("");

  logger.info(`[Main] Starting in ${config.mode.toUpperCase()} mode...`);
  logger.info(`[Main] n8n URL: ${config.n8nUrl}`);
  logger.info(`[Main] Ollama URL: ${config.ollamaUrl}`);

  // Check for API key
  if (!config.n8nApiKey) {
    logger.warn(
      "[Main] ⚠️  N8N_API_KEY not set - many features will be limited"
    );
  }

  // Version Monitoring & Auto-Rebuild
  if (process.env.N8N_AUTO_SYNC === "true") {
    try {
      const { N8nVersionMonitor } = require("./services/n8n-version-monitor");
      const monitor = new N8nVersionMonitor();
      const { hasUpdates, changes } = await monitor.checkForUpdates();

      if (hasUpdates) {
        logger.info(
          "🔄 Auto-rebuild enabled: Triggering rebuild due to detected updates..."
        );
        changes.forEach((c: string) => logger.info(`   - ${c}`));
        await monitor.triggerRebuild();
      }

      monitor.startMonitoring(true);
    } catch (error: any) {
      logger.warn("[Main] Version monitoring failed:", error.message);
    }
  }

  // Initialize AI system first (non-blocking if Ollama isn't available)
  logger.info("[Main] Step 1/2: Initializing AI system...");
  const aiReady = await initAISystem({
    ollamaUrl: config.ollamaUrl,
    enableLearning: config.enableLearning,
  });

  if (aiReady) {
    const aiStatus = getAISystemStatus();
    logger.info("[Main] AI system ready:", {
      backend: aiStatus.llmBackend,
      embeddingModel: aiStatus.embeddingModel,
      generationModel: aiStatus.generationModel,
    });
  } else {
    logger.warn(
      "[Main] AI system not available - some features will be disabled"
    );
  }

  // Initialize core (n8n connection, validation, etc.)
  logger.info("[Main] Step 2/2: Initializing core...");
  let coreReady = false;
  try {
    await initCore({
      n8nUrl: config.n8nUrl,
      n8nApiKey: config.n8nApiKey,
      ollamaUrl: config.ollamaUrl,
      enableDryRun: config.enableDryRun,
      enableSemanticCheck: aiReady,
    });
    coreReady = true;
  } catch (error: any) {
    logger.error("[Main] Failed to initialize core:", error.message);
    logger.warn(
      "[Main] Running in degraded mode - n8n features will be limited"
    );
    // Don't exit - allow MCP interface to run with limited functionality
  }

  // Wire LLM brain to validation gateway if AI is available
  if (aiReady) {
    try {
      const core = getCore();
      const validationGateway = core.getValidationGateway();
      const llmRouter = getLLMRouter();

      // Create a simple adapter for the validation gateway
      validationGateway.setLLMBrain({
        analyzeWorkflowLogic: async (workflow: any) => {
          const prompt = `Analyze this n8n workflow for logical issues:

Nodes: ${workflow.nodes?.map((n: any) => `${n.name} (${n.type})`).join(", ")}
Connections: ${JSON.stringify(workflow.connections).substring(0, 500)}

Return JSON: { "valid": true/false, "issues": [{"severity": "warning", "message": "..."}], "suggestions": ["..."] }`;

          try {
            const result = await llmRouter.generate(prompt, {
              temperature: 0.3,
              maxTokens: 500,
            });

            // Try to parse JSON response
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[0]);
            }
            return { valid: true, issues: [], suggestions: [] };
          } catch (error) {
            return { valid: true, issues: [], suggestions: [] };
          }
        },
      });

      logger.info("[Main] LLM brain connected to validation gateway");
    } catch (error) {
      logger.warn("[Main] Could not connect LLM to validation:", error);
    }
  }

  // Start appropriate server
  if (config.mode === "http") {
    await startHttpServer(config);
  } else {
    // MCP mode (stdio)
    await startMCPInterface();
  }

  // Handle shutdown
  const shutdown = async () => {
    logger.info("[Main] Shutting down...");

    try {
      const core = getCore();
      core.shutdown();
    } catch (e) {}

    await shutdownAISystem();

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run
main().catch((error) => {
  logger.error("[Main] Fatal error:", error);
  process.exit(1);
});
