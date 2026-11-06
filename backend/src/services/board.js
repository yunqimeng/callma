import { all, get } from '../db/index.js';
import { listStudents } from './students.js';
import { statsSnapshot, neverCalledStudents, recentCalls } from './stats.js';

/**
 * 积分看板：KPI + Top10 图表数据 + 三张洞察卡 + 完整排行榜。
 * Top10 同时给出「总积分」和「被点次数」，正好满足题目「柱状图或折线图显示
 * 积分最高的若干名同学的积分及其随机点名次数」。
 */
export async function boardOverview() {
  const students = await listStudents({ sort: 'score' });
  const stats = await statsSnapshot();
  const never = await neverCalledStudents();

  const top10 = students.slice(0, 10).map((s) => ({
    id: s.id,
    name: s.name,
    student_no: s.student_no,
    major: s.major,
    total: Number(s.total_score),
    randomCalls: Number(s.random_calls),
    calls: Number(s.total_calls),
  }));

  const leader = students[0]
    ? { name: students[0].name, total: Number(students[0].total_score) }
    : null;

  const mostRandom = [...students].sort((a, b) => Number(b.random_calls) - Number(a.random_calls))[0];

  return {
    stats,
    top10,
    insights: {
      leader,
      mostRandom: mostRandom
        ? { name: mostRandom.name, randomCalls: Number(mostRandom.random_calls) }
        : null,
      neverCalled: never.length,
      neverNames: never.slice(0, 6).map((s) => s.name),
    },
    ranking: students.map((s, index) => ({
      rank: index + 1,
      id: s.id,
      name: s.name,
      student_no: s.student_no,
      major: s.major,
      total: Number(s.total_score),
      randomCalls: Number(s.random_calls),
      calls: Number(s.total_calls),
      presents: Number(s.present_count),
      badges: Number(s.badges),
    })),
    feed: await recentCalls(6),
  };
}

/** 学生端：按学号或姓名查个人档案 */
export async function studentProfile(keyword) {
  const q = String(keyword ?? '').trim();
  if (!q) return null;

  const student =
    (await get('SELECT id, student_no, name FROM students WHERE student_no = ?', [q])) ??
    (await get('SELECT id, student_no, name FROM students WHERE name = ? ORDER BY student_no LIMIT 1', [q]));
  if (!student) return null;

  const ranking = await all(`
    SELECT s.id, s.name, s.student_no, COALESCE(SUM(e.delta), 0) AS total
    FROM students s LEFT JOIN score_events e ON e.student_id = s.id
    GROUP BY s.id, s.name, s.student_no
    ORDER BY total DESC, s.student_no ASC
  `);
  const index = ranking.findIndex((r) => r.id === student.id);
  const me = ranking[index];

  const profile = await get(`
    SELECT s.id, s.student_no, s.name, s.major, s.class_name,
      (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.mode = 'random') AS random_calls,
      (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.mode = 'sequence') AS sequence_calls,
      (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id) AS calls,
      (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.present = 1) AS presents,
      (SELECT COUNT(*) FROM badges b WHERE b.student_id = s.id AND b.used_at IS NULL) AS badges
    FROM students s WHERE s.id = ?
  `, [student.id]);

  const events = await all('SELECT delta, created_at FROM score_events WHERE student_id = ? ORDER BY id ASC', [student.id]);
  let acc = 0;
  const trend = events.map((e) => {
    acc = Math.round((acc + Number(e.delta)) * 10) / 10;
    return { t: e.created_at, value: acc };
  });

  const details = await all(`
    SELECT e.id, e.kind, e.delta, e.note, e.created_at, rc.mode
    FROM score_events e LEFT JOIN roll_calls rc ON rc.id = e.roll_call_id
    WHERE e.student_id = ? ORDER BY e.id DESC LIMIT 10
  `, [student.id]);

  const total = Number(me?.total ?? 0);
  const ahead = ranking.slice(0, index).filter((r) => Number(r.total) <= total).length;
  const beatPercent = ranking.length > 1 ? Math.round((index / (ranking.length - 1)) * 100) : 100;

  return {
    profile: {
      ...profile,
      total,
      rank: index + 1,
      rankTotal: ranking.length,
      randomCalls: Number(profile.random_calls),
      sequenceCalls: Number(profile.sequence_calls),
      calls: Number(profile.calls),
      presents: Number(profile.presents),
      badges: Number(profile.badges),
    },
    ahead,
    beatPercent,
    ranking: ranking.slice(0, 5).map((r, i) => ({ rank: i + 1, ...r, total: Number(r.total), isMe: r.id === student.id })),
    myRankRow: { rank: index + 1, ...me, total, isMe: true },
    trend,
    details,
  };
}
