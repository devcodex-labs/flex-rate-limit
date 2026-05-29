# 项目复审

> 基于 2026-05-29 的仓库状态复核。
> 默认英文版本：[`../REVIEW.md`](../REVIEW.md)

## 项目快照

| 字段 | 内容 |
|---|---|
| 包名 | `flex-rate-limit` |
| 版本 | `1.0.5` |
| 运行时 | Node.js `>=14.0.0` |
| 仓库 | `https://github.com/vextjs/flex-rate-limit` |
| 主要导出 | `RateLimiter`、`MemoryStore`、`RedisStore`、`algorithms`、`keyGenerators` |
| 入口 | CommonJS `lib/index.js`、ESM `index.mjs`、类型定义 `index.d.ts` |

## 复审目标

这份文档用于确认当前实现是否已经与早先 audit 发现项和 2026-05-29 完成的修复结果保持一致。

## 结论摘要

当前实现与最新修复结果一致。

- 早先的 audit 报告仍然有效，但它描述的是修复前的问题状态。
- 当前代码已经体现契约修复、中间件修复、Redis 滑动窗口修复，以及内存存储和滑动窗口性能优化。
- 公开文档与项目元信息已同步到 `flex-rate-limit` 当前项目状态。

## 本次复核的重点

### 契约与正确性

- `token-bucket` 和 `leaky-bucket` 已把桶相关字段纳入主判定链路。
- `fixed-window` 的 `reset()` 已改为删除当前窗口对应的活动 key。
- `perRoute`、`middleware(...)` 局部覆盖、`skipSuccessfulRequests`、`skipFailedRequests` 都已接入主请求流程。
- 默认 `429` 处理不再发送响应后继续默认转发第二个错误。
- Redis 滑动窗口回滚现在会携带写入的 sorted-set member，并通过 `ZREM` 精确删除该 member。

### 性能路径

- `MemoryStore` 改为共享 sweep 的过期模型，不再为每个 key 单独创建 timer。
- `sliding-window` 使用 `requests + head` 结构，并在必要时压缩。
- Redis 滑动窗口检查已回到真实执行路径，并支持 pipeline。

### 验证结果

- `npm test`：通过，`41 passing`
- `npm run test:integration`：通过，`5 passing`
- `npm run lint`：通过

## 基准补充

修复阶段记录的微基准结果如下：

| 场景 | 优化前 | 优化后 | 变化 |
|---|---:|---:|---:|
| `fixed-window` | `33.54 ms` | `36.55 ms` | `+8.98%` |
| `sliding-window` | `349.20 ms` | `151.41 ms` | `-56.64%` |

这说明主要热点路径已经有明显改善，而 `fixed-window` 仍保持在同一量级的实用范围内。

## 后续建议

- 以后只要公开选项或中间件行为有变化，就同步更新 `README.md`、`docs/README.md` 和 `index.d.ts`。
- 如果还要继续做性能工作，建议把微基准沉淀为仓库内脚本或 `package.json` 命令，便于后续回归验证。

## 关联文档

- 默认英文 review：[`../REVIEW.md`](../REVIEW.md)
- 文档导航：[`README.md`](README.md)
