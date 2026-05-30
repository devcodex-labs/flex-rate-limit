# Benchmark and Performance

`flex-rate-limit` is designed to keep the hot path small, but real throughput depends on the algorithm, storage backend, Node.js version, CPU, network, key distribution, and the work your application does after rate limiting.

## Current Performance Guidance

| Area | Fastest Path | Tradeoff |
|------|--------------|----------|
| Storage | Memory store | Single-process only; counters are not shared across instances |
| Algorithm | Fixed window | Highest throughput, but accepts boundary bursts |
| Distributed usage | Redis store | Shared counters, with network and Redis command overhead |
| Fairness | Sliding window | More precise, but stores more per-key state |

## Run a Local Memory Benchmark

```bash
npm run benchmark:memory
BENCH_ITERATIONS=200000 BENCH_KEYS=5000 npm run benchmark:memory
```

The script intentionally reports local `ops/s` only. Do not copy the output into public documentation as a universal QPS claim unless the environment, command, Node.js version, CPU, and storage backend are recorded with it.

## Extreme Optimization Roadmap

1. Add reproducible benchmark scripts for Memory and Redis scenarios before publishing QPS numbers.
2. Use Redis Lua scripts for sliding-window and bucket algorithms to reduce round trips and improve atomicity.
3. Keep direct `check()` integrations for Koa/Fastify/Hapi hot paths instead of routing through Express-style middleware adapters.
4. Prefer fixed-window or token-bucket algorithms for extremely high-throughput endpoints where boundary burst behavior is acceptable.
5. Use route-specific keys carefully to avoid Redis hot keys and to keep memory growth predictable.

## Correctness Note

Redis sliding-window entries use unique sorted-set members per store instance and request sequence. This avoids same-millisecond collisions across multiple limiter instances while preserving precise rollback for `skipSuccessfulRequests` and `skipFailedRequests`.
