const { expect } = require('chai');
const EventEmitter = require('events');
const { RateLimiter } = require('../../lib');

function createMockResponse() {
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
}

describe('RateLimiter', () => {
  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const limiter = new RateLimiter();
      expect(limiter).to.be.instanceOf(RateLimiter);
    });

    it('should accept custom options', () => {
      const limiter = new RateLimiter({
        windowMs: 30000,
        max: 50,
        algorithm: 'fixed-window',
      });
      expect(limiter.options.windowMs).to.equal(30000);
      expect(limiter.options.max).to.equal(50);
      expect(limiter.options.algorithm).to.equal('fixed-window');
    });

    it('should throw error for invalid windowMs', () => {
      expect(() => {
        new RateLimiter({ windowMs: -1 });
      }).to.throw('windowMs 必须是正数');
    });

    it('should throw error for invalid max', () => {
      expect(() => {
        new RateLimiter({ max: 0 });
      }).to.throw('max 必须是正数');
    });

    it('should throw error for invalid algorithm', () => {
      expect(() => {
        new RateLimiter({ algorithm: 'invalid' });
      }).to.throw('algorithm 必须是以下之一');
    });
  });

  describe('check()', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 5,
      });

      for (let i = 0; i < 5; i++) {
        const result = await limiter.check('test-key');
        expect(result.allowed).to.be.true;
        expect(result.current).to.equal(i + 1);
        expect(result.remaining).to.equal(5 - (i + 1));
      }
    });

    it('should deny requests over limit', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 3,
      });

      // First 3 should pass
      for (let i = 0; i < 3; i++) {
        const result = await limiter.check('test-key-2');
        expect(result.allowed).to.be.true;
      }

      // 4th should fail
      const result = await limiter.check('test-key-2');
      expect(result.allowed).to.be.false;
      expect(result.remaining).to.equal(0);
      expect(result.retryAfter).to.be.greaterThan(0);
    });

    it('should enforce token bucket capacity when capacity is omitted', async () => {
      const limiter = new RateLimiter({
        algorithm: 'token-bucket',
        windowMs: 60000,
        max: 2,
      });

      expect((await limiter.check('token-default')).allowed).to.be.true;
      expect((await limiter.check('token-default')).allowed).to.be.true;

      const result = await limiter.check('token-default');
      expect(result.allowed).to.be.false;
      expect(result.limit).to.equal(2);
    });

    it('should enforce leaky bucket capacity when capacity is omitted', async () => {
      const limiter = new RateLimiter({
        algorithm: 'leaky-bucket',
        windowMs: 60000,
        max: 2,
      });

      expect((await limiter.check('leaky-default')).allowed).to.be.true;
      expect((await limiter.check('leaky-default')).allowed).to.be.true;

      const result = await limiter.check('leaky-default');
      expect(result.allowed).to.be.false;
      expect(result.limit).to.equal(2);
    });

    it('should throw error for invalid key', async () => {
      const limiter = new RateLimiter();

      try {
        await limiter.check('');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('键必须是非空字符串');
      }
    });

    it('should handle different keys independently', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 2,
      });

      await limiter.check('key1');
      await limiter.check('key1');

      await limiter.check('key2');

      const result1 = await limiter.check('key1');
      const result2 = await limiter.check('key2');

      expect(result1.allowed).to.be.false;
      expect(result2.allowed).to.be.true;
    });

    it('should not attach internal rollback metadata by default', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 2,
      });
      const req = { ip: '127.0.0.1', largePayload: Buffer.alloc(1024) };

      const result = await limiter.check('public-result', { req });

      expect(Object.prototype.hasOwnProperty.call(result, '_internal')).to.be.false;
    });

    it('should attach internal rollback metadata only when explicitly requested', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 2,
      });

      const result = await limiter.check('rollback-result', { trackRollback: true });

      expect(Object.prototype.hasOwnProperty.call(result, '_internal')).to.be.true;
      expect(Object.keys(result)).to.not.include('_internal');
      expect(result._internal.key).to.equal('rollback-result');
    });
  });

  describe('reset()', () => {
    it('should reset rate limit for specific key', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 2,
      });

      await limiter.check('reset-key');
      await limiter.check('reset-key');

      let result = await limiter.check('reset-key');
      expect(result.allowed).to.be.false;

      await limiter.reset('reset-key');

      result = await limiter.check('reset-key');
      expect(result.allowed).to.be.true;
      expect(result.current).to.equal(1);
    });

    it('should reset fixed window counters in the active window', async () => {
      const limiter = new RateLimiter({
        algorithm: 'fixed-window',
        windowMs: 60000,
        max: 1,
      });

      await limiter.check('fixed-reset');
      let result = await limiter.check('fixed-reset');
      expect(result.allowed).to.be.false;

      await limiter.reset('fixed-reset');

      result = await limiter.check('fixed-reset');
      expect(result.allowed).to.be.true;
      expect(result.current).to.equal(1);
    });
  });

  describe('resetAll()', () => {
    it('should reset all rate limits', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 1,
      });

      await limiter.check('key1');
      await limiter.check('key2');
      await limiter.check('key3');

      await limiter.resetAll();

      const result1 = await limiter.check('key1');
      const result2 = await limiter.check('key2');
      const result3 = await limiter.check('key3');

      expect(result1.current).to.equal(1);
      expect(result2.current).to.equal(1);
      expect(result3.current).to.equal(1);
    });
  });

  describe('close()', () => {
    it('should delegate resource cleanup to stores that support close()', async () => {
      let closed = false;
      const store = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        increment: () => Promise.resolve({ count: 1, resetTime: Date.now() + 60000 }),
        reset: () => Promise.resolve(),
        close: () => {
          closed = true;
          return Promise.resolve();
        },
      };
      const limiter = new RateLimiter({ store });

      await limiter.close();

      expect(closed).to.be.true;
    });
  });

  describe('middleware()', () => {
    it('should create middleware function', () => {
      const limiter = new RateLimiter();
      const middleware = limiter.middleware();
      expect(middleware).to.be.a('function');
    });

    it('should call next() when request is allowed', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 5,
      });

      const middleware = limiter.middleware();
      let nextCalled = false;

      const req = { ip: '127.0.0.1' };
      const res = createMockResponse();
      const next = () => {
        nextCalled = true;
      };

      await middleware(req, res, next);
      expect(nextCalled).to.be.true;
    });

    it('should set rate limit headers', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
      });

      const middleware = limiter.middleware();
      const res = createMockResponse();

      const req = { ip: '127.0.0.1' };
      const next = () => {};

      await middleware(req, res, next);

      expect(res.headers['X-RateLimit-Limit']).to.exist;
      expect(res.headers['X-RateLimit-Remaining']).to.exist;
      expect(res.headers['X-RateLimit-Reset']).to.exist;
    });

    it('should skip rate limiting when skip function returns true', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 1,
        skip: (req) => req.path === '/health',
      });

      const middleware = limiter.middleware();
      let nextCalled = false;

      const req = { ip: '127.0.0.1', path: '/health' };
      const res = createMockResponse();
      const next = () => {
        nextCalled = true;
      };

      // Make multiple requests
      await middleware(req, res, next);
      await middleware(req, res, next);
      await middleware(req, res, next);

      expect(nextCalled).to.be.true;
    });

    it('should honor middleware overrides', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
      });

      const middleware = limiter.middleware({ max: 1 });
      const req = { ip: '127.0.0.1', path: '/login' };
      const firstRes = createMockResponse();
      const secondRes = createMockResponse();

      await middleware(req, firstRes, () => {});
      await middleware(req, secondRes, () => {});

      expect(secondRes.statusCode).to.equal(429);
    });

    it('should honor perRoute overrides', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
        perRoute: {
          '/login': { max: 1 },
        },
      });

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1', path: '/login' };
      const firstRes = createMockResponse();
      const secondRes = createMockResponse();

      await middleware(req, firstRes, () => {});
      await middleware(req, secondRes, () => {});

      expect(secondRes.statusCode).to.equal(429);
    });

    it('should rollback successful requests when skipSuccessfulRequests is enabled', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 1,
        skipSuccessfulRequests: true,
      });

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1', path: '/ok' };

      const firstRes = createMockResponse();
      await middleware(req, firstRes, () => {});
      firstRes.emit('finish');
      await new Promise((resolve) => setImmediate(resolve));

      const secondRes = createMockResponse();
      await middleware(req, secondRes, () => {});

      expect(secondRes.statusCode).to.equal(200);
      expect(secondRes.payload).to.be.undefined;
    });

    it('should rollback successful requests that finish synchronously in next', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 1,
        skipSuccessfulRequests: true,
      });

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1', path: '/sync-ok' };

      const firstRes = createMockResponse();
      await middleware(req, firstRes, () => {
        firstRes.emit('finish');
      });
      await new Promise((resolve) => setImmediate(resolve));

      const secondRes = createMockResponse();
      await middleware(req, secondRes, () => {});

      expect(secondRes.statusCode).to.equal(200);
      expect(secondRes.payload).to.be.undefined;
    });

    it('should not call next with error after sending 429 response', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: 1,
      });

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1', path: '/api' };
      const firstRes = createMockResponse();
      const secondRes = createMockResponse();
      const calls = [];

      await middleware(req, firstRes, (error) => {
        calls.push(error ? error.message : 'next');
      });
      await middleware(req, secondRes, (error) => {
        calls.push(error ? error.message : 'next');
      });

      expect(secondRes.statusCode).to.equal(429);
      expect(calls).to.deep.equal(['next']);
    });
  });

  describe('Custom max function', () => {
    it('should support dynamic max limit', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        max: (req) => (req.isPremium ? 100 : 10),
      });

      const result1 = await limiter.check('user1', { req: { isPremium: true } });
      expect(result1.limit).to.equal(100);

      const result2 = await limiter.check('user2', { req: { isPremium: false } });
      expect(result2.limit).to.equal(10);
    });
  });
});
