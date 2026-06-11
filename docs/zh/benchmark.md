# 性能基准

## 目录

- [测试环境](#测试环境)
- [当前 Memory 基准](#当前-memory-基准)
- [Memory OSS 对比](#memory-oss-对比)
- [Redis Direct 基准](#redis-direct-基准)
- [HTTP Middleware 基准](#http-middleware-基准)
- [如何复现](#如何复现)
- [如何解读数据](#如何解读数据)

## 测试环境

最新本地测试环境如下：

| 项目 | 值 |
|---|---|
| 日期 | 2026-06-11 |
| Node.js | `v20.20.2` |
| OS / Arch | `win32 x64` |
| CPU | Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz |
| Redis | `redis://127.0.0.1:6379` |
| 包版本 | `flex-rate-limit@2.2.4` working tree |

这些结果是本机测量值，不是跨机器通用的产品承诺。

## 当前 Memory 基准

命令：

```powershell
$env:BENCH_JSON='1'
$env:BENCH_RUNS='5'
$env:BENCH_ITERATIONS='200000'
$env:BENCH_KEYS='1000'
npm run benchmark:memory
```

| 算法 | Median ops/s | Range ops/s |
|---|---:|---:|
| fixed-window | 1,000,695 | 758,579-1,177,554 |
| sliding-window | 1,488,518 | 1,116,897-1,964,677 |
| token-bucket | 1,150,445 | 849,225-1,374,173 |
| leaky-bucket | 1,033,670 | 868,372-1,224,991 |

## Memory OSS 对比

OSS 对比使用历史本地脚本 `.devcodex/flex-rate-limit/tmp/oss-rate-limit-bench-20260531/compare-oss.cjs`。

### 100,000 次 check / 1,000 keys

| 实现 | Median ops/s |
|---|---:|
| flex sliding-window | 2,137,273 |
| limiter keyed token bucket | 1,821,318 |
| rate-limiter-flexible memory | 1,755,547 |
| express-rate-limit memory middleware | 559,102 |

### 200,000 次 check / 5,000 keys

| 实现 | Median ops/s |
|---|---:|
| flex sliding-window | 2,085,832 |
| limiter keyed token bucket | 1,146,367 |
| rate-limiter-flexible memory | 865,127 |
| express-rate-limit memory middleware | 314,179 |

### 100,000 次 check / 1 个热点 key

| 实现 | Median ops/s |
|---|---:|
| flex sliding-window | 3,236,078 |
| rate-limiter-flexible memory | 3,112,453 |
| flex leaky-bucket | 2,507,171 |
| limiter keyed token bucket | 2,115,614 |
| express-rate-limit memory middleware | 544,788 |

## Redis Direct 基准

命令：

```powershell
$env:BENCH_JSON='1'
$env:BENCH_ITERATIONS='5000'
$env:BENCH_KEYS='500'
$env:BENCH_CONCURRENCY='1,32'
npm run benchmark:redis
```

| Store | 算法 | c=1 ops/s | c=32 ops/s |
|---|---|---:|---:|
| RedisStore | fixed-window | 9,698 | 33,458 |
| CacheHubStore | fixed-window | 9,255 | 40,465 |
| RedisStore | sliding-window | 6,840 | 14,684 |
| CacheHubStore | sliding-window | 7,847 | 29,482 |
| RedisStore | token-bucket | 6,047 | 15,451 |
| CacheHubStore | token-bucket | 9,390 | 44,921 |
| RedisStore | leaky-bucket | 6,301 | 18,631 |
| CacheHubStore | leaky-bucket | 8,911 | 46,160 |
| rate-limiter-flexible | fixed-window | 8,183 | 20,072 |

## HTTP Middleware 基准

命令：

```powershell
$env:BENCH_JSON='1'
$env:BENCH_DURATION='5'
$env:BENCH_CONNECTIONS='50'
$env:BENCH_KEYS='500'
npm run benchmark:http
```

| 场景 | req/s | p50 | p99 |
|---|---:|---:|---:|
| flex-redis | 3,531 | 13 ms | 34 ms |
| flex-cache-hub | 3,501 | 13 ms | 27 ms |
| flex-memory | 3,151 | 13 ms | 46 ms |
| rate-limiter-flexible | 2,771 | 15 ms | 52 ms |

## 如何复现

```bash
npm run benchmark:memory
npm run benchmark:redis
npm run benchmark:http
```

设置 `BENCH_JSON=1` 可输出机器可读 JSON。Redis 不可用时，Redis 相关 benchmark 会给出明确跳过信息并正常退出。

## 如何解读数据

- Memory 结果适合评估单进程直接 `check()` 热路径。
- Redis Direct 结果适合评估分布式计数的 Redis 与原子后端开销。
- HTTP 结果适合评估 Express 风格 middleware 链路开销。
- 不要在 Node.js 版本、CPU、Redis 拓扑、并发数、key 分布和应用自身工作量不同的情况下直接复用这些数字。
