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
async function check(store, key, options) {
  const { windowMs, limit } = options;
  const now = Date.now();
  const windowKey = Math.floor(now / windowMs);
  const fullKey = `${key}:${windowKey}`;

  // 增加当前窗口的计数器
  const result = await store.increment(fullKey, { windowMs });

  // 计算重置时间（当前窗口结束时间）
  const resetTime = (windowKey + 1) * windowMs;

  return {
    allowed: result.count <= limit,
    limit,
    current: result.count,
    remaining: Math.max(0, limit - result.count),
    resetTime,
    retryAfter: result.count <= limit ? 0 : Math.max(0, resetTime - now),
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
