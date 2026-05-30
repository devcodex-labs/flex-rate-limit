#!/usr/bin/env node

const { performance } = require('perf_hooks');
const { RateLimiter } = require('../lib');

const iterations = Number(process.env.BENCH_ITERATIONS || 100000);
const keyCount = Number(process.env.BENCH_KEYS || 1000);
const algorithms = ['fixed-window', 'sliding-window', 'token-bucket', 'leaky-bucket'];

async function runCase(algorithm) {
  const limiter = new RateLimiter({
    algorithm,
    windowMs: 60000,
    max: iterations + 1,
  });

  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await limiter.check(`user:${index % keyCount}`);
  }
  const elapsedMs = performance.now() - started;

  return {
    algorithm,
    iterations,
    keyCount,
    elapsedMs,
    operationsPerSecond: Math.round((iterations / elapsedMs) * 1000),
  };
}

(async () => {
  console.log(`Memory benchmark: ${iterations} checks across ${keyCount} keys`);
  console.log('Numbers are local-machine measurements, not portable product claims.\n');

  for (const algorithm of algorithms) {
    const result = await runCase(algorithm);
    console.log(
      `${result.algorithm.padEnd(14)} ${String(result.operationsPerSecond).padStart(10)} ops/s ` +
      `(${result.elapsedMs.toFixed(1)} ms)`,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
