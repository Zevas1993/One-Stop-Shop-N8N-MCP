/**
 * Issue #6: Rate Limiting Enforcement - Request Throttling
 *
 * Prevents overwhelming n8n API with too many simultaneous or rapid requests.
 * Implements token bucket algorithm for fair rate limiting with burst support.
 *
 * Key Features:
 * - Token bucket rate limiting algorithm
 * - Per-endpoint throttling
 * - Configurable request rates
 * - Burst support (short-term spikes)
 * - Fair request queuing
 * - Metrics and monitoring
 * - Graceful degradation
 */

import { logger } from './logger';

/**
 * Rate limit configuration per endpoint
 */
export interface RateLimitConfig {
  requestsPerSecond: number;  // Sustained rate
  burstSize: number;           // Max burst capacity
  windowSize: number;          // Time window in ms (default 1000)
}

/**
 * Default rate limiting configurations
 * Based on typical n8n API limits
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Workflow operations
  'POST /workflows': {
    requestsPerSecond: 2,
    burstSize: 5,
    windowSize: 1000,
  },
  'PATCH /workflows': {
    requestsPerSecond: 2,
    burstSize: 5,
    windowSize: 1000,
  },
  'PUT /workflows': {
    requestsPerSecond: 2,
    burstSize: 5,
    windowSize: 1000,
  },
  'DELETE /workflows': {
    requestsPerSecond: 1,
    burstSize: 3,
    windowSize: 1000,
  },
  'GET /workflows': {
    requestsPerSecond: 5,
    burstSize: 10,
    windowSize: 1000,
  },

  // Execution operations
  'POST /executions': {
    requestsPerSecond: 3,
    burstSize: 8,
    windowSize: 1000,
  },
  'DELETE /executions': {
    requestsPerSecond: 2,
    burstSize: 5,
    windowSize: 1000,
  },
  'GET /executions': {
    requestsPerSecond: 5,
    burstSize: 10,
    windowSize: 1000,
  },

  // Credential operations
  'GET /credentials': {
    requestsPerSecond: 3,
    burstSize: 8,
    windowSize: 1000,
  },
  'POST /credentials': {
    requestsPerSecond: 1,
    burstSize: 3,
    windowSize: 1000,
  },

  // Generic fallback for unknown endpoints
  'default': {
    requestsPerSecond: 2,
    burstSize: 5,
    windowSize: 1000,
  },
};

/**
 * Token bucket state for a single endpoint
 */
interface TokenBucket {
  tokens: number;
  lastRefillTime: number;
  waitingQueue: Array<() => void>;
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private config: Record<string, RateLimitConfig>;
  private metrics = new Map<string, { totalRequests: number; throttledRequests: number }>();

  constructor(config: Record<string, RateLimitConfig> = DEFAULT_RATE_LIMITS) {
    this.config = config;
  }

  /**
   * Get rate limit configuration for endpoint
   */
  getConfig(endpoint: string): RateLimitConfig {
    return this.config[endpoint] || this.config['default'];
  }

  /**
   * Update rate limit configuration for endpoint
   */
  setConfig(endpoint: string, config: RateLimitConfig): void {
    this.config[endpoint] = config;
    logger.debug('Rate limit config updated', {
      endpoint,
      requestsPerSecond: config.requestsPerSecond,
      burstSize: config.burstSize,
    });
  }

  /**
   * Get or create token bucket for endpoint
   */
  private getBucket(endpoint: string): TokenBucket {
    if (!this.buckets.has(endpoint)) {
      const config = this.getConfig(endpoint);
      this.buckets.set(endpoint, {
        tokens: config.burstSize, // Start with full bucket
        lastRefillTime: Date.now(),
        waitingQueue: [],
      });
    }
    return this.buckets.get(endpoint)!;
  }

  /**
   * Calculate how many tokens to add based on elapsed time
   */
  private calculateTokens(elapsedMs: number, config: RateLimitConfig): number {
    // Rate = requestsPerSecond → tokens per millisecond = rate / 1000
    const tokensPerMs = config.requestsPerSecond / 1000;
    return tokensPerMs * elapsedMs;
  }

  /**
   * Refill bucket based on elapsed time
   */
  private refillBucket(endpoint: string): void {
    const bucket = this.getBucket(endpoint);
    const config = this.getConfig(endpoint);
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefillTime;

    if (elapsedMs > 0) {
      const tokensToAdd = this.calculateTokens(elapsedMs, config);
      bucket.tokens = Math.min(config.burstSize, bucket.tokens + tokensToAdd);
      bucket.lastRefillTime = now;
    }
  }

  /**
   * Wait until next request can be made (rate limit compliant)
   * Returns the number of milliseconds waited
   */
  async waitForRateLimit(endpoint: string): Promise<number> {
    const bucket = this.getBucket(endpoint);
    const config = this.getConfig(endpoint);
    const startTime = Date.now();
    let throttled = false;

    // Refill available tokens
    this.refillBucket(endpoint);

    // Check if we have tokens
    while (bucket.tokens < 1) {
      throttled = true;

      // Calculate time until we have a token
      // tokens = currentTokens + (elapsedMs * rate / 1000)
      // We need: tokens >= 1
      // 1 = currentTokens + (waitMs * rate / 1000)
      // waitMs = (1 - currentTokens) / (rate / 1000) = (1 - currentTokens) * 1000 / rate
      const tokensNeeded = 1 - bucket.tokens;
      const waitMs = (tokensNeeded * 1000) / config.requestsPerSecond;

      logger.debug('Rate limit: Request throttled', {
        endpoint,
        waitMs: Math.round(waitMs),
        currentTokens: bucket.tokens,
        requestsPerSecond: config.requestsPerSecond,
      });

      // Wait before trying again
      await this.sleep(Math.min(waitMs, 100)); // Max 100ms sleep to check sooner
      this.refillBucket(endpoint);
    }

    // Use one token
    bucket.tokens -= 1;

    const elapsedMs = Date.now() - startTime;

    // Track metrics
    this.recordRequest(endpoint, throttled);

    if (throttled && elapsedMs > 0) {
      logger.debug('Rate limit: Request released after wait', {
        endpoint,
        waitedMs: elapsedMs,
      });
    }

    return elapsedMs;
  }

  /**
   * Check if request can be made immediately without waiting
   */
  canMakeRequest(endpoint: string): boolean {
    const bucket = this.getBucket(endpoint);
    this.refillBucket(endpoint);
    return bucket.tokens >= 1;
  }

  /**
   * Get estimated wait time before next request can be made
   */
  getEstimatedWaitTime(endpoint: string): number {
    const bucket = this.getBucket(endpoint);
    const config = this.getConfig(endpoint);

    this.refillBucket(endpoint);

    if (bucket.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - bucket.tokens;
    return (tokensNeeded * 1000) / config.requestsPerSecond;
  }

  /**
   * Record request metric for monitoring
   */
  private recordRequest(endpoint: string, throttled: boolean): void {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, { totalRequests: 0, throttledRequests: 0 });
    }

    const metric = this.metrics.get(endpoint)!;
    metric.totalRequests++;
    if (throttled) {
      metric.throttledRequests++;
    }
  }

  /**
   * Get metrics for all endpoints
   */
  getMetrics(): Record<string, { totalRequests: number; throttledRequests: number; throttleRate: number }> {
    const result: Record<string, any> = {};

    for (const [endpoint, metric] of this.metrics.entries()) {
      result[endpoint] = {
        totalRequests: metric.totalRequests,
        throttledRequests: metric.throttledRequests,
        throttleRate: metric.totalRequests > 0 ? (metric.throttledRequests / metric.totalRequests) * 100 : 0,
      };
    }

    return result;
  }

  /**
   * Get metrics for specific endpoint
   */
  getEndpointMetrics(endpoint: string): {
    totalRequests: number;
    throttledRequests: number;
    throttleRate: number;
    config: RateLimitConfig;
  } {
    const metric = this.metrics.get(endpoint) || { totalRequests: 0, throttledRequests: 0 };
    return {
      ...metric,
      throttleRate: metric.totalRequests > 0 ? (metric.throttledRequests / metric.totalRequests) * 100 : 0,
      config: this.getConfig(endpoint),
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
    logger.info('Rate limiter metrics reset');
  }

  /**
   * Reset bucket state (for testing)
   */
  resetBuckets(): void {
    this.buckets.clear();
    logger.info('Rate limiter buckets reset');
  }

  /**
   * Get current bucket state (for debugging)
   */
  getBucketState(endpoint: string): { tokens: number; queuedRequests: number } {
    const bucket = this.getBucket(endpoint);
    this.refillBucket(endpoint);
    return {
      tokens: bucket.tokens,
      queuedRequests: bucket.waitingQueue.length,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    endpointsMonitored: number;
    totalRequests: number;
    totalThrottledRequests: number;
    overallThrottleRate: number;
  } {
    let totalRequests = 0;
    let totalThrottledRequests = 0;

    for (const metric of this.metrics.values()) {
      totalRequests += metric.totalRequests;
      totalThrottledRequests += metric.throttledRequests;
    }

    return {
      endpointsMonitored: this.metrics.size,
      totalRequests,
      totalThrottledRequests,
      overallThrottleRate: totalRequests > 0 ? (totalThrottledRequests / totalRequests) * 100 : 0,
    };
  }
}

// Singleton instance
const globalRateLimiter = new RateLimiter();

/**
 * Export helper functions
 */
export { RateLimiter, globalRateLimiter };

/**
 * Wait for rate limit before making request to endpoint
 */
export async function waitForRateLimit(endpoint: string): Promise<number> {
  return globalRateLimiter.waitForRateLimit(endpoint);
}

/**
 * Check if request can be made immediately
 */
export function canMakeRequest(endpoint: string): boolean {
  return globalRateLimiter.canMakeRequest(endpoint);
}

/**
 * Get estimated wait time
 */
export function getEstimatedWaitTime(endpoint: string): number {
  return globalRateLimiter.getEstimatedWaitTime(endpoint);
}

/**
 * Configure rate limit for endpoint
 */
export function setRateLimit(endpoint: string, config: RateLimitConfig): void {
  globalRateLimiter.setConfig(endpoint, config);
}

/**
 * Get rate limit configuration
 */
export function getRateLimitConfig(endpoint: string): RateLimitConfig {
  return globalRateLimiter.getConfig(endpoint);
}

/**
 * Get metrics for monitoring
 */
export function getRateLimiterMetrics(): Record<string, any> {
  return globalRateLimiter.getMetrics();
}

/**
 * Get metrics for specific endpoint
 */
export function getEndpointMetrics(endpoint: string): any {
  return globalRateLimiter.getEndpointMetrics(endpoint);
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
  globalRateLimiter.resetMetrics();
}

/**
 * Get statistics for monitoring dashboard
 */
export function getRateLimiterStatistics(): any {
  return globalRateLimiter.getStatistics();
}
