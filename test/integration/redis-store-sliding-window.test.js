const { expect } = require('chai');
const { RateLimiter, RedisStore } = require('../../lib');

class MockRedisClient {
  constructor() {
    this.values = new Map();
    this.sortedSets = new Map();
  }

  get(key) {
    return Promise.resolve(this.values.has(key) ? this.values.get(key) : null);
  }

  set(key, value) {
    this.values.set(key, value);
    return Promise.resolve('OK');
  }

  setex(key, _seconds, value) {
    this.values.set(key, value);
    return Promise.resolve('OK');
  }

  incr(key) {
    const value = Number(this.values.get(key) || 0) + 1;
    this.values.set(key, String(value));
    return Promise.resolve(value);
  }

  decr(key) {
    const value = Number(this.values.get(key) || 0) - 1;
    this.values.set(key, String(value));
    return Promise.resolve(value);
  }

  del(...keys) {
    for (const key of keys) {
      this.values.delete(key);
      this.sortedSets.delete(key);
    }
    return Promise.resolve(keys.length);
  }

  keys(pattern) {
    const prefix = pattern.replace('*', '');
    return Promise.resolve([
      ...Array.from(this.values.keys()),
      ...Array.from(this.sortedSets.keys()),
    ].filter((key) => key.startsWith(prefix)));
  }

  expire() {
    return Promise.resolve(1);
  }

  ttl() {
    return Promise.resolve(60);
  }

  zadd(key, score, member) {
    const entries = this.sortedSets.get(key) || [];
    entries.push({ member, score: Number(score) });
    entries.sort((left, right) => left.score - right.score);
    this.sortedSets.set(key, entries);
    return Promise.resolve(1);
  }

  zcard(key) {
    return Promise.resolve((this.sortedSets.get(key) || []).length);
  }

  zrem(key, member) {
    const entries = this.sortedSets.get(key) || [];
    const filtered = entries.filter((entry) => entry.member !== member);
    this.sortedSets.set(key, filtered);
    return Promise.resolve(entries.length - filtered.length);
  }

  zremrangebyscore(key, min, max) {
    const entries = this.sortedSets.get(key) || [];
    const lower = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = Number(max);
    const filtered = entries.filter((entry) => entry.score < lower || entry.score > upper);
    this.sortedSets.set(key, filtered);
    return Promise.resolve(entries.length - filtered.length);
  }

  zpopmax(key) {
    const entries = this.sortedSets.get(key) || [];
    if (entries.length === 0) {
      return Promise.resolve([]);
    }

    const entry = entries.pop();
    this.sortedSets.set(key, entries);
    return Promise.resolve([entry.member, String(entry.score)]);
  }

  type(key) {
    if (this.sortedSets.has(key)) {
      return Promise.resolve('zset');
    }

    if (this.values.has(key)) {
      return Promise.resolve('string');
    }

    return Promise.resolve('none');
  }

  zrange(key, start, stop, withScores) {
    const entries = this.sortedSets.get(key) || [];
    const slice = entries.slice(start, stop + 1);

    if (withScores === 'WITHSCORES') {
      return Promise.resolve(slice.flatMap((entry) => [entry.member, String(entry.score)]));
    }

    return Promise.resolve(slice.map((entry) => entry.member));
  }
}

describe('RedisStore sliding window integration', () => {
  it('should enforce sliding window limits with RedisStore', async () => {
    const limiter = new RateLimiter({
      algorithm: 'sliding-window',
      max: 2,
      windowMs: 60000,
      store: new RedisStore({ client: new MockRedisClient() }),
    });

    expect((await limiter.check('redis-user')).allowed).to.be.true;
    expect((await limiter.check('redis-user')).allowed).to.be.true;

    const result = await limiter.check('redis-user');
    expect(result.allowed).to.be.false;
    expect(result.current).to.equal(3);
    expect(result.limit).to.equal(2);
  });

  it('should rollback the exact Redis sorted set member for a request', async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({ client });
    const first = await store.checkSlidingWindow('redis-user', { windowMs: 60000, now: 1000 });
    await store.checkSlidingWindow('redis-user', { windowMs: 60000, now: 1001 });

    await store.rollbackSlidingWindow('redis-user', { member: first.member });

    const entries = client.sortedSets.get('rl:redis-user:scores');
    expect(entries).to.have.length(1);
    expect(entries[0].score).to.equal(1001);
  });

  it('should preserve Redis member metadata through RateLimiter rollback', async () => {
    const client = new MockRedisClient();
    const store = new RedisStore({ client });
    const limiter = new RateLimiter({
      algorithm: 'sliding-window',
      max: 10,
      windowMs: 60000,
      store,
    });

    const first = await limiter.check('redis-user');
    const second = await limiter.check('redis-user');

    await first._internal.algorithm.rollback(
      store,
      first._internal.key,
      first._internal.options,
      first,
    );

    const entries = client.sortedSets.get('rl:redis-user:scores');
    expect(entries).to.have.length(1);
    expect(entries[0].member).to.equal(second._internal.rollbackData.member);
  });
});
