import { all, get } from '../db/index.js';

/**
 * 全班快照：KPI 卡、规则页状态条、点名台侧栏共用。
 * 平均分按「全部学生」平均（没被点过的按 0 分算），避免漏算导致虚高。
 */
export async function statsSnapshot() {
  const row = await get(`
    SELECT
      (SELECT COUNT(*) FROM students) AS students,
      (SELECT COUNT(*) FROM roll_calls) AS calls,
      (SELECT COUNT(*) FROM roll_calls WHERE present = 1) AS presents,
      (SELECT COUNT(DISTINCT student_id) FROM roll_calls) AS called_students,
      (SELECT COUNT(*) FROM badges WHERE used_at IS NULL) AS badges,
      (SELECT COALESCE(AVG(COALESCE(t.total, 0)), 0)
         FROM students s
         LEFT JOIN (SELECT student_id, SUM(delta) AS total FROM score_events GROUP BY student_id) t
           ON t.student_id = s.id) AS avg_score
  `);
  const students = Number(row?.students ?? 0);
  const calledStudents = Number(row?.called_students ?? 0);
  return {
    students,
    calls: Number(row?.calls ?? 0),
    presents: Number(row?.presents ?? 0),
    calledStudents,
    badges: Number(row?.badges ?? 0),
    avgScore: Math.round(Number(row?.avg_score ?? 0) * 10) / 10,
    coverage: students ? Math.round((calledStudents / students) * 100) : 0,
  };
}

/** 最近点名流水：一条 roll_call + 该次产生的积分变动 */
export async function recentCalls(limit = 8) {
  const rows = await all(`
    SELECT rc.id, rc.mode, rc.event, rc.probability, rc.called_at,
           s.id AS student_id, s.name, s.student_no, s.major,
           COALESCE((SELECT SUM(e.delta) FROM score_events e WHERE e.roll_call_id = rc.id), 0) AS delta
    FROM roll_calls rc
    JOIN students s ON s.id = rc.student_id
    ORDER BY rc.id DESC
    LIMIT ?
  `, [limit]);
  return rows.map((r) => ({ ...r, delta: Math.round(Number(r.delta) * 10) / 10 }));
}

/** 未点到名单（用于看板洞察卡） */
export async function neverCalledStudents() {
  return all(`
    SELECT s.id, s.name, s.student_no
    FROM students s
    WHERE NOT EXISTS (SELECT 1 FROM roll_calls rc WHERE rc.student_id = s.id)
    ORDER BY s.student_no
  `);
}
