/**
 * Local LLM HTTP API Routes
 * Provides REST API for web UI interaction with local nano LLM
 */

import { Router, Request, Response } from 'express';
import { LocalLLMOrchestrator } from '../ai/local-llm-orchestrator';
import { HardwareDetector, NanoLLMOption } from '../ai/hardware-detector';
import { getDockerModelRunnerStatus } from '../ai/docker-model-runner-client';
import { logger } from '../utils/logger';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Setup state persistence file
const SETUP_STATE_FILE = path.join(process.cwd(), 'data', 'setup-state.json');

interface SetupState {
  configured: boolean;
  n8nApiUrl?: string;
  n8nApiKey?: string;
  n8nUsername?: string;
  n8nPassword?: string;
  configuredAt?: string;
}

function loadSetupState(): SetupState {
  try {
    if (fs.existsSync(SETUP_STATE_FILE)) {
      const data = fs.readFileSync(SETUP_STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('[Setup] Failed to load setup state:', error);
  }
  return { configured: false };
}

function saveSetupState(state: SetupState): void {
  try {
    const dir = path.dirname(SETUP_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETUP_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    logger.error('[Setup] Failed to save setup state:', error);
  }
}

export function createLocalLLMRoutes(): Router {
  const router = Router();

  // Global orchestrator instance (initialized on first request)
  let orchestrator: LocalLLMOrchestrator | null = null;

  /**
   * Ensure orchestrator is initialized
   */
  async function ensureOrchestratorReady(): Promise<LocalLLMOrchestrator> {
    if (!orchestrator) {
      logger.info('[LocalLLM API] Initializing orchestrator...');
      orchestrator = new LocalLLMOrchestrator();
      await orchestrator.initialize();
    }
    return orchestrator;
  }

  // ==========================================
  // Setup Wizard API Routes (for Docker Desktop)
  // ==========================================

  /**
   * GET /api/setup/status
   * Check if initial setup has been completed
   */
  router.get('/api/setup/status', async (req: Request, res: Response): Promise<void> => {
    try {
      const setupState = loadSetupState();
      const hardware = HardwareDetector.detectHardware();

      // Test n8n connection if configured
      let n8nConnected = false;
      let nodeCount = 0;

      if (setupState.configured && setupState.n8nApiUrl && setupState.n8nApiKey) {
        try {
          const response = await axios.get(`${setupState.n8nApiUrl}/api/v1/workflows`, {
            headers: { 'X-N8N-API-KEY': setupState.n8nApiKey },
            timeout: 5000,
          });
          n8nConnected = true;
          nodeCount = 800; // Approximate node count
        } catch {
          n8nConnected = false;
        }
      }

      res.json({
        configured: setupState.configured,
        n8nConnected,
        n8nApiUrl: setupState.n8nApiUrl || null,
        nodeCount,
        hardware: {
          cpuCores: hardware.cpuCores,
          ramGbytes: hardware.ramGbytes,
          hasGpu: hardware.hasGpu,
          osType: hardware.osType,
        },
        selectedLLM: {
          displayName: 'Nano LLM',
          modelSize: 'Auto-selected',
          speed: 'Fast',
          quality: 'Good',
        },
      });
    } catch (error) {
      logger.error('[Setup API] Status error:', error);
      res.status(500).json({
        configured: false,
        error: error instanceof Error ? error.message : 'Status check failed',
      });
    }
  });

  /**
   * POST /api/setup/test-n8n
   * Test n8n API connection
   */
  router.post('/api/setup/test-n8n', async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiUrl, apiKey } = req.body;

      if (!apiUrl || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'apiUrl and apiKey are required',
        });
        return;
      }

      // Test connection to n8n API
      try {
        const response = await axios.get(`${apiUrl}/api/v1/workflows`, {
          headers: { 'X-N8N-API-KEY': apiKey },
          timeout: 10000,
        });

        // Try to get node count
        let nodeCount = 800; // Default estimate
        try {
          const typesResponse = await axios.get(`${apiUrl}/api/v1/node-types`, {
            headers: { 'X-N8N-API-KEY': apiKey },
            timeout: 5000,
          });
          if (typesResponse.data?.data) {
            nodeCount = typesResponse.data.data.length;
          }
        } catch {
          // Node types endpoint may not be available
        }

        res.json({
          success: true,
          nodeCount,
          message: 'Successfully connected to n8n',
        });
      } catch (error: any) {
        const errorMessage = error.response?.status === 401
          ? 'Invalid API key'
          : error.code === 'ECONNREFUSED'
          ? 'Cannot connect to n8n - is it running?'
          : error.message || 'Connection failed';

        res.json({
          success: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      logger.error('[Setup API] Test n8n error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    }
  });

  /**
   * POST /api/setup/test-login
   * Test n8n login credentials
   */
  router.post('/api/setup/test-login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiUrl, username, password } = req.body;

      if (!apiUrl || !username || !password) {
        res.status(400).json({
          success: false,
          error: 'apiUrl, username, and password are required',
        });
        return;
      }

      // Try to authenticate with n8n
      try {
        const response = await axios.post(
          `${apiUrl}/rest/login`,
          { email: username, password },
          {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (response.status === 200) {
          res.json({
            success: true,
            message: 'Login successful',
          });
        } else {
          res.json({
            success: false,
            error: 'Invalid credentials',
          });
        }
      } catch (error: any) {
        const errorMessage = error.response?.status === 401
          ? 'Invalid username or password'
          : error.response?.status === 403
          ? 'Account may have MFA enabled (not supported)'
          : error.message || 'Login failed';

        res.json({
          success: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      logger.error('[Setup API] Test login error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    }
  });

  /**
   * POST /api/setup/complete
   * Save configuration and mark setup as complete
   */
  router.post('/api/setup/complete', async (req: Request, res: Response): Promise<void> => {
    try {
      const { n8nApiUrl, n8nApiKey, n8nUsername, n8nPassword } = req.body;

      if (!n8nApiUrl || !n8nApiKey) {
        res.status(400).json({
          success: false,
          error: 'n8nApiUrl and n8nApiKey are required',
        });
        return;
      }

      // Save setup state
      const setupState: SetupState = {
        configured: true,
        n8nApiUrl,
        n8nApiKey,
        n8nUsername: n8nUsername || undefined,
        n8nPassword: n8nPassword || undefined,
        configuredAt: new Date().toISOString(),
      };

      saveSetupState(setupState);

      // Set environment variables for current session
      process.env.N8N_API_URL = n8nApiUrl;
      process.env.N8N_API_KEY = n8nApiKey;
      if (n8nUsername) process.env.N8N_USERNAME = n8nUsername;
      if (n8nPassword) process.env.N8N_PASSWORD = n8nPassword;

      logger.info('[Setup API] Setup completed successfully');

      res.json({
        success: true,
        message: 'Setup completed successfully',
        configured: true,
        n8nConnected: true,
        n8nApiUrl,
        nodeCount: 800,
      });
    } catch (error) {
      logger.error('[Setup API] Complete error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Setup failed',
      });
    }
  });

  /**
   * POST /api/setup/test-model-runner
   * Test Docker Model Runner connection and vLLM availability
   */
  router.post('/api/setup/test-model-runner', async (req: Request, res: Response): Promise<void> => {
    try {
      const { baseUrl } = req.body;

      logger.info('[Setup API] Testing Docker Model Runner connection...', { baseUrl });

      // Get Docker Model Runner status
      const status = await getDockerModelRunnerStatus();

      if (!status.available) {
        res.json({
          success: false,
          available: false,
          vllmAvailable: false,
          error: 'Docker Model Runner is not available. Ensure Docker Desktop 4.54+ is running with Model Runner enabled.',
          troubleshooting: [
            'Verify Docker Desktop is running',
            'Update to Docker Desktop 4.54 or newer',
            'Enable Model Runner in Docker Desktop settings',
            'Check if port 12434 is accessible',
          ],
        });
        return;
      }

      // Return success with model runner status
      res.json({
        success: true,
        available: true,
        vllmAvailable: status.vllmEnabled,
        vllmVersion: status.vllmVersion || '0.12.0',
        models: status.models.map((m) => ({
          id: m.id,
          name: m.name,
          engine: m.engine,
          format: m.format,
        })),
        modelCount: status.models.length,
        vllmModelCount: status.models.filter((m) => m.engine === 'vllm').length,
        recommendation: status.vllmEnabled
          ? 'Docker Model Runner with vLLM is available and recommended for best performance.'
          : 'Docker Model Runner is available but vLLM models are not loaded. Consider pulling a vLLM model like ai/smollm2-vllm.',
      });
    } catch (error) {
      logger.error('[Setup API] Test Model Runner error:', error);
      res.status(500).json({
        success: false,
        available: false,
        vllmAvailable: false,
        error: error instanceof Error ? error.message : 'Model Runner test failed',
      });
    }
  });

  // ==========================================
  // Setup & Configuration Routes (Legacy)
  // ==========================================

  /**
   * GET /api/local-llm/setup
   * Get setup status and hardware information
   */
  router.get('/api/local-llm/setup', async (req: Request, res: Response): Promise<void> => {
    try {
      const orch = await ensureOrchestratorReady();
      const hardware = orch.getHardwareProfile();
      const config = orch.getConfig();

      const llmInfo = HardwareDetector.getLLMInfo(config.llmOption!);
      const validation = HardwareDetector.validateSystemRequirements(
        config.llmOption!,
        hardware
      );

      res.json({
        status: 'ready',
        hardware: {
          cpuCores: hardware.cpuCores,
          cpuModel: hardware.cpuModel,
          ramGbytes: hardware.ramGbytes,
          hasGpu: hardware.hasGpu,
          osType: hardware.osType,
          arch: hardware.arch,
        },
        selectedLLM: {
          option: config.llmOption,
          displayName: llmInfo.displayName,
          modelSize: llmInfo.modelSize,
          context: llmInfo.context,
          speed: llmInfo.speed,
          quality: llmInfo.quality,
        },
        systemValidation: {
          meetsRequirements: validation.meetsRequirements,
          warnings: validation.warnings,
          recommendations: validation.recommendations,
        },
        recommendation: hardware.recommendationReason,
        isConfigured: orch.getContext().isConfigured,
      });
    } catch (error) {
      logger.error('[LocalLLM API] Setup error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Setup failed',
      });
    }
  });

  /**
   * POST /api/local-llm/configure
   * Configure n8n API credentials
   */
  router.post('/api/local-llm/configure', async (req: Request, res: Response): Promise<void> => {
    try {
      const { n8nApiUrl, n8nApiKey } = req.body;

      if (!n8nApiUrl || !n8nApiKey) {
        res.status(400).json({
          error: 'n8nApiUrl and n8nApiKey are required',
        });
        return;
      }

      const orch = await ensureOrchestratorReady();
      const result = await orch.configureN8n(n8nApiUrl, n8nApiKey);

      res.json(result);
    } catch (error) {
      logger.error('[LocalLLM API] Configuration error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Configuration failed',
      });
    }
  });

  /**
   * GET /api/local-llm/status
   * Get current orchestrator status
   */
  router.get('/api/local-llm/status', async (req: Request, res: Response): Promise<void> => {
    try {
      const orch = await ensureOrchestratorReady();
      const context = orch.getContext();

      res.json({
        status: 'online',
        configured: context.isConfigured,
        messageCount: context.messages.length,
        workflowCount: context.generatedWorkflows.length,
        deployedWorkflows: context.generatedWorkflows.filter((w) => w.isDeployed).length,
      });
    } catch (error) {
      logger.error('[LocalLLM API] Status error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Status check failed',
      });
    }
  });

  // ==========================================
  // Conversation Routes
  // ==========================================

  /**
   * POST /api/local-llm/chat
   * Send message to nano LLM and get response
   */
  router.post('/api/local-llm/chat', async (req: Request, res: Response): Promise<void> => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          error: 'Message is required and must be a string',
        });
        return;
      }

      const orch = await ensureOrchestratorReady();
      const response = await orch.chat(message);

      res.json({
        success: true,
        message: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[LocalLLM API] Chat error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Chat failed',
      });
    }
  });

  /**
   * GET /api/local-llm/conversation
   * Get conversation history
   */
  router.get('/api/local-llm/conversation', async (req: Request, res: Response): Promise<void> => {
    try {
      const orch = await ensureOrchestratorReady();
      const context = orch.getContext();

      res.json({
        messages: context.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        workflowIdeas: context.workflowIdeas,
        totalMessages: context.messages.length,
      });
    } catch (error) {
      logger.error('[LocalLLM API] Conversation error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get conversation',
      });
    }
  });

  /**
   * DELETE /api/local-llm/conversation
   * Clear conversation history
   */
  router.delete('/api/local-llm/conversation', async (req: Request, res: Response): Promise<void> => {
    try {
      const orch = await ensureOrchestratorReady();
      orch.clearContext();

      res.json({
        success: true,
        message: 'Conversation history cleared',
      });
    } catch (error) {
      logger.error('[LocalLLM API] Clear conversation error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to clear conversation',
      });
    }
  });

  // ==========================================
  // Workflow Generation Routes
  // ==========================================

  /**
   * POST /api/local-llm/workflow/generate
   * Generate workflow from idea or recent conversation
   */
  router.post('/api/local-llm/workflow/generate', async (req: Request, res: Response): Promise<void> => {
    try {
      const { idea } = req.body;

      if (!idea || typeof idea !== 'string') {
        res.status(400).json({
          error: 'Workflow idea is required and must be a string',
        });
        return;
      }

      const orch = await ensureOrchestratorReady();
      const result = await orch.generateWorkflow(idea);

      res.json({
        success: true,
        workflow: {
          id: result.id,
          idea: result.idea,
          generatedAt: result.generatedAt,
          nodeCount: result.workflow?.nodes?.length || 0,
          isValid: result.validationResult?.valid,
          isDeployed: result.isDeployed,
        },
      });
    } catch (error) {
      logger.error('[LocalLLM API] Workflow generation error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Workflow generation failed',
      });
    }
  });

  /**
   * GET /api/local-llm/workflows
   * List all generated workflows
   */
  router.get('/api/local-llm/workflows', async (req: Request, res: Response): Promise<void> => {
    try {
      const orch = await ensureOrchestratorReady();
      const context = orch.getContext();

      res.json({
        workflows: context.generatedWorkflows.map((w) => ({
          id: w.id,
          idea: w.idea.substring(0, 100),
          generatedAt: w.generatedAt,
          nodeCount: w.workflow?.nodes?.length || 0,
          isValid: w.validationResult?.valid,
          isDeployed: w.isDeployed,
          deploymentId: w.deploymentId,
        })),
        total: context.generatedWorkflows.length,
        deployed: context.generatedWorkflows.filter((w) => w.isDeployed).length,
      });
    } catch (error) {
      logger.error('[LocalLLM API] Workflows list error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list workflows',
      });
    }
  });

  /**
   * GET /api/local-llm/workflows/:id
   * Get detailed workflow information
   */
  router.get('/api/local-llm/workflows/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const orch = await ensureOrchestratorReady();
      const context = orch.getContext();

      const workflow = context.generatedWorkflows.find((w) => w.id === id);
      if (!workflow) {
        res.status(404).json({
          error: 'Workflow not found',
        });
        return;
      }

      res.json({
        id: workflow.id,
        idea: workflow.idea,
        workflow: workflow.workflow,
        validationResult: workflow.validationResult,
        generatedAt: workflow.generatedAt,
        isDeployed: workflow.isDeployed,
        deploymentId: workflow.deploymentId,
      });
    } catch (error) {
      logger.error('[LocalLLM API] Workflow detail error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get workflow details',
      });
    }
  });

  /**
   * POST /api/local-llm/workflows/:id/deploy
   * Deploy workflow to n8n instance
   */
  router.post('/api/local-llm/workflows/:id/deploy', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const orch = await ensureOrchestratorReady();

      const result = await orch.deployWorkflow(id);
      res.json(result);
    } catch (error) {
      logger.error('[LocalLLM API] Deployment error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Deployment failed',
      });
    }
  });

  // ==========================================
  // LLM Information Routes
  // ==========================================

  /**
   * GET /api/local-llm/llms
   * Get available nano LLM options and their characteristics
   */
  router.get('/api/local-llm/llms', (req: Request, res: Response) => {
    try {
      const llmOptions: Array<{
        value: NanoLLMOption;
        label: string;
        info: any;
        minRam: number;
        minCores: number;
      }> = [];

      const allLlms = [
        NanoLLMOption.PHI_3_MINI,
        NanoLLMOption.PHI_3_SMALL,
        NanoLLMOption.NEURAL_CHAT_7B,
        NanoLLMOption.MIXTRAL_7B,
        NanoLLMOption.LLAMA_2_13B,
      ];

      for (const llm of allLlms) {
        const info = HardwareDetector.getLLMInfo(llm);
        llmOptions.push({
          value: llm,
          label: info.displayName,
          info,
          minRam: getMinRam(llm),
          minCores: getMinCores(llm),
        });
      }

      res.json({ llms: llmOptions });
    } catch (error) {
      logger.error('[LocalLLM API] LLM list error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list LLMs',
      });
    }
  });

  /**
   * GET /api/local-llm/hardware
   * Get detailed hardware information
   */
  router.get('/api/local-llm/hardware', (req: Request, res: Response) => {
    try {
      const hardware = HardwareDetector.detectHardware();

      res.json({
        cpu: {
          cores: hardware.cpuCores,
          model: hardware.cpuModel,
        },
        memory: {
          total: `${hardware.ramGbytes}GB`,
          totalBytes: hardware.totalRamBytes,
        },
        gpu: {
          available: hardware.hasGpu,
          vram: hardware.gpuVram,
        },
        os: {
          type: hardware.osType,
          release: hardware.osRelease,
          arch: hardware.arch,
        },
        recommendation: {
          selectedLlm: hardware.recommendedLlm,
          reason: hardware.recommendationReason,
          embeddingModel: hardware.embeddingModel,
          embeddingModelReason: hardware.embeddingModelReason,
          estimatedEmbeddingLatency: hardware.estimatedEmbeddingLatency,
          generationModel: hardware.generationModel,
          generationModelReason: hardware.generationModelReason,
          estimatedGenerationTokensPerSecond: hardware.estimatedGenerationTokensPerSecond,
        },
      });
    } catch (error) {
      logger.error('[LocalLLM API] Hardware info error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get hardware info',
      });
    }
  });

  /**
   * GET /api/local-llm/nano-models
   * Get information about dual nano LLM models (embedding + generation)
   */
  router.get('/api/local-llm/nano-models', (req: Request, res: Response) => {
    try {
      const hardware = HardwareDetector.detectHardware();
      const embeddingModelInfo = HardwareDetector.getEmbeddingModelInfo(hardware.embeddingModel);
      const generationModelInfo = HardwareDetector.getGenerationModelInfo(hardware.generationModel);

      res.json({
        architecture: 'dual-nano-llm',
        description: 'Separate embedding and generation models optimized for different tasks',
        embeddingModel: {
          selected: hardware.embeddingModel,
          ...embeddingModelInfo,
          reason: hardware.embeddingModelReason,
          estimatedLatency: `${hardware.estimatedEmbeddingLatency}ms`,
        },
        generationModel: {
          selected: hardware.generationModel,
          ...generationModelInfo,
          reason: hardware.generationModelReason,
          estimatedThroughput: `${hardware.estimatedGenerationTokensPerSecond} tokens/second`,
        },
        notes: {
          embeddingModelUse: 'Used for semantic understanding and knowledge graph queries',
          generationModelUse: 'Used for text generation and workflow creation',
          combinedBenefit: 'Lightweight embedding + optimized generation for hardware-aware performance',
        },
      });
    } catch (error) {
      logger.error('[LocalLLM API] Nano models info error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get nano models info',
      });
    }
  });

  return router;
}

// Helper methods
function getMinRam(llm: NanoLLMOption): number {
  const requirements: Record<NanoLLMOption, number> = {
    [NanoLLMOption.PHI_3_MINI]: 2,
    [NanoLLMOption.PHI_3_SMALL]: 4,
    [NanoLLMOption.NEURAL_CHAT_7B]: 4,
    [NanoLLMOption.MIXTRAL_7B]: 6,
    [NanoLLMOption.LLAMA_2_13B]: 16,
  };
  return requirements[llm] || 4;
}

function getMinCores(llm: NanoLLMOption): number {
  const requirements: Record<NanoLLMOption, number> = {
    [NanoLLMOption.PHI_3_MINI]: 2,
    [NanoLLMOption.PHI_3_SMALL]: 2,
    [NanoLLMOption.NEURAL_CHAT_7B]: 2,
    [NanoLLMOption.MIXTRAL_7B]: 4,
    [NanoLLMOption.LLAMA_2_13B]: 4,
  };
  return requirements[llm] || 2;
}
