# Benchmark and Performance

`flex-rate-limit` is designed to keep the hot path small, but real throughput depends on the algorithm, storage backend, Node.js version, CPU, network, key distribution, and the work your application does after rate limiting.

Run these commands from a cloned repository after installing development dependencies with `npm install`. The npm runtime package does not require benchmark dependencies.

## Current Performance Guidance

| Area | Fastest Path | Tradeoff |
|------|--------------|----------|
| Storage | Memory store | Single-process only; counters are not shared across instances |
| Algorithm | Token bucket / leaky bucket in current Memory benchmarks | Higher throughput, but choose semantics before speed |
| Distributed usage | Redis store | Shared counters, with network and Redis command overhead |
| Fairness | Sliding window | More precise, but stores more per-key state |

## Run a Local Memory Benchmark

```bash
npm run benchmark:memory
BENCH_ITERATIONS=200000 BENCH_KEYS=5000 npm run benchmark:memory
BENCH_RUNS=5 BENCH_JSON=1 npm run benchmark:memory
```

PowerShell example:

```powershell
$env:BENCH_RUNS='5'
$env:BENCH_JSON='1'
npm run benchmark:memory
Remove-Item Env:\BENCH_RUNS
Remove-Item Env:\BENCH_JSON
```

The script reports local `ops/s` with median and range when multiple runs are requested. Do not copy the output into public documentation as a universal QPS claim unless the environment, command, Node.js version, CPU, and storage backend are recorded with it.

## Run a Local Redis Benchmark

Redis benchmark compares `RedisStore`, `CacheHubStore`, and the fixed-window Redis path from `rate-limiter-flexible` under the same local Redis instance.

```bash
npm run benchmark:redis
BENCH_ITERATIONS=10000 BENCH_KEYS=1000 BENCH_CONCURRENCY=1,32 npm run benchmark:redis
BENCH_JSON=1 npm run benchmark:redis
```

PowerShell example:

```powershell
$env:BENCH_ITERATIONS='10000'
$env:BENCH_KEYS='1000'
$env:BENCH_CONCURRENCY='1,32'
npm run benchmark:redis
Remove-Item Env:\BENCH_ITERATIONS
Remove-Item Env:\BENCH_KEYS
Remove-Item Env:\BENCH_CONCURRENCY
```

Useful environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` / `BENCH_REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |
| `BENCH_ITERATIONS` | `5000` | Total checks per case |
| `BENCH_KEYS` | `500` | Number of keys to spread requests across |
| `BENCH_CONCURRENCY` | `1,32` | Comma-separated concurrency levels |
| `BENCH_ALGORITHMS` | all algorithms | Comma-separated algorithm list |
| `BENCH_JSON` | `0` | Set to `1` for JSON output |

If Redis is unavailable, the script exits successfully with a clear skip message.

## Run a Local HTTP Middleware Benchmark

HTTP benchmark starts local Express services and drives them with `autocannon`. It compares:

- `flex-memory`
- `flex-redis`
- `flex-cache-hub`
- `rate-limiter-flexible`

```bash
npm run benchmark:http
BENCH_DURATION=10 BENCH_CONNECTIONS=100 npm run benchmark:http
BENCH_JSON=1 npm run benchmark:http
```

Useful environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BENCH_DURATION` | `5` | autocannon duration in seconds |
| `BENCH_CONNECTIONS` | `50` | concurrent HTTP connections |
| `BENCH_PIPELINING` | `1` | autocannon pipelining |
| `BENCH_SCENARIOS` | all scenarios | Comma-separated scenario list |
| `BENCH_ALGORITHM` | `fixed-window` | flex-rate-limit algorithm for flex scenarios |
| `BENCH_HEADERS` | `0` | Set to `1` to include rate-limit response headers |
| `BENCH_JSON` | `0` | Set to `1` for JSON output |

The default HTTP comparison disables rate-limit headers so the flex scenarios are closer to the bare `rate-limiter-flexible` middleware cost. Enable `BENCH_HEADERS=1` when you want to measure the default header-writing behavior.

## Extreme Optimization Roadmap

1. Use Redis and HTTP benchmark scenarios before publishing distributed QPS numbers.
2. Keep `CacheHubStore` as an opt-in Redis atomic backend, not as the default Memory replacement.
3. Keep direct `check()` integrations for Koa/Fastify/Hapi hot paths instead of routing through Express-style middleware adapters when possible.
4. Prefer token-bucket, leaky-bucket, or fixed-window algorithms for extremely high-throughput endpoints where their semantics are acceptable.
5. Use route-specific keys carefully to avoid Redis hot keys and to keep memory growth predictable.

## Correctness Note

Redis sliding-window entries use unique sorted-set members per store instance and request sequence. This avoids same-millisecond collisions across multiple limiter instances while preserving precise rollback for `skipSuccessfulRequests` and `skipFailedRequests`.
