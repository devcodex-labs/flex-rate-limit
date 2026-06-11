const { expect } = require('chai');
const sinon = require('sinon');
const EventEmitter = require('events');
const { CacheHubStore, RateLimiter } = require('../../lib');

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = () => {};
  return res;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, intervalMs, getDebugState) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(intervalMs);
  }

  expect(getDebugState()).to.deep.equal({});
}

function getCacheHubMemoryStateCounts(store) {
  const fixedWindowStore = store.fixedWindowStore.delegate || store.fixedWindowStore;
  const stateStore = store.stateStore.delegate || store.stateStore;
  return {
    fixedCounters: fixedWindowStore._atomic?._counters?.size || 0,
    slidingWindows: stateStore._slidingWindows?.size || 0,
    tokenBuckets: stateStore._tokenBuckets?.size || 0,
    leakyBuckets: stateStore._leakyBuckets?.size || 0,
    fixedExpiryTracking: store.fixedWindowStore.expiryManager?.expiries?.size || 0,
    stateExpiryTracking: store.stateStore.expiryManager?.expiries?.size || 0,
    slidingWindowMeta: store.stateStore.slidingWindowMs?.size || 0,
    tokenBucketMeta: store.stateStore.tokenBucketOptions?.size || 0,
    leakyBucketMeta: store.stateStore.leakyBucketOptions?.size || 0,
  };
}

function getNonZeroCounts(store) {
  return Object.fromEntries(
    Object.entries(getCacheHubMemoryStateCounts(store)).filter(([, value]) => value !== 0),
  );
}

describe('CacheHubStore', () => {
  it('should enforce fixed-window limits through cache-hub fixed-window primitives', async () => {
    const store = new CacheHubStore();
    const limiter = new RateLimiter({
      algorithm: 'fixed-window',
      windowMs: 60000,
      max: 2,
      store,
    });

    expect((await limiter.check('fixed-user')).allowed).to.be.true;
    expect((await limiter.check('fixed-user')).allowed).to.be.true;

    const blocked = await limiter.check('fixed-user');
    expect(blocked.allowed).to.be.false;
    expect(blocked.current).to.equal(3);

    await limiter.reset('fixed-user');
    expect((await limiter.check('fixed-user')).allowed).to.be.true;
  });

  it('should rollback fixed-window counts after successful middleware requests', async () => {
    const store = new CacheHubStore();
    const limiter = new RateLimiter({
      algorithm: 'fixed-window',
      windowMs: 60000,
      max: 1,
      skipSuccessfulRequests: true,
      store,
    });
    const middleware = limiter.middleware();
    const req = { ip: '127.0.0.1', path: '/ok' };
    const res = createMockResponse();

    await middleware(req, res, () => {});
    res.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    const result = await limiter.check('127.0.0.1', { req });
    expect(result.allowed).to.be.true;
    expect(result.current).to.equal(1);
  });

  it('should enforce sliding-window limits and rollback successful middleware requests', async () => {
    const store = new CacheHubStore();
    const limiter = new RateLimiter({
      algorithm: 'sliding-window',
      windowMs: 60000,
      max: 1,
      skipSuccessfulRequests: true,
      store,
    });
    const middleware = limiter.middleware();
    const req = { ip: '127.0.0.1', path: '/ok' };
    const res = createMockResponse();

    await middleware(req, res, () => {});
    res.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    const result = await limiter.check('127.0.0.1', { req });
    expect(result.allowed).to.be.true;
    expect(result.current).to.equal(1);
  });

  it('should rollback token-bucket reservations with cache-hub rollback tokens', async () => {
    const store = new CacheHubStore();
    const limiter = new RateLimiter({
      algorithm: 'token-bucket',
      windowMs: 60000,
      max: 1,
      store,
    });

    const first = await limiter.check('token-user', { trackRollback: true });
    expect(first.allowed).to.be.true;
    expect((await limiter.check('token-user')).allowed).to.be.false;

    await first._internal.algorithm.rollback(
      store,
      first._internal.key,
      first._internal.options,
      first,
    );

    expect((await limiter.check('token-user')).allowed).to.be.true;
  });

  it('should rollback leaky-bucket reservations with cache-hub rollback tokens', async () => {
    const store = new CacheHubStore();
    const limiter = new RateLimiter({
      algorithm: 'leaky-bucket',
      windowMs: 60000,
      max: 1,
      store,
    });

    const first = await limiter.check('leaky-user', { trackRollback: true });
    expect(first.allowed).to.be.true;
    expect((await limiter.check('leaky-user')).allowed).to.be.false;

    await first._internal.algorithm.rollback(
      store,
      first._internal.key,
      first._internal.options,
      first,
    );

    expect((await limiter.check('leaky-user')).allowed).to.be.true;
  });

  it('should expose generic get/set/reset/resetAll methods', async () => {
    const store = new CacheHubStore({ prefix: 'test:' });

    await store.set('value', { ok: true }, 60000);
    expect(await store.get('value')).to.deep.equal({ ok: true });

    await store.reset('value');
    expect(await store.get('value')).to.be.undefined;

    await store.set('one', 1, 60000);
    await store.set('two', 2, 60000);
    await store.resetAll();

    expect(await store.get('one')).to.be.undefined;
    expect(await store.get('two')).to.be.undefined;
  });

  it('should prune only expired sliding-window entries for active in-memory keys', async function() {
    this.timeout(5000);

    const clock = sinon.useFakeTimers({
      now: 1000,
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
    });
    const store = new CacheHubStore({ prefix: 'sliding-prune:' });
    const limiter = new RateLimiter({
      algorithm: 'sliding-window',
      windowMs: 80,
      max: 10,
      store,
    });

    try {
      expect((await limiter.check('multi-entry')).current).to.equal(1);
      await clock.tickAsync(40);
      expect((await limiter.check('multi-entry')).current).to.equal(2);
      await clock.tickAsync(41);

      const result = await limiter.check('multi-entry');
      expect(result.allowed).to.be.true;
      expect(result.current).to.equal(2);

      await limiter.close();
    } finally {
      clock.restore();
    }
  });

  it('should release in-memory rate-limit state after short windows under memory pressure', async function() {
    this.timeout(10000);

    const algorithms = ['fixed-window', 'sliding-window', 'token-bucket', 'leaky-bucket'];
    const keyCount = 1500;

    for (const algorithm of algorithms) {
      const store = new CacheHubStore({ prefix: `pressure:${algorithm}:` });
      const limiter = new RateLimiter({
        algorithm,
        windowMs: 25,
        max: keyCount + 1,
        store,
      });

      for (let i = 0; i < keyCount; i++) {
        const result = await limiter.check(`${algorithm}:${i}`);
        expect(result.allowed).to.be.true;
      }

      expect(Object.keys(getNonZeroCounts(store)).length).to.be.greaterThan(0);

      await waitFor(
        () => Object.keys(getNonZeroCounts(store)).length === 0,
        1500,
        20,
        () => getNonZeroCounts(store),
      );

      await limiter.close();
    }
  });

  it('should release in-memory rate-limit state immediately when closed', async () => {
    const store = new CacheHubStore({ prefix: 'close:' });
    const limiters = [
      new RateLimiter({ algorithm: 'fixed-window', windowMs: 60000, max: 100, store }),
      new RateLimiter({ algorithm: 'sliding-window', windowMs: 60000, max: 100, store }),
      new RateLimiter({ algorithm: 'token-bucket', windowMs: 60000, max: 100, store }),
      new RateLimiter({ algorithm: 'leaky-bucket', windowMs: 60000, max: 100, store }),
    ];

    for (const [index, limiter] of limiters.entries()) {
      await limiter.check(`close-user:${index}`);
    }

    expect(Object.keys(getNonZeroCounts(store)).length).to.be.greaterThan(0);

    await store.close();

    expect(getNonZeroCounts(store)).to.deep.equal({});
  });
});
