/**
 * 内存存储 - 内存中的存储后端
 * 快速、简单、仅限单服务器
 * @class
 */
class MemoryStore {
  constructor() {
    this.store = new Map();
    this.expiries = new Map();
    this.sweepTimer = null;
    this.nextExpiryAt = null;
  }

  /**
   * 安排下一次过期清理
   * @private
   * @param {number|null} expiryAt - 下一次过期时间
   * @returns {void}
   */
  _scheduleSweep(expiryAt) {
    if (this.sweepTimer) {
      clearTimeout(this.sweepTimer);
      this.sweepTimer = null;
    }

    this.nextExpiryAt = expiryAt;

    if (expiryAt === null) {
      return;
    }

    const delay = Math.max(1, expiryAt - Date.now());
    this.sweepTimer = setTimeout(() => {
      this._runSweep();
    }, delay);

    if (typeof this.sweepTimer.unref === 'function') {
      this.sweepTimer.unref();
    }
  }

  /**
   * 查找最早的过期时间
   * @private
   * @returns {number|null} 最早过期时间
   */
  _findNextExpiry() {
    let nextExpiryAt = null;

    for (const expiresAt of this.expiries.values()) {
      if (nextExpiryAt === null || expiresAt < nextExpiryAt) {
        nextExpiryAt = expiresAt;
      }
    }

    return nextExpiryAt;
  }

  /**
   * 清理所有已过期的键
   * @private
   * @returns {void}
   */
  _runSweep() {
    const now = Date.now();

    for (const [key, expiresAt] of this.expiries.entries()) {
      if (expiresAt <= now) {
        this.expiries.delete(key);
        this.store.delete(key);
      }
    }

    this._scheduleSweep(this._findNextExpiry());
  }

  /**
   * 按需清理单个过期键
   * @private
   * @param {string} key - 存储键
   * @returns {boolean} 是否已清理
   */
  _evictIfExpired(key) {
    const expiresAt = this.expiries.get(key);

    if (expiresAt === undefined || expiresAt > Date.now()) {
      return false;
    }

    this.expiries.delete(key);
    this.store.delete(key);

    if (expiresAt === this.nextExpiryAt) {
      this._scheduleSweep(this._findNextExpiry());
    }

    return true;
  }

  /**
   * 获取未过期的原始值，供 Memory 热路径复用。
   * @private
   * @param {string} key - 存储键
   * @param {number} now - 当前时间
   * @returns {any} 存储值
   */
  _getActiveValue(key, now) {
    const expiresAt = this.expiries.get(key);

    if (expiresAt !== undefined && expiresAt <= now) {
      this.expiries.delete(key);
      this.store.delete(key);

      if (expiresAt === this.nextExpiryAt) {
        this._scheduleSweep(this._findNextExpiry());
      }

      return undefined;
    }

    return this.store.get(key);
  }

  /**
   * 写入值并设置绝对过期时间。
   * @private
   * @param {string} key - 存储键
   * @param {any} value - 存储值
   * @param {number} expiresAt - 绝对过期时间
   * @returns {void}
   */
  _setWithExpiry(key, value, expiresAt) {
    this.store.set(key, value);
    this.expiries.set(key, expiresAt);

    if (this.nextExpiryAt === null || expiresAt < this.nextExpiryAt) {
      this._scheduleSweep(expiresAt);
    }
  }

  /**
   * 固定窗口专用递增，避免通用 get/set Promise 链。
   * @param {string} key - 存储键
   * @param {Object} options - 选项
   * @returns {Object} 计数结果
   */
  incrementFixedWindow(key, options = {}) {
    const { expiresAt, windowMs } = options;
    const now = Date.now();
    const data = this._getActiveValue(key, now);

    if (!data) {
      this._setWithExpiry(key, { count: 1 }, expiresAt || now + windowMs);
      return { count: 1 };
    }

    data.count = (data.count || 0) + 1;
    return { count: data.count };
  }

  /**
   * Memory 专用滑动窗口检查，原地维护时间序列。
   * @param {string} key - 存储键
   * @param {Object} options - 选项
   * @returns {Object} 检查结果
   */
  checkSlidingWindow(key, options = {}) {
    const { windowMs, now = Date.now() } = options;
    const windowStart = now - windowMs;
    let data = this._getActiveValue(key, now);

    if (!data || !Array.isArray(data.requests)) {
      data = { requests: [], head: 0 };
      this._setWithExpiry(key, data, now + windowMs);
    }

    const requests = data.requests;
    let head = data.head || 0;

    while (head < requests.length && requests[head] <= windowStart) {
      head += 1;
    }

    if (head > 64 && head * 2 >= requests.length) {
      requests.splice(0, head);
      head = 0;
    }

    requests.push(now);
    data.head = head;

    const count = requests.length - head;
    const oldestRequest = requests[head] || now;

    return {
      count,
      resetTime: oldestRequest + windowMs,
    };
  }

  /**
   * Memory 专用滑动窗口精确回滚。
   * @param {string} key - 存储键
   * @param {Object} rollbackData - 回滚数据
   * @returns {void}
   */
  rollbackSlidingWindow(key, rollbackData = {}) {
    const data = this._getActiveValue(key, Date.now());
    if (!data || !Array.isArray(data.requests) || data.requests.length === 0) {
      return;
    }

    const requestTime = rollbackData.requestTime;
    const targetIndex = requestTime !== undefined
      ? data.requests.lastIndexOf(requestTime)
      : data.requests.length - 1;

    if (targetIndex === -1) {
      return;
    }

    data.requests.splice(targetIndex, 1);
    data.head = Math.min(data.head || 0, data.requests.length);

    if (data.requests.length === 0) {
      this.reset(key);
    }
  }

  /**
   * Memory 专用令牌桶检查。
   * @param {string} key - 存储键
   * @param {Object} options - 算法选项
   * @returns {Object} 限流结果
   */
  checkTokenBucket(key, options) {
    const { capacity, refillRate, windowMs, limit } = options;
    const now = Date.now();
    const ttl = Math.ceil((capacity / refillRate) * windowMs);
    const data = this._getActiveValue(key, now);
    let tokens = capacity;

    if (data) {
      const timePassed = now - data.lastRefill;
      tokens = Math.min(capacity, data.tokens + ((timePassed / windowMs) * refillRate));
    }

    if (tokens >= 1) {
      tokens -= 1;
      this._setWithExpiry(key, { tokens, lastRefill: now }, now + ttl);

      return {
        allowed: true,
        limit,
        current: limit - Math.max(0, Math.floor(tokens)),
        remaining: Math.max(0, Math.floor(tokens)),
        resetTime: now + Math.ceil(((capacity - tokens) / refillRate) * windowMs),
        retryAfter: 0,
      };
    }

    const timeToNextToken = ((1 - tokens) / refillRate) * windowMs;

    return {
      allowed: false,
      limit,
      current: limit,
      remaining: 0,
      resetTime: now + ttl,
      retryAfter: Math.ceil(timeToNextToken),
    };
  }

  /**
   * Memory 专用漏桶检查。
   * @param {string} key - 存储键
   * @param {Object} options - 算法选项
   * @returns {Object} 限流结果
   */
  checkLeakyBucket(key, options) {
    const { capacity, leakRate, windowMs, limit } = options;
    const now = Date.now();
    const ttl = Math.ceil((capacity / leakRate) * windowMs);
    const data = this._getActiveValue(key, now);
    let water = 0;

    if (data) {
      const timePassed = now - data.lastLeak;
      water = Math.max(0, data.water - ((timePassed / windowMs) * leakRate));
    }

    if (water + 1 <= capacity) {
      water += 1;
      this._setWithExpiry(key, { water, lastLeak: now }, now + ttl);

      return {
        allowed: true,
        limit,
        current: Math.min(limit, Math.ceil(water)),
        remaining: Math.max(0, limit - Math.ceil(water)),
        resetTime: now + Math.ceil((water / leakRate) * windowMs),
        retryAfter: 0,
      };
    }

    const timeToLeak = ((water + 1 - capacity) / leakRate) * windowMs;

    return {
      allowed: false,
      limit,
      current: limit,
      remaining: 0,
      resetTime: now + Math.ceil((water / leakRate) * windowMs),
      retryAfter: Math.ceil(timeToLeak),
    };
  }

  /**
   * 从存储中获取值
   * @param {string} key - 存储键
   * @returns {Promise<any>} 存储的值
   */
  get(key) {
    if (this._evictIfExpired(key)) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(this.store.get(key));
  }

  /**
   * 在存储中设置值，可选 TTL
   * @param {string} key - 存储键
   * @param {any} value - 要存储的值
   * @param {number} ttl - 生存时间（毫秒）
   * @returns {Promise<void>}
   */
  set(key, value, ttl) {
    const previousExpiry = this.expiries.get(key);
    this.store.set(key, value);

    if (ttl) {
      const expiresAt = Date.now() + ttl;
      this.expiries.set(key, expiresAt);

      if (this.nextExpiryAt === null || expiresAt < this.nextExpiryAt) {
        this._scheduleSweep(expiresAt);
      }
      return Promise.resolve();
    }

    if (this.expiries.has(key)) {
      this.expiries.delete(key);

      if (previousExpiry === this.nextExpiryAt) {
        this._scheduleSweep(this._findNextExpiry());
      }
    }

    return Promise.resolve();
  }

  /**
   * 增加计数器
   * @param {string} key - 存储键
   * @param {Object} options - 增量选项
   * @returns {Promise<Object>} 包含计数的结果
   */
  async increment(key, options = {}) {
    const { windowMs, timestamp } = options;
    if (!timestamp && windowMs) {
      return this.incrementFixedWindow(key, options);
    }

    const data = await this.get(key);

    if (!data) {
      // 第一个请求
      const value = timestamp ? { requests: [timestamp], head: 0 } : { count: 1 };
      await this.set(key, value, windowMs);
      return { count: 1 };
    }

    if (timestamp) {
      // 滑动窗口：存储时间戳
      data.requests = data.requests || [];
      data.requests.push(timestamp);
      data.head = data.head || 0;
      await this.set(key, data, windowMs);
      return { count: data.requests.length - data.head };
    }

    // 固定窗口：增加计数器
    data.count = (data.count || 0) + 1;
    await this.set(key, data, windowMs);
    return { count: data.count };
  }

  /**
   * 减少计数器（用于 skipFailedRequests）
   * @param {string} key - 存储键
   * @returns {Promise<void>}
   */
  async decrement(key) {
    const data = await this.get(key);

    if (!data) {
      return;
    }

    if (data.count !== undefined) {
      data.count = Math.max(0, data.count - 1);
      this.store.set(key, data);
    } else if (data.requests && data.requests.length > (data.head || 0)) {
      data.requests.pop();
      this.store.set(key, data);
    }
  }

  /**
   * 重置特定键
   * @param {string} key - 存储键
   * @returns {Promise<void>}
   */
  reset(key) {
    const previousExpiry = this.expiries.get(key);
    this.store.delete(key);
    this.expiries.delete(key);

    if (previousExpiry !== undefined && previousExpiry === this.nextExpiryAt) {
      this._scheduleSweep(this._findNextExpiry());
    }

    return Promise.resolve();
  }

  /**
   * 重置所有键
   * @returns {Promise<void>}
   */
  resetAll() {
    this.store.clear();
    this.expiries.clear();
    this._scheduleSweep(null);

    return Promise.resolve();
  }

  /**
   * 获取存储中的键数量
   * @returns {number} 键数量
   */
  size() {
    this._runSweep();
    return this.store.size;
  }
}

module.exports = MemoryStore;
