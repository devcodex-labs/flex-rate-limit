# Quick Start

## Table of Contents

- [Framework Example Files](#framework-example-files)
- [Fast Example](#fast-example)
- [Install](#install)
- [Express](#express)
- [Koa](#koa)
- [Egg.js](#eggjs)
- [Standalone Usage](#standalone-usage)
- [Storage Selection](#storage-selection)
- [Common Presets](#common-presets)
- [Testing](#testing)
- [Shutdown](#shutdown)
- [Next Steps](#next-steps)

## Framework Example Files

The repository keeps runnable examples under `examples/`:

| Framework / Style | File |
|---|---|
| Express | `examples/express-example.js` |
| Koa | `examples/koa-example.js` |
| Egg.js | `examples/egg-example.js` |
| Hapi | `examples/hapi-example.js` |
| Standalone direct calls | `examples/standalone-example.js` |
| IP allowlist examples | `examples/*ip-whitelist*.js` |

## Fast Example

### Step 1: Create a Limiter Factory

```javascript
const { RateLimiter } = require('flex-rate-limit');

function createLoginLimiter() {
  return new RateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    algorithm: 'sliding-window',
    keyGenerator: (req) => `login:${req.ip}:${req.body?.username || 'anonymous'}`,
  });
}
```

### Step 2: Use Middleware on a Route

```javascript
const express = require('express');

const app = express();
const loginLimiter = createLoginLimiter();

app.post('/login', loginLimiter.middleware(), (req, res) => {
  res.json({ message: 'login accepted' });
});
```

### Why Use a Factory?

A factory makes route-specific limits explicit and reusable. It also lets you create different limiters for login, public APIs, admin operations, and high-throughput internal endpoints without mutating shared configuration at runtime.

## Install

```bash
npm install flex-rate-limit
```

Install optional dependencies only when you need distributed or cache-hub-backed state:

```bash
npm install flex-rate-limit ioredis
npm install flex-rate-limit cache-hub ioredis
```

## Express

```javascript
const express = require('express');
const { RateLimiter } = require('flex-rate-limit');

const app = express();

const apiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  algorithm: 'sliding-window',
});

app.use('/api', apiLimiter.middleware());

app.get('/api/data', (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

## Koa

Use `check()` directly and map the result into Koa middleware behavior:

```javascript
const Koa = require('koa');
const { RateLimiter } = require('flex-rate-limit');

const app = new Koa();
const limiter = new RateLimiter({ windowMs: 60 * 1000, max: 60 });

app.use(async (ctx, next) => {
  const key = `ip:${ctx.ip}:${ctx.path}`;
  const result = await limiter.check(key);

  if (!result.allowed) {
    ctx.status = 429;
    ctx.body = {
      error: 'Too Many Requests',
      retryAfter: result.retryAfter,
    };
    return;
  }

  ctx.set('X-RateLimit-Limit', String(result.limit));
  ctx.set('X-RateLimit-Remaining', String(result.remaining));
  ctx.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

  await next();
});
```

## Egg.js

Egg.js projects normally wrap `check()` in application middleware:

```javascript
// app/middleware/rateLimit.js
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

module.exports = () => {
  return async function rateLimit(ctx, next) {
    const key = `ip:${ctx.ip}:${ctx.path}`;
    const result = await limiter.check(key);

    if (!result.allowed) {
      ctx.status = 429;
      ctx.body = { error: 'Too Many Requests' };
      return;
    }

    await next();
  };
};
```

## Standalone Usage

You can use `check()` in workers, queues, command handlers, websocket gateways, or any custom adapter:

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

async function handleJob(userId) {
  const result = await limiter.check(`job:${userId}`);
  if (!result.allowed) {
    throw new Error(`Retry after ${result.retryAfter} ms`);
  }

  return doWork(userId);
}
```

## Storage Selection

### Memory

Use MemoryStore for local development, tests, single-process services, and cases where counters do not need to be shared.

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'memory',
});
```

### RedisStore

Use RedisStore when multiple application instances must share counters.

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis('redis://127.0.0.1:6379');

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis }),
});
```

You can also let `RateLimiter` own the Redis client:

```javascript
const limiter = new RateLimiter({
  store: 'redis://127.0.0.1:6379',
});

await limiter.close();
```

### CacheHubStore

Use CacheHubStore when you want cache-hub atomic state primitives while keeping flex-rate-limit's algorithm and middleware contracts.

```javascript
const Redis = require('ioredis');
const { RateLimiter, CacheHubStore } = require('flex-rate-limit');

const redis = new Redis('redis://127.0.0.1:6379');

const limiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({ client: redis, prefix: 'rl:' }),
});
```

## Common Presets

| Scenario | Algorithm | Window | Max | Key Strategy |
|---|---|---:|---:|---|
| Login protection | `sliding-window` | 15 minutes | 5-10 | IP + username |
| Public API | `token-bucket` | 1 minute | 100-1000 | API key or user ID |
| Sensitive write | `sliding-window` | 1 hour | 20-100 | user ID + route |
| Internal monitoring | `fixed-window` | 1 minute | 1000+ | service identity |
| Backend smoothing | `leaky-bucket` | 1 minute | capacity by backend | route or tenant |

## Testing

Use `curl` or your HTTP test tool to verify headers and status codes:

```bash
for i in {1..6}; do
  curl -i http://localhost:3000/api/data
done
```

Expected behavior when the limit is exceeded:

```text
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
```

## Shutdown

Call `close()` when the limiter owns resources such as a `redis://` client or cache-hub memory cleanup timers:

```javascript
process.on('SIGTERM', async () => {
  await limiter.close();
  process.exit(0);
});
```

Externally supplied Redis clients remain caller-owned unless `ownsClient: true` is set on `RedisStore`.

## Next Steps

- [Configuration](../guides/config.md)
- [Storage Backends](../guides/storage.md)
- [Advanced Usage](../guides/advanced.md)
- [Business Lock Guide](../guides/business-lock-guide.md)
- [Algorithm Comparison](../algorithms/comparison.md)
- [API Reference](../reference/api-reference.md)
