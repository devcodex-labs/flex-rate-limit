# Algorithm Deep Analysis

## Table of Contents

- [Runtime Contract](#runtime-contract)
- [Fixed Window State](#fixed-window-state)
- [Sliding Window State](#sliding-window-state)
- [Token Bucket State](#token-bucket-state)
- [Leaky Bucket State](#leaky-bucket-state)
- [Rollback Semantics](#rollback-semantics)
- [Performance Notes](#performance-notes)
- [Sliding Window Deep Dive](#sliding-window-deep-dive)
- [Fixed Window Deep Dive](#fixed-window-deep-dive)
- [Token Bucket Deep Dive](#token-bucket-deep-dive)
- [Leaky Bucket Deep Dive](#leaky-bucket-deep-dive)
- [Instantaneous Burst Analysis](#instantaneous-burst-analysis)
- [Memory Model](#memory-model)
- [Algorithm Summary](#algorithm-summary)
- [Configuration Guidance](#configuration-guidance)
- [Related Docs](#related-docs)

## Runtime Contract

Every algorithm returns the same public shape:

```typescript
type RateLimitResult = {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
};
```

This makes storage and framework integration independent from the selected algorithm.

## Fixed Window State

Fixed window maps each key to a bucket derived from `Math.floor(now / windowMs)`. It is compact and fast, but allows bursts near the boundary between two windows.

## Sliding Window State

Sliding window keeps request timestamps for the last window. It gives the strictest fairness and is the safest default for sensitive actions. The tradeoff is more per-key state.

`CacheHubStore` with `cache-hub@2.2.4` uses public `cleanupExpired()` to prune expired in-memory entries without deleting still-active entries for the same key.

## Token Bucket State

Token bucket stores the current token count and last update time. It refills gradually and can allow bursts up to capacity.

## Leaky Bucket State

Leaky bucket stores the current water level and drain timestamp. It shapes traffic by draining at a steady rate.

## Rollback Semantics

Middleware options such as `skipSuccessfulRequests` and `skipFailedRequests` require rollback metadata. Direct public `check()` keeps that metadata hidden unless `trackRollback: true` is explicitly requested.

## Performance Notes

- Static Memory direct `check(key)` is the fastest path.
- Redis adds network and command overhead but enables shared counters.
- CacheHubStore is most useful as an opt-in Redis atomic backend.
- Use the benchmark scripts before publishing environment-specific performance claims.

## Sliding Window Deep Dive

### Algorithm Description

Sliding window evaluates requests against a rolling time range. If `windowMs` is 60 seconds and `max` is 100, a request at `10:01:00` is checked against requests from `10:00:00` through `10:01:00`, not against a calendar minute.

That makes it the strictest algorithm in this package. A client cannot send `max` requests at the end of one fixed bucket and another `max` immediately after the bucket changes.

### State Shape

For each key, the store keeps recent request timestamps:

```text
key = user:42:/api/login
state = [
  1718000001000,
  1718000005000,
  1718000012000
]
```

Before each decision, timestamps older than `now - windowMs` are removed or ignored. The remaining count is compared with `max`.

### Workflow

```text
1. Resolve key.
2. Read the active timestamp set/list for the key.
3. Drop timestamps older than the rolling window.
4. If active count + request cost > max, reject.
5. Otherwise append the current timestamp and allow.
6. Set expiry so inactive keys can be released after the window.
```

### Example Timeline

Configuration:

```javascript
new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 5,
});
```

Timeline:

```text
10:00:00 request 1 -> allowed, active count 1
10:00:10 request 2 -> allowed, active count 2
10:00:20 request 3 -> allowed, active count 3
10:00:30 request 4 -> allowed, active count 4
10:00:40 request 5 -> allowed, active count 5
10:00:50 request 6 -> rejected, active count still 5
10:01:01 request 6 -> allowed, request 1 has expired
```

### Instantaneous Burst Behavior

Maximum admitted requests in any real `windowMs` interval are bounded by `max`. That is the main advantage of sliding window.

```text
max instantaneous admitted requests in rolling window = max
```

### Memory Cost

Sliding window is the most memory-intensive algorithm because it stores per-request timestamps for active keys.

Approximate state:

```text
active keys * max timestamps per key
```

For 10,000 active users and `max = 100`, the worst-case state can approach 1,000,000 timestamps before expiry. Storage implementations may compress or prune that state differently, but the conceptual cost is still proportional to active requests in the window.

### Strengths

- Strictest fairness.
- Best default for security-sensitive routes.
- Easy to explain: "no more than N requests in any rolling period".
- Avoids fixed-window boundary bursts.

### Weaknesses

- Higher memory cost.
- More pruning work.
- Needs careful Redis or atomic-store behavior in distributed environments.

## Fixed Window Deep Dive

### Algorithm Description

Fixed window groups time into fixed buckets. A request belongs to exactly one bucket derived from `Math.floor(now / windowMs)`.

Configuration:

```javascript
new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 100,
});
```

### State Shape

The state is compact:

```text
key = user:42:/api/list
bucket = floor(now / 60000)
counter = 73
resetTime = bucketStart + 60000
```

Most stores need only a counter and an expiry time.

### Workflow

```text
1. Resolve key.
2. Resolve current fixed bucket.
3. Increment the bucket counter.
4. If counter > max, reject.
5. Otherwise allow.
6. Expire the bucket after the window.
```

### Boundary Scenario

The known weakness is boundary burst:

```text
max = 100
window = 60 seconds

10:00:59.900 -> 100 requests allowed in current bucket
10:01:00.001 -> 100 requests allowed in next bucket

Observed over roughly 101ms: 200 requests
```

This does not violate the fixed-window rule, but it may violate the business expectation if the expectation is rolling fairness.

### Instantaneous Burst Behavior

In the worst case, a client can complete almost `2 * max` requests around a window boundary.

```text
max instantaneous admitted requests near boundary ~= 2 * max
```

### Memory Cost

Fixed window has the lowest conceptual memory cost:

```text
active keys * one counter
```

That makes it attractive for very hot, approximate limits.

### Strengths

- Compact state.
- Usually the simplest and fastest counter model.
- Good for coarse-grained infrastructure protection.
- Easy to inspect in Redis or logs.

### Weaknesses

- Boundary burst can be significant.
- Less fair than sliding window.
- Reset timing can be predictable to clients.

## Token Bucket Deep Dive

### Algorithm Description

Token bucket models a capacity that refills over time. Each request consumes tokens. If enough tokens are available, the request is allowed; otherwise it is rejected until the bucket refills.

Configuration:

```javascript
new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 100,
  capacity: 150,
  refillRate: 100,
});
```

### State Shape

```text
key = api-key:abc
tokens = 87.5
lastRefill = 1718000000000
capacity = 150
refillRate = 100 per 60000ms
```

The state is compact because the algorithm does not store every request timestamp.

### Workflow

```text
1. Resolve key.
2. Load token count and last refill time.
3. Calculate elapsed time since last refill.
4. Add refill tokens, capped by capacity.
5. If tokens >= request cost, subtract cost and allow.
6. Otherwise reject and return retry timing.
```

### Refill Calculation

Conceptually:

```text
elapsed = now - lastRefill
tokensToAdd = elapsed / windowMs * refillRate
tokens = min(capacity, tokens + tokensToAdd)
```

Then a normal request consumes one token.

### Burst Behavior

Token bucket allows a burst up to `capacity`.

```text
max immediate burst = capacity
sustainable rate = refillRate per windowMs
```

If `capacity` is larger than `max`, a client can temporarily exceed the nominal per-window count, but only after the bucket has accumulated tokens.

### Memory Cost

```text
active keys * (tokens + timestamp + options metadata)
```

This is much smaller than sliding-window timestamp storage.

### Strengths

- Good user experience for API plans.
- Compact state.
- Supports controlled bursts.
- Useful when clients naturally batch requests.

### Weaknesses

- Not a strict rolling count.
- Capacity that is too high can admit bursts that overload a dependency.
- Product semantics need to distinguish "quota average" from "hard rolling cap".

## Leaky Bucket Deep Dive

### Algorithm Description

Leaky bucket models a bucket that drains at a steady rate. Incoming requests add water. If adding a request would exceed capacity, the request is rejected.

Configuration:

```javascript
new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 100,
  leakRate: 100,
});
```

### State Shape

```text
key = backend:reports
waterLevel = 42.3
lastLeak = 1718000000000
capacity = 100
leakRate = 100 per 60000ms
```

### Workflow

```text
1. Resolve key.
2. Load water level and last leak time.
3. Drain water according to elapsed time.
4. If water level + request cost > capacity, reject.
5. Otherwise add request cost and allow.
```

### Leak Calculation

Conceptually:

```text
elapsed = now - lastLeak
leaked = elapsed / windowMs * leakRate
waterLevel = max(0, waterLevel - leaked)
```

Then a normal request adds one unit of water.

### Burst Behavior

Leaky bucket can admit a burst only while the bucket has room. Unlike token bucket, it is not designed to accumulate extra burst allowance for later. Its main purpose is smoothing.

### Memory Cost

```text
active keys * (water level + timestamp + options metadata)
```

This is also compact.

### Strengths

- Smooths traffic.
- Good for protecting slow dependencies.
- Compact state.
- Useful in front of queues and workers.

### Weaknesses

- Less forgiving for legitimate bursts.
- Not a strict rolling-window count.
- Requires careful tuning to avoid rejecting acceptable traffic.

## Instantaneous Burst Analysis

Different algorithms answer different questions. The most important review question is: "How many requests can be admitted in a very short time?"

| Algorithm | Worst-case short burst | Explanation |
|---|---:|---|
| `sliding-window` | `max` | Rolling window prevents boundary amplification |
| `fixed-window` | nearly `2 * max` | End of one bucket plus beginning of next bucket |
| `token-bucket` | `capacity` | Stored tokens can be spent immediately |
| `leaky-bucket` | remaining capacity | Bucket space controls immediate admission |

### Boundary Comparison

```text
Sliding window:
  Last 60 seconds are always considered.
  Boundary does not reset the user's history.

Fixed window:
  Calendar bucket changes.
  Counter resets at the boundary.

Token bucket:
  Burst depends on accumulated tokens.
  Boundary is less important than refill math.

Leaky bucket:
  Burst depends on available bucket capacity.
  Drain rate decides how quickly capacity returns.
```

### Practical Interpretation

- Use `sliding-window` when "at most N in any period" must be literally true.
- Use `fixed-window` when "roughly N per bucket" is enough.
- Use `token-bucket` when "average N, burst M" matches the product contract.
- Use `leaky-bucket` when "smooth traffic into the dependency" is the operational goal.

## Memory Model

Memory pressure is mostly driven by active key cardinality, algorithm state shape, and expiry behavior.

| Algorithm | Conceptual state | Cleanup requirement |
|---|---|---|
| `sliding-window` | timestamp collection per active key | prune expired timestamps and release inactive keys |
| `fixed-window` | counter per key/bucket | expire old buckets |
| `token-bucket` | token count and timestamp | expire inactive buckets |
| `leaky-bucket` | water level and timestamp | expire inactive buckets |

### Store-Specific Notes

MemoryStore:

- Fastest local path.
- State must be released after key expiry.
- Good for single-process deployments, local development, and tests.

RedisStore:

- Enables shared counters across processes.
- Adds network and Redis command overhead.
- `resetAll()` uses prefix scanning when possible, so use a dedicated prefix.
- External clients are caller-owned unless `ownsClient` is set.

CacheHubStore:

- Uses `cache-hub@2.2.4` atomic state primitives.
- Can use Redis-backed atomic state when a Redis client is provided.
- In no-client memory mode, expired fixed-window, sliding-window, token-bucket, and leaky-bucket state is pruned by the wrapper cleanup path.
- `close()` stops internal cleanup timers for the auto-created memory path.

### Memory Regression Expectations

The project keeps a dedicated memory pressure regression for CacheHubStore. The important assertion is not only that old requests are rejected or allowed correctly, but also that expired internal state returns to zero after the TTL window and cleanup delay.

## Algorithm Summary

| Dimension | Sliding Window | Fixed Window | Token Bucket | Leaky Bucket |
|---|---|---|---|---|
| Strict rolling fairness | Excellent | Poor | Medium | Medium |
| Short burst tolerance | Low | Boundary burst | High | Low-medium |
| State cost | Highest | Lowest | Low | Low |
| Best for | Security-sensitive APIs | Hot coarse limits | API plans | Backend smoothing |
| Main risk | Memory under huge cardinality | Boundary amplification | Burst too large | Too strict for bursty clients |

### Detailed Selection Guide

Security-sensitive user operations:

```javascript
new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 15 * 60 * 1000,
  max: 5,
});
```

High-throughput operational limit:

```javascript
new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 10000,
});
```

API plan with bursts:

```javascript
new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 1000,
  capacity: 1200,
  refillRate: 1000,
});
```

Backend smoothing:

```javascript
new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 300,
  leakRate: 300,
});
```

## Configuration Guidance

### Sliding Window

Use conservative limits for endpoints where abuse causes account, money, or security risk.

```javascript
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `login:${req.ip}:${req.body?.username || 'unknown'}`,
});
```

### Fixed Window

Use it when the endpoint is very hot and the cost of boundary bursts is acceptable.

```javascript
const limiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 5000,
  keyGenerator: (req) => `public:${req.ip}`,
});
```

### Token Bucket

Separate capacity from refill rate when product language includes burst allowance.

```javascript
const limiter = new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 100,
  capacity: 150,
  refillRate: 100,
});
```

### Leaky Bucket

Tune leak rate to match the downstream system's sustainable processing rate.

```javascript
const limiter = new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 100,
  leakRate: 100,
});
```

### Distributed Deployments

For multiple Node.js processes, use a shared store:

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis(process.env.REDIS_URL);

const limiter = new RateLimiter({
  store: new RedisStore({ client: redis, prefix: 'rl:' }),
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
});
```

When the limiter creates the Redis client from a connection string, close it during shutdown:

```javascript
const limiter = new RateLimiter({
  store: 'redis://127.0.0.1:6379',
});

process.on('SIGTERM', async () => {
  await limiter.close();
});
```

## Related Docs

- [Algorithm Comparison](comparison.md)
- [Configuration](../guides/config.md)
- [Storage Backends](../guides/storage.md)
- [Business Lock Guide](../guides/business-lock-guide.md)
- [Benchmark](../benchmark.md)
- [API Reference](../reference/api-reference.md)
