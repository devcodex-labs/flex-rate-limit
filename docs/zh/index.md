---
pageType: home

hero:
  badge: v2.2.4 流量控制版本
  name: flex-rate-limit
  text: Node.js 服务流量控制台
  tagline: 用 Memory、Redis、cache-hub 原子后端、四种限流算法和 Express 风格中间件，稳定处理突发请求、共享计数并输出可预测的重试元数据。
  image:
    src: /traffic-gate.svg
    alt: 限流流量控制面板
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started/quickstart
    - theme: alt
      text: API 参考
      link: /zh/reference/api-reference
    - theme: alt
      text: 性能基准
      link: /zh/benchmark

features:
  - title: 框架无关防线
    details: 可直接在任意运行时调用 check()，也可用 middleware() 接入 Express 风格请求链路。
    link: /zh/getting-started/quickstart
  - title: 窗口与桶控制
    details: 滑动窗口、固定窗口、令牌桶和漏桶覆盖公平性、突发容量和流量整形需求。
    link: /zh/algorithms/comparison
  - title: 共享计数后端
    details: 单进程可从 Memory 起步，多实例共享计数时切换到 Redis 或 CacheHubStore。
    link: /zh/guides/storage
  - title: 生命周期清理
    details: 通过 await limiter.close() 关闭库自建 Redis client 和 cache-hub 清理资源。
    link: /zh/guides/storage
  - title: 独立白名单
    details: 保持 IP 白名单授权与路由限额相互独立，并支持全局与路由级配置模式。
    link: /zh/whitelist-ratelimit-config-scenarios
  - title: 可复现性能
    details: Memory、Redis direct、HTTP middleware 与 OSS 对比数据均记录命令和测试环境。
    link: /zh/benchmark
---
