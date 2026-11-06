/**
 * 抽签算法核心：加权轮盘赌。
 *
 * 权重公式（与前端「权重透视」「抽样概率模拟」展示的公式严格一致）：
 *   w = 1 / (1 + max(总分, 0))^decay
 *   若开启冷启动且该同学被点次数 < minCalls，则 w *= multiplier
 *
 * 为什么用「1/(1+分)」而不是「1/(1+分的平方)」：
 * 前者在 0~10 分区间内天然平滑，且不会让高分同学概率直接归零，
 * 保证「总积分越高被点概率越低」的同时仍保留被点到的可能。
 */

export function weightOf({ total = 0, calls = 0, rules }) {
  let weight = 1;
  if (rules.reverseWeight.enabled) {
    weight = 1 / Math.pow(1 + Math.max(total, 0), rules.reverseWeight.decay);
  }
  // 冷启动：total 模式看累计次数，lesson 模式的有效次数就是「本场被点次数」，
  // 此时阈值固定为 1（本节没被点到过才加成）
  const threshold = rules.coldStart.mode === 'lesson' ? 1 : rules.coldStart.minCalls;
  if (rules.coldStart.enabled && calls < threshold) {
    weight *= rules.coldStart.multiplier;
  }
  return weight;
}

/** 把学生 + 规则换算成 [{...student, weight, probability}] */
export function buildDistribution(students, rules) {
  const items = students.map((s) => {
    const total = Number(s.total_score ?? 0);
    const calls = Number(s.cold_calls ?? s.total_calls ?? 0);
    return { ...s, total, calls, weight: weightOf({ total, calls, rules }) };
  });
  const sum = items.reduce((acc, item) => acc + item.weight, 0) || 1;
  return items.map((item) => ({ ...item, probability: item.weight / sum }));
}

/** 轮盘赌：一次 O(n) 抽样，n 为班级人数 */
export function sampleOnce(items, random = Math.random) {
  const total = items.reduce((acc, item) => acc + item.weight, 0);
  if (total <= 0) return null;
  let ticket = random() * total;
  for (const item of items) {
    ticket -= item.weight;
    if (ticket <= 0) return item;
  }
  return items[items.length - 1];
}

/** 抽到后按概率排序，供前端「权重透视」直接渲染 */
export function sortByProbability(items) {
  return [...items].sort((a, b) => b.probability - a.probability);
}
