# 更新日志

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [2.2.2] - 2026-06-09

### Changed

- Pinned direct optional and dev dependencies in `package.json` to exact versions already resolved by `package-lock.json`.
- Kept public API, optional dependency semantics, and Node.js baseline unchanged.

## [2.2.1] - 2026-06-04

### Changed

- Updated package license metadata, LICENSE text, README badge, and package distribution metadata to Apache-2.0.

## [2.2.0] - 2026-06-01

### Added
- Added reproducible Redis direct benchmark coverage for `RedisStore`, `CacheHubStore`, and `rate-limiter-flexible`.
- Added reproducible HTTP middleware benchmark coverage for `flex-memory`, `flex-redis`, `flex-cache-hub`, and `rate-limiter-flexible`.
- Added benchmark documentation for Memory, Redis direct, and HTTP middleware scenarios.

### Changed
- Rewrote the root `README.md` as the English default package entry.
- Optimized the static middleware hot path by avoiding unnecessary runtime resolution, promise wrapping, and rollback metadata when rollback is disabled.
- Added a `CacheHubStore` fixed-window fast path backed by cache-hub atomic primitives.
- Updated release, website, docs navigation, and Profile version metadata for `2.2.0`.

### Compatibility
- Public APIs remain compatible with `2.1.x`.
- Node.js support remains `>=18.0.0`.
- `cache-hub` remains optional; existing Memory and RedisStore users do not need to change code.

## [2.1.0] - 2026-06-01

### Added
- 新增 `CacheHubStore`，可选接入 `cache-hub@^2.1.0` 的 Memory / Redis 原子状态后端。
- 新增 token-bucket、leaky-bucket 的 store rollback 快路径，支持 cache-hub opaque rollback token。
- 新增 CacheHubStore 单元测试与 Redis 集成测试。

### Changed
- `index.d.ts`、CommonJS 入口、ESM 入口同步导出 `CacheHubStore`。
- 文档、API reference、website 版本展示与存储指南同步更新为 `2.1.0`。
- CI 增加 TypeScript 类型检查；覆盖率工具从 `nyc` 切换为支持 Node.js `>=18.0.0` 的 `c8`。

## [2.0.2] - 2026-06-01

### Performance
- Optimized Memory Store and `RateLimiter.check()` hot paths with cached runtime options, Memory-specific algorithm fast paths, lazy TTL sweep rescheduling, and in-place sliding-window state maintenance.
- Added a direct Memory check fast path that skips unused rollback metadata and response repacking for static `check(key)` calls, allowing local benchmarks to exceed `rate-limiter-flexible` in measured Memory scenarios.

### Benchmarking
- Extended `npm run benchmark:memory` with multi-run median/range reporting and optional JSON output via `BENCH_RUNS` and `BENCH_JSON`.

### Tests
- Added Memory Store regressions for extended TTL expiry and precise sliding-window rollback.

## [2.0.1] - 2026-05-30

### Breaking Changes
- 将最低运行时提升为 Node.js 18。仍需 Node.js 14/16 的消费者请继续使用 `1.x` 版本线。

### 变更
- 将最低运行时提升为 Node.js 18，并将 GitHub Actions CI 矩阵收敛为 Node.js 18/20。
- 升级 GitHub Actions 基础 actions 到支持 Node 24 runtime 的主版本，消除即将到来的 runner runtime 弃用风险。
- 修复 publish workflow 的 Node 22 CI gate 脚本，避免 `require()` 与顶层 `await` 触发 ambiguous module syntax。

## [1.0.6] - 2026-05-30

### 变更
- 新增 Rspress website 站点骨架，复用 `docs/` 作为站点内容源，并补充首页与 benchmark 指南。
- 新增本地 Memory benchmark 脚本，用于生成可复现的性能基线。
- 修复 Redis 滑动窗口 sorted-set member 在多实例同毫秒写入时可能碰撞的问题，避免计数被覆盖。
- 修正文档中 Express 风格 middleware、漏桶实现语义与性能数字的过度表述。
- 移除一次性 review 文档，审查结论改由 DevCodex 报告归档。
- 修正文档链接、包名、`keyGenerator` 示例和 API 参考，使公开文档与当前实现一致。
- 对齐 TypeScript `Algorithm` 类型与算法实现返回契约。
- 缩短独立示例运行等待时间，确保示例验证脚本可稳定完成。

## [1.0.0] - 2026-02-04

### 新增
- 初始版本
- 框架无关的速率限制
- 多种算法支持：
  - 滑动窗口（默认）
  - 固定窗口
  - 令牌桶
  - 漏桶
- 多种存储后端：
  - 内存存储（默认）
  - Redis 存储
- Express 中间件集成
- Koa 中间件集成
- 无框架独立使用
- TypeScript 类型定义
- 全面的测试覆盖
- 详细的文档和示例
- ESLint 配置
- npm 包就绪

### 功能特性
- ✅ 可配置的时间窗口和请求限制
- ✅ 自定义键生成函数
- ✅ 跳过条件以绕过速率限制
- ✅ 超过速率限制的自定义处理器
- ✅ 响应中的速率限制头
- ✅ 手动重置功能
- ✅ 基于请求上下文的动态速率限制
- ✅ 同时支持 CommonJS 和 ES 模块

### 文档
- 完整的 README 和使用示例
- 带 TypeScript 类型的 API 文档
- Express 和 Koa 的集成示例
- 独立使用示例
- 贡献指南

