# Unreleased

## 2026-06-01

- **Performance**: Optimized Memory Store and `RateLimiter.check()` hot paths with cached runtime options, Memory-specific algorithm fast paths, lazy TTL sweep rescheduling, and in-place sliding-window state maintenance.
- **Benchmarking**: Extended `npm run benchmark:memory` with multi-run median/range reporting and optional JSON output via `BENCH_RUNS` and `BENCH_JSON`.
- **Tests**: Added Memory Store regressions for extended TTL expiry and precise sliding-window rollback.
