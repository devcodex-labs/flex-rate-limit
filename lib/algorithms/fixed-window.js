/**
 * 固定窗口算法
 * 简单的计数器，在固定时间间隔重置
 */

/**
 * 使用固定窗口算法检查速率限制
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<Object>} 包含计数和重置时间的结果
 */
function check(store, key, options) {
  const { windowMs, limit } = options;
  const now = Date.now();

  if (typeof store.checkFixedWindow === 'function') {
    return store.checkFixedWindow(key, { windowMs, limit, now });
  }

  const windowKey = Math.floor(now / windowMs);
  const fullKey = `${key}:${windowKey}`;
  const resetTime = (windowKey + 1) * windowMs;

  if (typeof store.incrementFixedWindow === 'function') {
    const result = store.incrementFixedWindow(fullKey, { expiresAt: resetTime, windowMs });
    return buildResult(result.count, limit, resetTime, now, fullKey);
  }

  const result = store.increment(fullKey, { windowMs });
  if (result && typeof result.then === 'function') {
    return result.then((resolved) => buildResult(resolved.count, limit, resetTime, now, fullKey));
  }

  return buildResult(result.count, limit, resetTime, now, fullKey);
}

function buildResult(count, limit, resetTime, now, fullKey) {
  return {
    allowed: count <= limit,
    limit,
    current: count,
    remaining: Math.max(0, limit - count),
    resetTime,
    retryAfter: count <= limit ? 0 : Math.max(0, resetTime - now),
    rollbackData: {
      storageKey: fullKey,
    },
  };
}

/**
 * 回滚固定窗口计数
 * @param {Object} store - 存储后端
 * @param {string} _key - 原始速率限制键
 * @param {Object} _options - 算法选项
 * @param {Object} result - 检查结果
 * @returns {Promise<void>}
 */
async function rollback(store, _key, _options, result) {
  if (typeof store.decrement !== 'function' || !result._internal?.rollbackData?.storageKey) {
    return;
  }

  await store.decrement(result._internal.rollbackData.storageKey);
}

/**
 * 重置当前窗口计数
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<void>}
 */
async function reset(store, key, options) {
  const { windowMs } = options;
  const windowKey = Math.floor(Date.now() / windowMs);
  const fullKey = `${key}:${windowKey}`;
  await store.reset(fullKey);
}

module.exports = {
  check,
  rollback,
  reset,
};
