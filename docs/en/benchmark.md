# Benchmark and Performance

## Table of Contents

- [Environment](#environment)
- [Current Memory Benchmark](#current-memory-benchmark)
- [Memory OSS Comparison](#memory-oss-comparison)
- [Redis Direct Benchmark](#redis-direct-benchmark)
- [HTTP Middleware Benchmark](#http-middleware-benchmark)
- [Run the Benchmarks](#run-the-benchmarks)
- [Reading the Numbers](#reading-the-numbers)

## Environment

Latest local run:

| Field | Value |
|---|---|
| Date | 2026-06-11 |
| Node.js | `v20.20.2` |
| OS / Arch | `win32 x64` |
| CPU | Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz |
| Redis | `redis://127.0.0.1:6379` |
| Package version | `flex-rate-limit@2.2.4` working tree |

These numbers are local-machine measurements, not portable product claims.

## Current Memory Benchmark

Command:

```powershell
$env:BENCH_JSON='1'
$env:BENCH_RUNS='5'
$env:BENCH_ITERATIONS='200000'
$env:BENCH_KEYS='1000'
npm run benchmark:memory
```

| Algorithm | Median ops/s | Range ops/s |
|---|---:|---:|
| fixed-window | 1,000,695 | 758,579-1,177,554 |
| sliding-window | 1,488,518 | 1,116,897-1,964,677 |
| token-bucket | 1,150,445 | 849,225-1,374,173 |
| leaky-bucket | 1,033,670 | 868,372-1,224,991 |

## Memory OSS Comparison

The OSS comparison uses the historical local script in `.devcodex/flex-rate-limit/tmp/oss-rate-limit-bench-20260531/compare-oss.cjs`.

### 100,000 checks / 1,000 keys

| Implementation | Median ops/s |
|---|---:|
| flex sliding-window | 2,137,273 |
| limiter keyed token bucket | 1,821,318 |
| rate-limiter-flexible memory | 1,755,547 |
| express-rate-limit memory middleware | 559,102 |

### 200,000 checks / 5,000 keys

| Implementation | Median ops/s |
|---|---:|
| flex sliding-window | 2,085,832 |
| limiter keyed token bucket | 1,146,367 |
| rate-limiter-flexible memory | 865,127 |
| express-rate-limit memory middleware | 314,179 |

### 100,000 checks / 1 hot key

| Implementation | Median ops/s |
|---|---:|
| flex sliding-window | 3,236,078 |
| rate-limiter-flexible memory | 3,112,453 |
| flex leaky-bucket | 2,507,171 |
| limiter keyed token bucket | 2,115,614 |
| express-rate-limit memory middleware | 544,788 |

## Redis Direct Benchmark

Command:

```powershell
$env:BENCH_JSON='1'
$env:BENCH_ITERATIONS='5000'
$env:BENCH_KEYS='500'
$env:BENCH_CONCURRENCY='1,32'
npm run benchmark:redis
```

| Store | Algorithm | c=1 ops/s | c=32 ops/s |
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

## HTTP Middleware Benchmark

Command:

```powershell
$env:BENCH_JSON='1'
$env:BENCH_DURATION='5'
$env:BENCH_CONNECTIONS='50'
$env:BENCH_KEYS='500'
npm run benchmark:http
```

| Scenario | req/s | p50 | p99 |
|---|---:|---:|---:|
| flex-redis | 3,531 | 13 ms | 34 ms |
| flex-cache-hub | 3,501 | 13 ms | 27 ms |
| flex-memory | 3,151 | 13 ms | 46 ms |
| rate-limiter-flexible | 2,771 | 15 ms | 52 ms |

## Run the Benchmarks

```bash
npm run benchmark:memory
npm run benchmark:redis
npm run benchmark:http
```

Set `BENCH_JSON=1` for machine-readable output. Redis benchmarks skip cleanly if Redis is unavailable.

## Reading the Numbers

- Use Memory results for single-process direct `check()` hot paths.
- Use Redis direct results for distributed counter overhead.
- Use HTTP results for Express-style middleware overhead.
- Do not compare these numbers to production traffic without matching Node.js, CPU, Redis topology, concurrency, key distribution, and application work.
