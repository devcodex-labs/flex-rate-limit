---
pageType: home

hero:
  badge: v2.2.4 traffic control release
  name: flex-rate-limit
  text: Traffic Control for Node.js Services
  tagline: Shape bursts, share counters, and expose predictable retry metadata with Memory, Redis, cache-hub atomic backends, four algorithms, and Express-style middleware.
  image:
    src: /traffic-gate.svg
    alt: Rate limiting traffic control panel
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
  - title: Framework-Neutral Guard
    details: Call check() directly in any runtime, or wrap middleware() for Express-compatible request flows.
    link: /getting-started/quickstart
  - title: Window and Bucket Control
    details: Sliding window, fixed window, token bucket, and leaky bucket cover fairness, burst capacity, and smoothing needs.
    link: /algorithms/comparison
  - title: Shared Counter Backends
    details: Start with in-process Memory, then move to Redis or CacheHubStore when counters must be shared across instances.
    link: /guides/storage
  - title: Lifecycle Cleanup
    details: Close owned Redis clients and cache-hub cleanup resources with await limiter.close().
    link: /guides/storage
  - title: Independent Allowlist
    details: Keep IP allowlist authorization separate from route quotas, with global and route-level configuration patterns.
    link: /whitelist-ratelimit-config-scenarios
  - title: Measured Performance
    details: Memory, Redis direct, HTTP middleware, and OSS comparison data are documented with commands and environment.
    link: /benchmark
---
