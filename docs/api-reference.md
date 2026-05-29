# API 参考

## 📚 目录

- [RateLimiter 类](#ratelimiter-类)
  - [构造函数](#构造函数)
  - [方法](#方法)
    - [check(key, options)](#checkkey-options)
    - [middleware()](#middleware)
    - [reset(key)](#resetkey)
- [配置选项](#配置选项)
  - [windowMs](#windowms)
  - [max](#max)
  - [algorithm](#algorithm)
  - [store](#store)
  - [keyGenerator](#keygenerator)
  - [skip](#skip)
  - [handler](#handler)
  - [headers](#headers)
  - [perRoute](#perroute)
- [Store 接口](#store-接口)
  - [get(key)](#getkey)
  - [set(key, value, ttl)](#setkey-value-ttl)
  - [increment(key, options)](#incrementkey-options)
  - [reset(key)](#resetkey-1)
- [预定义键生成器](#预定义键生成器)
- [响应头](#响应头)

---

## RateLimiter 类

### 构造函数

```javascript
const limiter = new RateLimiter(options);
```

### 方法

#### check(key, options)

检查请求是否在限流内。

```javascript
const result = await limiter.check('user-123', { route: '/api/data' });

// result 对象包含：
// {
//   allowed: boolean,      // 是否允许请求
//   limit: number,         // 限制数
//   current: number,       // 当前计数
//   remaining: number,     // 剩余请求数
//   resetTime: number,     // 重置时间（毫秒）
//   retryAfter: number,    // 重试等待时间（毫秒）
// }
```

#### middleware()

创建中间件函数。

```javascript
const middleware = limiter.middleware();

// Express
app.use(middleware);

// Koa
app.use(middleware);
```

#### reset(key)

重置特定键的限制计数。

```javascript
await limiter.reset('user-123');
```

#### resetAll()

重置所有键的限制计数。

```javascript
await limiter.resetAll();
```

## 响应头

当设置 `headers: true` 时，会添加以下响应头：

- `X-RateLimit-Limit` - 允许的最大请求数
- `X-RateLimit-Remaining` - 当前窗口剩余请求数
- `X-RateLimit-Reset` - 速率限制重置的时间（Unix 时间戳）
- `Retry-After` - 重试前等待的秒数（仅在速率受限时）

## 导出

### RateLimiter

主类，用于创建限流器实例。

```javascript
const { RateLimiter } = require('rate-limit');
```

### RedisStore

Redis 存储后端。

```javascript
const { RedisStore } = require('rate-limit');
```

### MemoryStore

内存存储后端（通常不需要直接使用）。

```javascript
const { MemoryStore } = require('rate-limit');
```

### keyGenerators

预定义的键生成器对象。

```javascript
const { keyGenerators } = require('rate-limit');

// 可用的生成器：
// - keyGenerators.ip
// - keyGenerators.userId
// - keyGenerators.routeAndIp
// - keyGenerators.apiEndpoint
// - keyGenerators.userAndRoute
```

## 错误处理

### 常见错误

```javascript
try {
  const result = await limiter.check('user-123');
} catch (error) {
  if (error.message.includes('windowMs')) {
    // windowMs 配置错误
  } else if (error.message.includes('max')) {
    // max 配置错误
  } else if (error.message.includes('algorithm')) {
    // algorithm 配置错误
  } else if (error.message.includes('键')) {
    // 键为空或非法
  } else {
    // 其他错误
  }
}
```

## 示例代码

### 基本使用

```javascript
const { RateLimiter } = require('rate-limit');

const limiter = new RateLimiter({
  windowMs: 60000,
  max: 10,
});

const result = await limiter.check('user-123');
if (result.allowed) {
  console.log('请求被允许');
} else {
  console.log('超过限制，请等待', result.retryAfter, 'ms');
}
```

### 中间件使用

```javascript
const express = require('express');
const { RateLimiter } = require('rate-limit');

const app = express();
const limiter = new RateLimiter({
  windowMs: 60000,
  max: 100,
});

// 全局应用
app.use(limiter.middleware());

// 或特定路由
app.get('/api/data', limiter.middleware(), (req, res) => {
  res.json({ data: 'success' });
});
```

### Redis 使用

```javascript
const { RateLimiter, RedisStore } = require('rate-limit');
const Redis = require('ioredis');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  windowMs: 60000,
  max: 100,
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
});
```

---

## 📚 相关文档

**使用指南**：
- 📖 [快速开始](quickstart.md) - 快速上手和集成
- 📖 [配置详解](config.md) - 配置选项详细说明
- 📖 [高级用法](advanced.md) - 高级功能和自定义

**返回**：
- 📖 [文档中心](README.md) - 查看所有文档和学习路径

### 动态限制

```javascript
const limiter = new RateLimiter({
  windowMs: 60000,
  max: async (req) => {
    const user = await getUser(req.user.id);
    return user.isPremium ? 1000 : 100;
  },
});
```

### 自定义处理

```javascript
const limiter = new RateLimiter({
  windowMs: 60000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({
      error: '请求过于频繁',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});
```




