/**
 * Shared Memory Service for Multi-Agent System
 * Provides SQLite-backed key-value store for inter-agent communication
 * Ensures isolation and thread-safety for agent coordination
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

export interface MemoryEntry<T = any> {
  key: string;
  value: T;
  agentId: string;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
}

export interface MemoryQuery {
  pattern?: string; // Glob pattern or exact key
  agentId?: string;
  maxAge?: number; // Max age in milliseconds
  limit?: number;
}

export class SharedMemory {
  private db: Database.Database | null = null;
  private dbPath: string;
  private logger: Logger;
  private initialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath();
    this.logger = new Logger({ prefix: 'SharedMemory' });
  }

  /**
   * Get default database path based on platform
   */
  private getDefaultDbPath(): string {
    const graphDir = process.env.GRAPH_DIR || this.getDefaultGraphDir();
    const dbDir = path.join(graphDir, '..', 'shared-memory');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return path.join(dbDir, 'shared-memory.db');
  }

  /**
   * Get default graph directory based on platform
   */
  private getDefaultGraphDir(): string {
    if (process.platform === 'win32') {
      const appdata = process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming');
      return path.join(appdata, 'n8n-mcp', 'graph');
    }
    return path.join(process.env.HOME || '', '.cache', 'n8n-mcp', 'graph');
  }

  /**
   * Initialize shared memory database
   */
  async initialize(): Promise<void> {
    try {
      this.logger.debug(`Initializing shared memory at: ${this.dbPath}`);

      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.createTables();

      this.initialized = true;
      this.logger.info('Shared memory initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize shared memory', error as Error);
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        agentId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expiresAt INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch('now', 'milliseconds')),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch('now', 'milliseconds'))
      );

      CREATE INDEX IF NOT EXISTS idx_key ON memory(key);
      CREATE INDEX IF NOT EXISTS idx_agentId ON memory(agentId);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memory(timestamp);
      CREATE INDEX IF NOT EXISTS idx_expiresAt ON memory(expiresAt);

      CREATE TABLE IF NOT EXISTS memory_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        oldValue TEXT,
        newValue TEXT NOT NULL,
        agentId TEXT NOT NULL,
        changeType TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_key ON memory_history(key);
      CREATE INDEX IF NOT EXISTS idx_history_agentId ON memory_history(agentId);
    `);

    this.logger.debug('Database tables created/verified');
  }

  /**
   * Set a value in shared memory
   */
  async set<T = any>(key: string, value: T, agentId: string, ttl?: number): Promise<void> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      const valueStr = JSON.stringify(value);
      const now = Date.now();
      const expiresAt = ttl ? now + ttl : null;

      const stmt = this.db.prepare(`
        INSERT INTO memory (key, value, agentId, timestamp, expiresAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          agentId = excluded.agentId,
          timestamp = excluded.timestamp,
          expiresAt = excluded.expiresAt,
          updatedAt = excluded.updatedAt
      `);

      stmt.run(key, valueStr, agentId, now, expiresAt, now, now);

      // Record in history
      this.recordHistory(key, null, valueStr, agentId, 'SET');

      this.logger.debug(`Set memory: ${key} (agent: ${agentId}, ttl: ${ttl}ms)`);
    } catch (error) {
      this.logger.error(`Failed to set memory: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Get a value from shared memory
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      // Clean up expired entries first
      await this.cleanupExpired();

      const stmt = this.db.prepare(`
        SELECT value FROM memory
        WHERE key = ? AND (expiresAt IS NULL OR expiresAt > ?)
      `);

      const result = stmt.get(key, Date.now()) as { value: string } | undefined;

      if (!result) {
        this.logger.debug(`Memory key not found: ${key}`);
        return null;
      }

      const value = JSON.parse(result.value) as T;
      this.logger.debug(`Get memory: ${key}`);
      return value;
    } catch (error) {
      this.logger.error(`Failed to get memory: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      await this.cleanupExpired();

      const stmt = this.db.prepare(`
        SELECT 1 FROM memory
        WHERE key = ? AND (expiresAt IS NULL OR expiresAt > ?)
      `);

      const result = stmt.get(key, Date.now());
      return result !== undefined;
    } catch (error) {
      this.logger.error(`Failed to check memory: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Delete a key from shared memory
   */
  async delete(key: string, agentId: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      // Get old value for history
      const getStmt = this.db.prepare('SELECT value FROM memory WHERE key = ?');
      const oldResult = getStmt.get(key) as { value: string } | undefined;
      const oldValue = oldResult?.value || null;

      // Delete the entry
      const delStmt = this.db.prepare('DELETE FROM memory WHERE key = ?');
      const result = delStmt.run(key);

      if ((result.changes as number) > 0) {
        this.recordHistory(key, oldValue, null, agentId, 'DELETE');
        this.logger.debug(`Deleted memory: ${key}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to delete memory: ${key}`, error as Error);
      throw error;
    }
  }

  /**
   * Get all keys matching a pattern
   */
  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      await this.cleanupExpired();

      let query = `
        SELECT key, value, agentId, timestamp FROM memory
        WHERE (expiresAt IS NULL OR expiresAt > ?)
      `;
      const params: any[] = [Date.now()];

      // Add pattern matching
      if (q.pattern) {
        if (q.pattern.includes('%') || q.pattern.includes('_')) {
          query += ` AND key LIKE ?`;
          params.push(q.pattern);
        } else {
          query += ` AND key = ?`;
          params.push(q.pattern);
        }
      }

      // Add agent filter
      if (q.agentId) {
        query += ` AND agentId = ?`;
        params.push(q.agentId);
      }

      // Add age filter
      if (q.maxAge) {
        query += ` AND timestamp > ?`;
        params.push(Date.now() - q.maxAge);
      }

      query += ` ORDER BY timestamp DESC`;

      // Add limit
      if (q.limit) {
        query += ` LIMIT ?`;
        params.push(q.limit);
      }

      const stmt = this.db.prepare(query);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        key: row.key,
        value: JSON.parse(row.value),
        agentId: row.agentId,
        timestamp: row.timestamp,
      }));
    } catch (error) {
      this.logger.error('Failed to query memory', error as Error);
      throw error;
    }
  }

  /**
   * Get all memory for an agent
   */
  async getAgentMemory(agentId: string): Promise<Record<string, any>> {
    const entries = await this.query({ agentId });
    const result: Record<string, any> = {};

    for (const entry of entries) {
      result[entry.key] = entry.value;
    }

    return result;
  }

  /**
   * Clear all memory for an agent
   */
  async clearAgentMemory(agentId: string): Promise<number> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      const stmt = this.db.prepare('DELETE FROM memory WHERE agentId = ?');
      const result = stmt.run(agentId);
      const count = result.changes as number;

      this.logger.info(`Cleared ${count} memory entries for agent: ${agentId}`);
      return count;
    } catch (error) {
      this.logger.error(`Failed to clear agent memory: ${agentId}`, error as Error);
      throw error;
    }
  }

  /**
   * Clean up expired entries
   */
  private async cleanupExpired(): Promise<number> {
    if (!this.db) return 0;

    try {
      const stmt = this.db.prepare('DELETE FROM memory WHERE expiresAt IS NOT NULL AND expiresAt <= ?');
      const result = stmt.run(Date.now());
      const count = result.changes as number;

      if (count > 0) {
        this.logger.debug(`Cleaned up ${count} expired memory entries`);
      }

      return count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired entries', error as Error);
      return 0;
    }
  }

  /**
   * Record a change in memory history
   */
  private recordHistory(
    key: string,
    oldValue: string | null,
    newValue: string | null,
    agentId: string,
    changeType: string
  ): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO memory_history (key, oldValue, newValue, agentId, changeType, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(key, oldValue, newValue, agentId, changeType, Date.now());
    } catch (error) {
      this.logger.warn('Failed to record memory history', error as Error);
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    totalAgents: number;
    totalHistory: number;
    keysByAgent: Record<string, number>;
  }> {
    if (!this.initialized || !this.db) {
      throw new Error('Shared memory not initialized');
    }

    try {
      const totalKeysStmt = this.db.prepare('SELECT COUNT(*) as count FROM memory');
      const totalKeysResult = totalKeysStmt.get() as { count: number };

      const totalAgentsStmt = this.db.prepare('SELECT COUNT(DISTINCT agentId) as count FROM memory');
      const totalAgentsResult = totalAgentsStmt.get() as { count: number };

      const totalHistoryStmt = this.db.prepare('SELECT COUNT(*) as count FROM memory_history');
      const totalHistoryResult = totalHistoryStmt.get() as { count: number };

      const keysByAgentStmt = this.db.prepare(
        'SELECT agentId, COUNT(*) as count FROM memory GROUP BY agentId'
      );
      const keysByAgentResults = keysByAgentStmt.all() as Array<{ agentId: string; count: number }>;

      const keysByAgent: Record<string, number> = {};
      for (const row of keysByAgentResults) {
        keysByAgent[row.agentId] = row.count;
      }

      return {
        totalKeys: totalKeysResult.count,
        totalAgents: totalAgentsResult.count,
        totalHistory: totalHistoryResult.count,
        keysByAgent,
      };
    } catch (error) {
      this.logger.error('Failed to get memory stats', error as Error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.initialized = false;
        this.logger.info('Shared memory closed');
      } catch (error) {
        this.logger.error('Failed to close shared memory', error as Error);
        throw error;
      }
    }
  }
}

// Export singleton instance
let instance: SharedMemory | null = null;

export async function getSharedMemory(): Promise<SharedMemory> {
  if (!instance) {
    instance = new SharedMemory();
    await instance.initialize();
  }
  return instance;
}

export async function resetSharedMemory(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
