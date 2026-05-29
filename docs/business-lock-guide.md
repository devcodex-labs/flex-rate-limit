# 业务锁使用指南

> **业务锁**：基于用户ID + 路由的精细化限流控制

---

## 📚 目录

1. [什么是业务锁](#什么是业务锁)
2. [核心概念](#核心概念)
3. [快速开始](#快速开始)
4. [完整示例](#完整示例)
5. [高级场景](#高级场景)
6. [最佳实践](#最佳实践)

---

## 什么是业务锁

### 传统限流 vs 业务锁

#### 传统限流（按IP）
```javascript
// 所有用户共享同一个IP的限流配额
keyGenerator: (req) => req.ip
// 问题：同一公司/网吧的用户会互相影响
```

#### 业务锁（按用户+路由）
```javascript
// 每个用户在每个路由上独立计数
keyGenerator: (ctx) => `user:${ctx.user.id}:${ctx.path}`
// 优势：
// - 用户A的操作不影响用户B
// - 每个接口独立限流
// - 精确控制业务行为
```

### 应用场景

| 场景 | 传统限流 | 业务锁 | 优势 |
|------|---------|--------|------|
| **公司网络** | ❌ 所有员工共享配额 | ✅ 每人独立配额 | 避免互相影响 |
| **登录限制** | ❌ IP被锁，所有人不能登录 | ✅ 只锁异常用户 | 不影响正常用户 |
| **API限流** | ❌ 无法区分用户 | ✅ 每个用户独立限制 | 公平分配资源 |
| **防刷接口** | ❌ 容易绕过（换IP） | ✅ 绑定用户ID | 更有效防护 |

---

## 核心概念

### keyGenerator

`keyGenerator` 是业务锁的核心，用于生成唯一的限流键。

#### 函数签名

```typescript
keyGenerator: (req: any, context?: { route: string }) => string | Promise<string>
```

#### 参数说明

- **req**: 请求对象（Express/Koa/Egg.js 的 ctx）
- **context**: 上下文对象
  - `route`: 当前路由路径（如 `/api/login`）

#### 返回值

字符串，作为限流的唯一键。

**示例**:
```javascript
keyGenerator: (ctx, context) => {
  const userId = ctx.user?.id || ctx.ip;
  const route = context?.route || ctx.path;
  return `user:${userId}:${route}`;
  // 返回: "user:123:/api/login"
}
```

---

## 快速开始

### 步骤1：安装

```bash
npm install flex-rate-limit
```

### 步骤2：创建业务锁中间件（Egg.js）

**文件**: `app/middleware/business-lock.js`

```javascript
const { RateLimiter } = require('flex-rate-limit');

module.exports = (options = {}) => {
  const limiter = new RateLimiter({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 100,
    
    // 核心：用户ID + 路由
    keyGenerator: (ctx) => {
      const userId = ctx.user?.id || ctx.state?.user?.id || ctx.ip;
      return `user:${userId}:${ctx.path}`;
    },
  });

  return async (ctx, next) => {
    const key = await limiter.options.keyGenerator(ctx);
    const result = await limiter.check(key);

    ctx.set('X-RateLimit-Limit', result.limit);
    ctx.set('X-RateLimit-Remaining', result.remaining);

    if (!result.allowed) {
      ctx.status = 429;
      ctx.body = {
        code: 429,
        message: '请求过于频繁，请稍后再试',
      };
      return;
    }

    await next();
  };
};
```

### 步骤3：在路由中使用

**文件**: `app/router.js`

```javascript
module.exports = (app) => {
  const { router, controller } = app;

  // 创建业务锁中间件
  const businessLock = app.middleware.businessLock({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5,                   // 最多5次
  });

  // 应用到登录接口
  router.post('/api/login', businessLock, controller.auth.login);
};
```

---

## 完整示例

### 示例1：多级限流

**不同严格程度的限流策略**

```javascript
// app/middleware/rate-limit.js
const { RateLimiter } = require('flex-rate-limit');

module.exports = (app) => {
  return {
    // 严格限制：登录、注册等敏感操作
    strict: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 15 * 60 * 1000, // 15分钟
        max: 5,                   // 最多5次
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.ip;
          return `strict:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '操作过于频繁，请15分钟后再试' };
        return;
      }

      await next();
    },

    // 中等限制：数据修改操作
    normal: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 60 * 1000, // 1小时
        max: 50,                  // 最多50次
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.ip;
          return `normal:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '请求过于频繁' };
        return;
      }

      await next();
    },

    // 宽松限制：查询操作
    relaxed: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 1000,  // 1分钟
        max: 200,             // 最多200次
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.ip;
          return `relaxed:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '请求过于频繁' };
        return;
      }

      await next();
    },
  };
};
```

**在路由中使用**:

```javascript
// app/router.js
module.exports = (app) => {
  const { router, controller } = app;
  const limit = app.middleware.rateLimit(app);

  // 认证相关 - 严格限制
  router.post('/api/login', limit.strict, controller.auth.login);
  router.post('/api/register', limit.strict, controller.auth.register);
  router.post('/api/reset-password', limit.strict, controller.auth.resetPassword);

  // 数据修改 - 中等限制
  router.post('/api/posts', limit.normal, controller.post.create);
  router.put('/api/posts/:id', limit.normal, controller.post.update);
  router.delete('/api/posts/:id', limit.normal, controller.post.delete);

  // 数据查询 - 宽松限制
  router.get('/api/posts', limit.relaxed, controller.post.list);
  router.get('/api/posts/:id', limit.relaxed, controller.post.detail);
};
```

### 示例2：使用预定义 keyGenerator

```javascript
const { RateLimiter, keyGenerators } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  
  // 使用预定义的 userAndRoute
  keyGenerator: keyGenerators.userAndRoute,
});

// keyGenerators.userAndRoute 的实现：
// (req, context) => {
//   const userId = req.user?.id || req.ip || 'unknown';
//   const route = context?.route || 'unknown';
//   return `user:${userId}:${route}`;
// }
```

**可用的预定义生成器**:

| 生成器 | 键格式 | 适用场景 |
|-------|--------|---------|
| `ip` | `127.0.0.1` | 按IP限流 |
| `userId` | `user:123` | 按用户限流（所有接口共享） |
| `routeAndIp` | `/api/login:127.0.0.1` | 按路由+IP限流 |
| `apiEndpoint` | `api:/api/login:127.0.0.1` | API端点限流 |
| `userAndRoute` | `user:123:/api/login` | **业务锁（推荐）** |

---

## 高级场景

### 场景1：VIP用户分级限流

**需求**: VIP用户有更高的限流配额。

```javascript
userLevel: async (ctx, next) => {
  const isVIP = ctx.user?.vip === true;
  
  const limiter = new RateLimiter({
    windowMs: 60 * 1000,
    max: isVIP ? 500 : 100, // VIP 5倍配额
    keyGenerator: (ctx) => {
      const userId = ctx.user?.id || ctx.ip;
      const level = ctx.user?.vip ? 'vip' : 'normal';
      return `${level}:user:${userId}:${ctx.path}`;
    },
  });

  const key = await limiter.options.keyGenerator(ctx);
  const result = await limiter.check(key);

  if (!result.allowed) {
    ctx.status = 429;
    ctx.body = {
      code: 429,
      message: isVIP 
        ? 'VIP请求过于频繁' 
        : '请求过于频繁，升级VIP可提升限额至5倍',
    };
    return;
  }

  await next();
}
```

**使用**:
```javascript
router.get('/api/data/export', limit.userLevel, controller.data.export);
```

### 场景2：资源级别锁（用户+路由+资源ID）

**需求**: 限制用户对特定资源的操作频率。

```javascript
resourceLock: (resourceIdField = 'id') => {
  return async (ctx, next) => {
    const limiter = new RateLimiter({
      windowMs: 60 * 1000,
      max: 10, // 每分钟最多操作10次
      keyGenerator: (ctx) => {
        const userId = ctx.user?.id || ctx.ip;
        const resourceId = ctx.params[resourceIdField] || ctx.query[resourceIdField];
        return `resource:user:${userId}:${ctx.path}:${resourceId}`;
      },
    });

    const key = await limiter.options.keyGenerator(ctx);
    const result = await limiter.check(key);

    if (!result.allowed) {
      ctx.status = 429;
      ctx.body = {
        code: 429,
        message: '对该资源的操作过于频繁',
      };
      return;
    }

    await next();
  };
}
```

**使用**:
```javascript
// 限制用户对每篇文章的点赞频率
router.post('/api/posts/:id/like', limit.resourceLock('id'), controller.post.like);

// 限制用户对每篇文章的评论频率
router.post('/api/posts/:id/comment', limit.resourceLock('id'), controller.post.comment);
```

### 场景3：多租户限流

**需求**: 不同租户独立计数。

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (ctx) => {
    const tenantId = ctx.headers['x-tenant-id'] || 'default';
    const userId = ctx.user?.id || ctx.ip;
    return `tenant:${tenantId}:user:${userId}:${ctx.path}`;
  },
});
```

### 场景4：分布式业务锁（Redis）

**需求**: 多服务器共享限流数据。

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
});

module.exports = (options = {}) => {
  const limiter = new RateLimiter({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 100,
    algorithm: 'sliding-window',
    
    // 使用 Redis 存储
    store: new RedisStore({
      client: redis,
      prefix: 'business-lock:',
    }),
    
    // 业务锁键生成器
    keyGenerator: (ctx) => {
      const userId = ctx.user?.id || ctx.ip;
      return `user:${userId}:${ctx.path}`;
    },
  });

  return async (ctx, next) => {
    const key = await limiter.options.keyGenerator(ctx);
    const result = await limiter.check(key);

    if (!result.allowed) {
      ctx.status = 429;
      ctx.body = { code: 429, message: '请求过于频繁' };
      return;
    }

    await next();
  };
};
```

---

## 最佳实践

### 1. 用户ID提取策略

**支持多种认证方式的降级策略**:

```javascript
keyGenerator: (ctx) => {
  // 优先级：
  // 1. JWT 认证的用户ID
  const userId = ctx.user?.id 
    // 2. Session 中的用户ID
    || ctx.state?.user?.id 
    // 3. Session 存储的用户ID
    || ctx.session?.userId 
    // 4. 自定义 Header
    || ctx.headers['x-user-id']
    // 5. 降级到 IP
    || ctx.ip;
  
  return `user:${userId}:${ctx.path}`;
}
```

### 2. 路由识别

**支持动态路由**:

```javascript
keyGenerator: (ctx, context) => {
  // 优先使用 context.route（包含路由参数）
  const route = context?.route || ctx.path;
  // context.route: "/api/posts/:id"
  // ctx.path: "/api/posts/123"
  
  return `user:${userId}:${route}`;
}
```

### 3. 键命名规范

**推荐格式**: `类型:维度1:维度2:维度3`

```javascript
// 严格限制
`strict:user:${userId}:${route}`

// 普通限制
`normal:user:${userId}:${route}`

// VIP分级
`vip:user:${userId}:${route}`
`normal:user:${userId}:${route}`

// 多租户
`tenant:${tenantId}:user:${userId}:${route}`

// 资源锁
`resource:user:${userId}:${route}:${resourceId}`
```

### 4. 响应头设置

**始终设置限流响应头**:

```javascript
ctx.set('X-RateLimit-Limit', result.limit);
ctx.set('X-RateLimit-Remaining', result.remaining);
ctx.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

if (!result.allowed) {
  ctx.set('Retry-After', Math.ceil(result.retryAfter / 1000));
}
```

**前端可以使用这些头来显示限流状态**:

```javascript
// 前端示例
const response = await fetch('/api/login', { method: 'POST', body: ... });

if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  console.log(`请在 ${retryAfter} 秒后重试`);
}

const remaining = response.headers.get('X-RateLimit-Remaining');
console.log(`剩余 ${remaining} 次请求`);
```

### 5. 错误处理

**统一的错误响应格式**:

```javascript
if (!result.allowed) {
  ctx.status = 429;
  ctx.body = {
    code: 429,
    message: '请求过于频繁，请稍后再试',
    retryAfter: Math.ceil(result.retryAfter / 1000),
    userId: ctx.user?.id || 'guest',
    route: ctx.path,
    timestamp: Date.now(),
  };
  return;
}
```

### 6. 日志记录

**记录限流事件**:

```javascript
if (!result.allowed) {
  ctx.logger.warn('[RateLimit] Request blocked', {
    userId: ctx.user?.id || 'guest',
    ip: ctx.ip,
    route: ctx.path,
    limit: result.limit,
    current: result.current,
  });
  
  ctx.status = 429;
  ctx.body = { code: 429, message: '请求过于频繁' };
  return;
}
```

### 7. 生产环境建议

#### ✅ 使用 Redis 存储

```javascript
const Redis = require('ioredis');
const { RedisStore } = require('flex-rate-limit');

const store = new RedisStore({
  client: new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  }),
  prefix: 'rl:',
});
```

#### ✅ 配置监控

```javascript
// 记录限流统计
let blockedCount = 0;
let totalRequests = 0;

const result = await limiter.check(key);
totalRequests++;

if (!result.allowed) {
  blockedCount++;
  // 发送到监控系统（如 Prometheus）
}
```

#### ✅ 动态配置

```javascript
// 从配置中心读取限流配置
const config = await configCenter.get('rate-limit');

const limiter = new RateLimiter({
  windowMs: config.windowMs,
  max: config.max,
  // ...
});
```

---

## 常见问题

### Q1: 如何测试业务锁？

```javascript
// test/business-lock.test.js
const { RateLimiter } = require('flex-rate-limit');

describe('Business Lock', () => {
  it('should limit per user per route', async () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      max: 5,
      keyGenerator: (ctx) => `user:${ctx.user.id}:${ctx.path}`,
    });

    // 用户1在路由A
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check('user:1:/api/login');
      assert.equal(result.allowed, true);
    }

    // 第6次应该被限制
    const result = await limiter.check('user:1:/api/login');
    assert.equal(result.allowed, false);

    // 用户2在路由A - 不应该被影响
    const result2 = await limiter.check('user:2:/api/login');
    assert.equal(result2.allowed, true);

    // 用户1在路由B - 不应该被影响
    const result3 = await limiter.check('user:1:/api/posts');
    assert.equal(result3.allowed, true);
  });
});
```

### Q2: 如何重置特定用户的限流？

```javascript
// 重置特定用户在特定路由的限流
await limiter.reset('user:123:/api/login');

// 在控制器中使用
async resetUserLimit(ctx) {
  const userId = ctx.params.userId;
  const route = ctx.request.body.route;
  const key = `user:${userId}:${route}`;
  
  await limiter.reset(key);
  
  ctx.body = { message: '限流已重置' };
}
```

### Q3: 如何查看当前限流状态？

```javascript
async checkLimitStatus(ctx) {
  const userId = ctx.user.id;
  const route = '/api/login';
  const key = `user:${userId}:${route}`;
  
  const result = await limiter.check(key, { req: ctx });
  
  ctx.body = {
    limit: result.limit,
    current: result.current,
    remaining: result.remaining,
    resetTime: new Date(result.resetTime).toISOString(),
  };
}
```

---

## 总结

### 业务锁优势

✅ **精细化控制**: 每个用户在每个接口独立计数  
✅ **公平分配**: 用户之间互不影响  
✅ **防止滥用**: 绑定用户ID，无法通过换IP绕过  
✅ **灵活配置**: 支持多种维度组合  
✅ **生产就绪**: Redis支持分布式部署

### 适用场景

- ✅ API限流
- ✅ 登录保护
- ✅ 防刷接口
- ✅ 资源操作限制
- ✅ 多租户系统
- ✅ VIP分级服务

### 相关资源

- **完整示例**: `examples/egg-business-lock-example.js`
- **API文档**: `docs/api-reference.md`
- **高级用法**: `docs/advanced.md`

---

## 📚 相关文档

**配置参考**：
- 📖 [配置详解](config.md) - keyGenerator配置说明
- 📖 [高级用法](advanced.md) - 自定义键生成器详解

**基础知识**：
- 📖 [快速开始](quickstart.md) - 基本用法和快速集成

**返回**：
- 📖 [文档中心](README.md) - 查看所有文档和学习路径

---

**最后更新**: 2026-02-05





