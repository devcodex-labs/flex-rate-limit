# Business Lock Guide

## Table of Contents

- [What Is a Business Lock?](#what-is-a-business-lock)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Complete Examples](#complete-examples)
- [Common Scenarios](#common-scenarios)
- [Advanced Scenarios](#advanced-scenarios)
- [Key Design Patterns](#key-design-patterns)
- [Distributed Business Locks](#distributed-business-locks)
- [Testing](#testing)
- [FAQ](#faq)
- [Summary](#summary)
- [Best Practices](#best-practices)
- [Related Documents](#related-documents)

## What Is a Business Lock?

A business lock is a rate-limit key designed around a business action rather than only an IP address.

Traditional rate limiting often uses a coarse key such as:

```text
ip:203.0.113.10
```

Business locking uses keys such as:

```text
user:42:route:/api/login
tenant:acme:action:invoice:create
user:42:resource:order:123:action:pay
```

This prevents one action from consuming another action's quota.

### Traditional Rate Limit vs Business Lock

| Dimension | Traditional Limit | Business Lock |
|---|---|---|
| Key | IP or user | User + route/action/resource |
| Scope | Broad | Precise |
| Best for | General API protection | Sensitive business operations |
| Example | 100 requests per minute per IP | 5 login attempts per user per 15 minutes |

### Typical Scenarios

- Login attempts
- Password reset
- Payment submission
- Order creation
- Invoice generation
- SMS or email code sending
- Admin operations
- Tenant-specific quotas

## Core Concepts

### keyGenerator

The key generator defines the business boundary:

```javascript
const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `login:${req.ip}:${req.body?.username || 'anonymous'}`,
});
```

### Route Context

Add route information when the same user should have separate quotas for different APIs:

```javascript
keyGenerator: (req) => `user:${req.user.id}:route:${req.path}`
```

### Tenant Context

For SaaS systems, include tenant identity:

```javascript
keyGenerator: (req) => `tenant:${req.tenant.id}:user:${req.user.id}:action:${req.action}`
```

## Quick Start

### User + Route Limit

```javascript
const { RateLimiter } = require('flex-rate-limit');

const routeLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  algorithm: 'sliding-window',
  keyGenerator: (req) => {
    const user = req.user?.id || 'anonymous';
    return `user:${user}:route:${req.path}`;
  },
});

app.use('/api', routeLimiter.middleware());
```

### Sensitive Operation Limit

```javascript
const paymentLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  algorithm: 'sliding-window',
  keyGenerator: (req) => `payment:user:${req.user.id}`,
});

app.post('/api/payment/submit', paymentLimiter.middleware(), submitPayment);
```

Sliding window is a good default for sensitive operations because it avoids fixed-window boundary bursts.

## Complete Examples

### Example 1: Multi-Level Limits

Many business systems need different strictness levels:

| Level | Typical operations | Example limit |
|---|---|---|
| Strict | login, register, reset password, payment | 5 requests / 15 minutes |
| Normal | create, update, delete business data | 50 requests / hour |
| Relaxed | list, detail, search, read-only pages | 200 requests / minute |

Egg.js-style middleware factory:

```javascript
// app/middleware/rate-limit.js
const { RateLimiter } = require('flex-rate-limit');

module.exports = (app) => {
  return {
    strict: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        algorithm: 'sliding-window',
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.state?.user?.id || ctx.ip;
          return `strict:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = {
          code: 429,
          message: 'Operation is too frequent. Please try again later.',
          retryAfter: result.retryAfter,
        };
        return;
      }

      await next();
    },

    normal: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 50,
        algorithm: 'sliding-window',
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.state?.user?.id || ctx.ip;
          return `normal:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: 'Too many requests.' };
        return;
      }

      await next();
    },

    relaxed: async (ctx, next) => {
      const limiter = new RateLimiter({
        windowMs: 60 * 1000,
        max: 200,
        algorithm: 'token-bucket',
        keyGenerator: (ctx) => {
          const userId = ctx.user?.id || ctx.state?.user?.id || ctx.ip;
          return `relaxed:user:${userId}:${ctx.path}`;
        },
      });

      const key = await limiter.options.keyGenerator(ctx);
      const result = await limiter.check(key);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.body = { code: 429, message: 'Too many requests.' };
        return;
      }

      await next();
    },
  };
};
```

Route usage:

```javascript
// app/router.js
module.exports = (app) => {
  const { router, controller } = app;
  const limit = app.middleware.rateLimit(app);

  router.post('/api/login', limit.strict, controller.auth.login);
  router.post('/api/register', limit.strict, controller.auth.register);
  router.post('/api/reset-password', limit.strict, controller.auth.resetPassword);

  router.post('/api/posts', limit.normal, controller.post.create);
  router.put('/api/posts/:id', limit.normal, controller.post.update);
  router.delete('/api/posts/:id', limit.normal, controller.post.delete);

  router.get('/api/posts', limit.relaxed, controller.post.list);
  router.get('/api/posts/:id', limit.relaxed, controller.post.detail);
};
```

### Example 2: Predefined Key Generator

Use `keyGenerators.userAndRoute` when the framework request object already exposes a user and a route context.

```javascript
const { RateLimiter, keyGenerators } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: keyGenerators.userAndRoute,
});
```

Equivalent implementation:

```javascript
(req, context) => {
  const userId = req.user?.id || req.ip || 'unknown';
  const route = context?.route || 'unknown';
  return `user:${userId}:${route}`;
}
```

Available generators:

| Generator | Key format | Recommended use |
|---|---|---|
| `ip` | `127.0.0.1` | IP-based anonymous limits |
| `userId` | `user:123` | One shared user quota across routes |
| `routeAndIp` | `/api/login:127.0.0.1` | Route + IP limits |
| `apiEndpoint` | `api:/api/login:127.0.0.1` | API endpoint limits |
| `userAndRoute` | `user:123:/api/login` | Business lock, recommended for user-route isolation |

## Common Scenarios

### Scenario 1: Login Protection

```javascript
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  algorithm: 'sliding-window',
  keyGenerator: (req) => `login:${req.ip}:${req.body.username || 'unknown'}`,
});
```

This limits attempts per username + IP instead of globally limiting the whole login endpoint.

### Scenario 2: SMS Code Sending

```javascript
const smsLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req) => `sms:${req.body.phone}`,
});
```

Use a longer secondary limiter when needed:

```javascript
const smsDailyLimiter = new RateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `sms-day:${req.body.phone}`,
});
```

### Scenario 3: Tenant Quota

```javascript
const tenantLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: (req) => req.tenant.plan === 'enterprise' ? 5000 : 500,
  keyGenerator: (req) => `tenant:${req.tenant.id}`,
});
```

### Scenario 4: Resource Action

```javascript
const orderLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user:${req.user.id}:order:${req.params.orderId}:action:${req.method}`,
});
```

### Scenario 5: Admin Operations

```javascript
const adminLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: (req) => `admin:${req.user.id}:${req.path}`,
});
```

## Advanced Scenarios

### Scenario 1: VIP or Plan-Based Limits

Business locks can combine identity, route, and plan level.

```javascript
const planLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: async (req) => {
    if (req.user?.plan === 'enterprise') return 5000;
    if (req.user?.plan === 'pro') return 1000;
    return 100;
  },
  keyGenerator: (req) => {
    const plan = req.user?.plan || 'free';
    const userId = req.user?.id || req.ip;
    return `plan:${plan}:user:${userId}:route:${req.path}`;
  },
});
```

Response copy can explain the plan difference:

```javascript
handler: (req, res) => {
  const plan = req.user?.plan || 'free';
  res.status(429).json({
    code: 'RATE_LIMITED',
    message: plan === 'free'
      ? 'Request limit reached. Upgrade for a higher quota.'
      : 'Request limit reached. Please try again later.',
  });
}
```

### Scenario 2: Resource-Level Lock

Use resource identity when the protected action is tied to a specific object.

```javascript
function createResourceLimiter(resourceIdField = 'id') {
  return new RateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    algorithm: 'sliding-window',
    keyGenerator: (req) => {
      const userId = req.user?.id || req.ip;
      const resourceId = req.params?.[resourceIdField] || req.query?.[resourceIdField];
      return `resource:user:${userId}:route:${req.path}:resource:${resourceId || 'unknown'}`;
    },
  });
}
```

Examples:

```javascript
const likeLimiter = createResourceLimiter('id');
const commentLimiter = createResourceLimiter('id');

app.post('/api/posts/:id/like', likeLimiter.middleware(), likePost);
app.post('/api/posts/:id/comment', commentLimiter.middleware(), commentPost);
```

This prevents a user from repeatedly operating on the same resource while keeping other resources independent.

### Scenario 3: Multi-Tenant Limits

Tenant identity should be explicit in SaaS systems.

```javascript
const tenantLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    const tenantId = req.headers['x-tenant-id'] || req.tenant?.id || 'default';
    const userId = req.user?.id || req.ip;
    return `tenant:${tenantId}:user:${userId}:route:${req.path}`;
  },
});
```

If the quota is tenant-wide rather than user-wide, remove the user dimension:

```javascript
keyGenerator: (req) => {
  const tenantId = req.headers['x-tenant-id'] || req.tenant?.id || 'default';
  return `tenant:${tenantId}:route:${req.path}`;
}
```

### Scenario 4: Company Network

In office networks, many users may share one public IP. IP-only limits can accidentally lock all employees.

```text
IP-only key:
  ip:203.0.113.10

Business lock key:
  user:alice:/api/login
  user:bob:/api/login
  user:carol:/api/login
```

If Alice fails login too many times, Bob and Carol should still be able to log in. That is the practical reason to include user identity when it is available.

### Scenario 5: Separate Access Control From Rate Limits

An IP allowlist authorizes access. A business lock limits request volume. These are separate decisions.

```javascript
const trustedOfficeIps = new Set(['10.0.0.10']);

function allowlist(req, res, next) {
  if (!trustedOfficeIps.has(req.ip)) {
    res.status(403).json({ code: 'FORBIDDEN' });
    return;
  }
  next();
}

app.post('/api/internal/export', allowlist, exportLimiter.middleware(), exportData);
```

Even allowlisted clients can still be rate-limited if the limiter is mounted after the allowlist.

## Key Design Patterns

### Recommended Key Components

| Component | Example | Purpose |
|---|---|---|
| user | `user:42` | Isolate per user |
| tenant | `tenant:acme` | Isolate per organization |
| route | `route:/api/pay` | Separate API endpoints |
| action | `action:create` | Separate business actions |
| resource | `order:123` | Protect a specific object |
| identity fallback | `anonymous` | Handle unauthenticated users |

### Avoid Overly Broad Keys

```javascript
// Too broad: one user quota for every action.
`user:${req.user.id}`

// Better: quota scoped to the business action.
`user:${req.user.id}:action:password-reset`
```

### Avoid Overly Specific Keys

```javascript
// Too specific: timestamp makes every key unique and disables limiting.
`user:${req.user.id}:time:${Date.now()}`
```

Keys should be stable for the intended quota window.

## Distributed Business Locks

Use Memory only when one process handles the whole key space. Use RedisStore or CacheHubStore with Redis when:

- Multiple instances serve the same users.
- Containers autoscale.
- Workers and HTTP services share a quota.
- API gateways and application services both need consistent limits.

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis }),
  keyGenerator: (req) => `tenant:${req.tenant.id}:user:${req.user.id}:${req.path}`,
});
```

## Testing

### Test a Single Business Key

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/login \
    -H "Content-Type: application/json" \
    -d '{"username":"alice"}'
done
```

Expected:

- Requests inside the limit return `200`.
- The first over-limit request returns `429`.
- A different username or route should use a different key if the generator includes those fields.

### Test Key Isolation

```bash
curl -X POST /api/login -d '{"username":"alice"}'
curl -X POST /api/login -d '{"username":"bob"}'
```

Alice's failed attempts should not consume Bob's quota.

### Test Distributed Behavior

When using Redis, send requests to multiple application instances and confirm they share the same quota.

### Test Company Network Isolation

Use the same IP with two different users:

```bash
curl -X POST /api/login -H "X-User-Id: alice" -d '{"username":"alice"}'
curl -X POST /api/login -H "X-User-Id: bob" -d '{"username":"bob"}'
```

If the key includes user identity, Alice and Bob should have independent counters.

### Test Route Isolation

Use the same user across two routes:

```bash
curl -X POST /api/login -H "X-User-Id: alice"
curl -X POST /api/reset-password -H "X-User-Id: alice"
```

If the key includes route identity, exhausting the login limit should not exhaust the reset-password limit.

### Test Reset

```javascript
await limiter.reset('user:alice:/api/login');
```

After reset, that key should be allowed again without affecting other users or routes.

## FAQ

### How do I test whether the business lock works?

Send more than `max` requests using the same generated key and confirm the next request returns `429`. Then change one key component, such as user or route, and confirm the new key has its own quota.

### How do I reset one user's limit?

Call `reset(key)` with the exact key generated by your `keyGenerator`.

```javascript
await limiter.reset(`user:${userId}:route:/api/login`);
```

For operator tools, keep key construction in a shared helper so application code and admin tools produce the same key.

### How do I inspect the current status?

Use `check()` to get the public result shape:

```javascript
const result = await limiter.check(`user:${userId}:route:/api/login`);
console.log(result.remaining, result.resetTime);
```

For read-only dashboards, avoid consuming quota by keeping explicit operational metrics instead of polling `check()` against production keys.

### Should the key include an IP address?

Include IP as a fallback for anonymous traffic. For authenticated traffic, user ID is usually more precise. For login, combining username and IP can be useful because the user may not be authenticated yet.

### Should I include route or action?

Include route or action when different operations should not share quota. Do not include it when the business rule is intentionally a shared account-level quota.

### Which algorithm should I use?

Use `sliding-window` for login, payment, password reset, and other sensitive operations. Use `token-bucket` for user-plan quotas that allow bursts. Use `leaky-bucket` when a backend must receive smoother traffic.

## Summary

### Advantages

- Users do not accidentally consume each other's quota.
- Different routes and actions can be controlled independently.
- Sensitive operations can use stricter limits than read-only operations.
- SaaS tenants can be isolated from each other.
- Multi-instance deployments can share business counters through Redis-backed stores.

### Good Fit

- Login and authentication flows.
- SMS, email, and verification code sending.
- Payment, order, refund, and coupon operations.
- User-generated content operations such as posting, commenting, and liking.
- Tenant-level API quotas.

### Production Checklist

- The key includes the correct identity dimension.
- The key includes route, action, tenant, or resource only when needed.
- The key does not include timestamps, random values, raw tokens, or unbounded payloads.
- RedisStore or CacheHubStore with Redis is used for multi-instance deployments.
- Rate-limit events are logged with safe key components.
- Allowlist/access-control decisions are kept separate from rate-limit decisions.

## Best Practices

- Use `sliding-window` for login, payment, and sensitive actions.
- Include only stable key components.
- Include tenant ID in multi-tenant systems.
- Include route or action when different operations should not share quota.
- Use Redis or CacheHubStore with Redis for multi-instance deployments.
- Keep allowlist authorization separate from business rate limits.
- Log rate-limit events with key components that are safe to record.
- Do not include secrets, raw tokens, or unbounded payloads in keys.

## Related Documents

- [Quick Start](../getting-started/quickstart.md)
- [Configuration](config.md)
- [Storage Backends](storage.md)
- [Advanced Usage](advanced.md)
- [Algorithm Comparison](../algorithms/comparison.md)
