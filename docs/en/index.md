---
pageType: home

hero:
  name: flex-rate-limit
  text: Universal Rate Limiting for Node.js
  tagline: Framework-agnostic rate limiting with Memory, Redis, cache-hub atomic backends, four algorithms, and Express-style middleware.
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started/quickstart
    - theme: alt
      text: API Reference
      link: /reference/api-reference
    - theme: alt
      text: Benchmarks
      link: /benchmark

features:
  - title: Framework-Agnostic Core
    details: Use check() directly in any runtime, or wrap middleware() for Express-compatible flows.
    link: /getting-started/quickstart
  - title: Four Algorithms
    details: Sliding window, fixed window, token bucket, and leaky bucket cover fairness, burst, and shaping needs.
    link: /algorithms/comparison
  - title: Memory, Redis, and cache-hub
    details: Start with in-process Memory, then move to Redis or CacheHubStore when counters must be shared.
    link: /guides/storage
  - title: Production Lifecycle
    details: Close owned Redis clients and cache-hub cleanup timers with await limiter.close().
    link: /guides/storage
  - title: Allowlist Scenarios
    details: Keep IP allowlist behavior independent from route rate limits, with global and route-level configuration patterns.
    link: /whitelist-ratelimit-config-scenarios
  - title: Reproducible Benchmarks
    details: Memory, Redis direct, HTTP middleware, and OSS comparison data are documented with commands and environment.
    link: /benchmark
  - title: Typed Package Surface
    details: CommonJS, ESM, and TypeScript declarations share one runtime contract.
    link: /reference/api-reference
---
