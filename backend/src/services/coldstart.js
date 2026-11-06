import { all } from '../db/index.js';
import { ensureActiveLesson } from './lesson.js';

/**
 * 冷启动的两种口径：
 *   total  —— 看「累计被点次数」不足阈值（长期公平，新同学优先）
 *   lesson —— 看「本场是否还没被点到」（当堂补漏，一节 40 分钟内先叫没叫过的）
 *
 * 这里统一把有效次数写进 cold_calls，权重函数只认这个字段，
 * 于是两种模式共用同一套抽签代码，切换不会产生分叉。
 */
export async function withColdCalls(students, rules) {
  if (rules.coldStart.mode !== 'lesson') {
    return students.map((s) => ({ ...s, cold_calls: Number(s.total_calls ?? 0) }));
  }
  const lesson = await ensureActiveLesson();
  const rows = await all(
    'SELECT student_id, COUNT(*) AS n FROM roll_calls WHERE lesson_id = ? GROUP BY student_id',
    [lesson.id],
  );
  const map = new Map(rows.map((r) => [Number(r.student_id), Number(r.n)]));
  return students.map((s) => ({ ...s, cold_calls: map.get(Number(s.id)) ?? 0 }));
}

/** 有多少人真正吃到冷启动加成（用于规则页提示「倍率是否被归一化抵消」） */
export function countColdStartAffected(students, rules) {
  if (!rules.coldStart.enabled) return 0;
  const threshold = rules.coldStart.mode === 'lesson' ? 1 : rules.coldStart.minCalls;
  return students.filter((s) => Number(s.cold_calls ?? s.total_calls ?? 0) < threshold).length;
}
