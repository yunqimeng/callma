import { sampleOnce } from './weighing.js';

/**
 * 蒙特卡洛模拟：按当前权重反复抽样，用频率逼近真实概率。
 *
 * 用途有三：
 *   1) 验证权重公式确实产生了「积分越高越难被点到」的分布；
 *   2) 给「趣味规则」页一张可解释的概率条；
 *   3) 博客里做「理论值 vs 模拟值」的偏差分析（标准误 ≈ √(p(1-p)/N)）。
 *
 * 放在后端执行而不是浏览器，是因为 3000~30000 次抽样在低端笔记本上会让
 * 主线程卡住 1~2 秒；服务端算完只回一份 46 行的结果，前端渲染几乎零成本。
 */
export function simulateDraws(items, draws = 3000, random = Math.random) {
  const hits = new Map(items.map((item) => [item.id, 0]));
  const n = Math.max(1, Math.min(Number(draws) || 3000, 50000));
  for (let i = 0; i < n; i += 1) {
    const picked = sampleOnce(items, random);
    if (picked) hits.set(picked.id, (hits.get(picked.id) ?? 0) + 1);
  }
  return items
    .map((item) => ({
      id: item.id,
      student_no: item.student_no,
      name: item.name,
      major: item.major,
      total: item.total,
      probability: item.probability,
      simulated: (hits.get(item.id) ?? 0) / n,
      hits: hits.get(item.id) ?? 0,
    }))
    .sort((a, b) => b.simulated - a.simulated);
}
