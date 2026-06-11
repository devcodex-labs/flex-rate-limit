# flex-rate-limit Documentation Center

This is the English documentation center for `flex-rate-limit`. The website uses English as the default locale and keeps Simplified Chinese under `/zh/`. English and Chinese pages are both current user-facing documentation and must be updated together.

## Quick Navigation

### Getting Started in 5-10 Minutes

1. **[Quick Start](getting-started/quickstart.md)**
   Install the package, create your first limiter, use Express middleware, integrate other frameworks, choose a store, and shut down owned resources correctly.

2. **[Configuration](guides/config.md)**
   Learn required options, algorithm choices, storage backends, key generation, middleware rollback behavior, route-level limits, dynamic limits, and recommended presets.

### Usage Guides in 20-40 Minutes

3. **[Advanced Usage](guides/advanced.md)**
   Route-level limits, custom key generation, async skip rules, response-outcome rollback, custom handlers, IP allowlists/denylists, distributed usage, and operational notes.

4. **[Business Lock Guide](guides/business-lock-guide.md)**
   Build user + route, tenant + action, and sensitive-operation keys so one business action does not consume another action's quota.

5. **[Storage Backends](guides/storage.md)**
   Compare MemoryStore, RedisStore, CacheHubStore, Redis cluster/sentinel options, ownership rules, cleanup behavior, and selection guidance.

6. **[Benchmark and Performance](benchmark.md)**
   Reproduce Memory direct, Redis direct, HTTP middleware, and OSS comparison benchmarks with the current local commands and caveats.

7. **[IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md)**
   Understand the four common combinations of allowlist and rate limiting: only limiter, only allowlist, both, and global allowlist.

8. **[Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md)**
   Verify that allowlist authorization and rate limiting remain separate controls instead of using allowlist entries to bypass quotas.

9. **[Dynamic IP Allowlist Configuration](ip-whitelist-dynamic-config.md)**
   Configure global and route-level allowlists through environment variables, files, runtime APIs, and framework examples.

### Algorithm Topics in 40-90 Minutes

10. **[Algorithm Comparison](algorithms/comparison.md)**
    Compare fixed-window, sliding-window, token-bucket, and leaky-bucket behavior, fairness, memory cost, throughput, and recommended scenarios.

11. **[Deep Algorithm Analysis](algorithms/deep-analysis.md)**
    Review runtime contracts, state structures, burst analysis, rollback semantics, memory behavior, Redis/CacheHubStore effects, and testing strategies.

### API Reference

12. **[API Reference](reference/api-reference.md)**
    Public classes, options, result shape, stores, headers, exports, TypeScript interfaces, and common usage snippets.

## Learning Paths

### Path 1: I Want to Start Quickly

1. Read [Quick Start](getting-started/quickstart.md).
2. Copy the Express middleware example.
3. Use the default `sliding-window` algorithm and MemoryStore.
4. Run a few requests and confirm `X-RateLimit-*` headers.
5. Read [Configuration](guides/config.md) when you need route-specific behavior.

### Path 2: I Need Redis or Distributed Counters

1. Read [Storage Backends](guides/storage.md).
2. Choose `RedisStore` for standard shared counters or `CacheHubStore` for cache-hub atomic primitives.
3. Decide who owns the Redis client.
4. Call `await limiter.close()` for limiter-owned resources.
5. Run `npm run benchmark:redis` in your own environment before using benchmark numbers in capacity planning.

### Path 3: I Need Business-Level Rate Limits

1. Read [Business Lock Guide](guides/business-lock-guide.md).
2. Design keys around `userId`, `tenantId`, `route`, and business action.
3. Pick stricter windows for sensitive write operations.
4. Use Redis or CacheHubStore with Redis when multiple instances share the same key space.

### Path 4: I Need to Choose an Algorithm

1. Start with [Algorithm Comparison](algorithms/comparison.md).
2. Use `sliding-window` for login, payment, and sensitive APIs.
3. Use `fixed-window` for very hot coarse-grained limits.
4. Use `token-bucket` when controlled bursts are acceptable.
5. Use `leaky-bucket` when you want smoother traffic to a backend.
6. Read [Deep Algorithm Analysis](algorithms/deep-analysis.md) before changing algorithm internals.

### Path 5: I Need IP Allowlists

1. Read [Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md).
2. Decide whether the route needs allowlist authorization, rate limiting, or both.
3. Read [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md) for behavior in each combination.
4. Use [Dynamic IP Allowlist Configuration](ip-whitelist-dynamic-config.md) for environment variables, config files, and runtime APIs.

## Documentation Map

| Need | Page |
|---|---|
| First integration | [Quick Start](getting-started/quickstart.md) |
| Full options | [Configuration](guides/config.md) |
| Storage choice | [Storage Backends](guides/storage.md) |
| Route and business keys | [Business Lock Guide](guides/business-lock-guide.md) |
| Advanced middleware behavior | [Advanced Usage](guides/advanced.md) |
| Algorithm choice | [Algorithm Comparison](algorithms/comparison.md) |
| Algorithm internals | [Deep Algorithm Analysis](algorithms/deep-analysis.md) |
| Public API | [API Reference](reference/api-reference.md) |
| Performance data | [Benchmark and Performance](benchmark.md) |
| Allowlist scenarios | [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md) |
| Allowlist independence | [Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md) |
| Dynamic allowlist config | [Dynamic IP Allowlist Configuration](ip-whitelist-dynamic-config.md) |

## Key Concepts

### RateLimiter

`RateLimiter` is the main class. It accepts a time window, a max request count, an algorithm, a store, and optional middleware behavior. You can call `check(key)` directly or use `middleware()` in Express-compatible stacks.

### Store

The store holds rate-limit state. Use MemoryStore for single-process deployments, RedisStore for shared counters, CacheHubStore when you want cache-hub atomic state primitives, or a custom store when you need a project-specific backend.

### Algorithm

The algorithm decides how a key is counted. `sliding-window` is precise, `fixed-window` is coarse and fast, `token-bucket` supports bursts, and `leaky-bucket` smooths traffic.

### Middleware

Middleware maps request data to a key, writes headers, sends 429 responses, and can roll back counts after success or failure when `skipSuccessfulRequests` or `skipFailedRequests` is enabled.

## Common Questions

### Which page should I read first?

Start with [Quick Start](getting-started/quickstart.md). It gives you the shortest path to a working limiter.

### Which algorithm should I choose?

Use `sliding-window` by default when fairness matters. Use [Algorithm Comparison](algorithms/comparison.md) when throughput, burst behavior, or state size is more important.

### How do I protect login?

Use `sliding-window`, a low `max`, a 15-minute window, and a key that includes user identity or IP. See [Quick Start](getting-started/quickstart.md) and [Business Lock Guide](guides/business-lock-guide.md).

### How do Memory, Redis, and CacheHubStore differ?

Memory is local and usually fastest. Redis shares counters across instances. CacheHubStore keeps flex-rate-limit as the algorithm and middleware layer while using cache-hub atomic primitives. See [Storage Backends](guides/storage.md).

### Are allowlisted IPs exempt from rate limits?

No. In the independent allowlist design, allowlisting only authorizes access. The request still flows into the rate limiter. See [Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md).

## Locale

- English: `docs/en/`
- Simplified Chinese: `docs/zh/`

