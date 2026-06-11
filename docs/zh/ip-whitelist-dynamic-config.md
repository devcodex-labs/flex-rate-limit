# IP 白名单动态配置 - 快速使用指南

## ⚠️ 重要：配置场景说明

在开始之前，请先了解白名单和限流的配置关系：

### 四个核心问题

#### 1️⃣ 只配置限流，不配置白名单

**问题**: 如果限流配置了 `/internal`，但白名单没配置 `/internal`，如何处理？

**答案**: ✅ **所有 IP 都可以访问 + 受限流限制**

```javascript
app.get('/api/internal/stats',
  createRateLimiter({ max: 500 }),  // 只有限流
  handler
);
```

**效果**: 未配置白名单 = 允许所有 IP 访问，但要受限流控制

---

#### 2️⃣ 只配置白名单，不配置限流

**问题**: 如果白名单配置了 `/internal`，但限流没配置 `/internal`，如何处理？

**答案**: ⚠️ **白名单 IP 无限制访问（不推荐）**

```javascript
app.get('/api/internal/stats',
  ipWhitelistMiddleware('/api/internal'),  // 只有白名单
  handler
);
```

**效果**: 
- 非白名单 IP → 403 Forbidden
- 白名单 IP → 无限制访问（没有限流保护）

**建议**: ❌ 不推荐，应该白名单 + 限流一起配置

---

#### 3️⃣ 白名单和限流都配置（推荐）

**问题**: 如果白名单配置了 `/internal`，限流也配置了 `/internal`，如何处理？

**答案**: ✅ **推荐配置 - 双重保护**

```javascript
app.get('/api/internal/stats',
  ipWhitelistMiddleware('/api/internal'),  // 第一层：白名单
  createRateLimiter({ max: 500 }),         // 第二层：限流
  handler
);
```

**效果**:
- 非白名单 IP → 403 Forbidden（立即拒绝）
- 白名单 IP（1-500次）→ 200 OK
- 白名单 IP（501+次）→ 429 Too Many Requests

---

#### 4️⃣ 全局白名单

**问题**: 白名单能否配置全局路由？

**答案**: ✅ **可以！而且非常推荐！**

```bash
# 环境变量
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100

# 效果
# - 全局白名单 IP 可以访问所有路由
# - 但仍然受各自路由的限流限制
```

**优先级**: 全局白名单 > 路由白名单

**详细说明**: 参见 [配置场景详解](whitelist-ratelimit-config-scenarios.md)

---

## 🚀 快速开始

### Express

```bash
# 1. 启动示例
cd flex-rate-limit
GLOBAL_IP_WHITELIST=127.0.0.1 \
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11 \
node examples/express-ip-whitelist-advanced.js

# 2. 测试 API
curl http://localhost:3400/api/whitelist/config
curl http://localhost:3400/api/public/data
curl http://localhost:3400/api/admin/users
```

### Koa

```bash
# 1. 安装依赖（如果还没有）
npm install @koa/router koa-bodyparser

# 2. 启动示例
PORT=3401 \
GLOBAL_IP_WHITELIST=127.0.0.1 \
node examples/koa-ip-whitelist-advanced.js

# 3. 测试 API
curl http://localhost:3401/api/whitelist/config
curl http://localhost:3401/api/public/data
```

### Egg.js

参考 `examples/egg-ip-whitelist-advanced.js` 中的完整说明，需要完整的 Egg.js 项目结构。

---

## 📋 配置方式

### 方式 1: 环境变量（推荐）

```bash
# 全局白名单
export GLOBAL_IP_WHITELIST="127.0.0.1,192.168.1.1,192.168.1.2"

# 管理后台白名单
export ADMIN_IP_WHITELIST="192.168.1.10,192.168.1.11"

# 内部 API IP 段
export INTERNAL_IP_WHITELIST="10.0.0.0/8,192.168.0.0/16"

# VIP 白名单
export VIP_IP_WHITELIST="192.168.1.200,192.168.1.201"

# 启动应用
node app.js
```

### 方式 2: 配置文件

创建 `config/ip-whitelist.json`:

```json
{
  "global": [
    "127.0.0.1",
    "::1"
  ],
  "routes": {
    "/api/admin": [
      "192.168.1.10",
      "192.168.1.11"
    ],
    "/api/internal": [
      "10.0.0.0/8",
      "192.168.0.0/16"
    ],
    "/api/vip": [
      "192.168.1.200"
    ]
  }
}
```

应用会自动加载此文件（如果存在）。

### 方式 3: 代码配置

```javascript
const ipConfig = new IPWhitelistConfig();
ipConfig.globalWhitelist = ['127.0.0.1', '192.168.1.1'];
ipConfig.routeWhitelists = {
  '/api/admin': ['192.168.1.10'],
};
```

---

## 🔧 动态管理 API

### 查看当前配置

```bash
curl http://localhost:3400/api/whitelist/config
```

**响应**:
```json
{
  "global": ["127.0.0.1", "::1"],
  "routes": {
    "/api/admin": ["192.168.1.10", "192.168.1.11"],
    "/api/internal": ["10.0.0.0/8", "192.168.0.0/16"]
  }
}
```

### 添加全局白名单

```bash
curl -X POST http://localhost:3400/api/whitelist/global/add \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'
```

**响应**:
```json
{
  "message": "添加成功",
  "ip": "192.168.1.100"
}
```

### 移除全局白名单

```bash
curl -X POST http://localhost:3400/api/whitelist/global/remove \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'
```

### 添加路由白名单

```bash
curl -X POST http://localhost:3400/api/whitelist/route/add \
  -H "Content-Type: application/json" \
  -d '{"route":"/api/admin","ip":"192.168.1.12"}'
```

---

## 🎯 使用场景

### 场景 1: 管理后台只允许办公室 IP

```bash
# 环境变量配置
ADMIN_IP_WHITELIST="192.168.1.10,192.168.1.11,192.168.1.12"

# 或配置文件
{
  "routes": {
    "/api/admin": ["192.168.1.10", "192.168.1.11", "192.168.1.12"]
  }
}

# 效果
# - 白名单 IP → 正常访问
# - 非白名单 IP → 403 Forbidden
```

### 场景 2: 内部 API 限制内网访问

```bash
# 使用 CIDR 格式配置 IP 段
INTERNAL_IP_WHITELIST="10.0.0.0/8,192.168.0.0/16,172.16.0.0/12"

# 效果
# - 内网 IP (10.x.x.x, 192.168.x.x, 172.16-31.x.x) → 正常访问
# - 外网 IP → 403 Forbidden
```

### 场景 3: 临时授权测试 IP

```bash
# 添加临时白名单
curl -X POST http://localhost:3400/api/whitelist/global/add \
  -d '{"ip":"203.0.113.100"}'

# 测试完成后移除
curl -X POST http://localhost:3400/api/whitelist/global/remove \
  -d '{"ip":"203.0.113.100"}'
```

### 场景 4: VIP 客户更高限额

```javascript
// VIP IP 获得 50 倍限额
const vipLimiter = new RateLimiter({
  max: (req) => {
    const isVIP = ipConfig.isRouteWhitelisted('/api/vip', req.ip);
    return isVIP ? 5000 : 100;
  },
});
```

---

## 🔒 安全建议

### 1. 保护管理 API

```javascript
// 添加身份验证
app.post('/api/whitelist/global/add', 
  authMiddleware,  // ⚠️ 必须验证管理员身份
  handler
);
```

### 2. 配置文件权限

```bash
# 设置只读权限
chmod 400 config/ip-whitelist.json

# 只允许应用用户读取
chown app:app config/ip-whitelist.json
```

### 3. 环境变量安全

```bash
# 不要提交到代码库
echo ".env" >> .gitignore

# 使用密钥管理服务
# - AWS Secrets Manager
# - Kubernetes Secrets
# - Docker Secrets
```

### 4. 定期审查

建议每月审查一次白名单配置，移除不再需要的 IP。

---

## 📚 相关文档

- **完整实现报告**: `reports/多框架IP白名单动态配置实现报告.md`
- **高级用法**: `guides/advanced.md#ip-白名单与黑名单-`
- **基础示例**: `examples/ip-whitelist-example.js`
- **Express 高级**: `examples/express-ip-whitelist-advanced.js`
- **Koa 高级**: `examples/koa-ip-whitelist-advanced.js`
- **Egg.js 高级**: `examples/egg-ip-whitelist-advanced.js`

---

## ❓ 常见问题

### Q1: 全局白名单和路由白名单的优先级？

**A**: 全局白名单优先级更高。如果 IP 在全局白名单中，将跳过所有路由的限制。

### Q2: 如何测试 IP 白名单是否生效？

**A**: 
```bash
# 1. 查看当前配置
curl http://localhost:3400/api/whitelist/config

# 2. 测试访问（查看响应头）
curl -v http://localhost:3400/api/admin/users

# 3. 如果不在白名单，会返回 403 Forbidden
```

### Q3: 支持 IPv6 吗？

**A**: 支持！可以配置 IPv6 地址：
```json
{
  "global": ["::1", "2001:db8::1"]
}
```

### Q4: CIDR 格式如何使用？

**A**: 
```bash
# 单个 C 类网段（256 个 IP）
192.168.1.0/24  # 192.168.1.0 - 192.168.1.255

# B 类网段（65536 个 IP）
192.168.0.0/16  # 192.168.0.0 - 192.168.255.255

# A 类网段（16777216 个 IP）
10.0.0.0/8      # 10.0.0.0 - 10.255.255.255
```

### Q5: 动态添加的白名单会持久化吗？

**A**: 不会。动态添加的白名单只存在于内存中，重启后会丢失。如需持久化，应该：
1. 将 IP 添加到环境变量
2. 或更新配置文件
3. 或实现数据库存储

### Q6: 如何实现白名单持久化？

**A**: 扩展 `IPWhitelistConfig` 类，在 `addGlobalWhitelist` 等方法中：
```javascript
addGlobalWhitelist(ip) {
  this.globalWhitelist.push(ip);
  
  // 持久化到文件
  fs.writeFileSync(
    'config/ip-whitelist.json',
    JSON.stringify(this.getConfig(), null, 2)
  );
  
  // 或持久化到数据库
  await db.ipWhitelist.create({ ip, type: 'global' });
}
```

---

**更新时间**: 2026-02-05
