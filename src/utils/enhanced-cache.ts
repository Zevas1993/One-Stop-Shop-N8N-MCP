import { PerformanceMonitor } from '../services/performance-monitor';
import { logger } from './logger';
import * as os from 'os';

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number;
  maxMemoryMB?: number; // Maximum memory usage in MB (adaptive)
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

export class EnhancedCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private performanceMonitor: PerformanceMonitor;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private currentMemoryMB: number = 0;
  private maxMemoryMB: number;

  constructor(config: CacheConfig) {
    this.config = config;
    this.performanceMonitor = PerformanceMonitor.getInstance();

    // Adaptive memory limit based on available system memory
    this.maxMemoryMB = this.calculateAdaptiveMemoryLimit(config.maxMemoryMB);

    if (this.config.enabled) {
      // Start cleanup interval every 5 minutes
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 5 * 60 * 1000);

      // Check memory pressure more frequently (every 30 seconds)
      setInterval(() => {
        this.checkMemoryPressure();
      }, 30 * 1000);
    }

    logger.info(`[Cache] Initialized with max ${this.maxMemoryMB}MB memory limit`);
  }

  private calculateAdaptiveMemoryLimit(configLimit?: number): number {
    const totalMemoryMB = os.totalmem() / 1024 / 1024;
    const totalMemoryGB = totalMemoryMB / 1024;
    const freeMemoryMB = os.freemem() / 1024 / 1024;

    if (configLimit) {
      logger.info(`[Cache] Using configured memory limit: ${configLimit}MB`);
      return configLimit;
    }

    // Automated percentage-based scaling that increases with available RAM
    // More RAM = higher percentage utilization for better performance
    let percentage: number;
    let adaptiveLimit: number;

    if (totalMemoryGB < 2) {
      // < 2GB: Use 0.5% (very conservative for ultra low-end)
      percentage = 0.005;
      adaptiveLimit = Math.max(10, Math.floor(totalMemoryMB * percentage)); // Min 10MB
    } else if (totalMemoryGB < 4) {
      // 2-4GB: Use 1% (conservative for low-end)
      percentage = 0.01;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~20-40MB
    } else if (totalMemoryGB < 8) {
      // 4-8GB: Use 2% (balanced for mid-range)
      percentage = 0.02;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~80-160MB
    } else if (totalMemoryGB < 16) {
      // 8-16GB: Use 3% (good performance)
      percentage = 0.03;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~240-480MB
    } else if (totalMemoryGB < 32) {
      // 16-32GB: Use 5% (high performance)
      percentage = 0.05;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~800-1600MB
    } else if (totalMemoryGB < 64) {
      // 32-64GB: Use 7% (workstation performance) - 32GB DDR5 system gets ~2.2GB cache
      percentage = 0.07;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~2.2-4.5GB
    } else if (totalMemoryGB < 128) {
      // 64-128GB: Use 10% (server performance)
      percentage = 0.10;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~6.4-12.8GB
    } else {
      // 128GB+: Use 12% (enterprise server)
      percentage = 0.12;
      adaptiveLimit = Math.floor(totalMemoryMB * percentage); // ~15.4GB+
    }

    logger.info(`[Cache] Auto-scaled to ${adaptiveLimit}MB (${(percentage * 100).toFixed(1)}% of ${totalMemoryGB.toFixed(1)}GB RAM, ${freeMemoryMB.toFixed(0)}MB currently free)`);
    return adaptiveLimit;
  }

  set(key: string, value: T, ttl?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const entryTtl = ttl || this.config.ttl;
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: entryTtl,
      hits: 0,
      lastAccessed: Date.now()
    };

    const entrySizeMB = this.estimateSize(value) / (1024 * 1024);

    // Check memory pressure BEFORE adding
    if (this.currentMemoryMB + entrySizeMB > this.maxMemoryMB) {
      this.evictUntilSpaceAvailable(entrySizeMB);
    }

    // Check if cache is at max size (entry count)
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastUsed();
    }

    this.cache.set(key, entry);
    this.currentMemoryMB += entrySizeMB;

    logger.debug(`Cache set: ${key} (TTL: ${entryTtl}s, Size: ${entrySizeMB.toFixed(2)}MB)`);
  }

  get(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.performanceMonitor.recordCacheMiss();
      return undefined;
    }

    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;

    // Check if entry has expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.performanceMonitor.recordCacheMiss();
      logger.debug(`Cache expired: ${key} (age: ${age}s, ttl: ${entry.ttl}s)`);
      return undefined;
    }

    // Update entry stats
    entry.hits++;
    entry.lastAccessed = now;
    
    this.performanceMonitor.recordCacheHit();
    logger.debug(`Cache hit: ${key} (hits: ${entry.hits})`);
    
    return entry.value;
  }

  has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;

    // Check if entry has expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    const result = this.cache.delete(key);

    if (result && entry) {
      const sizeMB = this.estimateSize(entry.value) / (1024 * 1024);
      this.currentMemoryMB -= sizeMB;
      logger.debug(`Cache deleted: ${key} (freed ${sizeMB.toFixed(2)}MB)`);
    }

    return result;
  }

  clear(): void {
    if (!this.config.enabled) {
      return;
    }

    const size = this.cache.size;
    const memoryMB = this.currentMemoryMB;
    this.cache.clear();
    this.currentMemoryMB = 0;
    logger.debug(`Cache cleared: ${size} entries removed, freed ${memoryMB.toFixed(2)}MB`);
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      key: string;
      size: number;
      hits: number;
      age: number;
      ttl: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: this.estimateSize(entry.value),
      hits: entry.hits,
      age: (Date.now() - entry.timestamp) / 1000,
      ttl: entry.ttl
    }));

    const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0);
    const totalRequests = totalHits + entries.length; // Approximate
    const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      entries: entries.sort((a, b) => b.hits - a.hits)
    };
  }

  private cleanup(): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    let removedCount = 0;
    let freedMemoryMB = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl) {
        const sizeMB = this.estimateSize(entry.value) / (1024 * 1024);
        this.cache.delete(key);
        this.currentMemoryMB -= sizeMB;
        freedMemoryMB += sizeMB;
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cache cleanup: removed ${removedCount} expired entries, freed ${freedMemoryMB.toFixed(2)}MB`);
    }
  }

  private checkMemoryPressure(): void {
    const usagePercent = (this.currentMemoryMB / this.maxMemoryMB) * 100;

    if (usagePercent > 90) {
      // Critical: evict 30% of cache
      const targetReduction = this.maxMemoryMB * 0.3;
      logger.warn(`[Cache] Memory pressure detected (${this.currentMemoryMB.toFixed(1)}MB/${this.maxMemoryMB}MB), evicting entries`);
      this.evictUntilSpaceAvailable(targetReduction);
    } else if (usagePercent > 80) {
      // Warning: evict 10% of cache
      const targetReduction = this.maxMemoryMB * 0.1;
      logger.info(`[Cache] High memory usage (${this.currentMemoryMB.toFixed(1)}MB/${this.maxMemoryMB}MB), evicting ${targetReduction.toFixed(1)}MB`);
      this.evictUntilSpaceAvailable(targetReduction);
    }
  }

  private evictUntilSpaceAvailable(requiredSpaceMB: number): void {
    // Sort entries by least recently used
    const entries = Array.from(this.cache.entries()).sort((a, b) =>
      a[1].lastAccessed - b[1].lastAccessed
    );

    let freedSpace = 0;
    let evictedCount = 0;

    for (const [key, entry] of entries) {
      if (freedSpace >= requiredSpaceMB) {
        break;
      }

      const entrySizeMB = this.estimateSize(entry.value) / (1024 * 1024);
      this.cache.delete(key);
      this.currentMemoryMB -= entrySizeMB;
      freedSpace += entrySizeMB;
      evictedCount++;
    }

    if (evictedCount > 0) {
      logger.info(`[Cache] Evicted ${evictedCount} entries, freed ${freedSpace.toFixed(2)}MB`);
    }
  }

  private evictLeastUsed(): void {
    if (this.cache.size === 0) {
      return;
    }

    // Find the least recently used entry
    let lruKey: string | null = null;
    let lruTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.cache.get(lruKey);
      if (entry) {
        const sizeMB = this.estimateSize(entry.value) / (1024 * 1024);
        this.currentMemoryMB -= sizeMB;
      }
      this.cache.delete(lruKey);
      logger.debug(`Cache evicted LRU: ${lruKey}`);
    }
  }

  private estimateSize(value: any): number {
    // Rough estimate of object size in bytes
    const json = JSON.stringify(value);
    return json.length * 2; // UTF-16 encoding
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}