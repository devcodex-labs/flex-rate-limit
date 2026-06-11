# API Reference

## Table of Contents

- [RateLimiter](#ratelimiter)
- [RateLimiterOptions](#ratelimiteroptions)
- [Result Shape](#result-shape)
- [Store Interface](#store-interface)
- [RedisStore](#redisstore)
- [CacheHubStore](#cachehubstore)
- [keyGenerators](#keygenerators)
- [Detailed Method Reference](#detailed-method-reference)
- [Configuration Option Details](#configuration-option-details)
- [Middleware Behavior](#middleware-behavior)
- [Headers](#headers)
- [Exports](#exports)
- [Examples](#examples)
- [Errors and Troubleshooting](#errors-and-troubleshooting)
- [Related Docs](#related-docs)

## RateLimiter

```javascript
const { RateLimiter } = require('flex-rate-limit');
const limiter = new RateLimiter(options);
```

### check(key, options)

```javascript
const result = await limiter.check('user:123', { route: '/api/data' });
```

### middleware(options)

Creates an Express-style `(req, res, next)` middleware.

```javascript
app.use('/api', limiter.middleware());
```

### reset(key)

```javascript
await limiter.reset('user:123');
```

### resetAll()

```javascript
await limiter.resetAll();
```

### close()

```javascript
await limiter.close();
```

Closes limiter-owned resources, such as Redis clients created from `store: 'redis://...'` and cache-hub memory cleanup timers.

## RateLimiterOptions

| Option | Type | Default |
|---|---|---:|
| `windowMs` | `number` | `60000` |
| `max` | `number \| function` | `100` |
| `algorithm` | `'sliding-window' \| 'fixed-window' \| 'token-bucket' \| 'leaky-bucket'` | `'sliding-window'` |
| `store` | `Store \| 'memory' \| 'redis://...'` | `'memory'` |
| `keyGenerator` | `function` | IP-based |
| `headers` | `boolean` | `true` |
| `skipSuccessfulRequests` | `boolean` | `false` |
| `skipFailedRequests` | `boolean` | `false` |

## Result Shape

```typescript
{
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}
```

## Store Interface

Stores must provide generic counter operations and may provide algorithm-specific atomic methods.

```typescript
interface Store {
  increment(key: string, options?: any): Promise<any>;
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll?(): Promise<void>;
  close?(): Promise<void>;
}
```

## RedisStore

```javascript
const { RedisStore } = require('flex-rate-limit');
const store = new RedisStore({ client: redis, prefix: 'rl:' });
```

External Redis clients are caller-owned by default. Set `ownsClient: true` when `store.close()` should close the client.

## CacheHubStore

```javascript
const { CacheHubStore } = require('flex-rate-limit');
const store = new CacheHubStore({ client: redis, prefix: 'rl:' });
```

`CacheHubStore` uses `cache-hub@2.2.4` atomic state primitives. It can run with Redis or with a local in-memory cache-hub backend.

## keyGenerators

```javascript
const { keyGenerators } = require('flex-rate-limit');

const limiter = new RateLimiter({
  keyGenerator: keyGenerators.ip,
});
```

| Generator | Key shape | Typical use |
|---|---|---|
| `keyGenerators.ip` | IP address | Simple public API or anonymous traffic |
| `keyGenerators.userId` | `user:${id}` | Authenticated user limit |
| `keyGenerators.routeAndIp` | `${route}:${ip}` | Per-route anonymous limit |
| `keyGenerators.apiEndpoint` | `api:${route}:${ip}` | API endpoint-level limit |
| `keyGenerators.userAndRoute` | `user:${id}:${route}` | Business lock / user+route limit |

## Detailed Method Reference

### `new RateLimiter(options)`

Creates a limiter instance.

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  algorithm: 'sliding-window',
  store: 'memory',
});
```

Constructor defaults:

| Option | Default |
|---|---|
| `windowMs` | `60000` |
| `max` | `100` |
| `algorithm` | `'sliding-window'` |
| `store` | `'memory'` |
| `headers` | `true` |
| `skipSuccessfulRequests` | `false` |
| `skipFailedRequests` | `false` |

### `check(key, options)`

Checks one key directly. This is the framework-agnostic API and is the right integration point for Koa, Egg.js, Fastify, Hapi, workers, queues, and custom runtimes.

```javascript
const result = await limiter.check('user:123', {
  route: '/api/orders',
  req,
});

if (!result.allowed) {
  throw Object.assign(new Error('Too many requests'), {
    retryAfter: result.retryAfter,
  });
}
```

Parameters:

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `key` | `string` | yes | Non-empty rate-limit key |
| `options.req` | `any` | no | Original request object for dynamic `max`, `skip`, and custom context |
| `options.route` | `string` | no | Route context used by route-aware key generators and `perRoute` |

Return value:

```typescript
type RateLimitResult = {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  error?: string;
};
```

`retryAfter` is `0` when the request is allowed. When rejected, it is the suggested wait time in milliseconds.

### `middleware(options)`

Creates an Express-style middleware function:

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

app.use('/api', limiter.middleware());
```

The middleware signature is:

```typescript
(req: any, res: any, next?: Function) => Promise<void>
```

For non-Express frameworks, wrap `check()` instead of using the Express-style middleware directly.

### `reset(key)`

Clears rate-limit state for a single key.

```javascript
await limiter.reset('user:123');
```

Use this when an operator manually unlocks a user, when a test needs a clean key, or when a business workflow resets a quota.

### `resetAll()`

Clears all state for stores that support it.

```javascript
await limiter.resetAll();
```

`MemoryStore`, `RedisStore`, and `CacheHubStore` implement `resetAll()`. For Redis-backed stores, use a dedicated prefix so reset operations do not touch unrelated application keys.

### `close()`

Closes limiter-owned resources.

```javascript
await limiter.close();
```

Use `close()` during application shutdown, tests, benchmark scripts, and short-lived CLI tools.

Lifecycle behavior:

| Store path | Ownership |
|---|---|
| `store: 'memory'` | No external connection; memory timers are internal |
| `store: 'redis://...'` | Limiter creates and owns the Redis client; `close()` closes it |
| `new RedisStore({ client })` | External client is caller-owned by default |
| `new RedisStore({ client, ownsClient: true })` | Store closes the client |
| `new CacheHubStore()` | Store closes auto-created memory cleanup timers |

## Configuration Option Details

### `windowMs`

The size of the rate-limit time window in milliseconds.

```javascript
windowMs: 15 * 60 * 1000
```

Use longer windows for security-sensitive actions and shorter windows for high-throughput operational throttling.

### `max`

Maximum allowed count for the selected algorithm. It can be a number or an async function.

```javascript
max: 100
```

Dynamic example:

```javascript
const limiter = new RateLimiter({
  max: async (req) => {
    if (req.user?.plan === 'enterprise') return 5000;
    if (req.user?.plan === 'pro') return 1000;
    return 100;
  },
});
```

### `algorithm`

Supported values:

| Value | Use when |
|---|---|
| `sliding-window` | You need strict rolling-window fairness |
| `fixed-window` | You need compact, approximate high-throughput limits |
| `token-bucket` | You need average quota with short bursts |
| `leaky-bucket` | You need smoother admission into a backend |

### `store`

Supported values:

| Value | Description |
|---|---|
| `'memory'` | Default in-process store |
| `'redis://...'` | RateLimiter creates and owns an ioredis client |
| `new MemoryStore()` | Explicit in-memory store |
| `new RedisStore({ client })` | Shared Redis-backed store |
| `new CacheHubStore({ client })` | cache-hub atomic state backed by Redis |
| custom `Store` | Any object implementing the Store interface |

### `keyGenerator`

Generates the limit key from a request object.

```javascript
const limiter = new RateLimiter({
  keyGenerator: (req, context) => {
    const user = req.user?.id || req.ip;
    const route = context?.route || req.route?.path || req.path || 'unknown';
    return `user-route:${user}:${route}`;
  },
});
```

### `skip`

Skips rate limiting for a request.

```javascript
const limiter = new RateLimiter({
  skip: (req) => {
    return req.path === '/health' || req.user?.role === 'admin';
  },
});
```

Common uses:

- IP allowlist.
- Health checks.
- Internal service accounts.
- Temporary operational bypasses.

### `handler`

Customizes the response when a request is rejected.

```javascript
const limiter = new RateLimiter({
  handler: (req, res) => {
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    });
  },
});
```

If no handler is provided, middleware returns status `429` with a basic message.

### `headers`

Controls whether middleware writes rate-limit headers.

```javascript
headers: true
```

### `skipSuccessfulRequests` and `skipFailedRequests`

These options are middleware-focused rollback controls.

```javascript
const limiter = new RateLimiter({
  skipSuccessfulRequests: true,
});
```

- `skipSuccessfulRequests`: count the request during processing, then roll it back if the response status is below `400`.
- `skipFailedRequests`: count the request during processing, then roll it back if the response status is `400` or above.

Use these options when the quota should count only failed attempts or only successful business actions. They are not needed for direct `check()` usage.

### `perRoute`

Overrides options for specific routes.

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  perRoute: {
    '/login': {
      windowMs: 15 * 60 * 1000,
      max: 5,
      algorithm: 'sliding-window',
    },
    '/api/upload': {
      windowMs: 60 * 1000,
      max: 20,
      algorithm: 'leaky-bucket',
    },
  },
});
```

Route matching uses the route context available to the limiter. When integrating manually, pass `route` to `check()`.

### `capacity`, `refillRate`, and `leakRate`

Algorithm-specific tuning options:

| Option | Algorithm | Description |
|---|---|---|
| `capacity` | `token-bucket` | Maximum bucket size / immediate burst allowance |
| `refillRate` | `token-bucket` | Tokens added per `windowMs` |
| `leakRate` | `leaky-bucket` | Water drained per `windowMs` |

## Middleware Behavior

Middleware flow:

```text
1. Resolve effective config, including per-route overrides.
2. Run skip(req). If true, call next().
3. Generate key.
4. Check the limit.
5. Write headers when enabled.
6. If allowed, call next().
7. If rejected, call custom handler or return 429.
8. If rollback options are enabled, observe response completion and rollback when appropriate.
```

Default rejection response:

```text
HTTP 429 Too Many Requests
```

Use a custom handler when your API needs a structured error payload.

## Headers

When `headers` is enabled, middleware writes common rate-limit headers:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Configured limit |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Reset time |
| `Retry-After` | Wait time when rejected |

Exact header availability can depend on the framework response object because middleware uses the Express-style response API.

## Exports

CommonJS:

```javascript
const {
  RateLimiter,
  MemoryStore,
  RedisStore,
  CacheHubStore,
  algorithms,
  keyGenerators,
} = require('flex-rate-limit');
```

ESM:

```javascript
import flexRateLimit, {
  RateLimiter,
  RedisStore,
  CacheHubStore,
} from 'flex-rate-limit';
```

Default export:

```javascript
const flexRateLimit = require('flex-rate-limit');
const limiter = new flexRateLimit.RateLimiter();
```

## Examples

### Basic Direct Usage

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

async function handleRequest(userId) {
  const result = await limiter.check(`user:${userId}`);
  if (!result.allowed) {
    return {
      status: 429,
      retryAfter: result.retryAfter,
    };
  }

  return { status: 200 };
}
```

### Express Middleware

```javascript
const express = require('express');
const { RateLimiter } = require('flex-rate-limit');

const app = express();
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

app.use('/api', limiter.middleware());
```

### Koa Manual Integration

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

async function rateLimit(ctx, next) {
  const result = await limiter.check(`ip:${ctx.ip}`, {
    req: ctx.request,
    route: ctx.path,
  });

  if (!result.allowed) {
    ctx.status = 429;
    ctx.body = { error: 'Too many requests', retryAfter: result.retryAfter };
    return;
  }

  await next();
}
```

### RedisStore

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis(process.env.REDIS_URL);

const limiter = new RateLimiter({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:',
  }),
  windowMs: 60 * 1000,
  max: 100,
});
```

The external Redis client remains caller-owned. Close it in your application shutdown code.

### Redis Connection String

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  store: 'redis://127.0.0.1:6379',
  windowMs: 60 * 1000,
  max: 100,
});

process.on('SIGTERM', async () => {
  await limiter.close();
});
```

In this path the limiter owns the Redis client.

### CacheHubStore

```javascript
const Redis = require('ioredis');
const { RateLimiter, CacheHubStore } = require('flex-rate-limit');

const redis = new Redis(process.env.REDIS_URL);

const limiter = new RateLimiter({
  store: new CacheHubStore({
    client: redis,
    prefix: 'rl:',
  }),
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
});
```

Use `CacheHubStore` when you want to reuse `cache-hub` atomic state primitives, especially with Redis-backed state.

### Business Lock Key

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req, context) => {
    const userId = req.user?.id || req.ip;
    const route = context?.route || req.path || 'unknown';
    return `business:${userId}:${route}`;
  },
});
```

This gives each user an independent budget for each route.

## Errors and Troubleshooting

### `键必须是非空字符串`

`check()` and `reset()` require a non-empty string key.

Fix:

```javascript
await limiter.check(`user:${userId || 'anonymous'}`);
```

### Redis client is required

`new RedisStore()` requires a Redis-compatible client.

Fix:

```javascript
const redis = new Redis(process.env.REDIS_URL);
const store = new RedisStore({ client: redis });
```

### `resetAll()` is unsupported

The store does not implement `resetAll()`.

Fix: use a built-in store that supports it, or reset known keys individually.

### Requests are all sharing one limit

The key generator is probably too coarse.

Fix: include the right identity and route dimensions:

```javascript
keyGenerator: (req, context) => {
  return `user:${req.user?.id || req.ip}:${context?.route || req.path}`;
}
```

### Redis connections remain open in tests

Call `close()` for limiter-owned clients, and close external clients yourself.

```javascript
afterEach(async () => {
  await limiter.close();
  await redis.quit();
});
```

## Related Docs

- [Quick Start](../getting-started/quickstart.md)
- [Configuration](../guides/config.md)
- [Advanced Usage](../guides/advanced.md)
- [Business Lock Guide](../guides/business-lock-guide.md)
- [Storage Backends](../guides/storage.md)
- [Algorithm Comparison](../algorithms/comparison.md)
- [Algorithm Deep Analysis](../algorithms/deep-analysis.md)
