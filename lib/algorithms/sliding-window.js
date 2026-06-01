/**
 * 滑动窗口算法
 * 最精确的速率限制，跨时间窗口平滑
 */

/**
 * 使用滑动窗口算法检查速率限制
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} options - 算法选项
 * @returns {Promise<Object>} 包含计数和重置时间的结果
 */
function check(store, key, options) {
  const { windowMs, limit } = options;
  const now = Date.now();
  if (typeof store.checkSlidingWindow === 'function') {
    const result = store.checkSlidingWindow(key, { windowMs, now });
    if (result && typeof result.then === 'function') {
      return result.then((resolved) => buildResult(resolved, limit, now));
    }
    return buildResult(result, limit, now);
  }

  return checkWithGenericStore(store, key, options, now);
}

async function checkWithGenericStore(store, key, options, now) {
  const { windowMs, limit } = options;
  const windowStart = now - windowMs;
  const data = await store.get(key);
  const requests = data?.requests ? [...data.requests] : [];
  let head = data?.head || 0;

  while (head < requests.length && requests[head] <= windowStart) {
    head += 1;
  }

  if (head > 64 && head * 2 >= requests.length) {
    requests.splice(0, head);
    head = 0;
  }

  requests.push(now);

  const current = requests.length - head;
  const oldestRequest = requests[head] || now;
  const resetTime = oldestRequest + windowMs;

  await store.set(key, { requests, head }, windowMs);

  return buildResult({
    count: current,
    resetTime,
    rollbackData: {
      requestTime: now,
    },
  }, limit, now);
}

function buildResult(result, limit, now) {
  return {
    allowed: result.count <= limit,
    limit,
    current: result.count,
    remaining: Math.max(0, limit - result.count),
    resetTime: result.resetTime,
    retryAfter: result.count <= limit ? 0 : Math.max(0, result.resetTime - now),
    rollbackData: {
      requestTime: now,
      member: result.member,
      ...result.rollbackData,
    },
  };
}

/**
 * 回滚滑动窗口计数
 * @param {Object} store - 存储后端
 * @param {string} key - 速率限制键
 * @param {Object} _options - 算法选项
 * @param {Object} result - 检查结果
 * @returns {Promise<void>}
 */
async function rollback(store, key, _options, result) {
  if (typeof store.rollbackSlidingWindow === 'function') {
    await store.rollbackSlidingWindow(key, result._internal?.rollbackData);
    return;
  }

  const data = await store.get(key);
  if (!data || !Array.isArray(data.requests) || data.requests.length === 0) {
    return;
  }

  const requests = [...data.requests];
  const requestTime = result._internal?.rollbackData?.requestTime;
  const targetIndex = requestTime !== undefined
    ? requests.lastIndexOf(requestTime)
    : requests.length - 1;

  if (targetIndex === -1) {
    return;
  }

  requests.splice(targetIndex, 1);
  const head = Math.min(data.head || 0, requests.length);

  if (requests.length === 0) {
    await store.reset(key);
    return;
  }

  await store.set(key, { requests, head }, _options.windowMs);
}

module.exports = {
  check,
  rollback,
};
