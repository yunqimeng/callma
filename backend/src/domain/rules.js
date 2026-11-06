/**
 * 趣味规则：默认值 + 归一化 + 文案摘要。
 * 所有开关都由前端「趣味规则」页下发，后端只认这一份结构。
 */
export const DEFAULT_RULES = {
  // 反向权重：总积分越高，被抽中概率越低
  reverseWeight: { enabled: true, decay: 0.85 },
  // 接力徽章：累计被点到 N 次获得一枚，可把一次点名转给同学
  badge: { enabled: true, threshold: 3 },
  // 随机事件：每次点名有概率触发（双倍积分 / 课堂护盾 / 全班小红包）
  randomEvent: { enabled: true, probability: 0.25 },
  // 冷启动加成：被点次数不足的学生权重放大
  //   mode=total  看累计被点次数（长期公平）
  //   mode=lesson 看本场是否还没被点到（当堂补漏）
  coldStart: { enabled: true, mode: 'total', minCalls: 3, multiplier: 2.5 },
  // 连击奖励：同一同学连续两次精准作答，额外 +1
  combo: { enabled: true },
};

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export function normalizeRules(input = {}) {
  const d = DEFAULT_RULES;
  const r = input || {};
  return {
    reverseWeight: {
      enabled: Boolean(r.reverseWeight?.enabled ?? d.reverseWeight.enabled),
      decay: clamp(r.reverseWeight?.decay, 0, 2, d.reverseWeight.decay),
    },
    badge: {
      enabled: Boolean(r.badge?.enabled ?? d.badge.enabled),
      threshold: Math.round(clamp(r.badge?.threshold, 1, 20, d.badge.threshold)),
    },
    randomEvent: {
      enabled: Boolean(r.randomEvent?.enabled ?? d.randomEvent.enabled),
      probability: clamp(r.randomEvent?.probability, 0, 1, d.randomEvent.probability),
    },
    coldStart: {
      enabled: Boolean(r.coldStart?.enabled ?? d.coldStart.enabled),
      mode: r.coldStart?.mode === 'lesson' ? 'lesson' : 'total',
      minCalls: Math.round(clamp(r.coldStart?.minCalls, 0, 50, d.coldStart.minCalls)),
      multiplier: clamp(r.coldStart?.multiplier, 1, 10, d.coldStart.multiplier),
    },
    combo: {
      enabled: Boolean(r.combo?.enabled ?? d.combo.enabled),
    },
  };
}

export function enabledCount(rules) {
  return Object.values(rules).filter((item) => item.enabled).length;
}

/** 把衰减系数翻译成一句人话，用于「趣味规则」页顶部状态条 */
export function tiltLabel(rules) {
  const { enabled, decay } = rules.reverseWeight;
  if (!enabled) return '关闭';
  if (decay <= 0.45) return '轻度倾斜';
  if (decay <= 0.95) return '中等';
  return '明显倾斜';
}

export function eventFrequencyLabel(rules) {
  const { enabled, probability } = rules.randomEvent;
  if (!enabled || probability <= 0) return '关闭';
  const per = Math.max(1, Math.round(1 / probability));
  return `每 ${per} 次点名约触发 1 次`;
}

/** 权重公式的可读版本，与前端展示的公式必须完全一致 */
export function weightFormulaText(rules) {
  const decay = rules.reverseWeight.decay;
  return `w = 1 / (1 + 总分)^${decay}`;
}
