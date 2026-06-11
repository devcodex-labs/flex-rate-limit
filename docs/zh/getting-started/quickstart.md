# 快速开始

## 📚 目录

- [📁 框架示例文件](#-框架示例文件)
- [⚡ 快速示例](#-快速示例)
  - [第 1 步：创建限流中间件工厂](#第-1-步创建限流中间件工厂)
  - [第 2 步：在路由中直接使用中间件](#第-2-步在路由中直接使用中间件)
- [📝 设计理念](#-设计理念)
- [📊 限制级别选择指南](#-限制级别选择指南)
- [🎯 快速决策树](#-快速决策树)
- [完整示例说明](#完整示例说明)
- [🎯 核心优势](#-核心优势)
- [🏃 快速运行示例](#-快速运行示例)
- [📚 深入了解](#-深入了解)
- [📚 相关文档](#-相关文档)

---

快速开始示例已按框架拆分为单独文件，每个文件都包含完整的中间件工厂 + 路由配置示例。

## 📁 框架示例文件

| 框架 | 快速开始文件 | 说明 |
|------|------------|------|
| **Express** | [quickstart-express.js](https://github.com/vextjs/flex-rate-limit/blob/main/examples/quickstart-express.js) | 完整的Express路由级限流示例 |
| **Koa** | [quickstart-koa.js](https://github.com/vextjs/flex-rate-limit/blob/main/examples/quickstart-koa.js) | 完整的Koa路由级限流示例 |
| **Egg.js** | [quickstart-egg.js](https://github.com/vextjs/flex-rate-limit/blob/main/examples/quickstart-egg.js) | 完整的Egg.js路由级限流示例 |
| **Hapi** | [quickstart-hapi.js](https://github.com/vextjs/flex-rate-limit/blob/main/examples/quickstart-hapi.js) | 完整的Hapi路由级限流示例 |
| **独立使用** | [standalone-example.js](https://github.com/vextjs/flex-rate-limit/blob/main/examples/standalone-example.js) | 无框架情况下的使用 |

## ⚡ 快速示例

所有框架都遵循相同的模式：

### 第 1 步：创建限流中间件工厂

```javascript
const createLimiters = () => {
  return {
    // 严格限制：15分钟5次（登录、注册等）
    strict: (req, res, next) => {
      const limiter = new RateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
      });
      limiter.middleware()(req, res, next);
    },
    
    // 中等限制：1小时50次（文件操作、数据修改）
    normal: (req, res, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 50,
      });
      limiter.middleware()(req, res, next);
    },
    
    // 宽松限制：1分钟200次（数据查询、读操作）
    relaxed: (req, res, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 1000,
        max: 200,
      });
      limiter.middleware()(req, res, next);
    },
  };
};

const limit = createLimiters();
```

### 第 2 步：在路由中直接使用中间件

```javascript
// Express（可直接使用 limiter.middleware() 包装出的 req/res/next 中间件）
app.post('/api/login', limit.strict, controller.login);
app.get('/api/users', limit.relaxed, controller.list);
app.post('/api/upload', limit.normal, controller.upload);

// Koa / Egg.js / Fastify / Hapi
// 不要直接复用 Express 风格中间件；请参考 examples/quickstart-*.js，
// 使用 limiter.check(key, { route }) 封装为对应框架的中间件、hook 或 pre-handler。
```

**就这么简单！** ✨

---

## 📝 设计理念

### 为什么使用中间件工厂模式？

传统方式需要在每个路由配置 `perRoute`：

```javascript
// ❌ 传统方式：分散配置，难以维护
const limiter = new RateLimiter({
  windowMs: 60000,
  max: 100,
  perRoute: {
    '/api/login': { max: 5, windowMs: 15 * 60 * 1000 },
    '/api/users': { max: 200 },
    '/api/upload': { max: 10, windowMs: 60 * 60 * 1000 },
    // ... 路由越多越难维护
  },
});
```

**中间件工厂模式的优势**：

```javascript
// ✅ 新方式：路由和限流配置在一起
router.post('/api/login', limit.strict, controller.login);     // 一眼看出：严格限制
router.get('/api/users', limit.relaxed, controller.list);      // 一眼看出：宽松限制
router.post('/api/upload', limit.normal, controller.upload);   // 一眼看出：中等限制
```

**核心优势**：
1. ✅ **配置集中**：所有限流配置在路由定义处
2. ✅ **语义清晰**：`strict`、`normal`、`relaxed` 一目了然
3. ✅ **易于维护**：修改限流只需改路由定义
4. ✅ **统一模式**：所有框架使用相同方式

---

## 📊 限制级别选择指南

### 如何选择限制级别？

| 级别 | 配置 | 适用场景 | 原因 |
|------|------|---------|------|
| **strict** | 15分钟5次 | 登录、注册、找回密码 | 防暴力破解 ⭐⭐⭐ |
| **normal** | 1小时50次 | 文件上传、数据修改、删除操作 | 防滥用，保护资源 |
| **relaxed** | 1分钟200次 | 数据查询、列表接口、搜索 | 允许正常高频使用 |
| **custom** | 自定义 | 特殊业务需求 | 灵活配置 |

### 实际决策示例

**场景1：用户登录接口**
```javascript
router.post('/api/login', limit.strict, controller.login);
// ✅ 选择 strict
// 原因：登录失败通常是暴力破解，15分钟5次足够正常用户
```

**场景2：用户信息查询**
```javascript
router.get('/api/users/:id', limit.relaxed, controller.getUser);
// ✅ 选择 relaxed
// 原因：查询操作，用户可能频繁刷新，1分钟200次很宽松
```

**场景3：文件上传**
```javascript
router.post('/api/upload', limit.normal, controller.upload);
// ✅ 选择 normal
// 原因：上传消耗资源，1小时50次既保护服务器又不影响正常使用
```

**场景4：支付接口（特殊需求）**
```javascript
router.post('/api/payment', limit.custom(60 * 60 * 1000, 10), controller.pay);
// ✅ 选择 custom(1小时, 10次)
// 原因：支付接口非常敏感，需要更严格的自定义限制
```

---

## 🎯 快速决策树

```
开始
│
├─ 是否是认证相关？（登录/注册/找回密码）
│  └─ 是 → 使用 strict（15分钟5次）
│
├─ 是否消耗服务器资源？（上传/导出/计算）
│  └─ 是 → 使用 normal（1小时50次）
│
├─ 是否是查询操作？（列表/详情/搜索）
│  └─ 是 → 使用 relaxed（1分钟200次）
│
└─ 是否有特殊业务需求？
   └─ 是 → 使用 custom(windowMs, max)
```

---

## 完整示例说明

每个快速开始文件都包含：

1. **中间件工厂函数** - 预定义的 4 个限制级别
   - `strict` - 严格限制（15分钟5次）
   - `normal` - 中等限制（1小时50次）
   - `relaxed` - 宽松限制（1分钟200次）
   - `custom(windowMs, max)` - 自定义限制

2. **路由定义示例** - 展示如何在不同路由中应用限流
   - 认证相关路由（严格限制）
   - 用户相关路由（宽松限制）
   - 文件操作路由（中等限制）
   - 特殊端点（自定义限制）

3. **完整的服务器启动代码** - 可以直接运行

## 🎯 核心优势

✅ **无需重复配置** - 只在路由中配置，无需 perRoute  
✅ **核心 API 统一** - 所有框架都通过 `check()` 获得一致的限流结果；框架接入层按各自中间件语义封装
✅ **清晰易维护** - 路由和限流配置在一起  
✅ **开箱即用** - 复制示例代码直接使用  

## 🏃 快速运行示例

```bash
# Express 快速开始
node examples/quickstart-express.js

# Koa 快速开始
node examples/quickstart-koa.js

# Egg.js 快速开始
node examples/quickstart-egg.js

# Hapi 快速开始
node examples/quickstart-hapi.js
```

## 📚 深入了解

- 更多配置选项，查看 [配置详解](../guides/config.md)
- 高级用法，查看 [高级用法](../guides/advanced.md)
- 限流算法，查看 [算法对比指南](../algorithms/comparison.md)

---

## 📚 相关文档

**下一步阅读**：
- 📖 [配置详解](../guides/config.md) - 了解所有配置选项和推荐配置
- 📖 [高级用法](../guides/advanced.md) - 学习路由级限流和动态配置

**相关主题**：
- 📖 [业务锁指南](../guides/business-lock-guide.md) - 按用户+路由的精细化限流
- 📖 [算法对比指南](../algorithms/comparison.md) - 选择合适的限流算法
- 📖 [存储后端](../guides/storage.md) - Memory、Redis、CacheHubStore 选择

**返回**：
- 📖 [文档中心](../README.md) - 查看所有文档和学习路径




