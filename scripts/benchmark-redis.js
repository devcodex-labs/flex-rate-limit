#!/usr/bin/env node

const os = require('os');
const { performance } = require('perf_hooks');
const Redis = require('ioredis');
const { RateLimiter, RedisStore, CacheHubStore } = require('../lib');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const redisUrl = process.env.REDIS_URL || process.env.BENCH_REDIS_URL || 'redis://127.0.0.1:6379';
const iterations = Number(process.env.BENCH_ITERATIONS || 5000);
const keyCount = Number(process.env.BENCH_KEYS || 500);
const windowMs = Number(process.env.BENCH_WINDOW_MS || 60000);
const limit = Number(process.env.BENCH_LIMIT || iterations + 1000);
const jsonOutput = process.env.BENCH_JSON === '1';
const algorithms = (process.env.BENCH_ALGORITHMS || 'fixed-window,sliding-window,token-bucket,leaky-bucket')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const concurrencyLevels = (process.env.BENCH_CONCURRENCY || '1,32')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

function createRedis() {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
  });
}

async function isRedisAvailable() {
  const redis = createRedis();
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

async function cleanupPrefix(redis, prefix) {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

async function runPool(total, concurrency, operation) {
  let nextIndex = 0;
  let allowed = 0;
  let blocked = 0;
  let errors = 0;

  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= total) {
        return;
      }

      try {
        const result = await operation(index);
        if (result && result.allowed === false) {
          blocked += 1;
        } else {
          allowed += 1;
        }
      } catch {
        errors += 1;
      }
    }
  });

  await Promise.all(workers);
  return { allowed, blocked, errors };
}

async function runFlexCase(storeName, StoreClass, algorithm, concurrency) {
  const redis = createRedis();
  const prefix = `bench:${process.pid}:${Date.now()}:${storeName}:${algorithm}:`;
  const store = new StoreClass({ client: redis, prefix });
  const limiter = new RateLimiter({
    algorithm,
    windowMs,
    max: limit,
    store,
  });
  const started = performance.now();
  const counters = await runPool(iterations, concurrency, (index) => (
    limiter.check(`user:${index % keyCount}`)
  ));
  const elapsedMs = performance.now() - started;

  try {
    if (typeof store.resetAll === 'function') {
      await store.resetAll();
    }
  } finally {
    if (typeof store.close === 'function') {
      await store.close();
    }
    redis.disconnect();
  }

  return buildResult(storeName, algorithm, concurrency, elapsedMs, counters);
}

async function runRateLimiterFlexibleCase(concurrency) {
  const redis = createRedis();
  const prefix = `bench:${process.pid}:${Date.now()}:rate-limiter-flexible:`;
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: prefix,
    points: limit,
    duration: Math.ceil(windowMs / 1000),
  });
  const started = performance.now();
  const counters = await runPool(iterations, concurrency, async (index) => {
    await limiter.consume(`user:${index % keyCount}`);
    return { allowed: true };
  });
  const elapsedMs = performance.now() - started;

  try {
    await cleanupPrefix(redis, prefix);
  } finally {
    redis.disconnect();
  }

  return buildResult('rate-limiter-flexible', 'fixed-window', concurrency, elapsedMs, counters);
}

function buildResult(store, algorithm, concurrency, elapsedMs, counters) {
  return {
    store,
    algorithm,
    concurrency,
    iterations,
    keyCount,
    elapsedMs,
    operationsPerSecond: Math.round((iterations / elapsedMs) * 1000),
    ...counters,
  };
}

function printTable(results) {
  console.log(`Redis benchmark: ${iterations} checks across ${keyCount} keys`);
  console.log(`Redis: ${redisUrl}`);
  console.log(`Node: ${process.version}`);
  console.log('Numbers are local-machine measurements, not portable product claims.\n');

  for (const result of results) {
    console.log(
      `${result.store.padEnd(24)} ${result.algorithm.padEnd(14)} c=${String(result.concurrency).padEnd(3)} ` +
      `${String(result.operationsPerSecond).padStart(8)} ops/s ` +
      `(${result.elapsedMs.toFixed(1)} ms, errors=${result.errors})`,
    );
  }
}

(async () => {
  const available = await isRedisAvailable();
  if (!available) {
    const skipped = {
      skipped: true,
      reason: `Redis unavailable at ${redisUrl}`,
    };
    if (jsonOutput) {
      console.log(JSON.stringify(skipped, null, 2));
    } else {
      console.log(`Redis benchmark skipped: ${skipped.reason}`);
    }
    return;
  }

  const results = [];

  for (const concurrency of concurrencyLevels) {
    for (const algorithm of algorithms) {
      results.push(await runFlexCase('RedisStore', RedisStore, algorithm, concurrency));
      results.push(await runFlexCase('CacheHubStore', CacheHubStore, algorithm, concurrency));
    }

    if (algorithms.includes('fixed-window')) {
      results.push(await runRateLimiterFlexibleCase(concurrency));
    }
  }

  const output = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model || 'unknown',
    redisUrl,
    iterations,
    keyCount,
    windowMs,
    limit,
    results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  printTable(results);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
