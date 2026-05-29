# 高级用法

## ⚠️ 重要提示

在开始之前，请先了解 **IP 白名单与限流的配置关系**：

### 配置场景快速参考

| 配置情况 | 效果 | 适用场景 |
|---------|------|---------|
| 只配置限流 | 所有 IP 可访问 + 限流 | 公开 API |
| 只配置白名单 | 白名单 IP 无限制访问 | ⚠️ 不推荐 |
| 白名单 + 限流 | 白名单验证 → 限流检查 | ✅ 推荐 |
| 全局白名单 | 所有路由通用 + 各自限流 | 办公室网络 |

**关键要点**：
- 未配置白名单 = 允许所有 IP（不是拒绝）
- 白名单 IP 也会被限流（独立版本）
- 推荐配置：白名单 + 限流一起使用

**详细说明**: [配置场景详解](whitelist-ratelimit-config-scenarios.md) | [独立性说明](whitelist-ratelimit-independence.md)

---

## 📚 目录

- [不同路由的不同限制](#不同路由的不同限制)
  - [Express 示例](#express-示例)
  - [Koa 示例](#koa-示例)
  - [路由参数说明](#路由参数说明)
- [动态限制（按用户等级）](#动态限制按用户等级)
- [自定义键生成器](#自定义键生成器)
  - [按IP限制](#按ip限制)
  - [按用户ID限制](#按用户id限制)
  - [按用户和路由限制（业务锁）](#按用户和路由限制业务锁)
  - [按API密钥限制](#按api密钥限制)
- [IP 白名单与黑名单](#ip-白名单与黑名单-)
  - [基础 IP 白名单](#基础-ip-白名单)
  - [路由级白名单](#路由级白名单只允许特定-ip-访问)
  - [IP 段白名单](#ip-段白名单cidr-支持)
  - [环境变量配置](#环境变量配置白名单生产环境推荐)
  - [黑名单模式](#黑名单模式限制特定-ip)
  - [组合白名单](#组合白名单ip--用户角色)
- [跳过某些请求](#跳过条件通用)
- [自定义限流响应](#自定义限流响应)
- [Redis 分布式存储](#redis-分布式存储)
- [自定义存储后端](#自定义存储后端)

---

## 不同路由的不同限制

### Express 示例

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100, // 默认限制
  
  perRoute: {
    // 登录端点：15分钟最多5次尝试
    '/api/login': {
      windowMs: 15 * 60 * 1000,
      max: 5,
    },
    
    // 带路由参数的登录：每个用户ID单独限制
    // 路由参数 :id 会被匹配为正则表达式 [^/]+
    // 支持 /api/login/123, /api/login/abc 等
    '/api/login/:id': {
      windowMs: 15 * 60 * 1000,
      max: 5, // 每个用户ID的15分钟限制为5次
    },
    
    // 注册端点：24小时最多3次注册
    '/api/register': {
      windowMs: 24 * 60 * 60 * 1000,
      max: 3,
    },
    
    // 用户详情：多个路由参数
    // 支持 /api/users/123, /api/users/abc 等
    '/api/users/:id': {
      windowMs: 60000,
      max: 50,
    },
    
    // 更复杂的路由参数
    // 支持 /api/posts/123/comments/456
    '/api/posts/:postId/comments/:commentId': {
      windowMs: 60000,
      max: 30,
    },
    
    // 文件上传：1小时最多10次上传
    '/api/upload': {
      windowMs: 60 * 60 * 1000,
      max: 10,
    },
  },
});

app.use(limiter.middleware());
```

### Egg.js 路由级别应用（最实用方案）

这是最推荐的方式 - 在路由定义时直接添加限流中间件，就像添加身份验证中间件一样！

#### 第 1 步：创建限流中间件工厂

**文件**: `app/middleware/rate-limit.js`

```javascript
const { RateLimiter } = require('rate-limit');

module.exports = (app) => {
  return {
    strict: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
      });
      const result = await limiter.check(ctx.ip, { route: ctx.path });
      
      ctx.set('X-RateLimit-Limit', result.limit);
      ctx.set('X-RateLimit-Remaining', result.remaining);
      
      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '请求过于频繁' };
        return;
      }
      await next();
    },
    
    normal: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 50,
      });
      const result = await limiter.check(ctx.ip, { route: ctx.path });
      
      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '请求过于频繁' };
        return;
      }
      await next();
    },
    
    relaxed: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 1000,
        max: 200,
      });
      const result = await limiter.check(ctx.ip, { route: ctx.path });
      
      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: '请求过于频繁' };
        return;
      }
      await next();
    },
    
    custom: (windowMs, max) => {
      return async (ctx, next) => {
        const limiter = new RateLimiter({ windowMs, max });
        const result = await limiter.check(ctx.ip, { route: ctx.path });
        
        if (!result.allowed) {
          ctx.status = 429;
          ctx.body = { code: 429, message: '请求过于频繁' };
          return;
        }
        await next();
      };
    },
  };
};
```

#### 第 2 步：在路由中使用

**文件**: `app/router.js`

```javascript
module.exports = (app) => {
  const { router, controller, middleware } = app;
  const limit = middleware.rateLimit(app);
  const baseAuth = middleware.baseAuth;

  // 认证相关 - 严格限制
  router.post('/api/login', limit.strict, controller.auth.login);
  router.post('/api/register', limit.strict, controller.auth.register);

  // 用户相关 - 宽松限制
  router.get('/api/users', limit.relaxed, controller.user.list);
  router.get('/api/users/:id', limit.relaxed, controller.user.detail);

  // 文件相关 - 中等限制
  router.post('/api/upload', baseAuth, limit.normal, controller.file.upload);

  // 特殊端点 - 自定义限制
  router.get('/sse',
    baseAuth,
    limit.custom(60 * 1000, 20),
    controller.stream.sse
  );
};
```

#### 第 3 步：app.js 注册

```javascript
module.exports = (app) => {
  const rateLimitFactory = require('./app/middleware/rate-limit');
  app.middleware.rateLimit = rateLimitFactory(app);
};
```

## 自定义键生成器

### 为什么需要键生成器？

**键生成器决定"按什么维度限流"**，不同的维度有不同的效果。

### 键生成器对比

| 键生成器 | 生成的Key示例 | 实际效果 | 适用场景 | 优缺点 |
|---------|-------------|---------|---------|--------|
| **按IP** | `192.168.1.1` | 同一IP下所有用户共享限额 | 公开API | ❌ 公司/网吧所有人共享 |
| **按用户** | `user:123` | 每个用户独立限额 | 登录后API | ✅ 公平；❌ 未登录用户不限制 |
| **按路由+IP** | `192.168.1.1:/api/login` | 同一IP在每个路由上独立限额 | 混合场景 | ✅ 路由隔离；❌ 同IP用户共享 |
| **按用户+路由** | `user:123:/api/login` | 每个用户在每个路由上独立限额 | 业务系统 ⭐ | ✅ 最精细；✅ 完全隔离 |

### 实际场景对比

#### 场景：公司网络（50个员工共享同一IP）

**情况1：按IP限制**
```javascript
keyGenerator: 'ip'  // Key: 192.168.1.1

// 配置：1分钟100次
// 实际效果：
// - 50个员工共享100次配额
// - 员工A用了50次，其他49个人只剩50次
// ❌ 问题：互相影响，不公平
```

**情况2：按用户限制**
```javascript
keyGenerator: 'userId'  // Key: user:1, user:2, user:3, ...

// 配置：1分钟100次
// 实际效果：
// - 每个员工独立100次配额
// - 员工A用了100次，不影响员工B
// ✅ 优势：公平，互不影响
```

**情况3：按用户+路由限制（业务锁）**
```javascript
keyGenerator: 'userAndRoute'  
// Key: user:1:/api/login, user:1:/api/data, user:2:/api/login, ...

// 配置：1分钟100次
// 实际效果：
// - 每个员工在每个接口上独立100次配额
// - 员工A在/api/login用了100次，不影响他在/api/data的配额
// - 也不影响员工B的任何配额
// ✅ 优势：最精细的控制，完全隔离
```

---

### 预定义键生成器详解

```javascript
const { RateLimiter } = require('flex-rate-limit');

// 1. 按 IP 限制（默认）
const limiter1 = new RateLimiter({
  keyGenerator: 'ip',  // 生成Key: 192.168.1.1
});
// ✅ 适用：公开API，无需登录
// ❌ 问题：同一IP的所有用户共享限额

// 2. 按用户 ID 限制
const limiter2 = new RateLimiter({
  keyGenerator: 'userId',  // 生成Key: user:123
});
// ✅ 适用：需要登录的API
// ⚠️ 注意：未登录用户会回退到IP限制

// 3. 按路由+IP 限制
const limiter3 = new RateLimiter({
  keyGenerator: 'routeAndIp',  // 生成Key: 192.168.1.1:/api/login
});
// ✅ 适用：不同接口需要不同限制
// ❌ 问题：同一IP的用户仍然共享

// 4. 按API端点限制
const limiter4 = new RateLimiter({
  keyGenerator: 'apiEndpoint',  // 生成Key: /api/v1/data:192.168.1.1
});
// ✅ 适用：RESTful API，按端点独立限制

// 5. 按用户+路由限制（业务锁，推荐）⭐
const limiter5 = new RateLimiter({
  keyGenerator: 'userAndRoute',  // 生成Key: user:123:/api/login
});
// ✅ 适用：业务系统（推荐）
// ✅ 优势：最精细的控制，完全隔离
```

---

### 自定义键生成器

#### 示例1：按IP限制

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req) => req.ip,
  // 生成Key: 192.168.1.1
  // 实际效果：同一IP的所有请求共享限额
});
```

#### 示例2：按用户ID限制

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req) => {
    const userId = req.user?.id || req.ip;
    return `user:${userId}`;
    // 登录用户: user:123
    // 未登录用户: user:192.168.1.1
    // 实际效果：每个用户独立限额，未登录按IP
  },
});
```

#### 示例3：按用户+路由限制（业务锁）⭐

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req, context) => {
    const userId = req.user?.id || req.ip;
    const route = context?.route || req.path;
    return `user:${userId}:${route}`;
    // 生成Key: user:123:/api/login
    // 实际效果：每个用户在每个路由上独立限额
  },
});

// 为什么推荐这种方式？
// ✅ 完全隔离：用户A在登录接口的限流不影响查询接口
// ✅ 公平性：不同用户互不影响
// ✅ 精确控制：可以为每个接口设置不同限制
```

#### 示例4：按API密钥限制

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    return `apikey:${apiKey || req.ip}`;
    // 有API Key: apikey:sk_1234567890
    // 无API Key: apikey:192.168.1.1
    // 实际效果：按API Key限流，适合开放平台
  },
});
```

---

### 键生成器选择决策树

```
开始
│
├─ 是否有用户登录系统？
│  ├─ 否 → 按IP限制（ip）
│  └─ 是 ↓
│
├─ 是否需要区分不同接口？
│  ├─ 否 → 按用户限制（userId）
│  └─ 是 ↓
│
└─ 每个用户在每个接口是否需要独立限额？
   ├─ 是 → 按用户+路由限制（userAndRoute）⭐ 推荐
   └─ 否 → 按路由+IP限制（routeAndIp）
```

---

## 动态限制（按用户等级）

```javascript
// 根据用户等级设置不同的限制
const limiter = new RateLimiter({
  max: async (req) => {
    const user = await getUserFromRequest(req);
    
    // 不同用户等级有不同的限制
    const limits = {
      free: 100,      // 免费用户：100次/分钟
      basic: 500,     // 基础用户：500次/分钟
      premium: 5000,  // 高级用户：5000次/分钟
      enterprise: Infinity, // 企业用户：无限制
    };
    
    return limits[user?.tier || 'free'];
  },
});
```

## 自定义键生成器

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req) => {
    // 根据用户 ID 而不是 IP 限制速率
    // 如果未登录，使用 IP 作为备用
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip}`;
  },
});
```

## IP 白名单与黑名单 ⭐

使用 `skip` 选项可以实现 IP 白名单功能，允许特定 IP 地址跳过限流或实现更精细的访问控制。

### ⚠️ 配置前必读

在配置 IP 白名单前，请先了解四个核心配置场景：

#### 1. 只配置限流，不配置白名单
```javascript
// 不配置白名单中间件
app.get('/api/data', createRateLimiter({ max: 100 }), handler);
// 效果：所有 IP 可访问 + 限流 100次/分钟
```

#### 2. 只配置白名单，不配置限流 ⚠️
```javascript
// 不配置限流中间件
app.get('/api/admin', ipWhitelistMiddleware('/api/admin'), handler);
// 效果：非白名单 403 / 白名单无限制访问（不推荐）
```

#### 3. 白名单 + 限流都配置 ✅
```javascript
// 推荐配置
app.get('/api/admin',
  ipWhitelistMiddleware('/api/admin'),  // 白名单验证
  createRateLimiter({ max: 200 }),      // 限流控制
  handler
);
// 效果：非白名单 403 / 白名单通过后仍受限流
```

#### 4. 全局白名单 ✅
```bash
# 环境变量
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100
# 效果：这些 IP 可访问所有路由，但仍受各路由限流
```

**详细说明**: [配置场景完整文档](whitelist-ratelimit-config-scenarios.md)

---

### 基础 IP 白名单

```javascript
// 定义白名单 IP 列表
const whitelistIPs = ['127.0.0.1', '::1', '192.168.1.100', '10.0.0.50'];

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => {
    const clientIP = req.ip || req.socket?.remoteAddress;
    // 白名单内的 IP 完全跳过限流
    return whitelistIPs.includes(clientIP);
  },
});

app.use(limiter.middleware());
```

### 路由级白名单（只允许特定 IP 访问）

```javascript
// 管理员接口：只允许特定 IP 访问
const adminWhitelist = ['192.168.1.10', '192.168.1.11'];

const adminLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => {
    const clientIP = req.ip || req.socket?.remoteAddress;
    // 不在白名单 = 拒绝访问
    return !adminWhitelist.includes(clientIP);
  },
  handler: (req, res) => {
    // 自定义拒绝消息
    res.status(403).json({
      error: '访问被拒绝',
      message: '只有授权的 IP 地址可以访问此资源',
    });
  },
});

app.use('/api/admin', adminLimiter.middleware());
```

### IP 段白名单（CIDR 支持）

```javascript
// 推荐使用 ipaddr.js 或 ip-range-check 库
const ipaddr = require('ipaddr.js');

const allowedRanges = ['192.168.1.0/24', '10.0.0.0/8'];

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  skip: (req) => {
    const clientIP = req.ip || req.socket?.remoteAddress;
    
    try {
      const addr = ipaddr.parse(clientIP);
      return allowedRanges.some((range) => {
        const [subnet, bits] = range.split('/');
        const subnetAddr = ipaddr.parse(subnet);
        return addr.match(subnetAddr, parseInt(bits));
      });
    } catch (err) {
      return false; // 无效 IP，不跳过限流
    }
  },
});

app.use('/api/internal', limiter.middleware());
```

### 环境变量配置白名单（生产环境推荐）

```javascript
// 从环境变量读取白名单
const whitelistIPs = (process.env.IP_WHITELIST || '').split(',').filter(Boolean);

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => {
    if (whitelistIPs.length === 0) {
      return false; // 未配置白名单，不跳过
    }
    const clientIP = req.ip || req.socket?.remoteAddress;
    return whitelistIPs.includes(clientIP);
  },
});

// 启动命令示例：
// IP_WHITELIST=127.0.0.1,192.168.1.100 node app.js
```

### 黑名单模式（限制特定 IP）

```javascript
const blacklistIPs = ['1.2.3.4', '5.6.7.8']; // 恶意 IP

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: (req) => {
    const clientIP = req.ip || req.socket?.remoteAddress;
    // 黑名单 IP 获得极低限额
    if (blacklistIPs.includes(clientIP)) {
      return 1; // 每分钟只能 1 次
    }
    return 100; // 正常限额
  },
});
```

### 组合白名单（IP + 用户角色）

```javascript
const vipIPs = ['192.168.1.200', '192.168.1.201'];

const smartLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: async (req) => {
    const clientIP = req.ip || req.socket?.remoteAddress;
    const isVIPIP = vipIPs.includes(clientIP);
    const isVIPUser = req.user?.tier === 'premium';
    
    if (isVIPIP || isVIPUser) {
      return 1000; // VIP 限额
    }
    return 100; // 普通限额
  },
  skip: (req) => {
    // 管理员完全跳过限流
    return req.user?.role === 'admin';
  },
});
```

### 白名单最佳实践

| 场景 | 实现方式 | 示例 |
|------|---------|------|
| **内部 API** | IP 段白名单 | `192.168.0.0/16`、`10.0.0.0/8` |
| **管理后台** | 严格 IP 白名单 + 403 拒绝 | 只允许办公室 IP |
| **VIP 用户** | 组合白名单（IP + 角色） | 特定 IP 或高级用户更高限额 |
| **生产环境** | 环境变量配置 | `IP_WHITELIST=1.2.3.4,5.6.7.8` |
| **防护恶意 IP** | 黑名单 + 低限额 | 已知攻击 IP 限制为 1 次/分钟 |

**完整示例文件**: `examples/ip-whitelist-example.js`

---

## 跳过条件（通用）

除了 IP 白名单，`skip` 选项还支持其他跳过条件：

```javascript
const limiter = new RateLimiter({
  skip: (req) => {
    // 1. 跳过管理员用户
    if (req.user?.role === 'admin') {
      return true;
    }
    
    // 2. 跳过健康检查端点
    if (req.path === '/health' || req.path === '/metrics') {
      return true;
    }
    
    // 3. 跳过内部请求（本地 IP）
    if (req.ip === '127.0.0.1' || req.ip === '::1') {
      return true;
    }
    
    // 4. 跳过特定 User-Agent（监控工具）
    if (req.headers['user-agent']?.includes('Monitor')) {
      return true;
    }
    
    return false;
  },
});
```

## 手动速率限制检查

```javascript
const result = await limiter.check('user-123');

if (result.allowed) {
  console.log(`请求被允许`);
  console.log(`剩余：${result.remaining}/${result.limit}`);
  console.log(`重置时间：${new Date(result.resetTime)}`);
} else {
  console.log(`超过限制`);
  console.log(`重试间隔：${result.retryAfter}ms`);
}
```

## 重置速率限制

```javascript
// 重置特定键的限制计数
await limiter.reset('user-123');

// 重置所有键（仅限内存存储）
await limiter.resetAll();
```

---

## 📚 相关文档

**深入学习**：
- 📖 [业务锁指南](business-lock-guide.md) - 业务系统最佳实践
- 📖 [存储后端](storage.md) - Redis集群配置和性能优化

**基础知识**：
- 📖 [配置详解](config.md) - 配置选项详细说明
- 📖 [快速开始](quickstart.md) - 基础用法和快速集成

**返回**：
- 📖 [文档中心](README.md) - 查看所有文档和学习路径





