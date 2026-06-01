/**
 * Token Bucket algorithm
 * Allows bursts while maintaining average rate
 */

/**
 * Check rate limit using token bucket algorithm
 * @param {Object} store - Storage backend
 * @param {string} key - Rate limit key
 * @param {Object} options - Algorithm options
 * @returns {Promise<Object>} Result with count and resetTime
 */
function check(store, key, options) {
  const { capacity = 10, refillRate = capacity, windowMs = 1000, limit = capacity } = options;
  if (typeof store.checkTokenBucket === 'function') {
    return store.checkTokenBucket(key, { capacity, refillRate, windowMs, limit });
  }

  return checkWithGenericStore(store, key, { capacity, refillRate, windowMs, limit });
}

async function checkWithGenericStore(store, key, options) {
  const { capacity, refillRate, windowMs, limit } = options;
  const now = Date.now();

  // 获取当前桶的状态
  const data = await store.get(key);

  let tokens = capacity;

  if (data) {
    // 根据经过的时间计算要添加的令牌数
    const timePassed = now - data.lastRefill;
    const tokensToAdd = (timePassed / windowMs) * refillRate;

    tokens = Math.min(capacity, data.tokens + tokensToAdd);
  }

  // 尝试消耗一个令牌
  if (tokens >= 1) {
    tokens -= 1;
    await store.set(key, { tokens, lastRefill: now }, Math.ceil((capacity / refillRate) * windowMs));

    return {
      allowed: true,
      limit,
      current: limit - Math.max(0, Math.floor(tokens)),
      remaining: Math.max(0, Math.floor(tokens)),
      resetTime: now + Math.ceil(((capacity - tokens) / refillRate) * windowMs),
      retryAfter: 0,
    };
  }

  // 没有可用令牌
  const timeToNextToken = ((1 - tokens) / refillRate) * windowMs;

  return {
    allowed: false,
    limit,
    current: limit,
    remaining: 0,
    resetTime: now + Math.ceil((capacity / refillRate) * windowMs),
    retryAfter: Math.ceil(timeToNextToken),
  };
}

/**
 * 回滚令牌桶消耗
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<void>}
 */
async function rollback(store, key, options) {
  const { capacity = 10, refillRate = capacity, windowMs = 1000 } = options;
  const data = await store.get(key);
  if (!data) {
    return;
  }

  await store.set(
    key,
    {
      tokens: Math.min(capacity, data.tokens + 1),
      lastRefill: data.lastRefill,
    },
    Math.ceil((capacity / refillRate) * windowMs),
  );
}

module.exports = {
  check,
  rollback,
};
