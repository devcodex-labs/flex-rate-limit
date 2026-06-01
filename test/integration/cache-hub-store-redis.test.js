const { expect } = require('chai');
const Redis = require('ioredis');
const { CacheHubStore, RateLimiter } = require('../../lib');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === 'true';
const TEST_PREFIX = `flex-cache-hub:${Date.now()}:`;

async function isRedisAvailable() {
  if (SKIP_INTEGRATION) {
    return false;
  }

  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

describe('CacheHubStore Redis integration', function() {
  this.timeout(10000);

  let redisAvailable = false;
  let redis;
  let store;

  before(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      return;
    }

    redis = new Redis(REDIS_URL);
    store = new CacheHubStore({ client: redis, prefix: TEST_PREFIX });
  });

  after(async () => {
    if (!redisAvailable) {
      return;
    }

    await store.resetAll();
    await store.close();
    redis.disconnect();
  });

  beforeEach(async () => {
    if (!redisAvailable) {
      return;
    }

    await store.resetAll();
  });

  it('should keep fixed-window counts correct under concurrent Redis checks', async function() {
    if (!redisAvailable) {
      this.skip();
    }

    const limiter = new RateLimiter({
      algorithm: 'fixed-window',
      windowMs: 60000,
      max: 100000,
      store,
    });
    const workers = Array.from({ length: 50 }, async () => {
      for (let i = 0; i < 100; i++) {
        await limiter.check('fixed-concurrent');
      }
    });

    await Promise.all(workers);

    const result = await limiter.check('fixed-concurrent');
    expect(result.current).to.equal(5001);
    expect(result.allowed).to.be.true;
  });

  it('should enforce sliding-window limits through cache-hub Redis Lua primitives', async function() {
    if (!redisAvailable) {
      this.skip();
    }

    const limiter = new RateLimiter({
      algorithm: 'sliding-window',
      windowMs: 60000,
      max: 5,
      store,
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.check('sliding-concurrent')),
    );

    expect(results.filter((result) => result.allowed)).to.have.length(5);
    expect(results.filter((result) => !result.allowed)).to.have.length(5);
  });

  it('should support Redis token-bucket and leaky-bucket algorithms', async function() {
    if (!redisAvailable) {
      this.skip();
    }

    const tokenLimiter = new RateLimiter({
      algorithm: 'token-bucket',
      windowMs: 60000,
      max: 2,
      store,
    });
    const leakyLimiter = new RateLimiter({
      algorithm: 'leaky-bucket',
      windowMs: 60000,
      max: 2,
      store,
    });

    expect((await tokenLimiter.check('token-user')).allowed).to.be.true;
    expect((await tokenLimiter.check('token-user')).allowed).to.be.true;
    expect((await tokenLimiter.check('token-user')).allowed).to.be.false;

    expect((await leakyLimiter.check('leaky-user')).allowed).to.be.true;
    expect((await leakyLimiter.check('leaky-user')).allowed).to.be.true;
    expect((await leakyLimiter.check('leaky-user')).allowed).to.be.false;
  });
});
