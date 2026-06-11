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
      'CacheHubStore requires cache-hub@2.2.4. Install it with: npm install cache-hub',
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

function maybeUnref(timer) {
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}

class ExpiryManager {
  constructor(onExpire) {
    this.onExpire = onExpire;
    this.expiries = new Map();
    this.timer = null;
  }

  track(key, expiresAt) {
    if (!Number.isFinite(expiresAt)) {
      return;
    }

    this.expiries.set(key, expiresAt);
    this._schedule();
  }

  untrack(key) {
    this.expiries.delete(key);
    this._schedule();
  }

  untrackPrefix(prefix) {
    for (const key of this.expiries.keys()) {
      if (key.startsWith(prefix)) {
        this.expiries.delete(key);
      }
    }
    this._schedule();
  }

  _schedule() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextExpiry = this._findNextExpiry();
    if (nextExpiry === null) {
      return;
    }

    this.timer = setTimeout(() => this._runSweep(), Math.max(1, nextExpiry - Date.now()));
    maybeUnref(this.timer);
  }

  _findNextExpiry() {
    let nextExpiry = null;
    for (const expiresAt of this.expiries.values()) {
      if (nextExpiry === null || expiresAt < nextExpiry) {
        nextExpiry = expiresAt;
      }
    }
    return nextExpiry;
  }

  _runSweep() {
    this.timer = null;
    const now = Date.now();

    for (const [key, expiresAt] of this.expiries) {
      if (expiresAt <= now) {
        this.expiries.delete(key);
        this.onExpire(key, now);
      }
    }

    this._schedule();
  }

  close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.expiries.clear();
  }
}

class ExpiringFixedWindowStore {
  constructor(delegate) {
    this.delegate = delegate;
    this.expiryManager = new ExpiryManager((key, now) => this._cleanupExpiredAndTrack(key, now));
  }

  async increment(key, windowMs, limit, delta = 1) {
    const result = await this.delegate.increment(key, windowMs, limit, delta);
    this.expiryManager.track(key, result.resetTime.getTime());
    return result;
  }

  decrement(key, delta = 1) {
    return this.delegate.decrement(key, delta);
  }

  reset(key) {
    this.expiryManager.untrack(key);
    return this.delegate.reset(key);
  }

  resetPrefix(prefix) {
    this.expiryManager.untrackPrefix(prefix);
    return this.delegate.resetPrefix(prefix);
  }

  close() {
    const keys = new Set(this.expiryManager.expiries.keys());
    for (const key of this.delegate._atomic?._counters?.keys?.() || []) {
      keys.add(key);
    }

    for (const key of keys) {
      this.delegate.reset(key);
    }
    this.expiryManager.close();
  }

  _cleanupExpiredAndTrack(key, now) {
    if (typeof this.delegate.cleanupExpired === 'function') {
      this.delegate.cleanupExpired(now);
    } else {
      this.delegate.reset(key);
    }

    const entry = this.delegate._atomic?._counters?.get(key);
    if (entry && Number.isFinite(entry.expiresAt)) {
      this.expiryManager.track(key, entry.expiresAt);
      return;
    }

    this.expiryManager.untrack(key);
  }
}

class ExpiringRateLimitStateStore {
  constructor(delegate) {
    this.delegate = delegate;
    this.slidingWindowMs = new Map();
    this.tokenBucketOptions = new Map();
    this.leakyBucketOptions = new Map();
    this.expiryManager = new ExpiryManager((key, now) => this._cleanupExpiredAndTrack(key, now));
  }

  async checkSlidingWindow(key, windowMs, limit, cost = 1) {
    const result = await this.delegate.checkSlidingWindow(key, windowMs, limit, cost);
    this.slidingWindowMs.set(key, windowMs);
    this._trackKey(key, result.resetTime);
    return result;
  }

  async rollbackSlidingWindow(key, rollbackToken) {
    const result = await this.delegate.rollbackSlidingWindow(key, rollbackToken);
    this._trackKey(key);
    return result;
  }

  async consumeTokenBucket(key, capacity, refillPerSecond, cost = 1) {
    const result = await this.delegate.consumeTokenBucket(key, capacity, refillPerSecond, cost);
    this.tokenBucketOptions.set(key, { capacity, refillPerSecond });
    this._trackKey(key, result.resetTime);
    return result;
  }

  async rollbackTokenBucket(key, rollbackToken) {
    const result = await this.delegate.rollbackTokenBucket(key, rollbackToken);
    this._trackKey(key);
    return result;
  }

  async consumeLeakyBucket(key, capacity, leakPerSecond, cost = 1) {
    const result = await this.delegate.consumeLeakyBucket(key, capacity, leakPerSecond, cost);
    this.leakyBucketOptions.set(key, { capacity, leakPerSecond });
    this._trackKey(key, result.resetTime);
    return result;
  }

  async rollbackLeakyBucket(key, rollbackToken) {
    const result = await this.delegate.rollbackLeakyBucket(key, rollbackToken);
    this._trackKey(key);
    return result;
  }

  reset(key) {
    this._untrackKey(key);
    return this.delegate.reset(key);
  }

  resetPrefix(prefix) {
    this.expiryManager.untrackPrefix(prefix);
    this._untrackPrefix(prefix);
    return this.delegate.resetPrefix(prefix);
  }

  close() {
    const keys = new Set(this.expiryManager.expiries.keys());
    for (const key of this.delegate._slidingWindows?.keys?.() || []) {
      keys.add(key);
    }
    for (const key of this.delegate._tokenBuckets?.keys?.() || []) {
      keys.add(key);
    }
    for (const key of this.delegate._leakyBuckets?.keys?.() || []) {
      keys.add(key);
    }

    for (const key of keys) {
      this.delegate.reset(key);
    }
    this.expiryManager.close();
    this.slidingWindowMs.clear();
    this.tokenBucketOptions.clear();
    this.leakyBucketOptions.clear();
  }

  _deleteKey(key) {
    this._untrackKey(key);
    this.delegate.reset(key);
  }

  _cleanupExpiredAndTrack(key, now) {
    if (typeof this.delegate.cleanupExpired === 'function') {
      this.delegate.cleanupExpired(now);
      this._trackKey(key);
      return;
    }

    this._deleteKey(key);
  }

  _trackKey(key, fallbackResetTime) {
    const expiries = [
      this._getSlidingWindowExpiresAt(key),
      this._getTokenBucketExpiresAt(key),
      this._getLeakyBucketExpiresAt(key),
    ].filter(Number.isFinite);

    const fallback = this._toTimestamp(fallbackResetTime);
    if (expiries.length === 0 && Number.isFinite(fallback)) {
      this.expiryManager.track(key, fallback);
      return;
    }

    if (expiries.length === 0) {
      this.expiryManager.untrack(key);
      return;
    }

    this.expiryManager.track(key, Math.min(...expiries));
  }

  _getSlidingWindowExpiresAt(key) {
    const state = this.delegate._slidingWindows?.get(key);
    const entries = Array.isArray(state) ? state : state?.entries;
    const windowMs = Number.isFinite(state?.windowMs)
      ? state.windowMs
      : this.slidingWindowMs.get(key);

    if (!Array.isArray(entries) || entries.length === 0 || !Number.isFinite(windowMs)) {
      this.slidingWindowMs.delete(key);
      return null;
    }

    return entries[0].timestamp + windowMs;
  }

  _getTokenBucketExpiresAt(key) {
    const entry = this.delegate._tokenBuckets?.get(key);
    const options = this.tokenBucketOptions.get(key);
    const capacity = Number.isFinite(entry?.capacity) ? entry.capacity : options?.capacity;
    const refillPerSecond = Number.isFinite(entry?.refillPerSecond)
      ? entry.refillPerSecond
      : options?.refillPerSecond;

    if (!entry || !Number.isFinite(capacity) || entry.tokens >= capacity) {
      this.tokenBucketOptions.delete(key);
      return null;
    }

    if (Number.isFinite(entry.expiresAt)) {
      return entry.expiresAt;
    }

    if (!Number.isFinite(refillPerSecond)) {
      return null;
    }

    return entry.updatedAt + Math.ceil((capacity - entry.tokens) / refillPerSecond * 1000);
  }

  _getLeakyBucketExpiresAt(key) {
    const entry = this.delegate._leakyBuckets?.get(key);
    const options = this.leakyBucketOptions.get(key);
    const leakPerSecond = Number.isFinite(entry?.leakPerSecond)
      ? entry.leakPerSecond
      : options?.leakPerSecond;

    if (!entry || entry.level <= 0) {
      this.leakyBucketOptions.delete(key);
      return null;
    }

    if (Number.isFinite(entry.expiresAt)) {
      return entry.expiresAt;
    }

    if (!Number.isFinite(leakPerSecond)) {
      return null;
    }

    return entry.updatedAt + Math.ceil(entry.level / leakPerSecond * 1000);
  }

  _toTimestamp(resetTime) {
    if (resetTime instanceof Date) {
      return resetTime.getTime();
    }
    return Number(resetTime);
  }

  _untrackKey(key) {
    this.expiryManager.untrack(key);
    this.slidingWindowMs.delete(key);
    this.tokenBucketOptions.delete(key);
    this.leakyBucketOptions.delete(key);
  }

  _untrackPrefix(prefix) {
    for (const key of this.slidingWindowMs.keys()) {
      if (key.startsWith(prefix)) {
        this.slidingWindowMs.delete(key);
      }
    }
    for (const key of this.tokenBucketOptions.keys()) {
      if (key.startsWith(prefix)) {
        this.tokenBucketOptions.delete(key);
      }
    }
    for (const key of this.leakyBucketOptions.keys()) {
      if (key.startsWith(prefix)) {
        this.leakyBucketOptions.delete(key);
      }
    }
  }
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
    const isAutoMemoryFixedWindowStore = !client && !options.fixedWindowStore;
    const isAutoMemoryStateStore = !client && !options.stateStore;

    this.prefix = options.prefix || 'rl:';
    this.defaultExpiry = options.expiry || 3600;
    this.cache = options.cache || (client
      ? hub.redis.createRedisCacheAdapter(client)
      : new hub.core.MemoryCache());

    const fixedWindowStore = options.fixedWindowStore || (client
      ? hub.rateLimit.createRedisFixedWindowRateLimitStore(this.cache)
      : hub.rateLimit.createMemoryFixedWindowRateLimitStore());
    const stateStore = options.stateStore || (client
      ? hub.rateLimit.createRedisRateLimitStateStore(this.cache)
      : hub.rateLimit.createMemoryRateLimitStateStore());

    this.fixedWindowStore = isAutoMemoryFixedWindowStore
      ? new ExpiringFixedWindowStore(fixedWindowStore)
      : fixedWindowStore;
    this.stateStore = isAutoMemoryStateStore
      ? new ExpiringRateLimitStateStore(stateStore)
      : stateStore;
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
    if (typeof this.fixedWindowStore.close === 'function') {
      await this.fixedWindowStore.close();
    }

    if (typeof this.stateStore.close === 'function') {
      await this.stateStore.close();
    }

    if (typeof this.cache.close === 'function') {
      await this.cache.close();
    }

    if (typeof this.cache.destroy === 'function') {
      this.cache.destroy();
    }
  }
}

module.exports = CacheHubStore;
