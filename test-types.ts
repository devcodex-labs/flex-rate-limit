import flexRateLimit, {
  CacheHubStore,
  MemoryStore,
  RateLimiter,
  RedisStore,
  type RateLimiterOptions,
  type Store,
  keyGenerators,
} from './index';

const memoryStore = new MemoryStore();
const redisStore = new RedisStore({ client: {} as any });
const cacheHubStore = new CacheHubStore({ redis: {} as any, prefix: 'rl:' });

const options: RateLimiterOptions = {
  algorithm: 'token-bucket',
  windowMs: 60_000,
  max: 100,
  capacity: 100,
  refillRate: 100,
  store: cacheHubStore,
};

const limiter = new RateLimiter(options);

void limiter.check('user:1');
void limiter.reset('user:1');
void limiter.resetAll();
limiter.middleware();

const stores: Store[] = [memoryStore, redisStore, cacheHubStore];
void stores;

const defaultLimiter = new flexRateLimit.RateLimiter({
  store: new flexRateLimit.CacheHubStore(),
  keyGenerator: keyGenerators.ip,
});

void defaultLimiter;
