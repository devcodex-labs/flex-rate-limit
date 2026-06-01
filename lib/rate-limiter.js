/**
 * RateLimiter 类 - 速率限制的主入口
 * @class
 */
class RateLimiter {
  /**
   * 创建 RateLimiter 实例
   * @param {Object} options - 配置选项
   * @param {number} options.windowMs - 时间窗口（毫秒）
   * @param {number|Function} options.max - 每个窗口的最大请求数
   * @param {string} options.algorithm - 算法：'sliding-window'、'fixed-window'、'token-bucket'、'leaky-bucket'
   * @param {Object|string} options.store - 存储后端实例或 'memory'
   * @param {Function} options.keyGenerator - 从请求生成速率限制键的函数
   * @param {Function} options.skip - 确定是否跳过速率限制的函数
   * @param {Function} options.handler - 超过速率限制时的自定义处理器
   * @param {boolean} options.headers - 是否在响应中包含速率限制头
   * @param {boolean} options.skipSuccessfulRequests - 跳过计数成功请求
   * @param {boolean} options.skipFailedRequests - 跳过计数失败请求
   */
  constructor(options = {}) {
    this.options = this._validateOptions(options);
    this.store = this._initializeStore(this.options.store);
    this.algorithms = require('./algorithms');
    this.algorithm = this._getAlgorithm(this.options.algorithm);
    this._hasRouteConfig = this.options.perRoute !== null;
    this._hasStaticMax = typeof this.options.max === 'number';
    this._baseAlgorithmOptions = this._hasStaticMax
      ? this._buildAlgorithmOptions(this.options)
      : null;
    this._canUseMemoryFastPath = this.store.constructor?.name === 'MemoryStore'
      && this._hasStaticMax
      && !this._hasRouteConfig;
  }

  /**
   * 验证和规范化选项
   * @private
   * @param {Object} options - 原始选项
   * @returns {Object} 验证后的选项
   */
  _validateOptions(options) {
    const defaults = {
      windowMs: 60000, // 1 分钟
      max: 100,
      algorithm: 'sliding-window',
      store: 'memory',
      keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
      skip: () => false,
      handler: null,
      headers: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      perRoute: null,
    };

    const config = { ...defaults, ...options };

    this._validateRuleConfig(config);

    if (config.perRoute !== null) {
      if (typeof config.perRoute !== 'object' || Array.isArray(config.perRoute)) {
        throw new Error('perRoute 必须是对象');
      }

      for (const routeConfig of Object.values(config.perRoute)) {
        this._validateRuleConfig(routeConfig, true);
      }
    }

    return config;
  }

  /**
   * 验证规则配置
   * @private
   * @param {Object} config - 规则配置
   * @param {boolean} allowPartial - 是否允许部分字段
   * @returns {void}
   */
  _validateRuleConfig(config, allowPartial = false) {
    const validAlgorithms = ['sliding-window', 'fixed-window', 'token-bucket', 'leaky-bucket'];

    if (!allowPartial || config.windowMs !== undefined) {
      if (typeof config.windowMs !== 'number' || config.windowMs <= 0) {
        throw new Error('windowMs 必须是正数');
      }
    }

    if (!allowPartial || config.max !== undefined) {
      if (typeof config.max !== 'number' && typeof config.max !== 'function') {
        throw new Error('max 必须是数字或函数');
      }

      if (typeof config.max === 'number' && config.max <= 0) {
        throw new Error('max 必须是正数');
      }
    }

    if (config.algorithm !== undefined && !validAlgorithms.includes(config.algorithm)) {
      throw new Error(`algorithm 必须是以下之一：${validAlgorithms.join('、')}`);
    }

    if (config.capacity !== undefined && (typeof config.capacity !== 'number' || config.capacity <= 0)) {
      throw new Error('capacity 必须是正数');
    }

    if (config.refillRate !== undefined && (typeof config.refillRate !== 'number' || config.refillRate <= 0)) {
      throw new Error('refillRate 必须是正数');
    }

    if (config.leakRate !== undefined && (typeof config.leakRate !== 'number' || config.leakRate <= 0)) {
      throw new Error('leakRate 必须是正数');
    }

    if (config.keyGenerator !== undefined && typeof config.keyGenerator !== 'function') {
      throw new Error('keyGenerator 必须是函数');
    }

    if (config.skip !== undefined && typeof config.skip !== 'function') {
      throw new Error('skip 必须是函数');
    }

    if (config.handler !== undefined && config.handler !== null && typeof config.handler !== 'function') {
      throw new Error('handler 必须是函数');
    }
  }

  /**
   * 初始化存储后端
   * @private
   * @param {Object|string} store - 存储实例或类型
   * @returns {Object} 存储实例
   */
  _initializeStore(store) {
    // 默认使用内存存储
    if (!store || (typeof store === 'string' && store === 'memory')) {
      const MemoryStore = require('./stores/memory-store');
      return new MemoryStore();
    }

    // 支持 Redis 连接字符串
    if (typeof store === 'string' && store.startsWith('redis://')) {
      const Redis = require('ioredis');
      const RedisStore = require('./stores/redis-store');
      const client = new Redis(store);
      return new RedisStore({ client });
    }

    if (typeof store === 'object' && store !== null) {
      // 验证存储是否具有所需方法
      const requiredMethods = ['increment', 'get', 'set', 'reset'];
      for (const method of requiredMethods) {
        if (typeof store[method] !== 'function') {
          throw new Error(`存储必须实现 ${method} 方法`);
        }
      }
      return store;
    }

    throw new Error('无效的存储配置');
  }

  /**
   * 初始化算法处理器
   * @private
   * @param {string} algorithmName - 算法名称
   * @returns {Object} 算法实现
   */
  _getAlgorithm(algorithmName) {
    const algo = this.algorithms[algorithmName];
    if (!algo) {
      throw new Error(`未知算法：${algorithmName}`);
    }
    return algo;
  }

  /**
   * 解析请求级配置
   * @private
   * @param {string} route - 当前路由
   * @param {Object} overrides - 覆盖配置
   * @returns {Object} 合并后的配置
   */
  _resolveConfig(route, overrides = {}) {
    const routeConfig = route && this.options.perRoute && this.options.perRoute[route]
      ? this.options.perRoute[route]
      : {};

    if (Object.keys(routeConfig).length === 0 && Object.keys(overrides).length === 0) {
      return this.options;
    }

    return {
      ...this.options,
      ...routeConfig,
      ...overrides,
    };
  }

  /**
   * 解析请求上限
   * @private
   * @param {Object} config - 配置
   * @param {Object} req - 请求对象
   * @returns {Promise<number>} 解析后的上限
   */
  async _resolveMax(config, req) {
    const max = typeof config.max === 'function'
      ? await config.max(req)
      : config.max;

    if (typeof max !== 'number' || max <= 0) {
      throw new Error('max 必须解析为正数');
    }

    return max;
  }

  /**
   * 解析本次 check 使用的配置与算法。
   * @private
   * @param {Object} runtimeOptions - 运行时选项
   * @returns {Promise<Object>|Object} 解析结果
   */
  _resolveRuntime(runtimeOptions) {
    const hasRuntimeConfig = runtimeOptions.config
      || runtimeOptions.route
      || runtimeOptions.overrides
      || runtimeOptions.req
      || this._hasRouteConfig
      || !this._hasStaticMax;

    if (!hasRuntimeConfig) {
      return {
        config: this.options,
        algorithm: this.algorithm,
        algorithmOptions: this._baseAlgorithmOptions,
      };
    }

    return this._resolveRuntimeSlow(runtimeOptions);
  }

  /**
   * Memory + 静态配置 + direct check 专用快路径。
   * @private
   * @param {string} key - 速率限制键
   * @returns {Object|null} 限流结果
   */
  _checkMemoryFastPath(key) {
    if (!this._canUseMemoryFastPath) {
      return null;
    }

    const options = this._baseAlgorithmOptions;
    const limit = options.limit;
    const now = Date.now();

    if (this.options.algorithm === 'fixed-window') {
      const windowKey = Math.floor(now / options.windowMs);
      const resetTime = (windowKey + 1) * options.windowMs;
      const result = this.store.incrementFixedWindow(`${key}:${windowKey}`, {
        expiresAt: resetTime,
        windowMs: options.windowMs,
      });
      const count = result.count;
      const allowed = count <= limit;

      return {
        allowed,
        limit,
        current: count,
        remaining: allowed ? limit - count : 0,
        resetTime,
        retryAfter: allowed ? 0 : Math.max(0, resetTime - now),
      };
    }

    if (this.options.algorithm === 'sliding-window') {
      const result = this.store.checkSlidingWindow(key, {
        windowMs: options.windowMs,
        now,
      });
      const count = result.count;
      const allowed = count <= limit;

      return {
        allowed,
        limit,
        current: count,
        remaining: allowed ? limit - count : 0,
        resetTime: result.resetTime,
        retryAfter: allowed ? 0 : Math.max(0, result.resetTime - now),
      };
    }

    if (this.options.algorithm === 'token-bucket') {
      return this.store.checkTokenBucket(key, options);
    }

    if (this.options.algorithm === 'leaky-bucket') {
      return this.store.checkLeakyBucket(key, options);
    }

    return null;
  }

  /**
   * 解析动态配置路径。
   * @private
   * @param {Object} runtimeOptions - 运行时选项
   * @returns {Promise<Object>} 解析结果
   */
  async _resolveRuntimeSlow(runtimeOptions) {
    const effectiveConfig = runtimeOptions.config || this._resolveConfig(
      runtimeOptions.route,
      runtimeOptions.overrides || {},
    );
    const max = await this._resolveMax(effectiveConfig, runtimeOptions.req);
    const config = max === effectiveConfig.max
      ? effectiveConfig
      : { ...effectiveConfig, max };

    return {
      config: effectiveConfig,
      algorithm: effectiveConfig === this.options
        ? this.algorithm
        : this._getAlgorithm(effectiveConfig.algorithm),
      algorithmOptions: this._buildAlgorithmOptions(config, runtimeOptions),
    };
  }

  /**
   * 构建算法配置
   * @private
   * @param {Object} config - 生效配置
   * @param {Object} runtimeOptions - 运行时选项
   * @returns {Object} 算法配置
   */
  _buildAlgorithmOptions(config, runtimeOptions = {}) {
    const algorithmOptions = {
      windowMs: config.windowMs,
      limit: config.max,
      req: runtimeOptions.req,
      route: runtimeOptions.route,
    };

    if (config.algorithm === 'token-bucket') {
      const capacity = config.capacity || config.max;
      algorithmOptions.capacity = capacity;
      algorithmOptions.limit = capacity;
      algorithmOptions.refillRate = config.refillRate || capacity;
    }

    if (config.algorithm === 'leaky-bucket') {
      const capacity = config.capacity || config.max;
      algorithmOptions.capacity = capacity;
      algorithmOptions.limit = capacity;
      algorithmOptions.leakRate = config.leakRate || capacity;
    }

    return algorithmOptions;
  }

  /**
   * 检查请求是否被允许
   * @param {string} key - 速率限制键
   * @param {Object} options - 检查选项
   * @returns {Promise<Object>} 包含 allowed、remaining、resetTime、retryAfter 的结果
   */
  // Keep check async for the public Promise contract while preserving the direct Memory fast path.
  // eslint-disable-next-line require-await
  async check(key, options) {
    if (!key || typeof key !== 'string') {
      throw new Error('键必须是非空字符串');
    }

    if (options === undefined) {
      const fastResult = this._checkMemoryFastPath(key);
      if (fastResult) {
        return fastResult;
      }
    }

    return this._checkSlow(key, options || {});
  }

  async _checkSlow(key, options) {
    const runtime = await this._resolveRuntime(options);
    const { config: effectiveConfig, algorithm, algorithmOptions } = runtime;

    try {
      const checkResult = algorithm.check(
        this.store,
        key,
        algorithmOptions,
      );
      const result = checkResult && typeof checkResult.then === 'function'
        ? await checkResult
        : checkResult;

      const response = {
        allowed: result.allowed,
        limit: result.limit,
        current: result.current,
        remaining: result.remaining,
        resetTime: result.resetTime,
        retryAfter: result.retryAfter,
      };

      Object.defineProperty(response, '_internal', {
        enumerable: false,
        value: {
          algorithm,
          key,
          options: algorithmOptions,
          rollbackData: result.rollbackData,
        },
      });

      return response;
    } catch (error) {
      // 出错时，允许请求但记录错误
      console.error('[RateLimiter] 检查速率限制时出错:', error);
      return {
        allowed: true,
        limit: algorithmOptions.limit,
        current: 0,
        remaining: algorithmOptions.limit,
        resetTime: Date.now() + effectiveConfig.windowMs,
        retryAfter: 0,
        error: error.message,
      };
    }
  }

  /**
   * 重置特定键的速率限制
   * @param {string} key - 速率限制键
   * @returns {Promise<void>}
   */
  async reset(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('键必须是非空字符串');
    }

    const algorithmConfig = this._buildAlgorithmOptions(this.options);

    if (typeof this.algorithm.reset === 'function') {
      await this.algorithm.reset(this.store, key, algorithmConfig);
      return;
    }

    await this.store.reset(key);
  }

  /**
   * 重置所有速率限制（仅限内存存储）
   * @returns {Promise<void>}
   */
  async resetAll() {
    if (typeof this.store.resetAll === 'function') {
      await this.store.resetAll();
    } else {
      throw new Error('存储不支持 resetAll 操作');
    }
  }

  /**
   * 为 Web 框架创建中间件
   * @param {Object} _options - 中间件选项
   * @returns {Function} 中间件函数
   */
  middleware(_options = {}) {
    return async (req, res, next) => {
      const route = req.route?.path || req.path || req.url;
      const config = this._resolveConfig(route, _options);

      try {
        // 检查是否应跳过速率限制
        if (await config.skip(req)) {
          return next ? next() : undefined;
        }

        // 生成速率限制键（传递路由上下文）
        const key = await config.keyGenerator(req, { route });

        // 检查速率限制（传递路由信息）
        const result = await this.check(key, { req, route, config });

        // 如果启用，添加响应头
        if (config.headers && res) {
          this._setHeaders(res, result);
        }

        // 处理超过速率限制的情况
        if (!result.allowed) {
          if (config.handler) {
            return config.handler(req, res, next);
          }

          // 默认处理器
          if (res && typeof res.status === 'function' && typeof res.json === 'function') {
            res.status(429).json({
              error: '请求过多',
              message: '超过速率限制',
              retryAfter: Math.ceil(result.retryAfter / 1000),
            });

            return undefined;
          }

          return next ? next(new Error('超过速率限制')) : undefined;
        }

        const postProcess = this._createPostProcess(result, config, res);

        // 继续下一个中间件
        const nextResult = next ? next() : undefined;
        if (nextResult && typeof nextResult.then === 'function') {
          const output = await nextResult;
          await postProcess();
          return output;
        }

        await postProcess();
        return nextResult;
      } catch (error) {
        console.error('[RateLimiter] 中间件错误:', error);
        // 出错时，允许请求
        return next ? next() : undefined;
      }
    };
  }

  /**
   * 设置速率限制响应头
   * @private
   * @param {Object} res - 响应对象
   * @param {Object} result - 检查结果
   */
  _setHeaders(res, result) {
    if (!res || typeof res.setHeader !== 'function') {
      return;
    }

    res.setHeader('X-RateLimit-Limit', Math.floor(result.limit).toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(result.remaining)).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfter / 1000).toString());
    }
  }

  /**
   * 创建请求结束后的回滚处理
   * @private
   * @param {Object} result - 速率限制结果
   * @param {Object} config - 生效配置
   * @param {Object} res - 响应对象
   * @returns {Function} 后处理函数
   */
  _createPostProcess(result, config, res) {
    const shouldRollback = config.skipSuccessfulRequests || config.skipFailedRequests;
    const rollback = result._internal && typeof result._internal.algorithm.rollback === 'function'
      ? result._internal.algorithm.rollback.bind(
        result._internal.algorithm,
        this.store,
        result._internal.key,
        result._internal.options,
        result,
      )
      : null;

    if (!shouldRollback || !rollback) {
      return async () => {};
    }

    let handled = false;
    const maybeRollback = async () => {
      if (handled) {
        return;
      }

      handled = true;

      const statusCode = typeof res?.statusCode === 'number' ? res.statusCode : 200;
      const isSuccess = statusCode < 400;
      const shouldRevert = (isSuccess && config.skipSuccessfulRequests)
        || (!isSuccess && config.skipFailedRequests);

      if (!shouldRevert) {
        return;
      }

      try {
        await rollback();
      } catch (error) {
        console.error('[RateLimiter] 回滚请求计数时出错:', error);
      }
    };

    if (res && typeof res.once === 'function') {
      return () => {
        res.once('finish', () => {
          maybeRollback().catch((error) => {
            console.error('[RateLimiter] finish 回滚失败:', error);
          });
        });
        res.once('close', () => {
          maybeRollback().catch((error) => {
            console.error('[RateLimiter] close 回滚失败:', error);
          });
        });
      };
    }

    return maybeRollback;
  }
}

module.exports = RateLimiter;
