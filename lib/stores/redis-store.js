/**
 * Redis Store - Redis-based storage backend
 * Distributed, persistent, multi-server support
 * @class
 */
class RedisStore {
  /**
   * Create RedisStore instance
   * @param {Object} options - Configuration options
   * @param {Object} options.client - Redis client instance (ioredis)
   * @param {string} options.prefix - Key prefix (default: 'rl:')
   * @param {number} options.expiry - Default expiry in seconds
   */
  constructor(options = {}) {
    if (!options.client) {
      throw new Error('Redis client is required');
    }

    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
    this.defaultExpiry = options.expiry || 3600;
    this.sequence = 0;

    // Validate Redis client
    if (typeof this.client.get !== 'function' || typeof this.client.set !== 'function') {
      throw new Error('Invalid Redis client: must implement get/set methods');
    }
  }

  /**
   * Get full key with prefix
   * @private
   * @param {string} key - Base key
   * @returns {string} Prefixed key
   */
  _getKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 生成滑动窗口成员 ID
   * @private
   * @param {number} timestamp - 时间戳
   * @returns {string} 成员 ID
   */
  _createMember(timestamp) {
    this.sequence += 1;
    return `${timestamp}-${this.sequence}`;
  }

  /**
   * Get value from Redis
   * @param {string} key - Storage key
   * @returns {Promise<any>} Stored value
   */
  async get(key) {
    try {
      const fullKey = this._getKey(key);
      const value = await this.client.get(fullKey);

      if (!value) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      console.error('[RedisStore] Get error:', error);
      return null;
    }
  }

  /**
   * Set value in Redis with optional TTL
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    try {
      const fullKey = this._getKey(key);
      const serialized = JSON.stringify(value);
      const expiry = ttl ? Math.ceil(ttl / 1000) : this.defaultExpiry;

      await this.client.setex(fullKey, expiry, serialized);
    } catch (error) {
      console.error('[RedisStore] Set error:', error);
      throw error;
    }
  }

  /**
   * 使用 Redis 原子操作增加计数器
   * @param {string} key - 存储键
   * @param {Object} options - 增量选项
   * @returns {Promise<Object>} 包含计数的结果
   */
  async increment(key, options = {}) {
    try {
      const { windowMs, timestamp } = options;
      const fullKey = this._getKey(key);

      if (timestamp) {
        const result = await this.checkSlidingWindow(key, { windowMs, now: timestamp });
        return { count: result.count, resetTime: result.resetTime };
      }

      // 固定窗口：使用原子递增的简单计数器
      const count = await this.client.incr(fullKey);

      if (count === 1 && windowMs) {
        // 第一个请求，设置过期时间
        await this.client.expire(fullKey, Math.ceil(windowMs / 1000));
      }

      return { count };
    } catch (error) {
      console.error('[RedisStore] 增量错误:', error);
      throw error;
    }
  }

  /**
   * 减少计数器（用于 skipFailedRequests）
   * @param {string} key - 存储键
   * @returns {Promise<void>}
   */
  async decrement(key) {
    try {
      const fullKey = this._getKey(key);
      const scoreKey = `${fullKey}:scores`;
      const scoreType = typeof this.client.type === 'function'
        ? await this.client.type(scoreKey)
        : 'none';

      if (scoreType === 'zset') {
        // 删除最近的条目
        await this.client.zpopmax(scoreKey);
      } else {
        // 减少计数器
        const value = await this.client.get(fullKey);
        if (value && parseInt(value) > 0) {
          await this.client.decr(fullKey);
        }
      }
    } catch (error) {
      console.error('[RedisStore] 减量错误:', error);
    }
  }

  /**
   * 重置特定键
   * @param {string} key - 存储键
   * @returns {Promise<void>}
   */
  async reset(key) {
    try {
      const fullKey = this._getKey(key);
      await this.client.del(fullKey);
      await this.client.del(`${fullKey}:scores`);
    } catch (error) {
      console.error('[RedisStore] 重置错误:', error);
      throw error;
    }
  }

  /**
   * 重置所有带前缀的键
   * @returns {Promise<void>}
   */
  async resetAll() {
    try {
      if (typeof this.client.scan === 'function') {
        let cursor = '0';

        do {
          const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            await this.client.del(...keys);
          }
        } while (cursor !== '0');

        return;
      }

      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('[RedisStore] 重置所有错误:', error);
      throw error;
    }
  }

  /**
   * 使用有序集合检查滑动窗口
   * @param {string} key - 存储键
   * @param {Object} options - 选项
   * @param {number} options.windowMs - 窗口大小
   * @param {number} options.now - 当前时间
   * @returns {Promise<Object>} 包含 count 和 resetTime 的结果
   */
  async checkSlidingWindow(key, options = {}) {
    try {
      const { windowMs, now = Date.now() } = options;
      const scoreKey = `${this._getKey(key)}:scores`;
      const windowStart = now - windowMs;
      const expirySeconds = Math.ceil(windowMs / 1000) + 1;
      const member = this._createMember(now);

      if (typeof this.client.pipeline === 'function' && typeof this.client.zrange === 'function') {
        const results = await this.client.pipeline()
          .zremrangebyscore(scoreKey, '-inf', windowStart)
          .zadd(scoreKey, now, member)
          .expire(scoreKey, expirySeconds)
          .zrange(scoreKey, 0, 0, 'WITHSCORES')
          .zcard(scoreKey)
          .exec();

        const oldest = results[3]?.[1];
        const oldestScore = Array.isArray(oldest) && oldest[1] ? Number(oldest[1]) : now;
        const count = Number(results[4]?.[1] || 0);

        return {
          count,
          resetTime: oldestScore + windowMs,
          member,
        };
      }

      await this.client.zremrangebyscore(scoreKey, '-inf', windowStart);
      await this.client.zadd(scoreKey, now, member);
      await this.client.expire(scoreKey, expirySeconds);

      const count = await this.client.zcard(scoreKey);
      let oldestScore = now;

      if (typeof this.client.zrange === 'function') {
        const oldest = await this.client.zrange(scoreKey, 0, 0, 'WITHSCORES');
        oldestScore = Array.isArray(oldest) && oldest[1] ? Number(oldest[1]) : now;
      }

      return {
        count: Number(count),
        resetTime: oldestScore + windowMs,
        member,
      };
    } catch (error) {
      console.error('[RedisStore] 滑动窗口检查错误:', error);
      throw error;
    }
  }

  /**
   * 回滚滑动窗口的指定条目
   * @param {string} key - 存储键
   * @param {Object|string} rollbackData - 回滚数据或成员 ID
   * @returns {Promise<void>}
   */
  async rollbackSlidingWindow(key, rollbackData) {
    try {
      const member = typeof rollbackData === 'string'
        ? rollbackData
        : rollbackData?.member;
      const scoreKey = `${this._getKey(key)}:scores`;

      if (!member) {
        throw new Error('Missing Redis sorted set member for sliding-window rollback');
      }

      if (typeof this.client.zrem !== 'function') {
        throw new Error('Redis client must implement zrem() for precise sliding-window rollback');
      }

      await this.client.zrem(scoreKey, member);
    } catch (error) {
      console.error('[RedisStore] 滑动窗口回滚错误:', error);
      throw error;
    }
  }
}

module.exports = RedisStore;
