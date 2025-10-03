/**
 * Lazy Initialization Manager
 *
 * Ensures MCP server starts instantly (<500ms) by loading database in background.
 * This prevents Claude Desktop connection timeouts and Docker startup failures.
 *
 * @version 3.0.0
 */

import { DatabaseAdapter, createDatabaseAdapter } from '../database/database-adapter';
import { NodeRepository } from '../database/node-repository';
import { TemplateService } from '../templates/template-service';
import { HandlerRegistry } from './handlers/handler-registry';
import { SimpleCache } from '../utils/simple-cache';
import { logger } from '../utils/logger';

export interface InitializationStatus {
  phase: 'starting' | 'database' | 'repository' | 'services' | 'ready' | 'failed';
  progress: number; // 0-100
  startedAt: Date;
  readyAt?: Date;
  error?: string;
  details?: string;
}

export class LazyInitializationManager {
  private status: InitializationStatus = {
    phase: 'starting',
    progress: 0,
    startedAt: new Date()
  };

  private initPromise: Promise<void> | null = null;
  private db: DatabaseAdapter | null = null;
  private repository: NodeRepository | null = null;
  private templateService: TemplateService | null = null;
  private handlerRegistry: HandlerRegistry | null = null;

  /**
   * Start initialization in background (non-blocking)
   */
  startBackgroundInit(dbPath: string): void {
    if (this.initPromise) {
      logger.debug('Background initialization already started');
      return; // Already started
    }

    logger.info('[LazyInit] Starting background initialization');
    this.initPromise = this.initializeInBackground(dbPath);
  }

  /**
   * Background initialization with progress tracking
   */
  private async initializeInBackground(dbPath: string): Promise<void> {
    try {
      // Phase 1: Database connection (lightweight, just open file)
      this.status.phase = 'database';
      this.status.progress = 10;
      this.status.details = 'Opening database connection';
      logger.info('[LazyInit] Phase 1: Opening database');

      this.db = await this.openDatabaseLazy(dbPath);

      this.status.progress = 30;
      logger.info('[LazyInit] Database opened successfully');

      // Phase 2: Repository (no data loading yet)
      this.status.phase = 'repository';
      this.status.details = 'Initializing node repository';
      logger.info('[LazyInit] Phase 2: Creating repository');

      this.repository = new NodeRepository(this.db);

      this.status.progress = 50;
      logger.info('[LazyInit] Repository created');

      // Phase 3: Services (lazy initialization)
      this.status.phase = 'services';
      this.status.details = 'Initializing services';
      logger.info('[LazyInit] Phase 3: Creating services');

      // Don't load templates until first use
      this.templateService = new TemplateService(this.db);

      this.status.progress = 70;

      // Handler registry is lightweight
      this.handlerRegistry = new HandlerRegistry(
        this.repository,
        this.templateService,
        new SimpleCache({ enabled: false, ttl: 300, maxSize: 10 })
      );

      this.status.progress = 100;
      this.status.phase = 'ready';
      this.status.readyAt = new Date();
      this.status.details = 'Initialization complete';

      const initTime = this.status.readyAt.getTime() - this.status.startedAt.getTime();
      logger.info(`[LazyInit] ✅ Background initialization complete in ${initTime}ms`);

    } catch (error) {
      this.status.phase = 'failed';
      this.status.error = error instanceof Error ? error.message : 'Unknown error';
      this.status.details = error instanceof Error ? error.stack : undefined;
      logger.error('[LazyInit] ❌ Background initialization failed:', error);
      throw error;
    }
  }

  /**
   * Open database without loading all data
   */
  private async openDatabaseLazy(dbPath: string): Promise<DatabaseAdapter> {
    // Use streaming database open (doesn't load entire DB into memory)
    const db = await createDatabaseAdapter(dbPath);

    // Optimize for lazy access (only if using better-sqlite3)
    try {
      // These pragmas improve performance for read-heavy workloads
      if (typeof db.pragma === 'function') {
        db.pragma('journal_mode = WAL'); // Better for concurrent reads
        db.pragma('synchronous = NORMAL'); // Faster for read-heavy workload
        db.pragma('cache_size = -10000'); // 10MB cache (negative means KB)
        db.pragma('temp_store = MEMORY'); // Temp tables in memory
        logger.debug('[LazyInit] Applied SQLite performance optimizations');
      }
    } catch (error) {
      // Pragmas might not be available with sql.js, ignore
      logger.debug('[LazyInit] Pragma not available (using sql.js)');
    }

    return db;
  }

  /**
   * Wait for specific component (with timeout)
   */
  async waitForComponent<T>(
    component: 'db' | 'repository' | 'services',
    timeout: number = 30000
  ): Promise<T> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      // Check if we have the requested component
      if (component === 'db' && this.db) {
        logger.debug(`[LazyInit] Component 'db' ready after ${Date.now() - start}ms`);
        return this.db as T;
      }
      if (component === 'repository' && this.repository) {
        logger.debug(`[LazyInit] Component 'repository' ready after ${Date.now() - start}ms`);
        return this.repository as T;
      }
      if (component === 'services' && this.handlerRegistry) {
        logger.debug(`[LazyInit] Component 'services' ready after ${Date.now() - start}ms`);
        return this.handlerRegistry as T;
      }

      // Check if initialization failed
      if (this.status.phase === 'failed') {
        throw new Error(`Initialization failed: ${this.status.error}`);
      }

      // Wait 50ms before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Timeout reached
    const currentStatus = this.getStatus();
    throw new Error(
      `Timeout waiting for ${component} after ${timeout}ms. ` +
      `Current phase: ${currentStatus.phase} (${currentStatus.progress}%). ` +
      `${currentStatus.details || ''}`
    );
  }

  /**
   * Get current status (safe copy)
   */
  getStatus(): InitializationStatus {
    return { ...this.status };
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.status.phase === 'ready';
  }

  /**
   * Check if failed
   */
  isFailed(): boolean {
    return this.status.phase === 'failed';
  }

  /**
   * Get initialization time (in milliseconds)
   */
  getInitTime(): number | null {
    if (!this.status.readyAt) return null;
    return this.status.readyAt.getTime() - this.status.startedAt.getTime();
  }

  /**
   * Get components (throws if not ready)
   */
  getDb(): DatabaseAdapter {
    if (!this.db) {
      throw new Error('Database not initialized. Current phase: ' + this.status.phase);
    }
    return this.db;
  }

  getRepository(): NodeRepository {
    if (!this.repository) {
      throw new Error('Repository not initialized. Current phase: ' + this.status.phase);
    }
    return this.repository;
  }

  getTemplateService(): TemplateService {
    if (!this.templateService) {
      throw new Error('Template service not initialized. Current phase: ' + this.status.phase);
    }
    return this.templateService;
  }

  getHandlerRegistry(): HandlerRegistry {
    if (!this.handlerRegistry) {
      throw new Error('Handler registry not initialized. Current phase: ' + this.status.phase);
    }
    return this.handlerRegistry;
  }

  /**
   * Get helpful error message for user
   */
  getWaitMessage(): string {
    const status = this.getStatus();

    if (status.phase === 'failed') {
      return `❌ MCP server initialization failed: ${status.error}`;
    }

    if (status.phase === 'ready') {
      return '✅ MCP server ready';
    }

    // Still initializing
    const phaseNames: Record<string, string> = {
      starting: 'Starting up',
      database: 'Loading database',
      repository: 'Initializing repository',
      services: 'Loading services'
    };

    const phaseName = phaseNames[status.phase] || status.phase;
    return `⏳ MCP server is initializing (${phaseName}, ${status.progress}%). Please try again in a moment.`;
  }
}
