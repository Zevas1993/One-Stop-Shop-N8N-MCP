# How Node Database Updates When Version Changes

## 🎯 The Complete Rebuild Process

When the MCP server detects a version mismatch (e.g., you upgraded from n8n 1.90.5 to 1.97.1), it automatically triggers a complete database rebuild to extract and catalog all nodes from the new version.

---

## 📊 High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│         MCP Server Startup - Version Detection                   │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  N8nNodeSync.detectInstanceVersion()                            │
│  • Tries: API → Docker → NPM                                    │
│  • Result: Version 1.97.1 detected                              │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Compare Versions                                               │
│  • Database version: 1.90.5                                     │
│  • Instance version: 1.97.1                                     │
│  • ❌ MISMATCH DETECTED!                                        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Trigger Rebuild: rebuildForVersion(1.97.1, 'api')             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────┴──────────────────┐
         │                                     │
    [Docker Path]                        [NPM Path]
         ↓                                     ↓
┌─────────────────────┐            ┌──────────────────────┐
│ rebuildFromDocker() │            │  rebuildFromNpm()    │
└─────────────────────┘            └──────────────────────┘
         │                                     │
         └─────────────────┬──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Execute: npm run rebuild:local                                 │
│  Environment: N8N_VERSION_OVERRIDE=1.97.1                       │
│  Timeout: 5 minutes (300,000ms)                                 │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  rebuild.ts Script Execution                                    │
└─────────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────┴──────────────────┐
         │                                     │
    [Docker Extraction]               [NPM Package Loading]
         ↓                                     ↓
┌───────────────────────┐          ┌────────────────────────┐
│ extractNodesFromDocker│          │ N8nNodeLoader.loadAll  │
│ • Check Docker volumes│          │ • Load n8n-nodes-base  │
│ • Read package files  │          │ • Load langchain nodes │
│ • Extract node classes│          │ • Parse package.json   │
└───────────────────────┘          └────────────────────────┘
         │                                     │
         └─────────────────┬──────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  For Each Node (535 nodes):                                     │
│  1. NodeParser.parse(NodeClass) → Extract metadata              │
│  2. DocsMapper.fetchDocumentation() → Get n8n docs              │
│  3. NodeRepository.saveNode() → Save to SQLite                  │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Update Version Metadata                                        │
│  • nodeRepo.setDbVersion('1.97.1')                             │
│  • INSERT INTO db_metadata (key, value)                         │
│    VALUES ('n8n_version', '1.97.1')                            │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  Notify GraphRAG                                                │
│  • graphragBridge.invalidateCache()                             │
│  • Triggers knowledge graph rebuild on next query               │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Rebuild Complete                                            │
│  • Database now has 535 nodes (was 480)                         │
│  • Version: 1.97.1                                              │
│  • GraphRAG will rebuild on next agent query                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Step-by-Step Process

### Step 1: Version Mismatch Detection

**File**: [src/services/n8n-node-sync.ts:148-206](src/services/n8n-node-sync.ts#L148-L206)

```typescript
async syncToInstance(): Promise<SyncResult> {
  // Detect what version is running
  const detection = await this.detectInstanceVersion();
  // Returns: { version: '1.97.1', source: 'api', confidence: 'high' }

  // Get what version database has
  const currentDbVersion = await this.nodeRepo.getDbVersion();
  // Returns: '1.90.5'

  // Compare
  if (currentDbVersion === detection.version) {
    return { synced: false, method: 'version-match' }; // ✅ Already synced
  }

  // ❌ Version mismatch - trigger rebuild!
  logger.info(`🔄 Version mismatch: ${currentDbVersion} → ${detection.version}`);

  const rebuildResult = await this.rebuildForVersion(
    detection.version,  // '1.97.1'
    detection.source    // 'api'
  );

  return rebuildResult;
}
```

---

### Step 2: Determine Rebuild Strategy

**File**: [src/services/n8n-node-sync.ts:211-238](src/services/n8n-node-sync.ts#L211-L238)

```typescript
private async rebuildForVersion(
  version: string,      // '1.97.1'
  source: 'api' | 'docker' | 'npm' | 'unknown'
): Promise<RebuildResult> {
  switch (source) {
    case 'docker':
      // Version detected from Docker container
      return await this.rebuildFromDocker(version);

    case 'npm':
    case 'api':
      // Version detected from API or local npm
      return await this.rebuildFromNpm(version);

    default:
      return { success: false, error: `Unknown source: ${source}` };
  }
}
```

**Decision Logic**:
- If version detected from **Docker container** → Use Docker extraction method
- If version detected from **API or NPM** → Use NPM package loading method
- Both methods ultimately run the same rebuild script, just with different extraction approaches

---

### Step 3A: Rebuild from Docker

**File**: [src/services/n8n-node-sync.ts:243-280](src/services/n8n-node-sync.ts#L243-L280)

```typescript
private async rebuildFromDocker(version: string): Promise<RebuildResult> {
  logger.info('Attempting to rebuild from Docker container...');

  // Execute rebuild script with version override
  const { stdout, stderr } = await execAsync('npm run rebuild:local', {
    env: {
      ...process.env,
      N8N_VERSION_OVERRIDE: version  // Pass version to rebuild script
    },
    timeout: 300000 // 5 minutes
  });

  // Count nodes after rebuild
  const nodesCount = await this.nodeRepo.getTotalCount();

  return {
    success: true,
    nodesCount,      // e.g., 535
    method: 'docker'
  };
}
```

**What This Does**:
1. Runs `npm run rebuild:local` command
2. Sets `N8N_VERSION_OVERRIDE` environment variable
3. Waits up to 5 minutes for completion
4. Counts final node count for verification

---

### Step 3B: Rebuild from NPM

**File**: [src/services/n8n-node-sync.ts:285-325](src/services/n8n-node-sync.ts#L285-L325)

```typescript
private async rebuildFromNpm(version: string): Promise<RebuildResult> {
  logger.info('Attempting to rebuild from local npm packages...');

  // Execute rebuild script with version override
  const { stdout, stderr } = await execAsync('npm run rebuild:local', {
    env: {
      ...process.env,
      N8N_VERSION_OVERRIDE: version
    },
    timeout: 300000
  });

  // Update database version metadata
  await this.nodeRepo.setDbVersion(version);

  // Count nodes
  const nodesCount = await this.nodeRepo.getTotalCount();

  return {
    success: true,
    nodesCount,
    method: 'npm'
  };
}
```

**Same process as Docker**, but explicitly sets the database version.

---

### Step 4: The Rebuild Script

**File**: [src/scripts/rebuild.ts](src/scripts/rebuild.ts)

This is where the **actual extraction and database rebuild** happens:

```typescript
async function rebuild() {
  console.log('🔄 Rebuilding n8n node database...\n');

  const db = await createDatabaseAdapter('./data/nodes.db');
  const parser = new NodeParser();
  const mapper = new DocsMapper();
  const repository = new NodeRepository(db);
  const extractor = new NodeSourceExtractor();

  // 1. Initialize database schema
  const schema = fs.readFileSync('src/database/schema.sql', 'utf8');
  db.exec(schema);

  // 2. Initialize metadata table
  repository.initializeMetadata();

  // 3. Clear existing data (DELETE old version nodes)
  db.exec('DELETE FROM nodes');
  console.log('🗑️  Cleared existing data\n');

  // 4. Choose extraction method
  let nodes = [];

  if (useDockerExtraction) {
    // Docker: Extract from mounted volumes
    console.log('🐳 Using Docker extraction method...\n');
    nodes = await extractNodesFromDocker(extractor, dockerVolumePaths);
  } else {
    // NPM: Load from local packages
    console.log('📦 Using local npm package extraction...\n');
    const loader = new N8nNodeLoader();
    nodes = await loader.loadAllNodes();
  }

  console.log(`📦 Loaded ${nodes.length} nodes\n`);

  // 5. Process each node
  for (const { packageName, nodeName, NodeClass } of nodes) {
    try {
      // Parse node metadata
      const parsed = parser.parse(NodeClass, packageName);

      // Fetch documentation from n8n-docs
      const docs = await mapper.fetchDocumentation(parsed.nodeType);
      parsed.documentation = docs || undefined;

      // Save to database
      repository.saveNode(parsed);

      console.log(`✅ ${parsed.nodeType}`);
    } catch (error) {
      console.error(`❌ Failed to process ${nodeName}`);
    }
  }

  // 6. Save version metadata
  const n8nVersion = detectN8nVersion() || process.env.N8N_VERSION_OVERRIDE;
  if (n8nVersion) {
    repository.setDbVersion(n8nVersion);
    console.log(`\n📌 Database version set to: ${n8nVersion}`);
  }

  console.log('\n✨ Rebuild complete!');
  db.close();
}
```

---

### Step 5: Node Extraction Methods

#### Method A: Docker Extraction

**File**: [src/scripts/rebuild.ts:202-229](src/scripts/rebuild.ts#L202-L229)

```typescript
async function extractNodesFromDocker(
  extractor: NodeSourceExtractor,
  dockerVolumePaths: string[]
): Promise<LoadedNode[]> {
  const nodes: LoadedNode[] = [];

  // Known n8n packages to extract
  const n8nPackages = [
    'n8n-nodes-base',
    '@n8n/n8n-nodes-langchain',
  ];

  for (const packageName of n8nPackages) {
    console.log(`📦 Processing package: ${packageName}`);

    // Find package in Docker volumes
    // Tries multiple locations:
    // - /n8n-modules/n8n-nodes-base
    // - /n8n-modules/node_modules/n8n-nodes-base
    // - /n8n-modules/.pnpm/n8n-nodes-base@*/node_modules/n8n-nodes-base

    const packageJson = require(`${packagePath}/package.json`);

    // Read node paths from package.json
    for (const nodePath of packageJson.n8n.nodes) {
      const NodeClass = require(`${packagePath}/${nodePath}`);
      nodes.push({ packageName, nodeName, NodeClass });
    }
  }

  return nodes;
}
```

**Docker Extraction Process**:
1. Checks Docker volume mount points (`/n8n-modules`, `/n8n-custom`)
2. Finds n8n packages in the container filesystem
3. Reads `package.json` to get list of nodes
4. Loads each node's TypeScript/JavaScript class
5. Returns array of node classes for processing

---

#### Method B: NPM Package Loading

**File**: [src/loaders/node-loader.ts:15-86](src/loaders/node-loader.ts#L15-L86)

```typescript
export class N8nNodeLoader {
  private readonly CORE_PACKAGES = [
    { name: 'n8n-nodes-base', path: 'n8n-nodes-base' },
    { name: '@n8n/n8n-nodes-langchain', path: '@n8n/n8n-nodes-langchain' }
  ];

  async loadAllNodes(): Promise<LoadedNode[]> {
    const results: LoadedNode[] = [];

    for (const pkg of this.CORE_PACKAGES) {
      // Load package.json
      const packageJson = require(`${pkg.path}/package.json`);

      // Load nodes listed in package.json
      const nodes = await this.loadPackageNodes(
        pkg.name,
        pkg.path,
        packageJson
      );

      results.push(...nodes);
    }

    return results;
  }

  private async loadPackageNodes(
    packageName: string,
    packagePath: string,
    packageJson: any
  ): Promise<LoadedNode[]> {
    const nodes: LoadedNode[] = [];
    const nodesList = packageJson.n8n.nodes || [];

    // For each node path in package.json
    for (const nodePath of nodesList) {
      // Resolve full path: n8n-nodes-base/dist/nodes/Slack/Slack.node.js
      const fullPath = require.resolve(`${packagePath}/${nodePath}`);

      // Load the node class
      const nodeModule = require(fullPath);
      const NodeClass = nodeModule.default || nodeModule[nodeName];

      nodes.push({ packageName, nodeName, NodeClass });
    }

    return nodes;
  }
}
```

**NPM Loading Process**:
1. Accesses local `node_modules/n8n-nodes-base` directory
2. Reads `package.json` to get node list
3. Uses Node.js `require()` to load each node module
4. Extracts the node class from exports
5. Returns array of loaded node classes

---

### Step 6: Node Parsing and Storage

**File**: [src/parsers/node-parser.ts](src/parsers/node-parser.ts)

```typescript
export class NodeParser {
  parse(NodeClass: any, packageName: string): ParsedNode {
    // Extract node metadata from class
    const description = NodeClass.description;

    // Extract properties (input fields)
    const properties = this.extractProperties(description.properties || []);

    // Extract operations (dropdown options)
    const operations = this.extractOperations(properties);

    // Detect node characteristics
    const isAITool = this.detectAITool(description);
    const isTrigger = this.detectTrigger(NodeClass);
    const isWebhook = this.detectWebhook(NodeClass);

    return {
      nodeType: description.name,
      displayName: description.displayName,
      description: description.description,
      properties,
      operations,
      credentials: description.credentials || [],
      isAITool,
      isTrigger,
      isWebhook,
      isVersioned: this.hasMultipleVersions(NodeClass),
      version: description.version || 1,
      category: description.group?.[0] || 'unknown',
      packageName
    };
  }
}
```

**What Gets Extracted**:
- ✅ Node type (e.g., `nodes-base.slack`)
- ✅ Display name (e.g., `Slack`)
- ✅ Description
- ✅ Properties (input fields with types, defaults, options)
- ✅ Operations (available actions like "post", "update", "delete")
- ✅ Credentials (authentication requirements)
- ✅ AI Tool capability flag
- ✅ Trigger/Webhook detection
- ✅ Version information

---

### Step 7: Database Storage

**File**: [src/database/node-repository.ts:11-38](src/database/node-repository.ts#L11-L38)

```typescript
saveNode(node: ParsedNode): void {
  const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO nodes (
      node_type, package_name, display_name, description,
      category, development_style, is_ai_tool, is_trigger,
      is_webhook, is_versioned, version, documentation,
      properties_schema, operations, credentials_required
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    node.nodeType,
    node.packageName,
    node.displayName,
    node.description,
    node.category,
    node.style,
    node.isAITool ? 1 : 0,
    node.isTrigger ? 1 : 0,
    node.isWebhook ? 1 : 0,
    node.isVersioned ? 1 : 0,
    node.version,
    node.documentation || null,
    JSON.stringify(node.properties, null, 2),
    JSON.stringify(node.operations, null, 2),
    JSON.stringify(node.credentials, null, 2)
  );
}
```

**Storage Details**:
- Uses SQLite with `INSERT OR REPLACE` (upsert)
- Stores complex data as JSON strings
- Indexes on node_type for fast lookups
- Full-text search (FTS5) on display_name and description

---

### Step 8: Version Metadata Update

**File**: [src/database/node-repository.ts:344-349](src/database/node-repository.ts#L344-L349)

```typescript
setDbVersion(version: string): void {
  this.db.prepare(`
    INSERT OR REPLACE INTO db_metadata (key, value, updated_at)
    VALUES ('n8n_version', ?, CURRENT_TIMESTAMP)
  `).run(version);
}
```

**Database Record**:
```sql
SELECT * FROM db_metadata WHERE key = 'n8n_version';
-- Returns: { key: 'n8n_version', value: '1.97.1', updated_at: '2025-11-26 14:30:00' }
```

This allows the MCP server to remember which version the database was last built for.

---

### Step 9: GraphRAG Notification

**File**: [src/ai/graphrag-bridge.ts:218-241](src/ai/graphrag-bridge.ts#L218-L241)

```typescript
async invalidateCache(): Promise<void> {
  // Clear local cache
  this.cache.clear();

  // Notify Python backend via JSON-RPC
  try {
    await this.rpc("invalidate_cache", {}, 10_000);
    console.log("[graphrag-bridge] Cache invalidated");
  } catch (error) {
    console.warn("[graphrag-bridge] Could not notify Python backend");
  }
}
```

**Python Backend**: [python/backend/graph/lightrag_service.py:219-230](python/backend/graph/lightrag_service.py#L219-L230)

```python
elif method == "invalidate_cache":
    log("Cache invalidation requested - node catalog changed")

    # Clear any cached embeddings or search results
    if hasattr(sync_engine, 'clear_cache'):
        sync_engine.clear_cache()

    # Knowledge graph will rebuild on next query
    result = {"ok": True, "message": "Cache invalidated"}
```

**What Happens**:
1. TypeScript clears in-memory node cache
2. Sends JSON-RPC message to Python GraphRAG backend
3. Python clears its cached embeddings and relationships
4. Knowledge graph will automatically rebuild on next agent query
5. **Lazy Rebuild Strategy** - doesn't rebuild immediately to save time

---

## 📊 What Gets Updated

### Database Changes

| What Changes | Before (v1.90.5) | After (v1.97.1) |
|--------------|------------------|-----------------|
| **Total Nodes** | 480 nodes | 535 nodes (+55) |
| **AI Tools** | 35 nodes | 47 nodes (+12) |
| **LangChain Nodes** | 18 nodes | 25 nodes (+7) |
| **Database Version** | `1.90.5` | `1.97.1` |
| **Properties** | Old schemas | New schemas |
| **Operations** | Old operations | New operations |
| **Documentation** | Old docs | New docs |

### File Changes

```
data/nodes.db
├── nodes table: 480 rows → 535 rows (REPLACED)
├── db_metadata: n8n_version='1.90.5' → '1.97.1' (UPDATED)
└── FTS index: Rebuilt for new nodes
```

---

## ⏱️ Performance Characteristics

### Rebuild Timing

```
🔄 Version mismatch detected
   Database: 1.90.5
   Instance: 1.97.1

⏳ Rebuild Process:
├─ Clear database: ~0.1s
├─ Load node classes: ~10-20s (535 nodes)
├─ Parse metadata: ~5-10s
├─ Fetch documentation: ~30-60s (API rate limits)
├─ Save to database: ~5-10s
└─ Total: ~50-100 seconds (1-2 minutes)

✅ Rebuild complete
   Loaded 535 nodes
```

### Why It Takes Time

1. **Node Loading** (10-20s)
   - Must load 535 TypeScript/JavaScript modules
   - Each module imports dependencies
   - Node.js require() is synchronous

2. **Documentation Fetching** (30-60s)
   - Fetches docs from n8n-docs repository
   - Makes HTTP requests to GitHub/docs site
   - Parses markdown → JSON
   - Rate limited to avoid overwhelming servers

3. **Database Operations** (5-10s)
   - 535 individual INSERT statements
   - JSON serialization of properties
   - Full-text index rebuild

---

## 🚀 Optimization Strategies

### Current Optimizations

1. **Non-Blocking Startup**
   ```typescript
   // Server starts immediately, rebuild happens in background
   this.syncN8nNodes()
     .then(result => logger.info('Sync complete'))
     .catch(error => logger.warn('Sync failed, using existing DB'));
   ```

2. **Lazy GraphRAG Rebuild**
   - Cache invalidated immediately
   - Knowledge graph rebuilds on first query
   - Avoids blocking startup

3. **Parallel Node Processing** (Future Enhancement)
   - Could process nodes in batches
   - Would reduce total time by 40-50%

---

## 🔧 Manual Rebuild

If automatic sync fails, you can manually rebuild:

```bash
# Rebuild with specific version
N8N_VERSION_OVERRIDE=1.97.1 npm run rebuild:local

# Or just rebuild using detected version
npm run rebuild:local

# Verify
npx tsx src/scripts/inspect-db.ts
```

---

## ✅ Verification

After rebuild completes, you can verify:

```bash
# Check database version
sqlite3 data/nodes.db "SELECT * FROM db_metadata WHERE key='n8n_version'"
# Output: n8n_version|1.97.1|2025-11-26 14:30:00

# Count nodes
sqlite3 data/nodes.db "SELECT COUNT(*) FROM nodes"
# Output: 535

# List new nodes
sqlite3 data/nodes.db "SELECT node_type FROM nodes ORDER BY node_type LIMIT 10"
```

---

## 🎯 Summary

When the MCP server detects a version change:

1. **Detects** version mismatch (1.90.5 → 1.97.1)
2. **Triggers** automatic rebuild via `npm run rebuild:local`
3. **Clears** old database (DELETE FROM nodes)
4. **Loads** all node classes from new version (535 nodes)
5. **Parses** metadata from each node (properties, operations, etc.)
6. **Fetches** documentation from n8n-docs
7. **Saves** to SQLite database with full-text indexing
8. **Updates** version metadata (db_metadata table)
9. **Notifies** GraphRAG to invalidate cache
10. **Completes** in ~1-2 minutes

**Result**: The MCP server now knows about all 535 nodes in n8n v1.97.1, with their correct properties, operations, and documentation. AI agents will only suggest nodes that exist in the new version! 🎉
