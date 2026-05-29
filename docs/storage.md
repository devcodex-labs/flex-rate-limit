# 存储后端

## 📚 目录

- [内存存储（默认）](#内存存储默认)
- [Redis 存储](#redis-存储)
  - [方式 1: 连接字符串（推荐）](#方式-1-连接字符串推荐)
  - [方式 2: 使用 ioredis 客户端](#方式-2-使用-ioredis-客户端)
  - [Redis 集群](#redis-集群)
  - [Redis 哨兵](#redis-哨兵)
- [自定义存储后端](#自定义存储后端)
  - [基本接口](#基本接口)
  - [示例：PostgreSQL 存储](#示例postgresql-存储)
  - [示例：MongoDB 存储](#示例mongodb-存储)
- [性能对比](#性能对比)
- [选择建议](#选择建议)

---

## 内存存储（默认）

快速、简单、仅限单服务器。

```javascript
const limiter = new RateLimiter({
  store: 'memory',
});
```

**特点**:
- ✅ 最快的速度
- ✅ 无外部依赖
- ✅ 零配置
- ❌ 仅限单服务器
- ❌ 服务器重启丢失数据

**适用场景**:
- 单机应用
- 开发和测试
- 小型服务

## Redis 存储

分布式、持久化、多服务器支持。

### 方式 1: 连接字符串（推荐）

```javascript
const limiter = new RateLimiter({
  store: 'redis://localhost:6379',
});
```

**特点**:
- ✅ 最简洁
- ✅ 自动创建连接
- ✅ 开箱即用

### 方式 2: 使用 ioredis 客户端

```javascript
const { RateLimiter, RedisStore } = require('rate-limit');
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0,
});

const limiter = new RateLimiter({
  store: new RedisStore({
    client: redis,
    prefix: 'rate-limit:', // 键前缀
    expiry: 3600, // 默认过期时间（秒）
  }),
});
```

**特点**:
- ✅ 完全控制连接
- ✅ 支持连接池
- ✅ 支持高级配置

### 方式 3: Redis 集群

```javascript
const Redis = require('ioredis');
const { RedisStore } = require('rate-limit');

const cluster = new Redis.Cluster([
  { host: 'node1', port: 6379 },
  { host: 'node2', port: 6379 },
  { host: 'node3', port: 6379 },
]);

const limiter = new RateLimiter({
  store: new RedisStore({ client: cluster }),
});
```

### 方式 4: Redis Sentinel

```javascript
const Redis = require('ioredis');
const { RedisStore } = require('rate-limit');

const sentinel = new Redis({
  sentinels: [
    { host: 'sentinel1', port: 26379 },
    { host: 'sentinel2', port: 26379 },
    { host: 'sentinel3', port: 26379 },
  ],
  name: 'mymaster',
});

const limiter = new RateLimiter({
  store: new RedisStore({ client: sentinel }),
});
```

**特点**:
- ✅ 高可用
- ✅ 自动故障转移
- ✅ 适合生产环境

## 自定义存储

实现自己的存储后端。

```javascript
class CustomStore {
  async increment(key, windowMs) {
    // 返回 { count, resetTime }
  }
  
  async decrement(key) {
    // 可选：用于 skipFailedRequests
  }
  
  async reset(key) {
    // 可选：手动重置
  }
}

const limiter = new RateLimiter({
  store: new CustomStore(),
});
```

**实现步骤**:

1. 创建一个类实现存储接口
2. 实现 `increment()` 方法
3. （可选）实现 `decrement()` 和 `reset()` 方法
4. 传递给 RateLimiter

## 存储对比

| 特性 | 内存存储 | Redis | 自定义 |
|------|---------|-------|--------|
| 速度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 分布式 | ❌ | ✅ | ✅ |
| 持久化 | ❌ | ✅ | 可选 |
| 配置复杂度 | 低 | 中 | 高 |
| 适用场景 | 单机 | 分布式 | 特殊需求 |

## 选择指南

### 选择内存存储

```javascript
// ✅ 开发环境
// ✅ 单机应用
// ✅ 测试环境
// ✅ 无外部依赖
```

### 选择 Redis

```javascript
// ✅ 分布式系统
// ✅ 多服务器部署
// ✅ 生产环境
// ✅ 需要持久化
// ✅ 微服务架构
```

### 选择自定义存储

```javascript
// ✅ 特殊数据库（MongoDB、MySQL等）
// ✅ 需要自定义逻辑
// ✅ 与现有系统集成
// ✅ 特殊需求
```

---

## 性能对比

### 具体性能数值

基于 10,000 个并发用户的测试数据：

| 存储类型 | QPS | 响应延迟 | 内存占用 | 数据持久化 | 分布式支持 |
|---------|-----|---------|---------|-----------|-----------|
| **Memory** | 500,000+ | <0.1ms | 78 KB - 7.8 MB | ❌ 否 | ❌ 否 |
| **Redis** | 100,000+ | 1-3ms | ~50 KB | ✅ 是 | ✅ 是 |
| **Redis 集群** | 300,000+ | 2-5ms | ~50 KB | ✅ 是 | ✅ 是 |

**内存占用说明**（10,000个用户）：
- **Memory**: 
  - 固定窗口：78 KB（每个key 8字节）
  - 滑动窗口：7.8 MB（每个key 800字节）
- **Redis**: ~50 KB（序列化后的数据）

**QPS说明**：
- **Memory**: 本地内存访问，极快
- **Redis**: 网络往返 + Redis处理时间
- **Redis 集群**: 需要路由到正确的节点

---

## 选择建议

### 选择决策树

```
开始
│
├─ 是否是单服务器部署？
│  ├─ 是 ↓
│  │  ├─ 是否需要数据持久化？
│  │  │  ├─ 否 → Memory 存储 ⭐（最快）
│  │  │  └─ 是 → Redis 存储
│  │  └─
│  └─ 否（多服务器）↓
│     ├─ 服务器数量？
│     │  ├─ 2-10台 → Redis 存储 ⭐（标准方案）
│     │  └─ 10台以上 → Redis 集群 ⭐（高可用）
│     └─
│
└─ 是否需要跨服务共享限流数据？
   ├─ 是 → Redis 存储（必需）
   └─ 否 → Memory 存储
```

### 具体场景选择

#### 场景1：个人项目 / 小型应用

```javascript
// ✅ 推荐：Memory 存储
const limiter = new RateLimiter({
  store: 'memory',
});

// 原因：
// - 单服务器部署
// - 请求量不大（<10万/天）
// - 无需持久化
// - 性能最佳
```

#### 场景2：中小型企业应用

```javascript
// ✅ 推荐：Redis 存储
const limiter = new RateLimiter({
  store: 'redis://localhost:6379',
});

// 原因：
// - 可能扩展到多服务器
// - 需要数据持久化
// - 重启后不丢失限流数据
// - 便于监控和调试
```

#### 场景3：大型分布式系统

```javascript
// ✅ 推荐：Redis 集群
const Redis = require('ioredis');
const { RedisStore } = require('flex-rate-limit');

const cluster = new Redis.Cluster([
  { host: 'node1', port: 6379 },
  { host: 'node2', port: 6379 },
  { host: 'node3', port: 6379 },
]);

const limiter = new RateLimiter({
  store: new RedisStore({ client: cluster }),
});

// 原因：
// - 多台服务器（10+）
// - 高并发（100万+ QPS）
// - 需要高可用
// - 数据需要持久化
```

#### 场景4：开发和测试环境

```javascript
// ✅ 推荐：Memory 存储
const limiter = new RateLimiter({
  store: 'memory',
});

// 原因：
// - 无需额外依赖（Redis）
// - 快速启动测试
// - 无需配置
// - 性能最好
```

---

### 传统选择建议（简化版）

### 选择内存存储

```javascript
const limiter = new RateLimiter({
  store: 'memory',
  algorithm: 'fixed-window', // 更快
  windowMs: 60000,
  max: 100,
});
```

### Redis 性能优化

```javascript
const redis = new Redis({
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

const limiter = new RateLimiter({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:', // 使用短前缀
  }),
});
```

---

## 📚 相关文档

**相关配置**：
- 📖 [配置详解](config.md) - store配置选项说明
- 📖 [高级用法](advanced.md) - 自定义存储后端实现

**性能优化**：
- 📖 [算法深度分析](algorithms-deep-analysis.md) - 性能对比数据和优化建议

**基础知识**：
- 📖 [快速开始](quickstart.md) - 基本用法

**返回**：
- 📖 [文档中心](README.md) - 查看所有文档和学习路径





