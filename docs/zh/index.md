---
pageType: home

hero:
  name: flex-rate-limit
  text: Node.js 通用限流库
  tagline: 框架无关核心、四种限流算法、Memory / Redis / cache-hub 存储后端，以及可落地的集成示例。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started/quickstart
    - theme: alt
      text: API 参考
      link: /zh/reference/api-reference

features:
  - title: 框架无关核心
    details: 可直接在任意运行时调用 check()，也可用 middleware() 接入 Express 风格中间件。
  - title: 四种限流算法
    details: 支持滑动窗口、固定窗口、令牌桶和漏桶，覆盖精确控制、突发流量与流量整形。
  - title: Memory、Redis 与 cache-hub
    details: 单进程优先使用 Memory；需要多实例共享计数时可切换到 Redis 或 CacheHubStore。
  - title: 可复现文档与基准
    details: 指南、API、存储说明和性能 benchmark 共用同一套文档站来源。
---
