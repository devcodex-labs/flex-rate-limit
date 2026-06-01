const { expect } = require('chai');
const EventEmitter = require('events');
const { CacheHubStore, RateLimiter } = require('../../lib');

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = () => {};
  return res;
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

    const first = await limiter.check('token-user');
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

    const first = await limiter.check('leaky-user');
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
});
