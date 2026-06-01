#!/usr/bin/env node

const { performance } = require('perf_hooks');
const { RateLimiter } = require('../lib');

const iterations = Number(process.env.BENCH_ITERATIONS || 100000);
const keyCount = Number(process.env.BENCH_KEYS || 1000);
const runs = Number(process.env.BENCH_RUNS || 1);
const jsonOutput = process.env.BENCH_JSON === '1';
const algorithms = ['fixed-window', 'sliding-window', 'token-bucket', 'leaky-bucket'];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

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

async function runAlgorithm(algorithm) {
  const samples = [];

  for (let run = 0; run < runs; run += 1) {
    samples.push(await runCase(algorithm));
  }

  const opsSamples = samples.map((sample) => sample.operationsPerSecond);
  const elapsedSamples = samples.map((sample) => sample.elapsedMs);

  return {
    algorithm,
    iterations,
    keyCount,
    runs,
    operationsPerSecond: median(opsSamples),
    minOperationsPerSecond: Math.min(...opsSamples),
    maxOperationsPerSecond: Math.max(...opsSamples),
    elapsedMs: median(elapsedSamples),
    samples,
  };
}

(async () => {
  const results = [];

  for (const algorithm of algorithms) {
    results.push(await runAlgorithm(algorithm));
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      node: process.version,
      iterations,
      keyCount,
      runs,
      results,
    }, null, 2));
    return;
  }

  console.log(`Memory benchmark: ${iterations} checks across ${keyCount} keys`);
  console.log(`Runs per algorithm: ${runs}`);
  console.log('Numbers are local-machine measurements, not portable product claims.\n');

  for (const result of results) {
    console.log(
      `${result.algorithm.padEnd(14)} ${String(result.operationsPerSecond).padStart(10)} ops/s ` +
      `(${result.elapsedMs.toFixed(1)} ms median, ` +
      `${result.minOperationsPerSecond}-${result.maxOperationsPerSecond} ops/s range)`,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
