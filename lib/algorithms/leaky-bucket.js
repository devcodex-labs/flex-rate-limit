/**
 * 漏桶算法
 * 平滑、恒定速率的限流
 */

/**
 * 使用漏桶算法检查速率限制
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<Object>} 包含计数和重置时间的结果
 */
function check(store, key, options) {
  const { capacity = 10, leakRate = capacity, windowMs = 1000, limit = capacity } = options;
  if (typeof store.checkLeakyBucket === 'function') {
    return store.checkLeakyBucket(key, { capacity, leakRate, windowMs, limit });
  }

  return checkWithGenericStore(store, key, { capacity, leakRate, windowMs, limit });
}

async function checkWithGenericStore(store, key, options) {
  const { capacity, leakRate, windowMs, limit } = options;
  const now = Date.now();

  // 获取当前桶的状态
  const data = await store.get(key);

  let water = 0;

  if (data) {
    // 计算自上次检查以来泄漏的水量
    const timePassed = now - data.lastLeak;
    const waterLeaked = (timePassed / windowMs) * leakRate;

    water = Math.max(0, data.water - waterLeaked);
  }

  // 尝试添加水（请求）
  if (water + 1 <= capacity) {
    water += 1;
    await store.set(key, { water, lastLeak: now }, Math.ceil((capacity / leakRate) * windowMs));

    return {
      allowed: true,
      limit,
      current: Math.min(limit, Math.ceil(water)),
      remaining: Math.max(0, limit - Math.ceil(water)),
      resetTime: now + Math.ceil((water / leakRate) * windowMs),
      retryAfter: 0,
    };
  }

  // 桶已满
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
 * 回滚漏桶计数
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<void>}
 */
async function rollback(store, key, options) {
  const { capacity = 10, leakRate = capacity, windowMs = 1000 } = options;
  const data = await store.get(key);
  if (!data) {
    return;
  }

  await store.set(
    key,
    {
      water: Math.max(0, data.water - 1),
      lastLeak: data.lastLeak,
    },
    Math.ceil((capacity / leakRate) * windowMs),
  );
}

module.exports = {
  check,
  rollback,
};
