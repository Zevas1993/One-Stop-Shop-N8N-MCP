/**
 * Event Bus for Inter-Agent Communication
 * 
 * Enables publish/subscribe pattern between agents in the multi-agent system.
 * Events are persisted to SQLite for reliability and can be replayed.
 * 
 * Event Types:
 * - validation:* - Workflow validation events
 * - pattern:* - Pattern discovery events
 * - workflow:* - Workflow lifecycle events
 * - insight:* - Knowledge/learning events
 * - system:* - System-level events
 * - llm:* - LLM operation events
 */

import { logger } from '../utils/logger';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// TYPES
// ============================================================================

export interface BusEvent<T = any> {
  id: string;
  type: string;                // e.g., "validation:completed", "workflow:created"
  source: string;              // Agent ID that emitted the event
  data: T;                     // Event payload
  timestamp: number;
  correlationId?: string;      // For tracking related events
  priority?: 'low' | 'normal' | 'high';
}

export interface EventSubscription {
  id: string;
  pattern: string;             // Event type pattern (supports wildcards: "validation:*")
  handler: EventHandler;
  agentId: string;
  createdAt: number;
}

export type EventHandler = (event: BusEvent) => void | Promise<void>;

export interface EventBusStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  activeSubscriptions: number;
  eventsLast24h: number;
}

// ============================================================================
// EVENT BUS CLASS
// ============================================================================

export class EventBus {
  private db: Database.Database | null = null;
  private dbPath: string;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private initialized: boolean = false;
  private subscriptionCounter: number = 0;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath();
  }

  /**
   * Get default database path
   */
  private getDefaultDbPath(): string {
    const baseDir = process.env.DATA_DIR || 
      (process.platform === 'win32'
        ? path.join(process.env.APPDATA || '', 'n8n-mcp')
        : path.join(process.env.HOME || '', '.cache', 'n8n-mcp'));

    const eventDir = path.join(baseDir, 'events');
    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    return path.join(eventDir, 'event-bus.db');
  }

  /**
   * Initialize the event bus
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.debug(`[EventBus] Initializing at: ${this.dbPath}`);

      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.createTables();

      this.initialized = true;
      logger.info('[EventBus] Initialized successfully');
    } catch (error) {
      logger.error('[EventBus] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        correlationId TEXT,
        priority TEXT DEFAULT 'normal',
        processed INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlationId);
      CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed);

      -- Keep track of subscription history for debugging
      CREATE TABLE IF NOT EXISTS subscription_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriptionId TEXT NOT NULL,
        pattern TEXT NOT NULL,
        agentId TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  // ==========================================================================
  // PUBLISH
  // ==========================================================================

  /**
   * Publish an event to the bus
   */
  async publish<T = any>(
    type: string,
    data: T,
    source: string,
    options?: {
      correlationId?: string;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<BusEvent<T>> {
    if (!this.initialized || !this.db) {
      throw new Error('EventBus not initialized');
    }

    const event: BusEvent<T> = {
      id: this.generateEventId(),
      type,
      source,
      data,
      timestamp: Date.now(),
      correlationId: options?.correlationId,
      priority: options?.priority || 'normal',
    };

    try {
      // Persist event
      const stmt = this.db.prepare(`
        INSERT INTO events (id, type, source, data, timestamp, correlationId, priority, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.id,
        event.type,
        event.source,
        JSON.stringify(event.data),
        event.timestamp,
        event.correlationId || null,
        event.priority,
        Date.now()  // Explicitly set createdAt to avoid SQLite version issues
      );

      logger.debug(`[EventBus] Published: ${type} from ${source}`, {
        eventId: event.id,
        correlationId: event.correlationId,
      });

      // Notify subscribers
      await this.notifySubscribers(event);

      return event;
    } catch (error) {
      logger.error('[EventBus] Failed to publish event:', error);
      throw error;
    }
  }

  /**
   * Notify matching subscribers
   */
  private async notifySubscribers(event: BusEvent): Promise<void> {
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => this.matchesPattern(event.type, sub.pattern));

    for (const subscription of matchingSubscriptions) {
      try {
        await subscription.handler(event);
      } catch (error) {
        logger.error(`[EventBus] Handler error for ${subscription.pattern}:`, error);
      }
    }
  }

  /**
   * Check if event type matches subscription pattern
   * Supports wildcards: "validation:*" matches "validation:completed"
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;

    // Handle wildcard patterns
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ':');
    }

    // Handle glob-style patterns
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`).test(eventType);
  }

  // ==========================================================================
  // SUBSCRIBE
  // ==========================================================================

  /**
   * Subscribe to events matching a pattern
   */
  subscribe(
    pattern: string,
    handler: EventHandler,
    agentId: string
  ): string {
    const subscriptionId = `sub_${++this.subscriptionCounter}_${Date.now()}`;

    const subscription: EventSubscription = {
      id: subscriptionId,
      pattern,
      handler,
      agentId,
      createdAt: Date.now(),
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Log subscription
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO subscription_log (subscriptionId, pattern, agentId, action, timestamp)
          VALUES (?, ?, ?, 'subscribe', ?)
        `);
        stmt.run(subscriptionId, pattern, agentId, Date.now());
      } catch (error) {
        logger.warn('[EventBus] Failed to log subscription:', error);
      }
    }

    logger.debug(`[EventBus] Subscribed: ${pattern} (agent: ${agentId}, id: ${subscriptionId})`);

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);

    // Log unsubscription
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO subscription_log (subscriptionId, pattern, agentId, action, timestamp)
          VALUES (?, ?, ?, 'unsubscribe', ?)
        `);
        stmt.run(subscriptionId, subscription.pattern, subscription.agentId, Date.now());
      } catch (error) {
        logger.warn('[EventBus] Failed to log unsubscription:', error);
      }
    }

    logger.debug(`[EventBus] Unsubscribed: ${subscriptionId}`);
    return true;
  }

  /**
   * Unsubscribe all handlers for an agent
   */
  unsubscribeAll(agentId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions.entries()) {
      if (sub.agentId === agentId) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    logger.debug(`[EventBus] Unsubscribed all for agent ${agentId}: ${count} subscriptions`);
    return count;
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  /**
   * Get recent events
   */
  async getEvents(options?: {
    type?: string;
    source?: string;
    correlationId?: string;
    since?: number;
    limit?: number;
  }): Promise<BusEvent[]> {
    if (!this.initialized || !this.db) {
      throw new Error('EventBus not initialized');
    }

    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (options?.type) {
      if (options.type.includes('*')) {
        const pattern = options.type.replace(/\*/g, '%');
        query += ' AND type LIKE ?';
        params.push(pattern);
      } else {
        query += ' AND type = ?';
        params.push(options.type);
      }
    }

    if (options?.source) {
      query += ' AND source = ?';
      params.push(options.source);
    }

    if (options?.correlationId) {
      query += ' AND correlationId = ?';
      params.push(options.correlationId);
    }

    if (options?.since) {
      query += ' AND timestamp > ?';
      params.push(options.since);
    }

    query += ' ORDER BY timestamp DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      source: row.source,
      data: JSON.parse(row.data),
      timestamp: row.timestamp,
      correlationId: row.correlationId,
      priority: row.priority,
    }));
  }

  /**
   * Get events by correlation ID (for tracing)
   */
  async getCorrelatedEvents(correlationId: string): Promise<BusEvent[]> {
    return this.getEvents({ correlationId });
  }

  /**
   * Replay events to a handler (useful for recovery)
   */
  async replayEvents(
    handler: EventHandler,
    options?: {
      type?: string;
      since?: number;
      limit?: number;
    }
  ): Promise<number> {
    const events = await this.getEvents(options);
    
    for (const event of events.reverse()) { // Oldest first
      await handler(event);
    }

    return events.length;
  }

  // ==========================================================================
  // STATS & MANAGEMENT
  // ==========================================================================

  /**
   * Get event bus statistics
   */
  async getStats(): Promise<EventBusStats> {
    if (!this.initialized || !this.db) {
      throw new Error('EventBus not initialized');
    }

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
    const totalResult = totalStmt.get() as { count: number };

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM events GROUP BY type
    `);
    const byTypeResults = byTypeStmt.all() as Array<{ type: string; count: number }>;

    const last24hStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM events WHERE timestamp > ?
    `);
    const last24hResult = last24hStmt.get(Date.now() - 86400000) as { count: number };

    const eventsByType: Record<string, number> = {};
    for (const row of byTypeResults) {
      eventsByType[row.type] = row.count;
    }

    return {
      totalEvents: totalResult.count,
      eventsByType,
      activeSubscriptions: this.subscriptions.size,
      eventsLast24h: last24hResult.count,
    };
  }

  /**
   * Clean up old events
   */
  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.initialized || !this.db) {
      throw new Error('EventBus not initialized');
    }

    const cutoff = Date.now() - maxAge;
    const stmt = this.db.prepare('DELETE FROM events WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    
    const count = result.changes as number;
    if (count > 0) {
      logger.info(`[EventBus] Cleaned up ${count} old events`);
    }
    
    return count;
  }

  /**
   * Close the event bus
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.subscriptions.clear();
    this.initialized = false;
    logger.info('[EventBus] Closed');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let eventBusInstance: EventBus | null = null;

/**
 * Get global event bus instance
 */
export async function getEventBus(): Promise<EventBus> {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
    await eventBusInstance.initialize();
  }
  return eventBusInstance;
}

/**
 * Reset event bus (for testing)
 */
export async function resetEventBus(): Promise<void> {
  if (eventBusInstance) {
    await eventBusInstance.close();
    eventBusInstance = null;
  }
}

// ============================================================================
// COMMON EVENT TYPES
// ============================================================================

export const EventTypes = {
  // Pipeline events
  PIPELINE_STARTED: 'pipeline:started',
  PIPELINE_COMPLETED: 'pipeline:completed',
  PIPELINE_FAILED: 'pipeline:failed',

  // Validation events
  VALIDATION_STARTED: 'validation:started',
  VALIDATION_COMPLETED: 'validation:completed',
  VALIDATION_FAILED: 'validation:failed',

  // Workflow events
  WORKFLOW_CREATED: 'workflow:created',
  WORKFLOW_UPDATED: 'workflow:updated',
  WORKFLOW_DELETED: 'workflow:deleted',
  WORKFLOW_EXECUTED: 'workflow:executed',

  // Pattern events
  PATTERN_DISCOVERED: 'pattern:discovered',
  PATTERN_MATCHED: 'pattern:matched',

  // Knowledge events
  INSIGHT_GENERATED: 'insight:generated',
  KNOWLEDGE_UPDATED: 'knowledge:updated',

  // LLM events
  LLM_REQUEST: 'llm:request',
  LLM_RESPONSE: 'llm:response',
  LLM_ERROR: 'llm:error',

  // System events
  SYSTEM_STARTED: 'system:started',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  AGENT_REGISTERED: 'system:agent_registered',
  CATALOG_SYNCED: 'system:catalog_synced',
} as const;
