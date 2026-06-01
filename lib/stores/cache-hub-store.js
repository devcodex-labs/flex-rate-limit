/**
 * CacheHubStore - cache-hub backed storage backend
 *
 * This store keeps flex-rate-limit as the algorithm/middleware layer while
 * delegating high-concurrency state updates to cache-hub atomic primitives.
 */

function loadCacheHub() {
  try {
    return {
      core: require('cache-hub'),
      redis: require('cache-hub/redis'),
      rateLimit: require('cache-hub/rate-limit'),
    };
  } catch (error) {
    throw new Error(
      'CacheHubStore requires cache-hub@^2.1.0. Install it with: npm install cache-hub',
    );
  }
}

function toMilliseconds(valueInSeconds) {
  return Math.ceil(valueInSeconds * 1000);
}

function toPerSecond(rate, windowMs) {
  return rate / (windowMs / 1000);
}

function getRollbackToken(rollbackData) {
  if (typeof rollbackData === 'string') {
    return rollbackData;
  }

  return rollbackData?.rollbackToken || rollbackData?.member;
}

class CacheHubStore {
  /**
   * Create CacheHubStore instance.
   * @param {Object} options - Store options
   * @param {Object} [options.client] - Redis client instance
   * @param {string} [options.prefix] - Key prefix
   * @param {number} [options.expiry] - Default expiry in seconds
   */
  constructor(options = {}) {
    const hub = options.cacheHub || loadCacheHub();
    const client = options.client || options.redis;

    this.prefix = options.prefix || 'rl:';
    this.defaultExpiry = options.expiry || 3600;
    this.cache = options.cache || (client
      ? hub.redis.createRedisCacheAdapter(client)
      : new hub.core.MemoryCache());

    this.fixedWindowStore = options.fixedWindowStore || (client
      ? hub.rateLimit.createRedisFixedWindowRateLimitStore(this.cache)
      : hub.rateLimit.createMemoryFixedWindowRateLimitStore());

    this.stateStore = options.stateStore || (client
      ? hub.rateLimit.createRedisRateLimitStateStore(this.cache)
      : hub.rateLimit.createMemoryRateLimitStateStore());
  }

  _getKey(key) {
    return `${this.prefix}${key}`;
  }

  get(key) {
    return Promise.resolve(this.cache.get(this._getKey(key)));
  }

  async set(key, value, ttl) {
    await this.cache.set(
      this._getKey(key),
      value,
      ttl || toMilliseconds(this.defaultExpiry),
    );
  }

  async increment(key, options = {}) {
    const { windowMs, timestamp } = options;

    if (timestamp) {
      const result = await this.checkSlidingWindow(key, { windowMs });
      return { count: result.count, resetTime: result.resetTime };
    }

    const result = await this.fixedWindowStore.increment(
      this._getKey(key),
      windowMs || toMilliseconds(this.defaultExpiry),
      Number.MAX_SAFE_INTEGER,
    );

    return {
      count: result.hits,
      resetTime: result.resetTime.getTime(),
    };
  }

  async checkFixedWindow(key, options = {}) {
    const {
      windowMs,
      limit = Number.MAX_SAFE_INTEGER,
      now = Date.now(),
    } = options;
    const windowKey = Math.floor(now / windowMs);
    const storageKey = `${key}:${windowKey}`;
    const result = await this.fixedWindowStore.increment(
      this._getKey(storageKey),
      windowMs || toMilliseconds(this.defaultExpiry),
      limit,
    );
    const count = result.hits;
    const allowed = count <= limit;
    const resetTime = result.resetTime.getTime();

    return {
      allowed,
      limit,
      current: count,
      remaining: result.remaining,
      resetTime,
      retryAfter: allowed ? 0 : result.retryAfterMs,
      rollbackData: {
        storageKey,
      },
    };
  }

  async decrement(key) {
    await this.fixedWindowStore.decrement(this._getKey(key));
  }

  async reset(key) {
    const fullKey = this._getKey(key);
    await this.cache.del(fullKey);
    await this.fixedWindowStore.reset(fullKey);
    await this.stateStore.reset(fullKey);
  }

  async resetAll() {
    await this.cache.delPattern(`${this.prefix}*`);
    await this.fixedWindowStore.resetPrefix(this.prefix);
    await this.stateStore.resetPrefix(this.prefix);
  }

  async checkSlidingWindow(key, options = {}) {
    const { windowMs } = options;
    const result = await this.stateStore.checkSlidingWindow(
      this._getKey(key),
      windowMs,
      Number.MAX_SAFE_INTEGER,
    );

    return {
      count: result.count,
      resetTime: result.resetTime.getTime(),
      rollbackData: {
        rollbackToken: result.rollbackToken,
      },
    };
  }

  async rollbackSlidingWindow(key, rollbackData) {
    const rollbackToken = getRollbackToken(rollbackData);
    if (!rollbackToken) {
      return;
    }

    await this.stateStore.rollbackSlidingWindow(this._getKey(key), rollbackToken);
  }

  async checkTokenBucket(key, options = {}) {
    const {
      capacity,
      refillRate,
      windowMs,
      limit = capacity,
    } = options;
    const result = await this.stateStore.consumeTokenBucket(
      this._getKey(key),
      capacity,
      toPerSecond(refillRate, windowMs),
    );

    return {
      allowed: result.allowed,
      limit,
      current: result.allowed ? Math.max(0, limit - result.remaining) : limit,
      remaining: result.remaining,
      resetTime: result.resetTime.getTime(),
      retryAfter: result.retryAfterMs,
      rollbackData: {
        rollbackToken: result.rollbackToken,
      },
    };
  }

  async rollbackTokenBucket(key, rollbackData) {
    const rollbackToken = getRollbackToken(rollbackData);
    if (!rollbackToken) {
      return;
    }

    await this.stateStore.rollbackTokenBucket(this._getKey(key), rollbackToken);
  }

  async checkLeakyBucket(key, options = {}) {
    const {
      capacity,
      leakRate,
      windowMs,
      limit = capacity,
    } = options;
    const result = await this.stateStore.consumeLeakyBucket(
      this._getKey(key),
      capacity,
      toPerSecond(leakRate, windowMs),
    );

    return {
      allowed: result.allowed,
      limit,
      current: Math.min(limit, Math.ceil(result.waterLevel)),
      remaining: result.remaining,
      resetTime: result.resetTime.getTime(),
      retryAfter: result.retryAfterMs,
      rollbackData: {
        rollbackToken: result.rollbackToken,
      },
    };
  }

  async rollbackLeakyBucket(key, rollbackData) {
    const rollbackToken = getRollbackToken(rollbackData);
    if (!rollbackToken) {
      return;
    }

    await this.stateStore.rollbackLeakyBucket(this._getKey(key), rollbackToken);
  }

  async close() {
    if (typeof this.cache.close === 'function') {
      await this.cache.close();
    }
  }
}

module.exports = CacheHubStore;
