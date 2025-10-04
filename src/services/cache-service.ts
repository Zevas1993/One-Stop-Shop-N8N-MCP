/**
 * LRU Cache Service
 *
 * Implements Least Recently Used (LRU) caching with:
 * - Automatic eviction of least recently used items
 * - TTL (Time To Live) support
 * - Statistics tracking
 * - Memory-aware eviction
 */

import { logger } from '../utils/logger.js';

export interface CacheOptions {
  /**
   * Maximum number of items in cache
   */
  maxSize?: number;

  /**
   * Default TTL in milliseconds (0 = no expiration)
   */
  ttl?: number;

  /**
   * Maximum memory usage in bytes (0 = unlimited)
   */
  maxMemory?: number;

  /**
   * Enable automatic memory-based eviction
   */
  memoryAware?: boolean;

  /**
   * Callback when item is evicted
   */
  onEvict?: (key: string, value: any, reason: 'size' | 'ttl' | 'memory') => void;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  memoryUsage: number;
  averageAccessCount: number;
}

export class LRUCache<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private accessOrder: string[];
  private options: Required<CacheOptions>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.accessOrder = [];
    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 0,
      maxMemory: options.maxMemory || 0,
      memoryAware: options.memoryAware || false,
      onEvict: options.onEvict || (() => {}),
    };
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key, 'ttl');
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(key);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const size = this.estimateSize(value);

    // Check if adding this item would exceed memory limit
    if (this.options.memoryAware && this.options.maxMemory > 0) {
      while (this.getMemoryUsage() + size > this.options.maxMemory && this.cache.size > 0) {
        this.evictLRU('memory');
      }
    }

    // Evict LRU if at capacity
    if (this.cache.size >= this.options.maxSize) {
      this.evictLRU('size');
    }

    const expiresAt = ttl || this.options.ttl
      ? Date.now() + (ttl || this.options.ttl)
      : undefined;

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      size,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key, 'ttl');
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string, reason: 'size' | 'ttl' | 'memory' = 'size'): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);

    if (reason !== 'ttl') {
      this.stats.evictions++;
    }

    this.options.onEvict(key, entry.value, reason);
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const accessCounts = Array.from(this.cache.values()).map((e) => e.accessCount);
    const averageAccessCount =
      accessCounts.length > 0
        ? accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length
        : 0;

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate,
      memoryUsage: this.getMemoryUsage(),
      averageAccessCount,
    };
  }

  /**
   * Evict expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key, 'ttl');
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(reason: 'size' | 'memory'): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.delete(lruKey, reason);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter((k) => k !== key);

    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per character (UTF-16)
    }

    if (typeof value === 'number') {
      return 8;
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (Buffer.isBuffer(value)) {
      return value.length;
    }

    // For objects, estimate based on JSON string length
    try {
      const json = JSON.stringify(value);
      return json.length * 2;
    } catch {
      return 100; // Default estimate
    }
  }

  /**
   * Get total memory usage of cache
   */
  private getMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }
}

/**
 * Cache Manager - Singleton for application-wide caching
 */
export class CacheManager {
  private static instance: CacheManager;
  private caches: Map<string, LRUCache>;

  private constructor() {
    this.caches = new Map();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get or create a named cache
   */
  getCache<T = any>(name: string, options?: CacheOptions): LRUCache<T> {
    let cache = this.caches.get(name);

    if (!cache) {
      cache = new LRUCache<T>(options);
      this.caches.set(name, cache);
      logger.info(`Created cache: ${name}`, options);
    }

    return cache as LRUCache<T>;
  }

  /**
   * Clear a specific cache
   */
  clearCache(name: string): boolean {
    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
      logger.info(`Cleared cache: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const [name, cache] of this.caches.entries()) {
      cache.clear();
      logger.info(`Cleared cache: ${name}`);
    }
  }

  /**
   * Get statistics for all caches
   */
  getAllStats(): { [name: string]: CacheStats } {
    const stats: { [name: string]: CacheStats } = {};

    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }

    return stats;
  }

  /**
   * Evict expired entries from all caches
   */
  evictExpiredAll(): number {
    let total = 0;

    for (const cache of this.caches.values()) {
      total += cache.evictExpired();
    }

    if (total > 0) {
      logger.debug(`Evicted ${total} expired cache entries`);
    }

    return total;
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    const interval = setInterval(() => {
      this.evictExpiredAll();
    }, intervalMs);

    logger.info(`Started cache cleanup interval: ${intervalMs}ms`);
    return interval;
  }
}

// Export default instance
export const cacheManager = CacheManager.getInstance();
