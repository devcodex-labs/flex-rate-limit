# flex-rate-limit

> A framework-agnostic Node.js rate limiting library with multiple algorithms, Memory / Redis / cache-hub backed storage, and Express-style middleware.

[![npm version](https://img.shields.io/npm/v/flex-rate-limit.svg)](https://www.npmjs.com/package/flex-rate-limit)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Node.js Version](https://img.shields.io/node/v/flex-rate-limit.svg)](https://nodejs.org)

[Documentation](https://devcodex-labs.github.io/flex-rate-limit/) · [中文文档](https://devcodex-labs.github.io/flex-rate-limit/zh/) · [Examples](https://github.com/devcodex-labs/flex-rate-limit/tree/main/examples)

## Why Use It

- **Framework-agnostic core**: call `check()` from Express, Koa, Egg.js, Hapi, Fastify, workers, queues, or any custom adapter.
- **Express-style middleware**: use `limiter.middleware()` directly in Express-compatible stacks.
- **Four algorithms**: sliding window, fixed window, token bucket, and leaky bucket.
- **Multiple stores**: in-memory storage, Redis storage, `CacheHubStore`, or your own store adapter.
- **Distributed-ready options**: use Redis or cache-hub Redis atomic backends when counters must be shared across instances.
- **Standard metadata**: each check returns `allowed`, `limit`, `current`, `remaining`, `resetTime`, and `retryAfter`.
- **Type definitions included**: CommonJS, ESM, and TypeScript consumers are supported.

## Requirements

- Node.js `>=18.0.0`
- npm, pnpm, or another package manager compatible with the npm registry
- Redis is optional and only needed for Redis-backed distributed rate limiting

## Installation

```bash
npm install flex-rate-limit
```

Redis-backed usage:

```bash
npm install flex-rate-limit ioredis
```

cache-hub atomic backend usage:

```bash
npm install flex-rate-limit cache-hub ioredis
```

## Quick Start

### Direct `check()`

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const result = await limiter.check('user:123');

if (!result.allowed) {
  console.log(`Retry after ${result.retryAfter} ms`);
}
```

### Express Middleware

```javascript
const express = require('express');
const { RateLimiter } = require('flex-rate-limit');

const app = express();

const globalLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(globalLimiter.middleware());

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

app.post('/api/login', loginLimiter.middleware(), (_req, res) => {
  res.json({ message: 'login accepted' });
});

app.listen(3000);
```

### Koa, Egg.js, Hapi, Fastify, and Other Frameworks

Use `check()` and map the result to the framework's own middleware, hook, or pre-handler shape:

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 60,
});

async function guard(ctx, next) {
  const key = `user:${ctx.user?.id || ctx.ip}:${ctx.path}`;
  const result = await limiter.check(key, { route: ctx.path });

  if (!result.allowed) {
    ctx.status = 429;
    ctx.body = { error: 'Too Many Requests', retryAfter: result.retryAfter };
    return;
  }

  await next();
}
```

See the runnable framework examples on [GitHub](https://github.com/devcodex-labs/flex-rate-limit/tree/main/examples) and the [quickstart guide](https://devcodex-labs.github.io/flex-rate-limit/getting-started/quickstart).

## Storage Backends

### Memory Store

The default store is fast and simple. Use it for single-process services, local development, tests, and cases where counters do not need to be shared across instances.

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'memory',
});
```

### RedisStore

Use `RedisStore` when multiple application instances must share counters.

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis, prefix: 'rl:' }),
});
```

If you pass `store: 'redis://...'`, `RateLimiter` creates and owns the Redis client; call `await limiter.close()` during shutdown. When you pass your own Redis client to `RedisStore`, that client remains caller-owned unless you set `ownsClient: true`.

### CacheHubStore

`CacheHubStore` keeps `flex-rate-limit` as the algorithm and middleware layer while delegating high-concurrency state updates to `cache-hub` atomic primitives. Pass a Redis client for distributed production usage; omit the client only when an in-memory cache-hub backend is acceptable. The in-memory cache-hub path prunes expired rate-limit state automatically, and `await limiter.close()` closes store-owned cleanup timers or cache resources.

```javascript
const Redis = require('ioredis');
const { RateLimiter, CacheHubStore } = require('flex-rate-limit');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({ client: redis, prefix: 'rl:' }),
});
```

Read more in the [storage guide](https://devcodex-labs.github.io/flex-rate-limit/guides/storage).

## Algorithms

| Algorithm | Best For | Notes |
|-----------|----------|-------|
| `sliding-window` | Precise rolling limits | Default algorithm; stores more per-key state |
| `fixed-window` | High-throughput coarse windows | Fast, but requests can cluster around window boundaries |
| `token-bucket` | Controlled bursts | Allows bursts up to capacity and refills over time |
| `leaky-bucket` | Smoothing traffic | Drains at a steady rate |

Choose semantics first, then optimize storage and hot paths. See [algorithm comparison](https://devcodex-labs.github.io/flex-rate-limit/algorithms/comparison) and [deep analysis](https://devcodex-labs.github.io/flex-rate-limit/algorithms/deep-analysis).

## Common Configuration

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  algorithm: 'sliding-window',
  headers: true,
  keyGenerator: (req) => `user:${req.user?.id || req.ip}:${req.path}`,
  skip: (req) => req.path === '/health',
  handler: (req, res) => {
    res.status(429).json({ error: 'Too Many Requests' });
  },
  perRoute: {
    '/api/login': { max: 5, windowMs: 15 * 60 * 1000 },
    '/api/users': { max: 100, windowMs: 60 * 1000 },
  },
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `windowMs` | `60000` | Time window in milliseconds |
| `max` | `100` | Max requests per window; may be a function |
| `algorithm` | `sliding-window` | One of the four supported algorithms |
| `store` | `memory` | Store instance or `'memory'` |
| `keyGenerator` | IP-based | Builds the rate-limit key from request context |
| `skip` | `() => false` | Return `true` to bypass rate limiting |
| `handler` | built-in 429 response | Custom over-limit handler |
| `headers` | `true` | Write `X-RateLimit-*` and `Retry-After` headers |
| `perRoute` | `null` | Route-specific overrides |
| `skipSuccessfulRequests` | `false` | Roll back successful responses |
| `skipFailedRequests` | `false` | Roll back failed responses |

Full details are in the [configuration guide](https://devcodex-labs.github.io/flex-rate-limit/guides/config) and [API reference](https://devcodex-labs.github.io/flex-rate-limit/reference/api-reference).

## Result Shape

```javascript
{
  allowed: true,
  limit: 100,
  current: 1,
  remaining: 99,
  resetTime: 1767225600000,
  retryAfter: 0
}
```

## Benchmarks

The repository includes reproducible local benchmark scripts for Memory direct checks, Redis direct checks, and HTTP middleware scenarios.

Run these from a cloned repository after installing development dependencies:

```bash
npm install
npm run benchmark:memory
npm run benchmark:redis
npm run benchmark:http
```

The npm runtime package does not require benchmark dependencies. Redis and HTTP benchmark output records the Node.js version, Redis URL, key distribution, concurrency, and other parameters. Use `BENCH_JSON=1` when you need machine-readable output.

See [Benchmark and Performance](https://devcodex-labs.github.io/flex-rate-limit/benchmark) for commands, environment variables, and interpretation notes.

## Documentation

| Entry | Description |
|-------|-------------|
| [Documentation index](https://devcodex-labs.github.io/flex-rate-limit/) | English documentation navigation |
| [Chinese documentation](https://devcodex-labs.github.io/flex-rate-limit/zh/) | Simplified Chinese documentation navigation |
| [Quickstart](https://devcodex-labs.github.io/flex-rate-limit/getting-started/quickstart) | First integration path and framework examples |
| [Configuration](https://devcodex-labs.github.io/flex-rate-limit/guides/config) | Complete option reference and practical presets |
| [Storage](https://devcodex-labs.github.io/flex-rate-limit/guides/storage) | Memory, Redis, and CacheHubStore selection |
| [Business lock guide](https://devcodex-labs.github.io/flex-rate-limit/guides/business-lock-guide) | User + route scoped rate limiting |
| [Algorithm comparison](https://devcodex-labs.github.io/flex-rate-limit/algorithms/comparison) | Choosing the right algorithm |
| [API reference](https://devcodex-labs.github.io/flex-rate-limit/reference/api-reference) | Classes, options, stores, and exports |
| [Benchmark guide](https://devcodex-labs.github.io/flex-rate-limit/benchmark) | Local benchmark commands and caveats |

The website is built with Rspress and reuses the `docs/` directory:

```bash
npm run docs:dev
npm run docs:validate
npm run docs:build
```

## Examples

Runnable examples are available on [GitHub](https://github.com/devcodex-labs/flex-rate-limit/tree/main/examples):

| Category | Files |
|----------|-------|
| Quickstart | `quickstart-express.js`, `quickstart-koa.js`, `quickstart-egg.js`, `quickstart-hapi.js`, `quickstart-fastify.js` |
| Router examples | `express-router-example.js`, `koa-router-example.js`, `egg-router-example.js`, `fastify-router-example.js` |
| IP whitelist examples | `express-ip-whitelist-independent.js`, `koa-ip-whitelist-independent.js`, `ip-whitelist-example.js` |
| Standalone usage | `standalone-example.js` |
| Business lock | `egg-business-lock-example.js` |

## Development

```bash
npm test
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run coverage
```

## Troubleshooting

- **Counters are not shared across instances**: use `RedisStore` or `CacheHubStore` with a Redis client instead of the default Memory store.
- **Redis benchmarks are skipped**: start Redis locally or set `REDIS_URL` / `BENCH_REDIS_URL`.
- **Package installs but Redis code fails at runtime**: install and configure a Redis client such as `ioredis`.
- **Short-lived scripts keep running after Redis usage**: call `await limiter.close()` when using `store: 'redis://...'`, or pass `ownsClient: true` to `RedisStore` if the store should close your client.
- **Koa/Fastify/Hapi integration feels awkward**: call `check()` directly and wrap the result in the framework's native middleware or hook style.
- **Benchmark numbers differ from the docs or CI**: local CPU, Node.js version, Redis latency, key distribution, and HTTP app work all affect throughput.

## Related Projects

- [monSQLize](https://github.com/devcodex-labs/monSQLize) - MongoDB ORM with caching
- [schema-dsl](https://devcodex-labs.github.io/schema-dsl/) ([GitHub](https://github.com/devcodex-labs/schema-dsl)) - JSON Schema validation
- [jrpc](https://github.com/devcodex-labs/jrpc) - JSON-RPC 2.0 implementation

## Support

- [GitHub Issues](https://github.com/devcodex-labs/flex-rate-limit/issues)
- [GitHub Discussions](https://github.com/devcodex-labs/flex-rate-limit/discussions)

## License

[Apache-2.0](LICENSE)
