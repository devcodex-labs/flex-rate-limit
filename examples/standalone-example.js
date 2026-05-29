/**
 * 独立使用示例（无 Web 框架）
 */

const { RateLimiter } = require('../lib');

// 创建速率限制器
const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 分钟
  max: 5, // 每分钟 5 个请求
  algorithm: 'sliding-window',
});

async function simulateRequests() {
  const userId = 'user-123';

  console.log('为用户模拟速率限制:', userId);
  console.log('限制：每分钟 5 个请求\n');

  // 模拟 8 个请求
  for (let i = 1; i <= 8; i++) {
    const result = await limiter.check(userId);

    console.log(`请求 ${i}:`);
    console.log(`  允许: ${result.allowed}`);
    console.log(`  当前: ${result.current}/${result.limit}`);
    console.log(`  剩余: ${result.remaining}`);
    console.log(`  重置时间: ${new Date(result.resetTime).toISOString()}`);

    if (!result.allowed) {
      console.log(`  ⛔ 超过速率限制！${Math.ceil(result.retryAfter / 1000)}秒后重试`);
    } else {
      console.log(`  ✅ 请求已允许`);
    }

    console.log('');

    // 短暂停顿，便于观察输出，同时保持示例验证脚本可快速完成。
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 重置速率限制
  console.log('\n🔄 正在重置用户的速率限制...');
  await limiter.reset(userId);

  // 重置后测试
  const result = await limiter.check(userId);
  console.log(`重置后 - 剩余: ${result.remaining}/${result.limit}\n`);
}

async function demonstrateAlgorithms() {
  console.log('\n=== 演示不同算法 ===\n');

  const algorithms = ['sliding-window', 'fixed-window', 'token-bucket', 'leaky-bucket'];

  for (const algo of algorithms) {
    console.log(`\n--- ${algo.toUpperCase()} ---`);

    const limiter = new RateLimiter({
      windowMs: 10000, // 10 秒
      max: 3,
      algorithm: algo,
    });

    for (let i = 1; i <= 5; i++) {
      const result = await limiter.check(`test-${algo}`);
      console.log(`请求 ${i}: ${result.allowed ? '✅' : '⛔'} (${result.current}/${result.limit})`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function main() {
  try {
    await simulateRequests();
    await demonstrateAlgorithms();

    console.log('\n✨ 演示完成！');
  } catch (error) {
    console.error('错误:', error);
  }
}

main();



