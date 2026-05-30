# 📚 flex-rate-limit 文档中心

> **项目**: flex-rate-limit
> **版本**: 2.0.0
> **运行时**: Node.js >= 18
> **仓库**: https://github.com/vextjs/flex-rate-limit
> **Website**: https://vextjs.github.io/flex-rate-limit
> **更新**: 2026-05-30

---

## 🎯 快速导航

### 🚀 新手入门（5-10分钟）

从这里开始，快速上手限流功能：

1. **[快速开始](getting-started/quickstart.md)** ⭐
   5分钟上手核心 API，并了解 Express、Koa、Egg.js、Hapi、Fastify 的接入方式
   
2. **[配置详解](guides/config.md)**
   了解所有配置选项和推荐配置

---

### 📖 使用指南（20-40分钟）

深入学习各种使用场景：

3. **[高级用法](guides/advanced.md)**
   路由级限流、动态配置、自定义键生成器
   
4. **[业务锁指南](guides/business-lock-guide.md)** ⭐
   用户ID+路由的精细化限流控制
   
5. **[存储后端](guides/storage.md)**
   Memory vs Redis，性能对比与选择决策

6. **[IP 白名单配置场景](whitelist-ratelimit-config-scenarios.md)** ⭐ 新增
   四个核心配置场景详解（必读）

7. **[白名单与限流独立性](whitelist-ratelimit-independence.md)** ⭐ 新增
   耦合版本 vs 独立版本对比说明

8. **[IP 白名单动态配置](ip-whitelist-dynamic-config.md)**
   快速使用指南和配置方式

---

### 🎯 算法专题（40-90分钟）

深入理解限流算法：

6. **[算法对比指南](algorithms/comparison.md)** ⭐
   4种算法对比、选择决策、配置示例
   
7. **[算法深度分析](algorithms/deep-analysis.md)**
   源码级分析、瞬时超频计算、性能数据

---

### 📚 API参考

快速查询API：

8. **[API参考](reference/api-reference.md)**
   完整的类、方法、参数文档

---

## 🎓 学习路径

### 路径1：我想快速上手（10分钟）

```
getting-started/quickstart.md → guides/config.md → 完成！
```

**适合**：
- 第一次使用
- 只需要基本功能
- 想快速集成

**学习目标**：
- ✅ 能在项目中使用限流
- ✅ 能配置基本参数
- ✅ 能集成到现有框架

---

### 路径2：我需要精细控制（40分钟）

```
getting-started/quickstart.md → guides/config.md → guides/advanced.md 
→ guides/business-lock-guide.md → 完成！
```

**适合**：
- 需要路由级限流
- 需要用户级限流
- 业务系统开发

**学习目标**：
- ✅ 能为不同路由设置不同限制
- ✅ 能按用户+路由限流（业务锁）
- ✅ 能实现动态限流

---

### 路径3：我想深入理解（90分钟）

```
getting-started/quickstart.md → guides/config.md → algorithms/comparison.md 
→ algorithms/deep-analysis.md → 完成！
```

**适合**：
- 想了解算法原理
- 需要性能优化
- 技术深入研究

**学习目标**：
- ✅ 理解4种算法的原理
- ✅ 能根据场景选择算法
- ✅ 了解性能特点和瞬时超频

---

### 路径4：我在生产环境部署（30分钟）

```
guides/config.md → guides/storage.md → guides/advanced.md → 完成！
```

**适合**：
- 分布式系统
- Redis集群配置
- 生产环境优化

**学习目标**：
- ✅ 能配置Redis存储
- ✅ 能部署分布式限流
- ✅ 能进行性能优化

---

## 📊 文档对比

| 文档 | 难度 | 时间 | 适合人群 |
|------|------|------|---------|
| getting-started/quickstart.md | ⭐ 初级 | 5分钟 | 所有人 |
| guides/config.md | ⭐⭐ 中级 | 10分钟 | 需要配置的人 |
| guides/advanced.md | ⭐⭐⭐ 进阶 | 20分钟 | 进阶用户 |
| guides/business-lock-guide.md | ⭐⭐⭐ 进阶 | 20分钟 | 业务系统开发 |
| **whitelist-ratelimit-config-scenarios.md** | **⭐⭐ 中级** | **15分钟** | **需要 IP 白名单** |
| **whitelist-ratelimit-independence.md** | **⭐⭐ 中级** | **10分钟** | **理解独立性** |
| **ip-whitelist-dynamic-config.md** | **⭐⭐ 中级** | **10分钟** | **快速上手** |
| guides/storage.md | ⭐⭐⭐ 进阶 | 15分钟 | 分布式部署 |
| algorithms/comparison.md | ⭐⭐⭐ 进阶 | 40分钟 | 需要选择算法 |
| algorithms/deep-analysis.md | ⭐⭐⭐⭐⭐ 专家 | 90分钟 | 技术深入研究 |
| reference/api-reference.md | ⭐⭐ 中级 | 查询用 | 需要查API |

---

### 路径4：IP 白名单配置（30分钟）⭐ 新增

```
whitelist-ratelimit-config-scenarios.md → whitelist-ratelimit-independence.md 
→ ip-whitelist-dynamic-config.md → 完成！
```

**适合**：
- 需要 IP 访问控制
- 需要白名单 + 限流组合
- 需要全局/路由级白名单

**学习目标**：
- ✅ 理解四个核心配置场景
- ✅ 掌握白名单与限流的独立性
- ✅ 能配置全局和路由级白名单
- ✅ 能实现动态管理白名单

**关键文档**：
1. [配置场景详解](whitelist-ratelimit-config-scenarios.md) - 必读
2. [独立性说明](whitelist-ratelimit-independence.md) - 理解原理
3. [动态配置指南](ip-whitelist-dynamic-config.md) - 实战应用

---

## 🔍 按场景查找

### 我想实现登录保护
→ [getting-started/quickstart.md](getting-started/quickstart.md) - 场景1：登录保护

### 我想用Redis
→ [guides/storage.md](guides/storage.md) - Redis配置

### 我想按用户限流
→ [guides/business-lock-guide.md](guides/business-lock-guide.md)

### 我想配置 IP 白名单 ⭐
→ [whitelist-ratelimit-config-scenarios.md](whitelist-ratelimit-config-scenarios.md) - 四个核心场景

### 我想知道"只配置限流"会怎样 ⭐
→ [whitelist-ratelimit-config-scenarios.md](whitelist-ratelimit-config-scenarios.md#问题-1-限流配置了-internal但白名单没配置-internal)

### 我想知道"只配置白名单"会怎样 ⭐
→ [whitelist-ratelimit-config-scenarios.md](whitelist-ratelimit-config-scenarios.md#问题-2-白名单配置了-internal但限流没配置-internal)

### 我想配置全局白名单 ⭐
→ [whitelist-ratelimit-config-scenarios.md](whitelist-ratelimit-config-scenarios.md#问题-4-白名单能否配置全局路由)

### 我想理解白名单和限流的关系 ⭐
→ [whitelist-ratelimit-independence.md](whitelist-ratelimit-independence.md)

### 我想选择算法
→ [algorithms/comparison.md](algorithms/comparison.md) - 选择决策树

### 我想优化性能
→ [algorithms/deep-analysis.md](algorithms/deep-analysis.md) - 性能对比

### 我想了解所有配置选项
→ [guides/config.md](guides/config.md) - 完整配置说明

### 我想实现路由级限流
→ [guides/advanced.md](guides/advanced.md) - 路由级限流示例

---

## 📖 文档详细说明

### getting-started/quickstart.md - 快速开始

**你会学到**：
- ✅ 如何在5分钟内集成限流
- ✅ Express、Koa、Egg.js、Hapi、Fastify 的完整示例
- ✅ 中间件工厂模式的使用
- ✅ 如何选择限制级别（strict/normal/relaxed）

**关键概念**：
- 中间件工厂模式
- 限制级别选择
- 快速决策树

---

### guides/config.md - 配置详解

**你会学到**：
- ✅ 所有配置选项的详细说明
- ✅ 4种算法的工作原理和对比
- ✅ 7个实战配置场景
- ✅ 推荐配置速查表

**关键概念**：
- windowMs 和 max 的配置
- 算法选择（滑动窗口/固定窗口/令牌桶/漏桶）
- keyGenerator 的使用
- 存储后端选择

---

### guides/advanced.md - 高级用法

**你会学到**：
- ✅ 路由级限流配置
- ✅ 动态限流（按用户等级）
- ✅ 自定义键生成器
- ✅ 自定义限流响应

**关键概念**：
- perRoute 配置
- 键生成器对比（按IP/按用户/按用户+路由）
- 实际场景对比（公司网络50人案例）
- 选择决策树

---

### guides/business-lock-guide.md - 业务锁指南

**你会学到**：
- ✅ 什么是业务锁
- ✅ 为什么需要业务锁
- ✅ 如何实现用户+路由的限流
- ✅ 完整的Egg.js实现

**关键概念**：
- 传统限流 vs 业务锁
- keyGenerator 详解
- 公司网络场景分析
- 防刷接口最佳实践

---

### guides/storage.md - 存储后端

**你会学到**：
- ✅ Memory 和 Redis 的对比
- ✅ 性能参考维度（正式 QPS/延迟需以可复现 benchmark 为准）
- ✅ 选择决策树
- ✅ 4个具体场景选择

**关键概念**：
- 单服务器 vs 多服务器
- Memory: 本地内存路径，通常吞吐最高
- Redis: 分布式路径，受网络与 Redis 命令策略影响
- Redis集群配置与热点 key 风险

---

### algorithms/comparison.md - 算法对比指南

**你会学到**：
- ✅ 4种算法的详细对比
- ✅ 每种算法的适用场景
- ✅ 选择决策树
- ✅ 实战推荐配置

**关键概念**：
- 滑动窗口：最精确（推荐）
- 固定窗口：最快速（有边界问题）
- 令牌桶：允许突发
- 漏桶：平滑流量

---

### algorithms/deep-analysis.md - 算法深度分析

**你会学到**：
- ✅ 算法实现原理（源码级）
- ✅ 瞬时超频分析
- ✅ 内存占用计算
- ✅ 性能对比数据

**关键概念**：
- 滑动窗口：存储所有时间戳
- 固定窗口：边界可能2倍超频
- 令牌桶 vs 漏桶的区别
- 性能优化建议

---

### reference/api-reference.md - API参考

**你会学到**：
- ✅ RateLimiter 类的所有方法
- ✅ 配置选项的完整说明
- ✅ Store 接口定义
- ✅ 预定义键生成器

**用途**：
- 快速查询API
- 查看方法签名
- 了解返回值结构

---

## 🆘 需要帮助？

### 常见问题

**Q: 我应该从哪个文档开始？**
A: 从 [getting-started/quickstart.md](getting-started/quickstart.md) 开始，5分钟就能上手。

**Q: 我如何选择算法？**
A: 查看 [algorithms/comparison.md](algorithms/comparison.md) 的选择决策树。

**Q: 登录接口应该怎么配置？**
A: 推荐 `strict` 级别：15分钟5次，参考 [getting-started/quickstart.md](getting-started/quickstart.md)。

**Q: Memory 和 Redis 如何选择？**
A: 单服务器用Memory，多服务器用Redis，详见 [guides/storage.md](guides/storage.md)。

**Q: 什么是业务锁？**
A: 按用户+路由限流，每个用户在每个接口独立限额，详见 [guides/business-lock-guide.md](guides/business-lock-guide.md)。

---

### 获取支持

- 💬 [GitHub Issues](https://github.com/vextjs/flex-rate-limit/issues)
- 💡 [GitHub Discussions](https://github.com/vextjs/flex-rate-limit/discussions)
- 📖 [示例代码](https://github.com/vextjs/flex-rate-limit/tree/main/examples)

---

## 🎉 快速链接

- 📖 [项目首页](https://github.com/vextjs/flex-rate-limit#readme)
- 💻 [示例代码](https://github.com/vextjs/flex-rate-limit/tree/main/examples)
- 📦 [npm 包](https://www.npmjs.com/package/flex-rate-limit)
- 🐛 [报告问题](https://github.com/vextjs/flex-rate-limit/issues)

---

**祝您使用愉快！** ✨




