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
      } else if (previousExpiry !== undefined && previousExpiry === this.nextExpiryAt && expiresAt > previousExpiry) {
        this._scheduleSweep(this._findNextExpiry());
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
