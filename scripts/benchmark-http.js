#!/usr/bin/env node

const os = require('os');
const http = require('http');
const express = require('express');
const autocannon = require('autocannon');
const Redis = require('ioredis');
const { RateLimiter, RedisStore, CacheHubStore } = require('../lib');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const redisUrl = process.env.REDIS_URL || process.env.BENCH_REDIS_URL || 'redis://127.0.0.1:6379';
const duration = Number(process.env.BENCH_DURATION || 5);
const connections = Number(process.env.BENCH_CONNECTIONS || 50);
const pipelining = Number(process.env.BENCH_PIPELINING || 1);
const keyCount = Number(process.env.BENCH_KEYS || 500);
const windowMs = Number(process.env.BENCH_WINDOW_MS || 60000);
const limit = Number(process.env.BENCH_LIMIT || 1000000000);
const algorithm = process.env.BENCH_ALGORITHM || 'fixed-window';
const headers = process.env.BENCH_HEADERS === '1';
const jsonOutput = process.env.BENCH_JSON === '1';
const requestedScenarios = (process.env.BENCH_SCENARIOS || 'flex-memory,flex-redis,flex-cache-hub,rate-limiter-flexible')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

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

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function createFlexMiddleware(store) {
  let sequence = 0;
  const limiter = new RateLimiter({
    algorithm,
    windowMs,
    max: limit,
    headers,
    keyGenerator: () => {
      sequence += 1;
      return `user:${sequence % keyCount}`;
    },
    store,
  });

  return limiter.middleware();
}

function createRateLimiterFlexibleMiddleware(redis, prefix) {
  let sequence = 0;
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: prefix,
    points: limit,
    duration: Math.ceil(windowMs / 1000),
  });

  return async (_req, res, next) => {
    sequence += 1;
    try {
      await limiter.consume(`user:${sequence % keyCount}`);
      return next();
    } catch {
      res.status(429).send('Too Many Requests');
      return undefined;
    }
  };
}

async function createScenario(name, redisAvailable) {
  const validScenarios = new Set(['flex-memory', 'flex-redis', 'flex-cache-hub', 'rate-limiter-flexible']);
  if (!validScenarios.has(name)) {
    throw new Error(`Unknown HTTP benchmark scenario: ${name}`);
  }

  const app = express();
  let cleanup = async () => {};

  if (name === 'flex-memory') {
    app.use(createFlexMiddleware('memory'));
  } else {
    if (!redisAvailable) {
      return {
        name,
        skipped: true,
        reason: `Redis unavailable at ${redisUrl}`,
      };
    }

    const redis = createRedis();
    const prefix = `bench:http:${process.pid}:${Date.now()}:${name}:`;

    if (name === 'flex-redis') {
      app.use(createFlexMiddleware(new RedisStore({ client: redis, prefix })));
    } else if (name === 'flex-cache-hub') {
      app.use(createFlexMiddleware(new CacheHubStore({ client: redis, prefix })));
    } else if (name === 'rate-limiter-flexible') {
      app.use(createRateLimiterFlexibleMiddleware(redis, prefix));
    }

    cleanup = async () => {
      await cleanupPrefix(redis, prefix);
      redis.disconnect();
    };
  }

  app.get('/limited', (_req, res) => {
    res.end('ok');
  });

  const nodeServer = http.createServer(app);
  const port = await listen(nodeServer);

  return {
    name,
    url: `http://127.0.0.1:${port}/limited`,
    close: async () => {
      await close(nodeServer);
      await cleanup();
    },
  };
}

async function runScenario(scenario) {
  if (scenario.skipped) {
    return scenario;
  }

  try {
    const result = await autocannon({
      url: scenario.url,
      connections,
      duration,
      pipelining,
    });

    return {
      name: scenario.name,
      requestsPerSecond: Math.round(result.requests.average),
      latencyP50: result.latency.p50,
      latencyP99: result.latency.p99,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      duration,
      connections,
      pipelining,
    };
  } finally {
    await scenario.close();
  }
}

function printTable(results) {
  console.log(`HTTP middleware benchmark: duration=${duration}s connections=${connections} pipelining=${pipelining}`);
  console.log(`Algorithm: ${algorithm}; headers=${headers ? 'on' : 'off'}; keys=${keyCount}`);
  console.log(`Node: ${process.version}`);
  console.log('Numbers are local-machine measurements, not portable product claims.\n');

  for (const result of results) {
    if (result.skipped) {
      console.log(`${result.name.padEnd(24)} skipped (${result.reason})`);
      continue;
    }

    console.log(
      `${result.name.padEnd(24)} ${String(result.requestsPerSecond).padStart(8)} req/s ` +
      `(p50=${result.latencyP50} ms, p99=${result.latencyP99} ms, ` +
      `errors=${result.errors}, non2xx=${result.non2xx})`,
    );
  }
}

(async () => {
  const redisAvailable = await isRedisAvailable();
  const results = [];

  for (const scenarioName of requestedScenarios) {
    const scenario = await createScenario(scenarioName, redisAvailable);
    results.push(await runScenario(scenario));
  }

  const output = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model || 'unknown',
    redisUrl,
    algorithm,
    headers,
    duration,
    connections,
    pipelining,
    keyCount,
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
