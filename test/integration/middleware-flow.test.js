const { expect } = require('chai');
const EventEmitter = require('events');
const { RateLimiter } = require('../../lib');

function createMockResponse(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = {};
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

describe('RateLimiter integration flow', () => {
  it('should rollback failed requests when skipFailedRequests is enabled', async () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      max: 1,
      skipFailedRequests: true,
    });

    const middleware = limiter.middleware();
    const req = { ip: '127.0.0.1', path: '/submit' };

    const firstRes = createMockResponse(500);
    await middleware(req, firstRes, () => {});
    firstRes.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    const secondRes = createMockResponse(200);
    await middleware(req, secondRes, () => {});

    expect(secondRes.statusCode).to.equal(200);
    expect(secondRes.payload).to.be.undefined;
  });

  it('should rollback failed requests that finish synchronously in next', async () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      max: 1,
      skipFailedRequests: true,
    });

    const middleware = limiter.middleware();
    const req = { ip: '127.0.0.1', path: '/sync-submit' };

    const firstRes = createMockResponse();
    await middleware(req, firstRes, () => {
      firstRes.statusCode = 500;
      firstRes.emit('finish');
    });
    await new Promise((resolve) => setImmediate(resolve));

    const secondRes = createMockResponse(200);
    await middleware(req, secondRes, () => {});

    expect(secondRes.statusCode).to.equal(200);
    expect(secondRes.payload).to.be.undefined;
  });

  it('should prioritize middleware overrides over base config', async () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      max: 5,
      perRoute: {
        '/orders': { max: 2 },
      },
    });

    const middleware = limiter.middleware({ max: 1 });
    const req = { ip: '127.0.0.1', path: '/orders' };

    const firstRes = createMockResponse();
    const secondRes = createMockResponse();

    await middleware(req, firstRes, () => {});
    await middleware(req, secondRes, () => {});

    expect(secondRes.statusCode).to.equal(429);
    expect(secondRes.payload.error).to.equal('请求过多');
  });
});
