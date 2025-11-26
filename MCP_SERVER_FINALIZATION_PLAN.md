# MCP Server Finalization Plan
## Production Hardening for External Agent Autonomy

**Status**: CRITICAL - 12 blocking issues identified
**Target**: Production-ready for autonomous external agents
**Estimated Effort**: 3-4 weeks for complete implementation
**Risk**: HIGH - Current implementation unsafe for unattended agent use

---

## EXECUTIVE SUMMARY

The n8n MCP server has sophisticated architecture but contains **12 critical gaps** that will cause external agents to fail unpredictably:

1. **Configuration validation happens too late** - Agents waste tokens before discovering misconfiguration
2. **No retry logic for transient failures** - Network hiccups cause permanent failures
3. **Error messages are too vague** - Agents can't self-correct and retry endlessly
4. **Missing timeout management** - Long operations fail without retry
5. **Validation-execution gap** - Workflows pass validation but fail on API call
6. **No rate limiting** - Agents can spam API and get rate-limited
7. **SharedMemory has no persistence** - Learning is lost on restart
8. **Tool schemas too permissive** - Invalid inputs waste tokens on deserialization
9. **No graceful degradation** - Optional features fail mysteriously
10. **Initialization status opaque** - Hanging services timeout invisibly
11. **Version mismatches undetected** - Node compatibility issues only surface at runtime
12. **Insufficient operation logging** - Impossible to debug agent decisions

---

## CRITICAL ISSUES & FIXES

### Issue #1: Late Configuration Validation

**File**: `src/mcp/server-modern.ts` (Lines 1196-1201)

**Problem**:
```typescript
this.server.tool("workflow_manager", ..., async (args) => {
  this.ensureN8nConfigured();  // ❌ TOO LATE - happens INSIDE handler
  // Agent already spent tokens on input validation/processing
});
```

**Impact**:
- Agent gets "not configured" error after token expenditure
- Retries same operation repeatedly
- Configuration issues waste 10-100+ tokens per attempt

**Solution**:
```typescript
// 1. Validate configuration during server initialization
private initializeN8nConfiguration() {
  const config = getN8nApiConfig();
  if (!config?.apiKey || !config?.baseUrl) {
    logger.warn('n8n API not configured - workflow tools disabled');
    this.n8nConfigured = false;
    return;
  }

  // 2. Cache validation result with 5-minute TTL
  this.n8nConfigured = true;
  this.n8nConfigCheckTime = Date.now();
}

// 3. Check status EARLY in tool definitions
private ensureN8nAvailable(toolName: string) {
  if (!this.n8nConfigured) {
    throw new MissingConfigurationError(
      `n8n API not configured. Required env vars: N8N_API_URL, N8N_API_KEY`,
      {
        docs: 'https://docs.n8n.io/api/',
        setupGuide: 'Check .env file configuration'
      }
    );
  }
}

// 4. Call check early
this.server.tool("workflow_manager",
  {
    name: "workflow_manager",
    description: "Create, update, delete n8n workflows",
    // ... schema definition
  },
  async (args) => {
    this.ensureN8nAvailable("workflow_manager"); // ✅ Fail fast
    // ... rest of handler
  }
);
```

**Testing**: Create test with missing N8N_API_URL and verify error appears before tool accepts input

---

### Issue #2: No Retry Logic for Transient Failures

**File**: `src/services/n8n-api-client.ts` (Lines 64-121)

**Problem**:
```typescript
constructor(config: N8nApiClientConfig) {
  const { baseUrl, apiKey, timeout = 30000, maxRetries = 3 } = config;
  this.maxRetries = maxRetries;  // ❌ Set but never used

  // ❌ No interceptor for retries
  this.client = axios.create({ timeout });
}
```

**Impact**:
- Transient network errors (DNS timeouts, 503) cause immediate failure
- No exponential backoff for rate limits
- No circuit breaker to prevent cascading failures

**Solution**:
```typescript
private setupRetryInterceptor() {
  this.client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;

      // 1. Determine if error is retryable
      const isRetryable = [
        429, // Rate limit
        503, // Service unavailable
        504  // Gateway timeout
      ].includes(error.response?.status) ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);

      // 2. Check if we've exhausted retries
      if (!isRetryable || !config) {
        return Promise.reject(error);
      }

      config.__retryCount = (config.__retryCount || 0) + 1;
      if (config.__retryCount > this.maxRetries) {
        return Promise.reject(error);
      }

      // 3. Exponential backoff: 1s, 2s, 4s, 8s...
      const backoffMs = Math.pow(2, config.__retryCount - 1) * 1000;

      // 4. Respect rate limit Retry-After header
      if (error.response?.status === 429 && error.response.headers['retry-after']) {
        const retryAfterSec = parseInt(error.response.headers['retry-after']);
        await this.sleep(retryAfterSec * 1000);
      } else {
        await this.sleep(backoffMs);
      }

      logger.info(`Retrying request (attempt ${config.__retryCount}/${this.maxRetries})`, {
        method: config.method,
        url: config.url,
        backoffMs
      });

      return this.client(config);
    }
  );
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Testing**:
- Mock 503 response, verify retry with correct backoff
- Mock 429 with Retry-After: 2, verify honor the header
- Exceed maxRetries, verify final rejection

---

### Issue #3: Generic Error Messages Prevent Self-Correction

**File**: `src/utils/n8n-errors.ts` (Lines 99-116)

**Problem**:
```typescript
export function getUserFriendlyErrorMessage(error: N8nApiError): string {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return `Invalid request: ${error.message}`;  // ❌ Too vague for agents
    case 'NOT_FOUND':
      return 'Resource not found';  // ❌ Which resource? Which field?
    // ...
  }
}
```

**Impact**:
- Agents don't know if error is:
  - Node type doesn't exist (search for alternative)
  - Property validation failed (restructure config)
  - Connection invalid (fix node names)
  - API schema changed (rebuild database)
- Agents retry same operation endlessly

**Solution**:
```typescript
export interface ErrorWithRecovery {
  code: string;
  message: string;
  nodeType?: string;          // If node-related
  propertyName?: string;      // If property-related
  recoverySteps: string[];    // Exact steps to fix
  suggestedAlternatives?: string[];  // "Did you mean..." suggestions
  documentation?: string;     // Link to relevant docs
  isRetryable: boolean;       // Can agent retry?
  estimatedRecoveryTime?: number; // ms to wait before retry
}

export class N8nValidationError extends Error {
  constructor(
    message: string,
    public recovery: ErrorWithRecovery
  ) {
    super(message);
    this.name = 'N8nValidationError';
  }
}

// Usage example
if (!nodeTypesAvailable.includes(nodeType)) {
  throw new N8nValidationError(
    `Node type '${nodeType}' not found in n8n instance`,
    {
      code: 'NODE_TYPE_NOT_FOUND',
      message: `Node type '${nodeType}' not found in n8n instance`,
      nodeType: nodeType,
      recoverySteps: [
        `Use 'node_discovery' tool to search for alternatives`,
        `Try searching for keywords instead: "${extractKeywords(nodeType)}"`,
        `Check if node is installed in your n8n instance`
      ],
      suggestedAlternatives: [
        'n8n-nodes-base.httpRequest',    // Generic alternative
        'n8n-nodes-base.webhook'          // Trigger alternative
      ],
      documentation: `https://docs.n8n.io/nodes/`,
      isRetryable: false,
      estimatedRecoveryTime: 0
    }
  );
}
```

**Testing**:
- Create workflow with non-existent node type
- Verify error includes suggestions and recovery steps
- Verify agent can parse structured error and act on it

---

### Issue #4: Validation Happens Before Execution, But After API Understanding

**File**: `src/mcp/handlers-n8n-manager.ts` (Lines 183-279)

**Problem**:
```typescript
// 1. Validation occurs
const validationResult = await validateWorkflowUnified(
  workflowInput as any,
  repository,
  { validateNodes: true, validateConnections: true }
);

// 2. Time passes, agent makes decisions based on validation
// 3. Workflow could change in cache/memory

// 4. API call happens WITH NO RE-VALIDATION
const workflow = await client.createWorkflow(workflowInput);  // ❌ Different data?
```

**Impact**:
- Race condition between validation and creation
- Agent blames validation system when actual problem is timing
- DSL expansion could introduce invalid nodes

**Solution**:
```typescript
async function createWorkflow(
  workflowInput: any,
  repository: NodeRepository,
  client: N8nApiClient
): Promise<any> {
  // 1. Validate input
  const validation = await validateWorkflowUnified(
    workflowInput,
    repository,
    { validateNodes: true, validateConnections: true, profile: 'runtime' }
  );

  if (!validation.valid) {
    throw new N8nValidationError('Workflow validation failed', {
      // ... recovery information
    });
  }

  // 2. Expand DSL (if needed)
  let expandedWorkflow = workflowInput;
  if (workflowInput.__useDsl) {
    expandedWorkflow = expandDslToWorkflow(workflowInput);
  }

  // 3. RE-VALIDATE expanded version
  const expandedValidation = await validateWorkflowUnified(
    expandedWorkflow,
    repository,
    { validateNodes: true, validateConnections: true, profile: 'runtime' }
  );

  if (!expandedValidation.valid) {
    throw new N8nValidationError(
      'Expanded workflow validation failed',
      {
        code: 'DSL_EXPANSION_INVALID',
        message: 'DSL expansion produced invalid workflow',
        recoverySteps: [
          'Check DSL syntax and node references',
          'Use simpler DSL or explicit workflow JSON',
          'Report to maintainers if DSL appears correct'
        ],
        isRetryable: false
      }
    );
  }

  // 4. Create atomic validation fingerprint
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(expandedWorkflow))
    .digest('hex');

  // 5. Call API with validation proof
  const response = await client.createWorkflow({
    ...expandedWorkflow,
    __validationFingerprint: fingerprint
  });

  // 6. Verify response matches input (no server-side changes)
  const responseFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(response.data.workflow))
    .digest('hex');

  if (fingerprint !== responseFingerprint) {
    logger.warn('Workflow modified by API', {
      originalFingerprint: fingerprint,
      responseFingerprint
    });
  }

  return response.data;
}
```

**Testing**:
- Modify workflow between validation and API call
- Verify re-validation catches the change
- Verify fingerprint mismatch is detected

---

### Issue #5: No Timeout Configuration Per Operation Type

**File**: `src/services/n8n-api-client.ts` (Line 65)

**Problem**:
```typescript
constructor(config: N8nApiClientConfig) {
  const { baseUrl, apiKey, timeout = 30000 } = config;  // ❌ Fixed 30s for all ops

  this.client = axios.create({ timeout });  // ❌ One timeout for everything
}
```

**Impact**:
- 30s timeout too short for large workflows (100+ nodes)
- 30s timeout too long for simple operations (wastes agent time)
- Timeout failures indistinguishable from actual errors

**Solution**:
```typescript
enum OperationType {
  FAST = 10000,      // List, get (10s)
  NORMAL = 30000,    // Create, update (30s)
  SLOW = 120000      // Execute large workflow (2m)
}

interface RequestConfig extends AxiosRequestConfig {
  operationType?: OperationType;
}

async createWorkflow(workflow: any): Promise<any> {
  return this.requestWithTimeout(
    'post',
    '/workflows',
    workflow,
    OperationType.NORMAL  // 30s for creation
  );
}

async executeWorkflow(id: string): Promise<any> {
  return this.requestWithTimeout(
    'post',
    `/executions`,
    { workflowId: id },
    OperationType.SLOW  // 2m for execution
  );
}

private async requestWithTimeout(
  method: string,
  path: string,
  data: any,
  timeout: OperationType
): Promise<any> {
  try {
    const response = await this.client({
      method,
      url: path,
      data,
      timeout
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new TimeoutError(
        `Operation timed out after ${timeout}ms`,
        {
          code: 'OPERATION_TIMEOUT',
          operationType: timeout,
          recoverySteps: [
            'Check n8n instance health',
            'Increase timeout if operation is legitimately long',
            'Break workflow into smaller parts'
          ],
          isRetryable: true,
          estimatedRecoveryTime: timeout + 5000
        }
      );
    }
    throw error;
  }
}
```

**Testing**:
- Time a real workflow creation
- Adjust timeout to be slightly short
- Verify timeout error is caught and reported correctly

---

### Issue #6: No Rate Limiting Enforcement

**File**: Missing entirely

**Problem**:
- Agents can loop creating workflows indefinitely
- No protection against DoS
- No quota visibility

**Solution**:
```typescript
export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  private readonly CONFIG = {
    'workflow_create': { tokensPerMinute: 10, maxBurst: 2 },
    'workflow_execute': { tokensPerMinute: 30, maxBurst: 5 },
    'workflow_list': { tokensPerMinute: 60, maxBurst: 10 },
    'default': { tokensPerMinute: 100, maxBurst: 10 }
  };

  async checkLimit(operationType: string): Promise<RateLimitResult> {
    const config = this.CONFIG[operationType] || this.CONFIG.default;
    const bucket = this.getOrCreateBucket(operationType, config);

    const now = Date.now();
    const timePassed = (now - bucket.lastRefillTime) / 1000 / 60; // minutes

    // Refill tokens
    bucket.tokens = Math.min(
      config.maxBurst,
      bucket.tokens + timePassed * config.tokensPerMinute
    );
    bucket.lastRefillTime = now;

    if (bucket.tokens < 1) {
      const secsUntilToken = 60 / config.tokensPerMinute;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(secsUntilToken),
        remainingTokens: 0,
        resetTime: new Date(now + secsUntilToken * 1000)
      };
    }

    bucket.tokens--;
    return {
      allowed: true,
      remainingTokens: Math.floor(bucket.tokens),
      resetTime: new Date(now + 60000)
    };
  }
}

// Usage in handlers
async function handleCreateWorkflow(args: any) {
  const rateLimitResult = await rateLimiter.checkLimit('workflow_create');

  if (!rateLimitResult.allowed) {
    throw new RateLimitError(
      `Rate limit exceeded for workflow creation`,
      {
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        resetTime: rateLimitResult.resetTime,
        recoverySteps: [
          `Wait ${rateLimitResult.retryAfterSeconds} seconds before retrying`,
          'Consider batching operations',
          'Space out workflow creation over time'
        ],
        isRetryable: true
      }
    );
  }

  // ... rest of handler
}
```

**Testing**:
- Create 11 workflows rapidly
- Verify 11th fails with rate limit error
- Verify retry suggestions work

---

### Issue #7: Workflow Diff Validation Incomplete

**File**: `src/services/workflow-diff-engine.ts` (Lines 160-187)

**Problem**:
```typescript
case 'updateSettings':
case 'updateName':
case 'addTag':
case 'removeTag':
  return null; // ❌ These are ALWAYS valid? Wrong!
```

**Impact**:
- Invalid settings accepted (bad timezone, invalid JSON)
- Duplicate tags not caught
- Name conflicts not detected
- Diff validates but API call fails

**Solution**:
```typescript
private async validateSettingsUpdate(
  settings: any,
  currentWorkflow: any
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // 1. Check for invalid settings
  const validSettings = ['timezone', 'errorHandler', 'retryPolicy'];
  for (const key in settings) {
    if (!validSettings.includes(key)) {
      errors.push({
        field: key,
        message: `Unknown setting '${key}'`,
        suggestion: `Valid settings: ${validSettings.join(', ')}`
      });
    }
  }

  // 2. Validate timezone if specified
  if (settings.timezone) {
    const validTimezones = getValidTimezones();
    if (!validTimezones.includes(settings.timezone)) {
      errors.push({
        field: 'timezone',
        message: `Invalid timezone '${settings.timezone}'`,
        suggestion: `Valid timezones: ${validTimezones.slice(0, 5).join(', ')}...`
      });
    }
  }

  return errors;
}

private validateAddTag(tag: string, currentTags: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Check tag format
  if (!tag || typeof tag !== 'string') {
    errors.push({
      field: 'tag',
      message: 'Tag must be a non-empty string'
    });
  }

  // 2. Check for duplicates
  if (currentTags.includes(tag)) {
    errors.push({
      field: 'tag',
      message: `Tag '${tag}' already exists`,
      suggestion: 'Use a different tag name'
    });
  }

  return errors;
}

// Validate all operations
async validateOperation(operation: DiffOperation): Promise<ValidationError[]> {
  switch (operation.type) {
    case 'addNode':
      return await this.validateAddNode(operation);
    case 'removeNode':
      return await this.validateRemoveNode(operation);
    case 'updateSettings':
      return await this.validateSettingsUpdate(operation.settings, operation.currentWorkflow);
    case 'addTag':
      return await this.validateAddTag(operation.tag, operation.currentTags);
    case 'updateName':
      return this.validateName(operation.name);
    default:
      return [];
  }
}
```

**Testing**:
- Try adding duplicate tag
- Try setting invalid timezone
- Verify validation catches all invalid metadata operations

---

### Issue #8: Tool Input Schemas Too Permissive

**File**: `src/mcp/server-modern.ts` (Lines 166-231)

**Problem**:
```typescript
this.server.tool("workflow_manager",
  {
    // ❌ Too permissive - accepts anything
    workflow: z.any().optional(),
    changes: z.any().optional(),
    filters: z.any().optional(),
  },
  async (args) => { ... }
);
```

**Impact**:
- Agents send malformed inputs
- Tools waste time on deserialization errors
- Schema validation doesn't catch at MCP level

**Solution**:
```typescript
// Define strict schemas for workflow inputs
const WorkflowNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  typeVersion: z.number().optional()
});

const WorkflowConnectionSchema = z.object({
  main: z.array(z.array(z.object({
    node: z.string(),
    type: z.string(),
    index: z.number()
  }))).optional(),
  ai_tool: z.array(z.object({
    node: z.string()
  })).optional(),
  ai_languageModel: z.array(z.object({
    node: z.string()
  })).optional(),
  ai_memory: z.array(z.object({
    node: z.string()
  })).optional()
});

const WorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  nodes: z.array(WorkflowNodeSchema),
  connections: z.record(WorkflowConnectionSchema),
  settings: z.object({}).optional(),
  staticData: z.object({}).optional()
});

// Use in tool definition
this.server.tool("workflow_manager",
  {
    action: z.enum(['create', 'update', 'delete', 'list']),
    workflow: WorkflowSchema.optional(),
    workflowId: z.string().optional(),
    filters: z.object({
      name: z.string().optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(['active', 'inactive']).optional()
    }).optional()
  },
  async (args) => {
    // Schema validation happened automatically
    // args.workflow is guaranteed valid structure
    if (args.action === 'create') {
      const { workflow } = args;
      // Guaranteed: workflow.name, workflow.nodes array, etc.
    }
  }
);
```

**Testing**:
- Send malformed node structure
- Verify MCP rejects before handler runs
- Verify helpful schema error message

---

### Issue #9: No Graceful Degradation for Missing Config

**File**: `src/mcp/server-modern.ts` (Lines 1126-1145)

**Problem**:
```typescript
if (isN8nApiConfigured()) {
  this.server.resource("n8n-workflows", ...)
}
// But agents don't know which tools exist!
```

**Impact**:
- Agents discover unavailable tools only by trying them
- No capability query mechanism
- Wasted tokens on unavailable operations

**Solution**:
```typescript
// 1. Add capabilities discovery tool
this.server.tool("mcp_capabilities",
  {
    description: "List available MCP tools and their current status"
  },
  async (args) => {
    const capabilities = {
      nodeDiscovery: {
        available: true,
        description: "Search and filter n8n nodes"
      },
      workflowManagement: {
        available: this.isN8nConfigured(),
        requiredConfig: ['N8N_API_URL', 'N8N_API_KEY'],
        description: "Create, update, delete workflows"
      },
      workflowExecution: {
        available: this.isN8nConfigured(),
        requiredConfig: ['N8N_API_URL', 'N8N_API_KEY'],
        description: "Execute and monitor workflows"
      },
      templateLibrary: {
        available: this.hasTemplateDb(),
        description: "Search workflow templates"
      }
    };

    return {
      capabilities,
      configStatus: {
        configured: this.isN8nConfigured(),
        setupGuide: !this.isN8nConfigured()
          ? 'Set N8N_API_URL and N8N_API_KEY environment variables'
          : null
      }
    };
  }
);

// 2. Graceful error when optional feature not available
if (!this.isN8nConfigured()) {
  this.server.tool("workflow_manager",
    { /* schema */ },
    async (args) => {
      throw new FeatureUnavailableError(
        'Workflow management requires n8n API configuration',
        {
          feature: 'workflow_manager',
          requiredEnvVars: ['N8N_API_URL', 'N8N_API_KEY'],
          setupInstructions: 'https://docs.n8n.io/api/',
          alternatives: [
            'Use node_discovery to understand available nodes',
            'Use template_library to find pre-built workflows'
          ]
        }
      );
    }
  );
}
```

**Testing**:
- Start server without N8N_API_KEY
- Call mcp_capabilities
- Verify workflowManagement shows as unavailable with setup instructions
- Try calling workflow_manager
- Verify graceful error with setup guidance

---

### Issue #10: No Initialization Progress Reporting

**File**: `src/mcp/server-modern.ts` (Lines 124-143)

**Problem**:
```typescript
async ensureInitialized(): Promise<void> {
  // 30 second timeout with NO progress reporting
  await this.initManager.waitForComponent("services", 30000);  // ❌ Opaque
}
```

**Impact**:
- Initialization hangs invisibly
- Agents timeout waiting with no info
- Can't debug what's blocking startup

**Solution**:
```typescript
export interface InitializationStatus {
  ready: boolean;
  components: {
    database: 'pending' | 'loading' | 'ready' | 'error';
    nodeRepository: 'pending' | 'loading' | 'ready' | 'error';
    expressServer: 'pending' | 'loading' | 'ready' | 'error';
    mcpServer: 'pending' | 'loading' | 'ready' | 'error';
  };
  errors: string[];
  estimatedTimeRemaining: number; // ms
}

// 1. Add initialization status tracking
private initStatus: InitializationStatus = {
  ready: false,
  components: {
    database: 'pending',
    nodeRepository: 'pending',
    expressServer: 'pending',
    mcpServer: 'pending'
  },
  errors: [],
  estimatedTimeRemaining: 30000
};

// 2. Update status as components initialize
async initialize(): Promise<void> {
  const startTime = Date.now();

  try {
    this.initStatus.components.database = 'loading';
    await this.database.initialize();
    this.initStatus.components.database = 'ready';
  } catch (error) {
    this.initStatus.components.database = 'error';
    this.initStatus.errors.push(`Database initialization failed: ${error.message}`);
  }

  try {
    this.initStatus.components.nodeRepository = 'loading';
    await this.repository.initialize();
    this.initStatus.components.nodeRepository = 'ready';
  } catch (error) {
    this.initStatus.components.nodeRepository = 'error';
    this.initStatus.errors.push(`Repository initialization failed: ${error.message}`);
  }

  this.initStatus.ready = this.initStatus.errors.length === 0;
  this.initStatus.estimatedTimeRemaining = 0;

  if (!this.initStatus.ready) {
    logger.error('Initialization failed', this.initStatus);
  }
}

// 3. Expose status endpoint
app.get('/health', (req, res) => {
  return res.json({
    status: this.initStatus.ready ? 'ready' : 'initializing',
    initialization: this.initStatus
  });
});

// 4. Fail fast if initialization fails
async ensureInitialized(): Promise<void> {
  if (this.initStatus.ready) return;

  if (this.initStatus.errors.length > 0) {
    throw new InitializationError('Server failed to initialize', {
      components: this.initStatus.components,
      errors: this.initStatus.errors,
      recoverySteps: [
        'Check logs for detailed error messages',
        'Verify database connectivity',
        'Ensure n8n packages are installed'
      ]
    });
  }

  // Still initializing
  throw new ServiceUnavailableError('Server is still initializing', {
    status: this.initStatus,
    retryAfterSeconds: 5
  });
}
```

**Testing**:
- Make request to /health during initialization
- Verify components show 'loading' state
- Simulate database error and verify it's captured
- Verify error endpoint returns detailed status

---

### Issue #11: No n8n Version Compatibility Checking

**File**: `src/services/workflow-validator.ts` (missing)

**Problem**:
- Validator doesn't check n8n instance version
- Doesn't verify node typeVersion compatibility
- Doesn't detect deprecated nodes
- Workflows pass validation but fail on deployment

**Solution**:
```typescript
export class VersionCompatibilityChecker {
  private n8nVersion: string | null = null;
  private supportedNodeVersions: Map<string, number[]> = new Map();

  async initialize(client: N8nApiClient): Promise<void> {
    try {
      // 1. Get n8n instance version
      const info = await client.getInstanceInfo();
      this.n8nVersion = info.version;
      logger.info(`n8n instance version: ${this.n8nVersion}`);

      // 2. Get list of available nodes with version info
      const nodes = await client.listNodes();
      nodes.forEach(node => {
        const versions = node.supportedVersions || [node.defaultVersion];
        this.supportedNodeVersions.set(node.type, versions);
      });
    } catch (error) {
      logger.warn('Could not check n8n version compatibility', error);
      // Gracefully continue - compatibility checking is optional
    }
  }

  validateWorkflowCompatibility(workflow: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.n8nVersion) {
      logger.debug('Skipping version compatibility check (not available)');
      return errors;
    }

    // 1. Check each node's typeVersion
    workflow.nodes.forEach((node: any, index: number) => {
      const supportedVersions = this.supportedNodeVersions.get(node.type);

      if (!supportedVersions) {
        errors.push({
          node: node.name,
          field: 'type',
          message: `Node type '${node.type}' not found in n8n ${this.n8nVersion}`,
          suggestion: 'Node may not be installed in this n8n instance'
        });
        return;
      }

      // 2. Check typeVersion
      if (node.typeVersion !== undefined) {
        if (!supportedVersions.includes(node.typeVersion)) {
          errors.push({
            node: node.name,
            field: 'typeVersion',
            message: `Node type '${node.type}' does not support version ${node.typeVersion}`,
            suggestion: `Supported versions: ${supportedVersions.join(', ')}`
          });
        }
      }
    });

    return errors;
  }
}

// Usage in workflow validation
const compatibilityChecker = new VersionCompatibilityChecker();
await compatibilityChecker.initialize(client);

const compatErrors = compatibilityChecker.validateWorkflowCompatibility(workflow);
if (compatErrors.length > 0) {
  throw new CompatibilityError('Workflow incompatible with n8n instance', {
    instanceVersion: compatibilityChecker.getN8nVersion(),
    errors: compatErrors,
    recoverySteps: [
      'Update n8n to latest version',
      'Install missing node packages',
      'Update node typeVersion to supported value'
    ]
  });
}
```

**Testing**:
- Get n8n version
- Create workflow with unsupported typeVersion
- Verify compatibility error with supported versions listed

---

### Issue #12: Insufficient Operation Logging

**File**: All handlers

**Problem**:
- No operation IDs for tracing
- No logging of tool inputs/outputs
- Impossible to debug agent decisions
- Can't correlate agent actions with outcomes

**Solution**:
```typescript
// 1. Add operation context to all handlers
export interface OperationContext {
  operationId: string;
  toolName: string;
  timestamp: Date;
  args?: any;
  result?: any;
  error?: Error;
  durationMs?: number;
}

const operationContexts = new Map<string, OperationContext>();

// 2. Middleware/wrapper for all tools
function withOperationLogging(
  toolName: string,
  handler: (args: any, context: OperationContext) => Promise<any>
) {
  return async (args: any) => {
    const operationId = uuidv4();
    const context: OperationContext = {
      operationId,
      toolName,
      timestamp: new Date(),
      args: sanitizeArgs(args)  // Remove sensitive data
    };

    operationContexts.set(operationId, context);

    const startTime = Date.now();
    logger.info(`[OPERATION ${operationId}] ${toolName} started`, {
      args: context.args
    });

    try {
      const result = await handler(args, context);
      context.result = sanitizeResult(result);
      context.durationMs = Date.now() - startTime;

      logger.info(`[OPERATION ${operationId}] ${toolName} completed`, {
        durationMs: context.durationMs
      });

      return { result, operationId };  // Include operation ID in response
    } catch (error) {
      context.error = error;
      context.durationMs = Date.now() - startTime;

      logger.error(`[OPERATION ${operationId}] ${toolName} failed`, {
        error: error.message,
        durationMs: context.durationMs
      });

      throw error;
    }
  };
}

// 3. Usage example
this.server.tool("workflow_manager", ...,
  withOperationLogging("workflow_manager", async (args, context) => {
    if (args.action === 'create') {
      const response = await createWorkflow(args.workflow);
      return response;
    }
    // ...
  })
);

// 4. Expose operation history endpoint (for debugging)
app.get('/api/operations/:operationId', (req, res) => {
  const operation = operationContexts.get(req.params.operationId);
  if (!operation) {
    return res.status(404).json({ error: 'Operation not found' });
  }
  return res.json(operation);
});

// 5. Cleanup old operations (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [id, op] of operationContexts.entries()) {
    if (now - op.timestamp.getTime() > maxAge) {
      operationContexts.delete(id);
    }
  }
}, 60 * 60 * 1000); // Cleanup every hour
```

**Testing**:
- Call a tool with operation logging
- Extract operationId from response
- Query /api/operations/{operationId}
- Verify full context is available

---

## IMPLEMENTATION ROADMAP

### Phase 1: Critical Fixes (Week 1)
**Priority**: BLOCKING - Must complete before external agent use

- [ ] Fix configuration validation (Issue #1)
  - Move check to initialization
  - Cache validation result
- [ ] Implement retry logic (Issue #2)
  - Add axios interceptor
  - Exponential backoff
- [ ] Improve error messages (Issue #3)
  - Error taxonomy
  - Recovery suggestions
- [ ] Fix validation-execution gap (Issue #4)
  - Re-validate after DSL expansion
  - Add fingerprint validation
- [ ] Add operation logging (Issue #12)
  - Operation IDs
  - Request/response logging

### Phase 2: Reliability (Week 2)
**Priority**: IMPORTANT - Prevents silent failures

- [ ] Implement timeout management (Issue #5)
  - Per-operation timeouts
  - Clear timeout errors
- [ ] Add rate limiting (Issue #6)
  - Token bucket per operation
  - Quota enforcement
- [ ] Fix diff validation (Issue #7)
  - Validate all metadata operations
- [ ] Fix input schemas (Issue #8)
  - Strict Zod schemas
  - Nested validation
- [ ] Add version checking (Issue #11)
  - Query n8n version
  - Validate typeVersion

### Phase 3: Production Hardening (Week 3)
**Priority**: IMPORTANT - For multi-agent scenarios

- [ ] Graceful degradation (Issue #9)
  - Capabilities discovery
  - Clear feature unavailable errors
- [ ] Initialization status (Issue #10)
  - Progress reporting
  - Component status tracking
- [ ] SharedMemory persistence (separate from this guide)
  - SQLite backing store
  - Corruption recovery

### Phase 4: Documentation (Week 4)
**Priority**: CRITICAL - Agents need to understand tools

- [ ] Tool documentation
  - Parameter descriptions
  - Examples for each action
  - Error codes and meanings
- [ ] Deployment guide
  - Production setup
  - Security hardening
  - Monitoring
- [ ] Error recovery patterns
  - Common scenarios
  - Recommended agent responses

---

## SUCCESS CRITERIA

External agents can reliably:

- ✓ Discover available tools and capabilities
- ✓ Handle configuration errors gracefully (fail fast before wasting tokens)
- ✓ Recover from transient network failures (automatic retries)
- ✓ Understand and correct validation errors (specific recovery steps)
- ✓ Create workflows without manual debugging
- ✓ Execute workflows with monitoring
- ✓ Respect rate limits and quotas
- ✓ Adapt to different n8n versions
- ✓ Debug failures with operation IDs and logs
- ✓ Maintain state across restarts (SharedMemory persistence)
- ✓ Work in multi-agent scenarios without conflicts
- ✓ Retry failed operations with appropriate backoff

---

## TESTING CHECKLIST

Before declaring production-ready:

- [ ] All critical fixes tested (Issues #1-5, #12)
- [ ] All reliability fixes tested (Issues #6-11)
- [ ] Retry logic verified with synthetic failures
- [ ] Rate limiting verified to prevent DoS
- [ ] Version compatibility checked across n8n versions
- [ ] Multi-agent concurrency tested
- [ ] Error messages include recovery steps
- [ ] Operation logging enables debugging
- [ ] 100+ workflow creation/execution cycles without issues
- [ ] Memory usage stable (no leaks)
- [ ] Configuration validation catches common mistakes
- [ ] Documentation complete and accurate

---

## NEXT STEPS

1. **Create feature branches** for each issue area
2. **Implement Phase 1 fixes** (blocking issues)
3. **Add comprehensive tests** as you go
4. **Code review** each fix before merge
5. **Integration testing** with real external agents
6. **Documentation** for each new feature

See [MCP_SERVER_IMPLEMENTATION_GUIDE.md](./MCP_SERVER_IMPLEMENTATION_GUIDE.md) for detailed code examples and implementation patterns.
