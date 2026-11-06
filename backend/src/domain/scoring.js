/**
 * 积分规则（固定，不可关闭）——严格对齐题目 Part·1 需求 (5)：
 *   初始积分 0；
 *   每点到一次且到达课堂，+1；
 *   点名回答问题时，能准确重复所提问题，+0.5，否则 -1；
 *   准确回答问题，根据情况 +0.5 ~ 3；
 *   总积分越高，被随机点到的概率越低（由 weighing.js 的权重实现）。
 *
 * 于是「一次点名」被拆成两个可独立判定的动作：
 *   1) 是否到场      → 自动 +1（抽中即视为到场，可在记录里撤销）
 *   2) 是否复述准确  → +0.5 / -1
 *   3) 回答质量      → 0 / 0.5 / 1 / 1.5 / 2 / 3
 */
export const SCORE_RULES = {
  attend: 1,
  repeatCorrect: 0.5,
  repeatWrong: -1,
  answerOptions: [0, 0.5, 1, 1.5, 2, 3],
  comboBonus: 1,
};

export const REPEAT_LABEL = { correct: '准确复述问题', wrong: '未能复述' };

export function repeatDelta(repeat) {
  if (repeat === 'correct') return SCORE_RULES.repeatCorrect;
  if (repeat === 'wrong') return SCORE_RULES.repeatWrong;
  return 0;
}

export function isValidAnswer(value) {
  return SCORE_RULES.answerOptions.includes(Number(value));
}

/**
 * 随机事件效果：
 *   double    本轮首次计分翻倍
 *   shield    本轮首次扣分归零
 *   redpacket 全班各 +0.5
 */
export const RANDOM_EVENTS = [
  { key: 'double', label: '双倍积分', desc: '本轮首次加减分按 ×2 结算，仅生效一次' },
  { key: 'shield', label: '课堂护盾', desc: '本轮第一次扣分被抵消为 0，仅生效一次' },
  { key: 'redpacket', label: '全班小红包', desc: '立即触发：全班同学各 +0.5 分，不影响本轮加分' },
];

export function applyRollCallEffect(delta, event) {
  if (event === 'double' && delta > 0) return delta * 2;
  if (event === 'shield' && delta < 0) return 0;
  return delta;
}
