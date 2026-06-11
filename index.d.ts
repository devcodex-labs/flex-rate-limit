// Type definitions for flex-rate-limit v2.2.3
// Project: https://github.com/vextjs/flex-rate-limit
// Definitions by: vext.js Team

// ========== 核心类型 ==========

/**
 * 速率限制检查结果
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  error?: string;
}

/**
 * 速率限制规则选项
 */
export interface RateLimiterRuleOptions {
  /**
   * 时间窗口大小（毫秒）
   * @default 60000 (1分钟)
   */
  windowMs?: number;

  /**
   * 每个时间窗口的最大请求数
   * @default 100
   */
  max?: number | ((req: any) => number | Promise<number>);

  /**
   * 限流算法：'sliding-window', 'fixed-window', 'token-bucket', 'leaky-bucket'
   * @default 'sliding-window'
   */
  algorithm?: 'sliding-window' | 'fixed-window' | 'token-bucket' | 'leaky-bucket';

  /**
   * 从请求对象生成限流键的函数
   * @default (req) => req.ip
   */
  keyGenerator?: (req: any, context?: { route?: string }) => string | Promise<string>;

  /**
   * 确定是否跳过速率限制的函数
   *
   * 可用于实现：
   * - IP 白名单：whitelistIPs.includes(req.ip)
   * - 管理员跳过：req.user?.role === 'admin'
   * - 健康检查跳过：req.path === '/health'
   * - 特定路由跳过：跳过监控端点等
   *
   * @example
   * // IP 白名单
   * skip: (req) => ['127.0.0.1', '192.168.1.100'].includes(req.ip)
   *
   * @example
   * // 管理员跳过限流
   * skip: (req) => req.user?.role === 'admin'
   *
   * @default () => false
   */
  skip?: (req: any) => boolean | Promise<boolean>;

  /**
   * 超过速率限制时的自定义处理器
   */
  handler?: (req: any, res: any, next?: Function) => void | Promise<void>;

  /**
   * 是否在响应中包含速率限制头
   * @default true
   */
  headers?: boolean;

  /**
   * 跳过计数成功的请求
   * @default false
   */
  skipSuccessfulRequests?: boolean;

  /**
   * 跳过计数失败的请求
   * @default false
   */
  skipFailedRequests?: boolean;

  /**
   * 令牌桶容量（用于 token-bucket 算法）
   */
  capacity?: number;

  /**
   * 每个 windowMs 内补充的令牌数（用于 token-bucket 算法）
   */
  refillRate?: number;

  /**
   * 每个 windowMs 内漏出的请求数（用于 leaky-bucket 算法）
   */
  leakRate?: number;

}

/**
 * 路由级别配置
 */
export interface PerRouteOptions extends Partial<RateLimiterRuleOptions> {}

/**
 * 速率限制器配置选项
 */
export interface RateLimiterOptions extends RateLimiterRuleOptions {
  /**
   * 存储后端
   * - Store 实例：自定义或内置的存储后端（MemoryStore、RedisStore、CacheHubStore）
   * - 'memory'：使用默认内存存储
   * - 'redis://...'：由 RateLimiter 创建并拥有 Redis 客户端，可通过 close() 关闭
   * @default 'memory'
   * @example
   * ```typescript
   * // 使用内存存储
   * store: 'memory'
   *
   * // 使用 Redis 存储
   * const redis = new Redis();
   * store: new RedisStore({ client: redis })
   *
   * // 使用 Redis 连接字符串
   * store: 'redis://127.0.0.1:6379'
   *
   * // 使用 cache-hub 原子状态后端
   * store: new CacheHubStore({ client: redis })
   *
   * // 条件使用（Egg.js 风格）
   * store: ctx.app.redis
   *   ? new RedisStore({ client: ctx.app.redis })
   *   : 'memory'
   * ```
   */
  store?: Store | 'memory' | `redis://${string}`;

  /**
   * 路由级别配置：为不同路由设置不同的限制
   */
  perRoute?: {
    [route: string]: PerRouteOptions;
  };
}

/**
 * 存储后端接口
 */
export interface Store {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  increment(key: string, options?: any): Promise<{ count: number; resetTime: number }>;
  decrement?(key: string): Promise<void>;
  checkFixedWindow?(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  checkSlidingWindow?(key: string, options?: any): Promise<{ count: number; resetTime: number; rollbackData?: any }>;
  rollbackSlidingWindow?(key: string, rollbackData?: any): Promise<void>;
  checkTokenBucket?(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  rollbackTokenBucket?(key: string, rollbackData?: any): Promise<void>;
  checkLeakyBucket?(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  rollbackLeakyBucket?(key: string, rollbackData?: any): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Redis 客户端接口（兼容 ioredis、node-redis 等）
 *
 * 此接口定义了最小必需的 Redis 方法集。
 * 如果你的 Redis 客户端是 any 类型，可以直接传入。
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | any>;
  setex(key: string, seconds: number, value: string): Promise<string | any>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl?(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  zrange?(key: string, start: number, stop: number, withScores?: 'WITHSCORES'): Promise<string[]>;
  zrem?(key: string, member: string): Promise<number>;
  zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number>;
  zpopmax(key: string): Promise<string[]>;
  type(key: string): Promise<string>;
  scan?(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  pipeline?(): RedisPipeline;
  quit?(): Promise<any>;
  disconnect?(): void;
}

/**
 * Redis pipeline 接口
 */
export interface RedisPipeline {
  zremrangebyscore(key: string, min: string | number, max: string | number): RedisPipeline;
  zadd(key: string, score: number, member: string): RedisPipeline;
  expire(key: string, seconds: number): RedisPipeline;
  zrange(key: string, start: number, stop: number, withScores?: 'WITHSCORES'): RedisPipeline;
  zcard(key: string): RedisPipeline;
  exec(): Promise<Array<[Error | null, any]>>;
}

/**
 * Redis 存储选项
 */
export interface RedisStoreOptions {
  /**
   * Redis 客户端实例（ioredis 或兼容客户端）
   * 支持任何实现了基本 Redis 方法的客户端
   */
  client: RedisClient | any;

  /**
   * 键前缀
   * @default 'rl:'
   */
  prefix?: string;

  /**
   * 默认过期时间（秒）
   * @default 3600
   */
  expiry?: number;

  /**
   * 是否在 RedisStore.close() 时关闭 Redis 客户端。
   * 外部传入 client 默认由调用方管理。
   * @default false
   */
  ownsClient?: boolean;

  /**
   * ownsClient 的兼容别名。
   * @default false
   */
  closeClient?: boolean;
}

/**
 * CacheHub 存储选项
 */
export interface CacheHubStoreOptions {
  /**
   * Redis 客户端实例；不传时使用 cache-hub 内存后端。
   */
  client?: RedisClient | any;

  /**
   * Redis 客户端别名。
   */
  redis?: RedisClient | any;

  /**
   * 键前缀
   * @default 'rl:'
   */
  prefix?: string;

  /**
   * 默认过期时间（秒）
   * @default 3600
   */
  expiry?: number;

}

/**
 * 限流算法接口
 */
export interface Algorithm {
  check(store: Store, key: string, options: any): Promise<RateLimitResult & { rollbackData?: any }>;
  rollback?(store: Store, key: string, options: any, result: RateLimitResult): Promise<void>;
  reset?(store: Store, key: string, options: any): Promise<void>;
}

/**
 * 预定义的键生成器接口
 */
export interface KeyGenerators {
  /**
   * 按 IP 地址生成键
   */
  ip(req: any, context?: any): string;

  /**
   * 按用户 ID 生成键（需要 req.user.id）
   */
  userId(req: any, context?: any): string;

  /**
   * 按路由和 IP 组合生成键
   */
  routeAndIp(req: any, context?: any): string;

  /**
   * 按 API 端点生成键
   */
  apiEndpoint(req: any, context?: any): string;

  /**
   * 按用户和路由组合生成键
   */
  userAndRoute(req: any, context?: any): string;
}

/**
 * 中间件选项（预留用于未来扩展）
 */
export interface MiddlewareOptions {
  windowMs?: number;
  max?: number | ((req: any) => number | Promise<number>);
  algorithm?: 'sliding-window' | 'fixed-window' | 'token-bucket' | 'leaky-bucket';
  keyGenerator?: (req: any, context?: { route?: string }) => string | Promise<string>;
  skip?: (req: any) => boolean | Promise<boolean>;
  handler?: (req: any, res: any, next?: Function) => void | Promise<void>;
  headers?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  capacity?: number;
  refillRate?: number;
  leakRate?: number;
}

// ========== 导出的类 ==========

/**
 * RateLimiter 主类
 */
export class RateLimiter {
  constructor(options?: RateLimiterOptions);

  /**
   * 检查请求是否被允许
   * @param key - 限流键
   * @param options - 选项对象，包含 req 和路由上下文
   * @returns 检查结果
   */
  check(key: string, options?: { req?: any; route?: string }): Promise<RateLimitResult>;

  /**
   * 重置特定键的速率限制
   * @param key - 要重置的键
   */
  reset(key: string): Promise<void>;

  /**
   * 重置所有速率限制（仅限内存存储）
   */
  resetAll(): Promise<void>;

  /**
   * 关闭当前 limiter 拥有的存储资源。
   */
  close(): Promise<void>;

  /**
   * 为 Web 框架创建中间件
   * @param options - 中间件选项
   * @returns Express-style `(req, res, next)` 中间件函数；Koa/Egg.js/Fastify/Hapi 请用 check() 包装到对应框架适配器
   */
  middleware(options?: MiddlewareOptions): (req: any, res: any, next?: Function) => Promise<void>;
}

/**
 * 内存存储后端
 */
export class MemoryStore implements Store {
  constructor();
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  increment(key: string, options?: any): Promise<{ count: number; resetTime: number }>;
  decrement(key: string): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
  size(): number;
}

/**
 * Redis 存储后端
 */
export class RedisStore implements Store {
  constructor(options: RedisStoreOptions);
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  increment(key: string, options?: any): Promise<{ count: number; resetTime: number }>;
  decrement(key: string): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * cache-hub 原子状态存储后端
 */
export class CacheHubStore implements Store {
  constructor(options?: CacheHubStoreOptions);
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  increment(key: string, options?: any): Promise<{ count: number; resetTime: number }>;
  decrement(key: string): Promise<void>;
  checkFixedWindow(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  checkSlidingWindow(key: string, options?: any): Promise<{ count: number; resetTime: number; rollbackData?: any }>;
  rollbackSlidingWindow(key: string, rollbackData?: any): Promise<void>;
  checkTokenBucket(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  rollbackTokenBucket(key: string, rollbackData?: any): Promise<void>;
  checkLeakyBucket(key: string, options?: any): Promise<RateLimitResult & { rollbackData?: any }>;
  rollbackLeakyBucket(key: string, rollbackData?: any): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
  close(): Promise<void>;
}

// ========== 导出的常量 ==========

/**
 * 可用的限流算法
 */
export const algorithms: {
  'sliding-window': Algorithm;
  'fixed-window': Algorithm;
  'token-bucket': Algorithm;
  'leaky-bucket': Algorithm;
};

/**
 * 预定义的键生成器集合
 */
export const keyGenerators: KeyGenerators;

// ========== 默认导出 ==========

/**
 * 默认导出对象，包含所有主要导出
 */
declare const _default: {
  RateLimiter: typeof RateLimiter;
  MemoryStore: typeof MemoryStore;
  RedisStore: typeof RedisStore;
  CacheHubStore: typeof CacheHubStore;
  algorithms: typeof algorithms;
  keyGenerators: typeof keyGenerators;
};

export default _default;
