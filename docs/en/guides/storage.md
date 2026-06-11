# Storage Backends

## Table of Contents

- [Memory Store](#memory-store)
- [Redis Store](#redis-store)
- [CacheHubStore Atomic Backend](#cachehubstore-atomic-backend)
- [Custom Stores](#custom-stores)
- [Performance and Memory](#performance-and-memory)
- [Selection Decision Tree](#selection-decision-tree)
- [Recommended Configurations](#recommended-configurations)
- [Lifecycle and Ownership](#lifecycle-and-ownership)
- [Related Documents](#related-documents)

## Memory Store

MemoryStore is the default backend. It stores counters in the current Node.js process.

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'memory',
});
```

### Advantages

- No external service required.
- Very low latency because all operations stay in process.
- Good for local development, tests, command-line tools, single-instance services, and low-complexity deployments.

### Limitations

- Counters are not shared across processes.
- Restarting the process clears all counters.
- Horizontal scaling requires a shared backend such as Redis.

### When to Use Memory

Use MemoryStore when one process owns the full key space, or when strict distributed consistency is not required.

## Redis Store

Use RedisStore when multiple application instances must share counters.

### Option 1: Connection String

```javascript
const { RateLimiter } = require('flex-rate-limit');

const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'redis://localhost:6379',
});

await limiter.close();
```

This form creates a Redis client owned by the limiter. Call `await limiter.close()` when the process shuts down.

### Option 2: ioredis Client

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  db: 0,
});

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis, prefix: 'rl:' }),
});
```

External clients are caller-owned by default. Set `ownsClient: true` if `RedisStore.close()` or `RateLimiter.close()` should close the client.

### Option 3: Redis Cluster

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const cluster = new Redis.Cluster([
  { host: '10.0.0.1', port: 6379 },
  { host: '10.0.0.2', port: 6379 },
]);

const limiter = new RateLimiter({
  store: new RedisStore({ client: cluster }),
});
```

Use cluster when the key space or Redis throughput requires horizontal Redis scaling. Watch for hot keys and slot distribution.

### Option 4: Redis Sentinel

```javascript
const Redis = require('ioredis');
const { RateLimiter, RedisStore } = require('flex-rate-limit');

const sentinel = new Redis({
  sentinels: [
    { host: '10.0.0.1', port: 26379 },
    { host: '10.0.0.2', port: 26379 },
  ],
  name: 'mymaster',
});

const limiter = new RateLimiter({
  store: new RedisStore({ client: sentinel }),
});
```

Use Sentinel when you need Redis failover while keeping a single logical primary.

## CacheHubStore Atomic Backend

`CacheHubStore` uses `cache-hub@2.2.4` atomic state primitives. It keeps flex-rate-limit as the algorithm and middleware layer while delegating high-concurrency state updates to cache-hub.

```bash
npm install flex-rate-limit cache-hub ioredis
```

```javascript
const Redis = require('ioredis');
const { RateLimiter, CacheHubStore } = require('flex-rate-limit');

const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({
    client: redis,
    prefix: 'rl:',
  }),
});
```

### Characteristics

- Supports fixed-window, sliding-window, token-bucket, and leaky-bucket state through cache-hub primitives.
- The Redis path uses cache-hub Lua-backed atomic operations.
- The no-client memory path can be useful in tests and short-lived local scenarios.
- In-memory cache-hub state prunes expired fixed-window, sliding-window, token-bucket, and leaky-bucket entries automatically.
- `await limiter.close()` closes owned cleanup timers or cache resources.

### Rollback Integration

CacheHubStore supports rollback data for middleware features such as `skipFailedRequests` and `skipSuccessfulRequests`.

```javascript
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({ client: redis }),
  skipFailedRequests: true,
});
```

## Custom Stores

Implement the Store contract when you need a project-specific backend.

```javascript
class CustomStore {
  async get(key) {}
  async set(key, value, ttlMs) {}
  async increment(key, windowMs) {}
  async decrement(key) {}
  async reset(key) {}
  async resetAll() {}
  async close() {}
}
```

For algorithm-specific optimization, a custom store can also implement `checkSlidingWindow`, `checkTokenBucket`, `checkLeakyBucket`, and rollback methods.

## Performance and Memory

These are guidance points, not universal QPS guarantees. Actual throughput depends on Node.js version, CPU, network latency, Redis deployment, algorithm, key distribution, and application work.

| Backend | Strength | Latency Cost | Shared Across Instances | Persistence |
|---|---|---|---|---|
| Memory | Highest local throughput | In-process only | No | No |
| Redis | Shared counters | Network + Redis commands | Yes | Yes |
| Redis Cluster | Larger key space and throughput | Network + routing + node load | Yes | Yes |
| CacheHubStore with Redis | Atomic cache-hub primitives | Network + Lua/atomic backend | Yes | Yes |

### Approximate Memory Considerations

- Memory: state lives in the Node.js process and scales with key count and algorithm state.
- Redis: application memory is small, while serialized state is held in Redis.
- Sliding window stores more per-key data than fixed-window.
- Token bucket and leaky bucket usually keep compact per-key state.

### Performance Notes

- Memory is typically the fastest single-process path.
- Redis is affected by network round trips, pipelining/Lua strategy, and Redis CPU.
- Redis Cluster is affected by slot routing and hot keys.
- CacheHubStore is most useful when Redis atomic update behavior matters.

See [Benchmark and Performance](../benchmark.md) for current reproducible benchmark commands.

## Selection Decision Tree

```text
Do multiple application instances need shared counters?
|
|-- No
|   |-- Is this a single-process service or local tool?
|       |-- Yes -> MemoryStore
|       |-- No  -> consider RedisStore
|
|-- Yes
    |-- Do you already run Redis?
    |   |-- Yes -> RedisStore or CacheHubStore with Redis
    |   |-- No  -> add Redis before relying on distributed counters
    |
    |-- Do you need cache-hub atomic primitives?
        |-- Yes -> CacheHubStore with Redis
        |-- No  -> RedisStore
```

## Recommended Configurations

### Single Server or Development

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'memory',
});
```

### Multi-Instance API

```javascript
const limiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store: 'redis://localhost:6379',
});
```

### Redis Client Owned by the App

```javascript
const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  store: new RedisStore({ client: redis }),
});

await redis.quit();
```

### Store-Owned Redis Client

```javascript
const redis = new Redis('redis://localhost:6379');

const limiter = new RateLimiter({
  store: new RedisStore({ client: redis, ownsClient: true }),
});

await limiter.close();
```

### CacheHubStore with Redis

```javascript
const limiter = new RateLimiter({
  algorithm: 'fixed-window',
  windowMs: 60 * 1000,
  max: 100,
  store: new CacheHubStore({ client: redis, prefix: 'rl:' }),
});
```

## Lifecycle and Ownership

| Configuration | Owner | Close With |
|---|---|---|
| `store: 'memory'` | Limiter/store | Usually no external close needed |
| `store: 'redis://...'` | RateLimiter | `await limiter.close()` |
| `new RedisStore({ client })` | Caller | `await redis.quit()` |
| `new RedisStore({ client, ownsClient: true })` | Store / limiter | `await limiter.close()` |
| `new CacheHubStore({ client })` | Caller owns Redis client | Close caller client separately |
| `new CacheHubStore()` | Store owns cleanup timers | `await limiter.close()` |

## Related Documents

- [Configuration](config.md)
- [Advanced Usage](advanced.md)
- [Benchmark and Performance](../benchmark.md)
- [API Reference](../reference/api-reference.md)

