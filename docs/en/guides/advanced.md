# Advanced Usage

## Table of Contents

- [Different Limits for Different Routes](#different-limits-for-different-routes)
- [Custom Key Generators](#custom-key-generators)
- [Dynamic Configuration](#dynamic-configuration)
- [IP Allowlist and Denylist](#ip-allowlist-and-denylist)
- [Redis Distributed Storage](#redis-distributed-storage)
- [Response Outcome Rollback](#response-outcome-rollback)
- [Custom Response Handler](#custom-response-handler)
- [Framework Integration Patterns](#framework-integration-patterns)
- [Production Notes](#production-notes)
- [Related Documents](#related-documents)

## Different Limits for Different Routes

Route-level limits let one application use different quotas for login, normal API calls, admin operations, and internal endpoints.

### Express Example

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  perRoute: {
    '/api/login': { max: 5, windowMs: 15 * 60 * 1000 },
    '/api/admin': { max: 20, windowMs: 60 * 1000 },
    '/api/public': { max: 1000, windowMs: 60 * 1000 },
  },
});

app.use('/api', limiter.middleware());
```

### Egg.js Route-Level Pattern

Egg.js projects often keep route logic in middleware and use route path or route name as part of the key:

```javascript
module.exports = () => {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (ctx) => `user:${ctx.user?.id || ctx.ip}:${ctx.path}`,
  });

  return async function rateLimit(ctx, next) {
    const result = await limiter.check(`route:${ctx.path}:ip:${ctx.ip}`);
    if (!result.allowed) {
      ctx.status = 429;
      ctx.body = { error: 'Too Many Requests' };
      return;
    }

    await next();
  };
};
```

## Custom Key Generators

### Why Key Generation Matters

The key defines who shares a quota. A poor key can accidentally make unrelated users share the same limit, or let one user bypass expected limits.

### Key Strategy Comparison

| Strategy | Example | Use Case | Risk |
|---|---|---|---|
| IP | `ip:203.0.113.10` | Anonymous traffic | NAT users share one quota |
| User ID | `user:42` | Authenticated APIs | Requires trusted identity |
| User + route | `user:42:/api/pay` | Business locks | More keys |
| Tenant + action | `tenant:acme:invoice:create` | SaaS quotas | Requires tenant context |
| API key | `api-key:abc` | Gateway plans | Key leakage affects quota |

### Examples

```javascript
const perIpLimiter = new RateLimiter({
  keyGenerator: (req) => `ip:${req.ip}`,
});

const perUserLimiter = new RateLimiter({
  keyGenerator: (req) => `user:${req.user?.id || 'guest'}`,
});

const perActionLimiter = new RateLimiter({
  keyGenerator: (req) => `tenant:${req.tenant.id}:user:${req.user.id}:route:${req.path}`,
});
```

## Dynamic Configuration

### Dynamic max

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: (req) => {
    if (req.user?.role === 'admin') return 5000;
    if (req.user?.plan === 'pro') return 1000;
    return 100;
  },
});
```

### Dynamic skip

```javascript
const limiter = new RateLimiter({
  skip: async (req) => {
    if (req.path === '/health') return true;
    return req.user?.internal === true;
  },
});
```

Use `skip` carefully. It bypasses rate limiting. For IP allowlists, prefer an independent allowlist middleware before the limiter unless bypassing quota is the explicit requirement.

## IP Allowlist and Denylist

### Independent Allowlist Pattern

```javascript
app.get('/api/admin/users',
  ipWhitelistMiddleware('/api/admin'),
  adminLimiter.middleware(),
  handler,
);
```

The allowlist authorizes access. The limiter still controls request volume. See [Allowlist and Rate Limit Independence](../whitelist-ratelimit-independence.md).

### Denylist Pattern

```javascript
const blocked = new Set(['203.0.113.10']);

function denylist(req, res, next) {
  if (blocked.has(req.ip)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
```

Place denylist/allowlist middleware before rate limiting when you want rejected traffic to avoid consuming quota.

## Redis Distributed Storage

Use Redis when multiple application instances need shared counters:

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis }),
});
```

Use `CacheHubStore` when you want cache-hub atomic primitives:

```javascript
const { CacheHubStore } = require('flex-rate-limit');

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({ client: redis, prefix: 'rl:' }),
});
```

## Response Outcome Rollback

### Roll Back Successful Requests

```javascript
const limiter = new RateLimiter({
  skipSuccessfulRequests: true,
});
```

This is useful when you only want failed requests to count, such as login failures.

### Roll Back Failed Requests

```javascript
const limiter = new RateLimiter({
  skipFailedRequests: true,
});
```

This is useful when successful requests should count but failed downstream responses should not consume user quota.

### Important Implementation Detail

Rollback requires internal metadata. Direct public `check()` results hide this metadata by default. Middleware explicitly enables it when rollback options are configured.

## Custom Response Handler

```javascript
const limiter = new RateLimiter({
  handler: (req, res) => {
    res.status(429).json({
      code: 429,
      message: 'Too Many Requests',
      retryAfter: Math.ceil(req.rateLimit?.retryAfter || 0),
    });
  },
});
```

Use a handler when your API has a standard error format.

## Framework Integration Patterns

### Direct `check()`

Use direct `check()` when the framework is not Express-compatible:

```javascript
const result = await limiter.check(key);
if (!result.allowed) {
  throw new TooManyRequestsError(result.retryAfter);
}
```

### Express-Compatible Middleware

Use `middleware()` when the framework supports `(req, res, next)`:

```javascript
app.use(limiter.middleware());
```

### Wrapper Middleware

When a framework uses a different signature, wrap `check()` and map the result to the framework's own response object.

## Production Notes

- Call `close()` for limiter-owned Redis clients or cache-hub cleanup timers.
- Use RedisStore or CacheHubStore with Redis when counters must be shared.
- Keep allowlist authorization separate from rate limiting unless bypass is intentional.
- Use business keys for sensitive operations.
- Record benchmark environment before using benchmark results in capacity planning.
- Keep English and Chinese docs synchronized when examples, options, or behavior change.

## Related Documents

- [Quick Start](../getting-started/quickstart.md)
- [Configuration](config.md)
- [Storage Backends](storage.md)
- [Business Lock Guide](business-lock-guide.md)
- [IP Allowlist Configuration Scenarios](../whitelist-ratelimit-config-scenarios.md)
- [API Reference](../reference/api-reference.md)

