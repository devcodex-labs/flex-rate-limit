# 配置详解

## 📚 目录

- [快速开始](#快速开始)
- [核心配置项](#核心配置项)
  - [1. windowMs - 时间窗口（必需）](#1-windowms---时间窗口必需)
  - [2. max - 最大请求数（必需）](#2-max---最大请求数必需)
  - [3. algorithm - 限流算法（可选）](#3-algorithm---限流算法可选)
  - [4. store - 存储后端（可选）](#4-store---存储后端可选)
  - [5. keyGenerator - 键生成器（可选）](#5-keygenerator---键生成器可选)
  - [6. 其他配置项](#6-其他配置项)
- [完整配置示例](#完整配置示例)
- [参数速查表](#参数速查表)
- [实战配置场景](#实战配置场景)
  - [场景1：登录保护（严格限制）](#场景1登录保护严格限制)
  - [场景2：敏感操作（中等限制）](#场景2敏感操作中等限制)
  - [场景3：数据修改（普通限制）](#场景3数据修改普通限制)
  - [场景4：API查询（宽松限制）](#场景4api查询宽松限制)
  - [场景5：公开API（高频限制）](#场景5公开api高频限制)
  - [场景6：用户等级分级](#场景6用户等级分级)
  - [场景7：分布式系统（Redis）](#场景7分布式系统redis)
- [推荐配置速查表](#推荐配置速查表)
- [Redis 存储配置](#redis-存储配置)

---

## 快速开始

最简单的配置：

```javascript
const { RateLimiter } = require('flex-rate-limit');

// 默认配置：1分钟内最多100次请求
const limiter = new RateLimiter({
  windowMs: 60 * 1000,  // 1分钟
  max: 100,             // 最多100次
});
```

⚠️ **重要提示**：
- 默认值 `max: 100` 仅作为示例，**请根据实际业务调整**
- 登录等敏感接口建议设置为 `5-10`
- 公开API建议设置为 `1000+`（配合更长的时间窗口）

---

## 核心配置项

### 1. windowMs - 时间窗口（必需）

**说明**：限流的时间范围（毫秒）

```javascript
windowMs: 60 * 1000        // 1分钟 = 60秒
windowMs: 15 * 60 * 1000   // 15分钟
windowMs: 60 * 60 * 1000   // 1小时
```

**推荐配置**：
- 登录/注册：`15 * 60 * 1000`（15分钟）
- API查询：`60 * 1000`（1分钟）
- 数据修改：`60 * 60 * 1000`（1小时）

**默认值**：`60000`（1分钟）

---

### 2. max - 最大请求数（必需）

**说明**：在时间窗口内允许的最大请求次数

```javascript
// 方式1：固定数字
max: 5        // 最多5次
max: 100      // 最多100次

// 方式2：动态函数（根据用户等级）
max: async (req) => {
  if (req.user?.vip) return 1000;  // VIP用户
  return 100;                       // 普通用户
}
```

**推荐配置**：
- 登录/注册：`5`（严格限制，防暴力破解）⭐⭐⭐
- 敏感操作：`10`（修改密码、支付等）
- 数据修改：`50`（创建、更新、删除）
- API查询：`100`（列表、详情等）
- 高频查询：`200-500`（搜索、统计等）
- 公开API：`1000+`（开放接口）

**默认值**：`100`（仅作示例，请根据业务调整）

---

### 3. algorithm - 限流算法（可选）

**说明**：选择限流算法，不同算法有不同特性

```javascript
algorithm: 'sliding-window'  // 滑动窗口（默认，推荐）
algorithm: 'fixed-window'    // 固定窗口（高并发）
algorithm: 'token-bucket'    // 令牌桶（允许突发）
algorithm: 'leaky-bucket'    // 漏桶（平滑流量）
```

**默认值**：`'sliding-window'`（最精确）

#### 快速对比

| 算法 | 精确度 | 内存 | 适用场景 | 推荐度 | 详细文档 |
|------|--------|------|---------|--------|---------|
| **sliding-window** | ⭐⭐⭐⭐⭐ | 高 | API限流、登录保护 | ⭐⭐⭐⭐⭐ | [👉 详细说明](#1-sliding-window滑动窗口---默认推荐-) |
| **fixed-window** | ⭐⭐ | 低 | 高并发、低精度 | ⭐⭐⭐ | [👉 详细说明](#2-fixed-window固定窗口---高并发场景) |
| **token-bucket** | ⭐⭐⭐⭐ | 低 | API网关、允许突发 | ⭐⭐⭐⭐ | [👉 详细说明](#3-token-bucket令牌桶---允许突发) |
| **leaky-bucket** | ⭐⭐⭐⭐ | 低 | 流量整形、保护后端 | ⭐⭐⭐⭐ | [👉 详细说明](#4-leaky-bucket漏桶---平滑流量) |

💡 **算法对比文档**：
- 📖 [算法对比指南](algorithms-comparison.md) - 选择决策、配置示例、实战推荐
- 📖 [算法深度分析](algorithms-deep-analysis.md) - 实现原理、瞬时超频分析、源码解读

#### 算法详解

**1. sliding-window（滑动窗口）** - 默认推荐 ⭐⭐⭐⭐⭐

```javascript
// 配置：windowMs: 60000 (60秒), max: 100
```

**工作方式**：
- 每次请求都检查"往前推60秒"内的所有请求数
- 任意连续60秒内严格≤100次
- 0ms时刻100个请求全部允许，第101个拒绝
- 0ms的请求在60000ms时过期，此时可以再发新请求

**特点**：
- ✅ 最精确：任意时刻都精确限制
- ✅ 无边界问题：不会出现窗口切换时的超频
- ✅ 支持并发：瞬间100个请求全部允许（不是"不允许突发"）
- ❌ 内存占用高：需要存储所有请求时间戳

**适用**：API限流、登录保护、需要精确控制的场景

---

**2. fixed-window（固定窗口）** - 高并发场景

```javascript
// 配置：windowMs: 60000 (60秒), max: 100
```

**工作方式**：
- 时间分为固定的窗口：[0-60s)、[60-120s)、[120-180s)...
- 每个窗口内独立计数，最多100次
- 窗口切换时计数器重置为0

**边界问题示例**：
```
窗口0 [0-60s):   59秒时发送100次 → ✅ 允许
窗口1 [60-120s): 60秒时发送100次 → ✅ 允许
结果：连续2秒内发送了200次！（本应60秒内≤100次）
```

**特点**：
- ✅ 最快速：O(1)复杂度，内存占用最低
- ⚠️ 边界超频：窗口交界处可能瞬间允许2倍请求（200次）
- ⚠️ 不精确：不符合"任意连续60秒"的语义

**适用**：10万+ QPS高并发场景，可接受边界超频

---

**3. token-bucket（令牌桶）** - 允许突发

```javascript
// 配置：capacity: 100, refillRate: 100 (每秒100个), windowMs: 1000
```

**工作方式**：
- 桶初始有100个令牌（满）
- 每秒补充100个令牌（最多补到100）
- 每个请求消耗1个令牌
- 有令牌就立即处理，没有就拒绝

**实际表现**：
```
场景：桶满时瞬间发送150个请求
0ms:    请求1-100  → 立即处理（消耗100令牌，桶空）✅
0ms:    请求101-150 → 拒绝（无令牌）❌
10ms:   补充1个令牌
10ms:   请求151    → 立即处理 ✅
```

**与 sliding-window 的区别**：

| 维度 | sliding-window | token-bucket |
|------|----------------|--------------|
| **突发处理** | 瞬间100个，立即允许 | 瞬间100个，立即处理 |
| **后续请求** | 60秒后才能发新请求 | 每10ms可发1个新请求（持续补充） |
| **适用场景** | 严格限制（登录等） | 允许持续流量（API网关） |

**核心差异**：
- sliding-window：100次用完后要等60秒
- token-bucket：100次用完后按速率持续补充（每10ms补1个）

**特点**：
- ✅ 允许突发：桶满时可瞬间处理capacity个请求
- ✅ 持续可用：按refillRate持续补充令牌
- ✅ 用户体验好：不会长时间完全阻塞

**适用**：API网关、允许持续高频请求的场景

---

**4. leaky-bucket（漏桶）** - 平滑流量

```javascript
// 配置：capacity: 100, leakRate: 100 (每秒漏100个), windowMs: 1000
```

**工作方式**：
- 请求进入桶（不立即处理）
- 以恒定速率"漏出"（处理）：每秒100个 = 每10ms处理1个
- 桶满时拒绝新请求

**实际表现**：
```
场景：瞬间发送100个请求
0ms:    请求1-100  → 放入桶 ✅（不是立即处理！）
0ms:    开始以恒定速率漏出
10ms:   处理第1个请求
20ms:   处理第2个请求
...
1000ms: 处理完第100个请求

对比 token-bucket：
- token-bucket：0ms时立即处理完100个 ✅
- leaky-bucket：0-1000ms内匀速处理完 🐌
```

**"恒定速率"的具体值**：
- 配置：leakRate: 100, windowMs: 1000
- 恒定速率 = 每秒漏出100个 = 每10ms漏1个
- **这就是"恒定"的具体意思：每10ms处理1个请求**

**特点**：
- ✅ 恒定输出：严格按leakRate处理（每10ms处理1个）
- ✅ 平滑流量：削峰填谷，保护后端
- ❌ 体验稍差：突发请求需要排队等待（不是立即处理）

**适用**：保护后端系统、需要恒定输出速率的场景

📖 **详细文档**：
- [算法对比指南](algorithms-comparison.md) - 使用场景、配置示例、选择决策
- [算法深度分析](algorithms-deep-analysis.md) - 实现原理、瞬时超频分析

---

### 4. store - 存储后端（可选）

**说明**：存储限流数据的位置

```javascript
// 方式1：内存存储（默认，单服务器）
store: 'memory'

// 方式2：Redis连接字符串
store: 'redis://localhost:6379'

// 方式3：Redis Store实例（推荐）
const Redis = require('ioredis');
const { RedisStore } = require('flex-rate-limit');

store: new RedisStore({
  client: new Redis({ host: '127.0.0.1', port: 6379 }),
  prefix: 'rl:',
})
```

**默认值**：`'memory'`

**选择建议**：
- 单服务器：使用 `memory`（快速、简单）
- 多服务器：使用 `Redis`（分布式、数据共享）

---

### 5. keyGenerator - 键生成器（可选）

**说明**：生成唯一的限流键，决定"按什么维度限流"

```javascript
const { keyGenerators } = require('flex-rate-limit');

// 预定义生成器（函数引用）
keyGenerator: keyGenerators.ip            // 按IP限流
keyGenerator: keyGenerators.userId        // 按用户ID限流
keyGenerator: keyGenerators.userAndRoute  // 按用户+路由限流（业务锁）⭐

// 自定义函数
keyGenerator: (req, context) => {
  const userId = req.user?.id || req.ip;
  const route = context?.route || req.path;
  return `user:${userId}:${route}`;
}
```

**默认值**：按IP限流

**常见场景**：
- 按IP：`keyGenerators.ip`（公开API）
- 按用户：`keyGenerators.userId`（登录后API）
- 按用户+路由：`keyGenerators.userAndRoute`（业务锁，推荐）⭐

📖 **详细说明**：[business-lock-guide.md](business-lock-guide.md)

---

### 6. 其他配置项

```javascript
const limiter = new RateLimiter({
  // ... 核心配置

  // 跳过特定请求（如健康检查）
  skip: (req) => req.path === '/health',
  
  // 路由级别配置（覆盖全局配置）
  perRoute: {
    '/api/login': { max: 5, windowMs: 15 * 60 * 1000 },
    '/api/query': { max: 200, windowMs: 60 * 1000 },
  },
  
  // 自定义限流响应
  handler: (req, res) => {
    res.status(429).json({ 
      error: '请求过多，请稍后再试',
      retryAfter: 60,
    });
  },
  
  // 是否添加响应头（X-RateLimit-*）
  headers: true,
  
  // 是否跳过成功/失败请求的计数
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});
```

---

## 完整配置示例

```javascript
const { RateLimiter, keyGenerators } = require('flex-rate-limit');

const limiter = new RateLimiter({
  // 核心配置
  windowMs: 60 * 1000,           // 1分钟
  max: 100,                      // 最多100次
  algorithm: 'sliding-window',   // 滑动窗口
  
  // 存储配置
  store: 'memory',               // 内存存储
  
  // 键生成器（业务锁：用户+路由）
  keyGenerator: (ctx, context) => {
    const userId = ctx.user?.id || ctx.ip;
    return `user:${userId}:${context?.route || ctx.path}`;
  },
  
  // 可选配置
  headers: true,                 // 添加响应头
  skip: (req) => req.path === '/health',  // 跳过健康检查
});
```

---

## 参数速查表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| windowMs | number | 60000 | 时间窗口大小（毫秒） |
| max | number \| function | 100 | 最大请求数或动态函数 |
| algorithm | string | 'sliding-window' | 限流算法 |
| store | string \| object | 'memory' | 存储后端 |
| keyGenerator | function | 默认按 IP | 键生成器 |
| skip | function | () => false | 跳过检查的条件 |
| perRoute | object | {} | 路由级别配置 |
| handler | function | null | 自定义处理器 |
| headers | boolean | true | 是否添加响应头 |
| skipSuccessfulRequests | boolean | false | 跳过成功请求 |
| skipFailedRequests | boolean | false | 跳过失败请求 |

---

## 实战配置场景

### 场景1：登录保护（严格限制）⭐⭐⭐

```javascript
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15分钟
  max: 5,                     // ⭐ 最多5次（防暴力破解）
  keyGenerator: keyGenerators.ip,         // 按IP限制
  handler: (req, res) => {
    res.status(429).json({
      error: '登录尝试过多，请15分钟后再试',
    });
  },
});
```

### 场景2：敏感操作（中等限制）

```javascript
const sensitiveOpLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,   // 1小时
  max: 10,                     // ⭐ 最多10次（修改密码、支付等）
  keyGenerator: keyGenerators.userId,      // 按用户限制
});
```

### 场景3：数据修改（普通限制）

```javascript
const mutationLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,   // 1小时
  max: 50,                     // ⭐ 最多50次（创建、更新、删除）
  keyGenerator: keyGenerators.userAndRoute, // 按用户+路由限制（业务锁）
});
```

### 场景4：API查询（宽松限制）

```javascript
const queryLimiter = new RateLimiter({
  windowMs: 60 * 1000,        // 1分钟
  max: 100,                    // ⭐ 最多100次（列表、详情查询）
  keyGenerator: keyGenerators.userAndRoute,
});
```

### 场景5：公开API（高频限制）

```javascript
const publicApiLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,   // 1小时
  max: 1000,                   // ⭐ 最多1000次（公开接口）
  keyGenerator: (req) => req.apiKey || req.ip,
});
```

### 场景6：用户等级分级

```javascript
const tieredLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  max: async (req) => {
    const tier = req.user?.tier || 'free';
    return {
      free: 100,        // ⭐ 免费用户
      basic: 500,       // ⭐ 基础会员
      premium: 2000,    // ⭐ 高级会员
      enterprise: 10000,// ⭐ 企业用户
    }[tier];
  },
  keyGenerator: keyGenerators.userId,
});
```

### 场景7：分布式系统（Redis）

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const distributedLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: new Redis('redis://redis-server:6379'),
    prefix: 'rl:',
  }),
});
```

---

## 推荐配置速查表

| 场景 | windowMs | max | 说明 |
|------|----------|-----|------|
| **登录/注册** | 15分钟 | 5 | 严格限制，防暴力破解 ⭐⭐⭐ |
| **修改密码** | 1小时 | 10 | 敏感操作 |
| **支付操作** | 1小时 | 10 | 敏感操作 |
| **数据修改** | 1小时 | 50 | 创建、更新、删除 |
| **API查询** | 1分钟 | 100 | 列表、详情等 |
| **搜索接口** | 1分钟 | 200 | 高频查询 |
| **公开API** | 1小时 | 1000 | 开放接口 |
| **WebSocket** | 1分钟 | 500 | 实时通信 |

---

## Redis 存储配置

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0, // Redis 数据库编号
  password: 'your-password', // 如果需要密码
});

const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: redis,
    prefix: 'rl:', // 键前缀（避免键冲突）
    expiry: 3600, // 数据过期时间（秒）
  }),
});
```

---

## 📚 相关文档

**下一步阅读**：
- 📖 [高级用法](advanced.md) - 路由级限流、动态配置
- 📖 [算法对比指南](algorithms-comparison.md) - 深入理解算法选择

**相关主题**：
- 📖 [业务锁指南](business-lock-guide.md) - keyGenerator详解
- 📖 [存储后端](storage.md) - Redis配置和性能对比
- 📖 [快速开始](quickstart.md) - 基础用法

**返回**：
- 📖 [文档中心](README.md) - 查看所有文档和学习路径

