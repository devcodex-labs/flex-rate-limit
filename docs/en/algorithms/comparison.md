# Algorithm Comparison

## Table of Contents

- [Quick Matrix](#quick-matrix)
- [Sliding Window](#sliding-window)
- [Fixed Window](#fixed-window)
- [Token Bucket](#token-bucket)
- [Leaky Bucket](#leaky-bucket)
- [How to Choose](#how-to-choose)
- [Token Bucket vs Leaky Bucket](#token-bucket-vs-leaky-bucket)
- [Recommended Production Configurations](#recommended-production-configurations)
- [Performance Dimensions](#performance-dimensions)
- [FAQ](#faq)
- [Related Docs](#related-docs)

## Quick Matrix

| Algorithm | Accuracy | Burst Behavior | State Cost | Good Fit |
|---|---|---|---|---|
| `sliding-window` | Highest | Smooth, strict | Higher | login, payment, sensitive APIs |
| `fixed-window` | Lower | Boundary bursts possible | Low | very hot coarse limits |
| `token-bucket` | Medium-high | Allows bursts | Low | API plans, gateway quotas |
| `leaky-bucket` | Medium-high | Smooth output | Low | backend protection, shaping |

## Sliding Window

Sliding window counts events in the last `windowMs` milliseconds.

```javascript
new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 15 * 60 * 1000,
  max: 5,
});
```

Use it when fairness matters more than raw throughput.

### Good Fit

- Login, password reset, MFA, payment, refund, coupon, and other abuse-sensitive operations.
- APIs where a user should never exceed `max` requests in any rolling `windowMs`.
- Multi-tenant systems where fairness is more important than squeezing out the highest possible per-process throughput.
- Business lock scenarios such as "same user + same route" limits.

### Characteristics

| Dimension | Value |
|---|---|
| Accuracy | Highest among the four algorithms |
| Boundary burst | No fixed-window boundary burst |
| Memory cost | Higher, because each active key keeps recent timestamps |
| User experience | Strict and predictable |
| Default fit | Recommended default for sensitive user actions |

### How It Works

For each key, the algorithm keeps request timestamps that are still inside the rolling time window.

```text
Current time: 10:01:00
Window:       60 seconds
Valid range:  10:00:00 - 10:01:00

Stored timestamps:
10:00:05, 10:00:20, 10:00:45, 10:00:55

Count = 4
If max = 5, the next request is allowed.
```

Expired timestamps are ignored or removed before the new request is evaluated. This is why the algorithm avoids the classic fixed-window boundary problem.

### Pros and Cons

| Pros | Cons |
|---|---|
| Strictest rolling-window fairness | More per-key state than the other algorithms |
| Good protection for sensitive operations | Slightly higher CPU and memory work under very high cardinality |
| Easy to explain to product and security teams | Requires careful storage choice for distributed deployments |

### Practical Notes

- Use a route-aware key such as `user:${userId}:${route}` when different endpoints need independent budgets.
- For Redis deployments, prefer a store path that supports atomic algorithm operations.
- For extremely high-cardinality traffic, benchmark against `fixed-window`, `token-bucket`, and `leaky-bucket` before choosing a global default.

## Fixed Window

Fixed window groups requests into calendar-like buckets.

```javascript
new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 1000,
});
```

Use it for very hot endpoints where approximate limits are acceptable.

### Good Fit

- High-throughput endpoints where an approximate count is acceptable.
- Coarse operational protection, such as "up to 10,000 requests per minute per API key".
- Internal APIs where the cost of an occasional boundary burst is low.
- Metrics-oriented throttling where compact state is more valuable than exact rolling fairness.

### Characteristics

| Dimension | Value |
|---|---|
| Accuracy | Lowest, because the window has hard boundaries |
| Boundary burst | Possible near the edge of two windows |
| Memory cost | Low, usually one counter per active key |
| User experience | Can feel permissive at window boundaries |
| Default fit | Good for hot, coarse limits |

### How It Works

The algorithm maps a request time to a bucket:

```text
bucket = floor(now / windowMs)
counter key = `${rateLimitKey}:${bucket}`
```

All requests in the same bucket share one counter. When time moves into the next bucket, the counter starts over.

```text
Window A: 10:00:00 - 10:00:59
Window B: 10:01:00 - 10:01:59

User sends 100 requests at 10:00:59
User sends 100 requests at 10:01:00

In two real seconds, the user may complete 200 requests.
```

That boundary behavior is the main tradeoff.

### Pros and Cons

| Pros | Cons |
|---|---|
| Very compact state | Can allow up to nearly `2 * max` around a boundary |
| Fast and easy to reason about | Less fair for sensitive actions |
| Works well for coarse operational limits | Reset timing can be visible to clients |

### Practical Notes

- Use it when throughput and state cost matter more than strict fairness.
- Avoid it as the only protection for login, MFA, payment, or similar sensitive actions.
- If boundary bursts are unacceptable, use `sliding-window` instead.

## Token Bucket

Token bucket refills quota over time and allows short bursts up to capacity.

```javascript
new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 100,
});
```

Use it for API plans, user quotas, or endpoints where bursts are acceptable.

### Good Fit

- API gateway plans where users can make short bursts but must follow a long-term average.
- Integrations that naturally send traffic in bursts, such as dashboards refreshing multiple widgets.
- Product quotas such as "100 requests per minute, with short bursts allowed".
- Mobile or edge clients that may retry or reconnect in small clusters.

### Characteristics

| Dimension | Value |
|---|---|
| Accuracy | Medium-high for average rate |
| Burst behavior | Allows bursts up to bucket capacity |
| Memory cost | Low, usually token count and last refill time |
| User experience | Flexible and forgiving |
| Default fit | Good for plan/quota style APIs |

### How It Works

Each key owns a bucket. The bucket has a capacity and refills over time.

```text
capacity = 100
refillRate = 100 tokens per windowMs

Request cost = 1 token
If tokens >= 1: allow and subtract 1
If tokens < 1: reject until enough tokens are refilled
```

In `flex-rate-limit`, `max` is the default capacity unless `capacity` is specified, and `refillRate` can be used to tune refill behavior.

### Pros and Cons

| Pros | Cons |
|---|---|
| Allows useful short bursts | Not as strict as sliding window |
| Keeps compact state | Burst capacity must be chosen carefully |
| Good fit for API plans | May still overload a fragile backend during synchronized bursts |

### Practical Notes

- Set `capacity` to the largest acceptable immediate burst.
- Set `refillRate` to the sustainable rate over `windowMs`.
- If a backend needs smooth arrival instead of burst tolerance, use `leaky-bucket`.

## Leaky Bucket

Leaky bucket smooths traffic by draining at a steady rate.

```javascript
new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 100,
});
```

Use it when the backend needs a steadier arrival rate.

### Good Fit

- Protecting backend services that degrade when traffic arrives in spikes.
- Work queues, notification senders, webhook dispatchers, and background processing endpoints.
- APIs where a client should experience gradual admission rather than burst-friendly admission.
- Traffic shaping before a slower dependency.

### Characteristics

| Dimension | Value |
|---|---|
| Accuracy | Medium-high for smoothing |
| Burst behavior | Restricts bursts more than token bucket |
| Memory cost | Low, usually water level and last leak time |
| User experience | Smooth but less burst-friendly |
| Default fit | Good for backend protection and shaping |

### How It Works

The bucket has a current water level. Requests add water. Time drains water at a stable rate.

```text
capacity = 100
leakRate = 100 per windowMs

Before checking: drain elapsed capacity
If water + cost <= capacity: allow and add cost
If water + cost > capacity: reject
```

This makes the effective output smoother than token bucket, especially when many clients send traffic at the same time.

### Pros and Cons

| Pros | Cons |
|---|---|
| Smooths traffic to protect dependencies | Less friendly to legitimate bursts |
| Compact state | Capacity and leak rate need tuning |
| Good for queue-like workloads | Not a strict rolling count |

### Practical Notes

- Use `leakRate` to match the backend's sustainable processing rate.
- Keep `capacity` close to the largest queue depth you are comfortable admitting.
- Combine with a route-aware key when only specific routes need shaping.

## How to Choose

| Requirement | Choose |
|---|---|
| Login protection | `sliding-window` |
| Highest Memory throughput | benchmark `fixed-window`, `token-bucket`, and `leaky-bucket` |
| Burst-friendly API plan | `token-bucket` |
| Smooth backend protection | `leaky-bucket` |
| Shared counters | RedisStore or CacheHubStore with Redis |

Use this decision path when choosing a default:

```text
Is the endpoint security-sensitive?
  yes -> sliding-window
  no  -> continue

Do users need short legitimate bursts?
  yes -> token-bucket
  no  -> continue

Does the backend require smooth arrival?
  yes -> leaky-bucket
  no  -> continue

Is the endpoint extremely hot and approximate limiting is acceptable?
  yes -> fixed-window
  no  -> sliding-window
```

## Token Bucket vs Leaky Bucket

Both algorithms keep compact state and both model a rate over time, but they optimize for different behavior.

| Question | Token Bucket | Leaky Bucket |
|---|---|---|
| What is stored? | Current token count and last refill time | Current water level and last leak time |
| What does it allow? | Short bursts up to capacity | Smoother request admission |
| What does it protect? | Long-term quota fairness | Backend stability under spikes |
| Best user experience | Flexible API plan limits | Predictable backend shaping |
| Risk if misconfigured | Burst capacity too high | Legitimate bursts rejected too early |

### Scenario Comparison

API plan:

```javascript
new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 100,
  capacity: 150,
  refillRate: 100,
});
```

Backend smoothing:

```javascript
new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 100,
  leakRate: 100,
});
```

If the product promise is "100 requests per minute with short bursts", choose token bucket. If the engineering goal is "do not let this dependency receive a spike", choose leaky bucket.

## Recommended Production Configurations

### Login Protection

```javascript
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  algorithm: 'sliding-window',
  keyGenerator: (req) => `login:${req.ip}:${req.body?.username || 'unknown'}`,
});
```

Why: login attempts need strict fairness and should not benefit from fixed-window boundaries.

### API Gateway Plan

```javascript
const apiPlanLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  algorithm: 'token-bucket',
  capacity: 1200,
  refillRate: 1000,
  keyGenerator: (req) => `api-key:${req.headers['x-api-key'] || req.ip}`,
});
```

Why: plan users often send small bursts, but the average rate must remain bounded.

### Queue or Webhook Protection

```javascript
const webhookLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  algorithm: 'leaky-bucket',
  leakRate: 300,
  keyGenerator: (req) => `webhook:${req.user?.id || req.ip}`,
});
```

Why: downstream workers usually prefer smooth input over bursty input.

### Very Hot Public Endpoint

```javascript
const publicLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10000,
  algorithm: 'fixed-window',
  keyGenerator: (req) => `public:${req.ip}`,
});
```

Why: the endpoint is hot, the limit is coarse, and a boundary burst is acceptable.

## Performance Dimensions

Performance depends on the storage backend, algorithm, key cardinality, network latency, and the shape of the request stream. Treat the matrix below as a decision aid, not as a substitute for local benchmark data.

| Algorithm | State per key | Typical operation | Accuracy | Burst control |
|---|---:|---|---|---|
| `sliding-window` | Up to recent request timestamps | prune + count + append | Highest | Strict |
| `fixed-window` | One counter per active bucket | increment + expire | Lower | Boundary burst possible |
| `token-bucket` | token count + timestamp | refill + consume | Medium-high | Burst-friendly |
| `leaky-bucket` | water level + timestamp | leak + admit | Medium-high | Smooth |

For reproducible local numbers, run:

```bash
npm run benchmark:memory
npm run benchmark:redis
npm run benchmark:http
```

Then compare:

- Median and p95 latency, not only QPS.
- State growth after keys expire.
- Behavior under high-cardinality keys.
- Redis command count and network round trips.
- Whether middleware rollback options are enabled.

## FAQ

### What is the default algorithm?

`sliding-window` is the default because it is the strictest and easiest to reason about for user-facing safety.

### When should I use fixed window?

Use it for high-throughput, coarse limits where boundary bursts are acceptable. Do not use it as the only protection for login, MFA, payment, or refund operations.

### How do I choose between token bucket and leaky bucket?

Choose `token-bucket` when legitimate bursts should be allowed. Choose `leaky-bucket` when the backend needs traffic smoothing.

### Can I switch algorithms later?

Yes. The public result shape remains the same, but the stored state semantics differ. For production systems, roll out algorithm changes by route or tenant and watch rejection rate, p95 latency, and key cardinality.

### Do all algorithms work with all stores?

Yes through the common store contract. Stores with algorithm-specific atomic methods can provide stronger distributed behavior and better performance for that algorithm.

## Related Docs

- [Quick Start](../getting-started/quickstart.md)
- [Configuration](../guides/config.md)
- [Advanced Usage](../guides/advanced.md)
- [Business Lock Guide](../guides/business-lock-guide.md)
- [Storage Backends](../guides/storage.md)
- [Algorithm Deep Analysis](deep-analysis.md)
- [API Reference](../reference/api-reference.md)
