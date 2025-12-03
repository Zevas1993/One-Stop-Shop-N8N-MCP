import { DatabaseAdapter } from "./database-adapter";
import { ParsedNode } from "../parsers/node-parser";
import { SimpleCache } from "../utils/simple-cache";

export class NodeRepository {
  private nodeInfoCache = new SimpleCache({
    enabled: true,
    ttl: 300,
    maxSize: 100,
  });
  private searchCache = new SimpleCache({
    enabled: true,
    ttl: 60,
    maxSize: 50,
  });

  constructor(private db: DatabaseAdapter) {}

  /**
   * Save node with proper JSON serialization
   */
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

  /**
   * Get node with proper JSON deserialization and caching
   */
  getNode(nodeType: string): any {
    // Check cache first
    const cacheKey = `node:${nodeType}`;
    const cached = this.nodeInfoCache.get(cacheKey);
    if (cached) return cached;

    const row = this.db
      .prepare(
        `
      SELECT * FROM nodes WHERE node_type = ?
    `
      )
      .get(nodeType) as any;

    if (!row) return null;

    const result = {
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      developmentStyle: row.development_style,
      package: row.package_name,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
      properties: this.safeJsonParse(row.properties_schema, []),
      operations: this.safeJsonParse(row.operations, []),
      credentials: this.safeJsonParse(row.credentials_required, []),
      hasDocumentation: !!row.documentation,
    };

    // Cache the result
    this.nodeInfoCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get AI tools with proper filtering
   */
  getAITools(): any[] {
    const rows = this.db
      .prepare(
        `
      SELECT node_type, display_name, description, package_name
      FROM nodes
      WHERE is_ai_tool = 1
      ORDER BY display_name
    `
      )
      .all() as any[];

    return rows.map((row) => ({
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      package: row.package_name,
    }));
  }

  /**
   * Get node info (alias for getNode with more comprehensive data)
   */
  getNodeInfo(nodeType: string): any {
    // Check cache first
    const cacheKey = `node_info:${nodeType}`;
    const cached = this.nodeInfoCache.get(cacheKey);
    if (cached) return cached;

    const row = this.db
      .prepare(
        `
      SELECT * FROM nodes WHERE node_type = ?
    `
      )
      .get(nodeType) as any;

    if (!row) return null;

    const result = {
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      developmentStyle: row.development_style,
      package: row.package_name,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
      properties: this.safeJsonParse(row.properties_schema, []),
      operations: this.safeJsonParse(row.operations, []),
      credentials: this.safeJsonParse(row.credentials_required, []),
      documentation: row.documentation,
      hasDocumentation: !!row.documentation,
    };

    // Cache the result
    this.nodeInfoCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get node by type with optional version matching
   * Used by NodeParameterValidator to validate node parameters
   */
  getNodeByType(nodeType: string, typeVersion?: number): any {
    // Check cache first
    const cacheKey = `node_by_type:${nodeType}:${typeVersion || ""}`;
    const cached = this.nodeInfoCache.get(cacheKey);
    if (cached) return cached;

    // Try exact match first
    let row = this.db
      .prepare(
        `
      SELECT * FROM nodes WHERE node_type = ?
    `
      )
      .get(nodeType) as any;

    // If not found, try normalized versions
    // Workflows use full package names, but database stores shortened names
    if (!row) {
      let normalizedType = nodeType;

      // Handle: n8n-nodes-base.httpRequest → nodes-base.httpRequest
      if (nodeType.startsWith("n8n-nodes-base.")) {
        normalizedType = nodeType.replace("n8n-nodes-base.", "nodes-base.");
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      }
      // Handle: @n8n/n8n-nodes-langchain.agent → nodes-langchain.agent
      else if (nodeType.startsWith("@n8n/n8n-nodes-langchain.")) {
        normalizedType = nodeType.replace(
          "@n8n/n8n-nodes-langchain.",
          "nodes-langchain."
        );
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      }
      // Handle: n8n-nodes-langchain.agent → nodes-langchain.agent
      else if (nodeType.startsWith("n8n-nodes-langchain.")) {
        normalizedType = nodeType.replace(
          "n8n-nodes-langchain.",
          "nodes-langchain."
        );
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      }
      // Handle: @n8n/n8n-nodes-base.httpRequest → nodes-base.httpRequest
      else if (nodeType.startsWith("@n8n/n8n-nodes-base.")) {
        normalizedType = nodeType.replace(
          "@n8n/n8n-nodes-base.",
          "nodes-base."
        );
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      }
      // Generic fallback: Remove any n8n- or @n8n/ prefix
      else if (nodeType.startsWith("n8n-")) {
        normalizedType = nodeType.substring(4); // Remove 'n8n-'
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      } else if (nodeType.startsWith("@n8n/")) {
        normalizedType = nodeType.substring(5); // Remove '@n8n/'
        row = this.db
          .prepare(
            `
          SELECT * FROM nodes WHERE node_type = ?
        `
          )
          .get(normalizedType) as any;
      }
    }

    if (!row) return null;

    const result = {
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      developmentStyle: row.development_style,
      package: row.package_name,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
      properties: this.safeJsonParse(row.properties_schema, []),
      operations: this.safeJsonParse(row.operations, []),
      credentials: this.safeJsonParse(row.credentials_required, []),
      documentation: row.documentation,
      hasDocumentation: !!row.documentation,
    };

    // Cache the result
    this.nodeInfoCache.set(cacheKey, result);
    return result;
  }

  /**
   * List nodes with optional filtering
   */
  listNodes(options: any = {}): any[] {
    let query = "SELECT * FROM nodes WHERE 1=1";
    const params: any[] = [];

    // Package filter - support multiple package name formats
    if (options.package) {
      const packageVariants = [
        options.package,
        `@n8n/${options.package}`,
        options.package.replace("@n8n/", ""),
      ];
      query +=
        " AND package_name IN (" +
        packageVariants.map(() => "?").join(",") +
        ")";
      params.push(...packageVariants);
    }

    // Category filter
    if (options.category) {
      query += " AND category = ?";
      params.push(options.category);
    }

    // Development style filter
    if (options.developmentStyle) {
      query += " AND development_style = ?";
      params.push(options.developmentStyle);
    }

    // AI tool filter
    if (options.isAITool !== undefined) {
      query += " AND is_ai_tool = ?";
      params.push(options.isAITool ? 1 : 0);
    }

    query += " ORDER BY display_name";

    // Limit results
    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      package: row.package_name,
      developmentStyle: row.development_style,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
    }));
  }

  /**
   * Search nodes with full-text search and caching
   */
  searchNodes(query: string, options: any = {}): any[] {
    // Check cache first
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const searchQuery = `
      SELECT * FROM nodes
      WHERE (display_name LIKE ? OR description LIKE ? OR node_type LIKE ?)
      ORDER BY display_name
    `;

    const searchTerm = `%${query}%`;
    const rows = this.db
      .prepare(searchQuery)
      .all(searchTerm, searchTerm, searchTerm) as any[];

    const result = rows.map((row) => ({
      nodeType: row.node_type,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      package: row.package_name,
      isAITool: !!row.is_ai_tool,
      isTrigger: !!row.is_trigger,
      isWebhook: !!row.is_webhook,
      isVersioned: !!row.is_versioned,
      version: row.version,
    }));

    // Cache the search results
    this.searchCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get node documentation
   */
  getNodeDocumentation(nodeType: string): string | null {
    const row = this.db
      .prepare(
        `
      SELECT documentation FROM nodes WHERE node_type = ?
    `
      )
      .get(nodeType) as any;

    return row?.documentation || null;
  }

  /**
   * Get database statistics
   */
  getDatabaseStatistics(): any {
    const totalNodes = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as any;
    const aiTools = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE is_ai_tool = 1")
      .get() as any;
    const triggers = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE is_trigger = 1")
      .get() as any;
    const webhooks = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE is_webhook = 1")
      .get() as any;
    const withDocs = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM nodes WHERE documentation IS NOT NULL"
      )
      .get() as any;

    return {
      totalNodes: totalNodes.count,
      aiTools: aiTools.count,
      triggers: triggers.count,
      webhooks: webhooks.count,
      withDocumentation: withDocs.count,
      categories: this.getCategories(),
    };
  }

  /**
   * Get total count of nodes in database
   * Used for verification after rebuild
   */
  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as any;
    return result.count;
  }

  /**
   * Get current database n8n version
   * Returns null if version not set (initial state)
   */
  getDbVersion(): string | null {
    try {
      const row = this.db
        .prepare(
          `
        SELECT value FROM db_metadata WHERE key = 'n8n_version'
      `
        )
        .get() as any;

      return row?.value || null;
    } catch (error) {
      // Table might not exist yet in older databases
      return null;
    }
  }

  /**
   * Set database n8n version
   * Called after successful rebuild for specific version
   */
  setDbVersion(version: string): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO db_metadata (key, value, updated_at)
      VALUES ('n8n_version', ?, CURRENT_TIMESTAMP)
    `
      )
      .run(version);
  }

  /**
   * Initialize db_metadata table if it doesn't exist
   * Called during database setup
   */
  initializeMetadata(): void {
    try {
      this.db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS db_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
        )
        .run();
    } catch (error) {
      // Table already exists, ignore error
    }
  }

  /**
   * Get all categories
   */
  private getCategories(): string[] {
    const rows = this.db
      .prepare(
        `
      SELECT DISTINCT category FROM nodes WHERE category IS NOT NULL ORDER BY category
    `
      )
      .all() as any[];

    return rows.map((row) => row.category);
  }

  private safeJsonParse(json: string, defaultValue: any): any {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }
}
