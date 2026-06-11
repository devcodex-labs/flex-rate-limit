# Configuration

## Table of Contents

- [Quick Start](#quick-start)
- [Core Options](#core-options)
- [Algorithm](#algorithm)
- [Store](#store)
- [Key Generator](#key-generator)
- [Middleware Behavior](#middleware-behavior)
- [Route-Level Configuration](#route-level-configuration)
- [Dynamic Limits](#dynamic-limits)
- [Scenario Presets](#scenario-presets)
- [Redis Configuration](#redis-configuration)
- [Related Documents](#related-documents)

## Quick Start

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  algorithm: 'sliding-window',
});
```

The two required ideas are the time window and the maximum number of allowed requests. Other options refine the algorithm, storage backend, key generation, middleware behavior, and route overrides.

## Core Options

| Option | Type | Default | Description |
|---|---|---|---|
| `windowMs` | `number` | `60000` | Time window in milliseconds |
| `max` | `number \| Function` | `100` | Maximum requests per window |
| `algorithm` | `string` | `sliding-window` | Rate limiting algorithm |
| `store` | `Store \| 'memory' \| 'redis://...'` | `memory` | Storage backend |
| `keyGenerator` | `Function` | IP-based | Builds a key from request context |
| `skip` | `Function` | `() => false` | Bypasses rate limiting when true |
| `handler` | `Function` | built-in 429 response | Custom over-limit response |
| `headers` | `boolean` | `true` | Writes rate-limit headers |
| `perRoute` | `Object` | `null` | Route-level overrides |
| `skipSuccessfulRequests` | `boolean` | `false` | Roll back successful responses |
| `skipFailedRequests` | `boolean` | `false` | Roll back failed responses |

## Algorithm

```javascript
algorithm: 'sliding-window'
algorithm: 'fixed-window'
algorithm: 'token-bucket'
algorithm: 'leaky-bucket'
```

| Algorithm | Fairness | State Cost | Typical Use | Throughput |
|---|---|---|---|---|
| `sliding-window` | Highest | Higher | API limits, login protection | Medium |
| `fixed-window` | Lower | Low | Very hot coarse limits | High |
| `token-bucket` | Medium-high | Low | API gateways, burst-friendly plans | Medium-high |
| `leaky-bucket` | Medium-high | Low | Traffic shaping, backend protection | Medium-high |

### 1. Sliding Window

Use sliding window when you need the most precise rolling-window behavior.

```javascript
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  algorithm: 'sliding-window',
});
```

Recommended for:

- Login and authentication flows
- Payment or sensitive actions
- Per-user API limits where fairness matters

### 2. Fixed Window

Use fixed window when a coarse window is acceptable and you want a simple hot path.

```javascript
const publicLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  algorithm: 'fixed-window',
});
```

Fixed-window counters reset at window boundaries, so requests can cluster around the boundary.

### 3. Token Bucket

Use token bucket when controlled bursts are acceptable and capacity refills over time.

```javascript
const apiLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  windowMs: 60 * 1000,
  max: 100,
  capacity: 100,
  refillRate: 100,
});
```

Compared with sliding window:

| Dimension | Sliding Window | Token Bucket |
|---|---|---|
| Fairness | Strict rolling window | Burst-friendly |
| After quota is used | Wait for old requests to expire | Tokens refill gradually |
| Best fit | Login and sensitive APIs | API plans and gateways |

### 4. Leaky Bucket

Use leaky bucket when the goal is to smooth traffic to a backend.

```javascript
const backendLimiter = new RateLimiter({
  algorithm: 'leaky-bucket',
  windowMs: 60 * 1000,
  max: 100,
  capacity: 100,
  leakRate: 100,
});
```

Leaky bucket allows requests while the bucket has capacity and gradually drains state over time.

## Store

### Memory

```javascript
const limiter = new RateLimiter({
  store: 'memory',
});
```

Use Memory for single-process services, tests, local development, and low-complexity deployments.

### Redis Connection String

```javascript
const limiter = new RateLimiter({
  store: 'redis://localhost:6379',
});

await limiter.close();
```

The library creates and owns the Redis client in this form. Short-lived scripts and services should call `await limiter.close()`.

### RedisStore Instance

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  store: new RedisStore({ client: redis, ownsClient: false }),
});
```

The caller owns the Redis client by default. Set `ownsClient: true` if the store should close it.

### CacheHubStore Atomic Backend

```javascript
const Redis = require('ioredis');
const { RateLimiter, CacheHubStore } = require('flex-rate-limit');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  store: new CacheHubStore({ client: redis, prefix: 'rl:' }),
});
```

Use CacheHubStore when you want cache-hub atomic state primitives while keeping flex-rate-limit as the algorithm and middleware layer.

## Key Generator

The key generator controls the isolation boundary of a quota.

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req) => `user:${req.user?.id || 'guest'}:${req.path}`,
});
```

Common key strategies:

| Strategy | Example Key | Use |
|---|---|---|
| IP only | `ip:203.0.113.10` | Anonymous public traffic |
| User ID | `user:42` | Authenticated APIs |
| User + route | `user:42:/api/pay` | Business locks and route-level fairness |
| Tenant + action | `tenant:acme:invoice:create` | Multi-tenant SaaS |
| API key | `api-key:abc123` | Gateway-style plans |

## Middleware Behavior

### skip

```javascript
const limiter = new RateLimiter({
  skip: (req) => req.path === '/health',
});
```

Use `skip` for routes that should not be counted, such as health checks. Do not use `skip` to make allowlisted IPs bypass limits unless that is explicitly intended.

### Custom Handler

```javascript
const limiter = new RateLimiter({
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
    });
  },
});
```

### Response Outcome Rollback

```javascript
const limiter = new RateLimiter({
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
});
```

`skipSuccessfulRequests` and `skipFailedRequests` use rollback metadata internally. Public `check()` results do not expose that metadata unless `trackRollback: true` is requested.

## Route-Level Configuration

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  perRoute: {
    '/api/login': { max: 5, windowMs: 15 * 60 * 1000 },
    '/api/users': { max: 100, windowMs: 60 * 1000 },
    '/api/admin': { max: 20, windowMs: 60 * 1000 },
  },
});
```

Route-level overrides are useful when the same application needs different limits for login, query, admin, and write operations.

## Dynamic Limits

`max` can be a function:

```javascript
const limiter = new RateLimiter({
  max: (req) => {
    if (req.user?.plan === 'enterprise') return 5000;
    if (req.user?.plan === 'pro') return 1000;
    return 100;
  },
});
```

Use dynamic limits for plan-based quotas, tenant-specific limits, or internal service accounts.

## Scenario Presets

| Scenario | Algorithm | Window | Max | Notes |
|---|---|---:|---:|---|
| Login | `sliding-window` | 15 minutes | 5-10 | Include username or user ID in the key |
| Public API | `token-bucket` | 1 minute | 100-1000 | Allows controlled bursts |
| Sensitive writes | `sliding-window` | 1 hour | 20-100 | Pair with business keys |
| Internal health checks | `fixed-window` | 1 minute | high | Often skipped or lightly limited |
| Backend protection | `leaky-bucket` | 1 minute | backend capacity | Smooths request flow |

## Redis Configuration

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  db: 0,
});

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
});
```

For cluster and sentinel examples, see [Storage Backends](storage.md).

## Related Documents

- [Storage Backends](storage.md)
- [Advanced Usage](advanced.md)
- [Business Lock Guide](business-lock-guide.md)
- [Algorithm Comparison](../algorithms/comparison.md)
- [API Reference](../reference/api-reference.md)

