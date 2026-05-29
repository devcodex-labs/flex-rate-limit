# Project Review

> Verified against the repository state on 2026-05-29.
> Chinese translation: [docs/review.zh-CN.md](docs/review.zh-CN.md)

## Project Snapshot

| Field | Value |
|---|---|
| Package | `flex-rate-limit` |
| Version | `1.0.5` |
| Runtime | Node.js `>=14.0.0` |
| Repository | `https://github.com/vextjs/flex-rate-limit` |
| Primary exports | `RateLimiter`, `MemoryStore`, `RedisStore`, `algorithms`, `keyGenerators` |
| Entry points | CommonJS `lib/index.js`, ESM `index.mjs`, types `index.d.ts` |

## Review Goal

This review checks whether the current implementation matches the earlier audit findings and the fixes completed on 2026-05-29.

## Executive Summary

The current implementation is aligned with the latest remediation work.

- The earlier audit report remains useful as a historical record of pre-fix issues.
- The current code contains the contract fixes, middleware behavior fixes, Redis sliding-window fix, and memory/sliding-window performance improvements from the remediation round.
- The documentation and project metadata have been updated to point at the `flex-rate-limit` project and to describe the current implementation state.

## What Was Re-checked

### Contract and correctness

- `token-bucket` and `leaky-bucket` now use their bucket-specific fields in the main decision path.
- `fixed-window` reset targets the active window key.
- `perRoute`, `middleware(...)` overrides, `skipSuccessfulRequests`, and `skipFailedRequests` are wired into the request flow.
- The default `429` handler no longer sends a response and then forwards a second error.
- Redis sliding-window rollback now carries the written sorted-set member and removes that exact member with `ZREM`.

### Performance path

- `MemoryStore` uses a shared sweep-based expiry model instead of one timer per key.
- `sliding-window` uses a `requests + head` structure and compacts only when useful.
- Redis sliding-window checks run through the real execution path and support pipelined operations.

### Verification

- `npm test`: passed with `41 passing`
- `npm run test:integration`: passed with `5 passing`
- `npm run lint`: passed

## Benchmark Note

Micro-benchmark data captured during the remediation work showed:

| Case | Before | After | Change |
|---|---:|---:|---:|
| `fixed-window` | `33.54 ms` | `36.55 ms` | `+8.98%` |
| `sliding-window` | `349.20 ms` | `151.41 ms` | `-56.64%` |

The main hotspot improved materially, while the fixed-window path stayed in the same practical range.

## Follow-up Guidance

- Keep `README.md`, `docs/README.md`, and `index.d.ts` in sync whenever public options or middleware behavior changes.
- If performance work continues, promote the micro-benchmark into a checked-in script or package command so future regressions are easier to verify.

## Related Documents

- Chinese translation: [docs/review.zh-CN.md](docs/review.zh-CN.md)
- Documentation index: [docs/README.md](docs/README.md)
