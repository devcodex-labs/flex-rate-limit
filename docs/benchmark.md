# Benchmark and Performance

`flex-rate-limit` is designed to keep the hot path small, but real throughput depends on the algorithm, storage backend, Node.js version, CPU, network, key distribution, and the work your application does after rate limiting.

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

## Extreme Optimization Roadmap

1. Add Redis benchmark scenarios before publishing distributed QPS numbers.
2. Use Redis Lua scripts for sliding-window and bucket algorithms to reduce round trips and improve atomicity.
3. Keep direct `check()` integrations for Koa/Fastify/Hapi hot paths instead of routing through Express-style middleware adapters.
4. Prefer token-bucket, leaky-bucket, or fixed-window algorithms for extremely high-throughput endpoints where their semantics are acceptable.
5. Use route-specific keys carefully to avoid Redis hot keys and to keep memory growth predictable.

## Correctness Note

Redis sliding-window entries use unique sorted-set members per store instance and request sequence. This avoids same-millisecond collisions across multiple limiter instances while preserving precise rollback for `skipSuccessfulRequests` and `skipFailedRequests`.
