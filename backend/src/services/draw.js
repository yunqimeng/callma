import { randomUUID } from 'node:crypto';
import { get, run, now } from '../db/index.js';
import { listStudents, getStudent } from './students.js';
import { getRules, ensureActiveLesson } from './lesson.js';
import { withColdCalls } from './coldstart.js';
import { buildDistribution, sampleOnce, sortByProbability } from '../domain/weighing.js';
import { RANDOM_EVENTS } from '../domain/scoring.js';
import { statsSnapshot } from './stats.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** 点名台初始化：名单规模 + 权重透视 + 本场数据，一次拿全 */
export async function drawContext({ className = '' } = {}) {
  const rules = await getRules();
  const students = await withColdCalls(await listStudents({ sort: 'no', className }), rules);
  const distribution = buildDistribution(students, rules);
  const top = sortByProbability(distribution).slice(0, 4);
  return {
    total: students.length,
    scope: className || '全部班级',
    majors: [...new Set(students.map((s) => s.major).filter(Boolean))],
    preview: top.map((item) => ({
      id: item.id,
      name: item.name,
      total: item.total,
      probability: item.probability,
      calls: item.calls,
    })),
    rules,
    stats: await statsSnapshot(),
    lastCalledId: (await get('SELECT student_id FROM roll_calls ORDER BY id DESC LIMIT 1'))?.student_id ?? null,
  };
}

/**
 * 抽一次。
 * random   —— 加权轮盘赌，权重随积分下降（规则见 weighing.js）
 * sequence —— 按学号顺序取「上一次顺序点名的下一位」，到末尾自动回到第一位
 */
export async function drawOnce({ mode = 'random', className = '' } = {}) {
  const rules = await getRules();
  const lesson = await ensureActiveLesson();
  const students = await withColdCalls(await listStudents({ sort: 'no', className }), rules);
  if (!students.length) throw httpError(400, '名单为空，请先导入学生名单');

  let picked;
  let distribution = [];

  if (mode === 'sequence') {
    const ordered = [...students].sort((a, b) => String(a.student_no).localeCompare(String(b.student_no)));
    const last = await get("SELECT student_id FROM roll_calls WHERE mode = 'sequence' ORDER BY id DESC LIMIT 1");
    let index = 0;
    if (last) {
      const current = ordered.findIndex((s) => s.id === last.student_id);
      index = current >= 0 ? (current + 1) % ordered.length : 0;
    }
    picked = { ...ordered[index], weight: 1, probability: 1 / ordered.length };
  } else {
    distribution = buildDistribution(students, rules);
    picked = sampleOnce(distribution);
    if (!picked) throw httpError(400, '抽取失败，请检查名单');
  }

  // 随机事件：先定事件，再落库，保证同一次点名的事件与积分一致
  let event = null;
  if (rules.randomEvent.enabled && Math.random() < rules.randomEvent.probability) {
    event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)].key;
  }

  const calledAt = now();
  const { insertId: rollCallId } = await run(
    'INSERT INTO roll_calls (lesson_id, student_id, mode, weight, probability, event, present, called_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [lesson.id, picked.id, mode, picked.weight, picked.probability, event, calledAt],
  );

  const batch = randomUUID();
  await run(
    'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [lesson.id, picked.id, rollCallId, 'attend', 1, '到场', batch, calledAt],
  );

  // 全班小红包：立即结算，与本次点名本身分开记录
  if (event === 'redpacket') {
    const allStudents = await listStudents({ sort: 'no', className });
    for (const s of allStudents) {
      await run(
        'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lesson.id, s.id, null, 'event', 0.5, '全班小红包', batch, now()],
      );
    }
  }

  // 接力徽章：每累计被点 threshold 次发一枚（可叠加）
  let badgeEarned = false;
  if (rules.badge.enabled) {
    const calls = await get('SELECT COUNT(*) AS n FROM roll_calls WHERE student_id = ?', [picked.id]);
    const n = Number(calls?.n ?? 0);
    if (n > 0 && n % rules.badge.threshold === 0) {
      await run('INSERT INTO badges (student_id, earned_at) VALUES (?, ?)', [picked.id, now()]);
      badgeEarned = true;
    }
  }

  const student = await getStudent(picked.id);
  return {
    student,
    rollCall: {
      id: rollCallId,
      mode,
      event,
      eventLabel: RANDOM_EVENTS.find((e) => e.key === event)?.label ?? null,
      probability: picked.probability,
      weight: picked.weight,
    },
    badgeEarned,
    stats: await statsSnapshot(),
    preview: sortByProbability(distribution).slice(0, 4).map((item) => ({
      id: item.id,
      name: item.name,
      total: item.total,
      probability: item.probability,
    })),
  };
}

/**
 * 接力徽章：把「本次点名」转给另一位同学，消耗原同学一枚徽章。
 * 实现上是撤销原记录、给目标同学重新记一次（mode = transfer），保证积分只算一次。
 */
export async function transferRollCall({ rollCallId, toStudentId }) {
  const rollCall = await get('SELECT * FROM roll_calls WHERE id = ?', [rollCallId]);
  if (!rollCall) throw httpError(404, '点名记录不存在');
  const target = await getStudent(toStudentId);
  if (!target) throw httpError(404, '目标同学不存在');
  if (target.id === rollCall.student_id) throw httpError(400, '不能转给本人');

  const badge = await get('SELECT id FROM badges WHERE student_id = ? AND used_at IS NULL ORDER BY id LIMIT 1', [
    rollCall.student_id,
  ]);
  if (!badge) throw httpError(400, '该同学没有可用的接力徽章');

  await run('DELETE FROM score_events WHERE roll_call_id = ?', [rollCall.id]);
  await run('DELETE FROM roll_calls WHERE id = ?', [rollCall.id]);
  await run('UPDATE badges SET used_at = ?, used_roll_call_id = ? WHERE id = ?', [now(), null, badge.id]);

  const lesson = await ensureActiveLesson();
  const calledAt = now();
  const { insertId } = await run(
    'INSERT INTO roll_calls (lesson_id, student_id, mode, weight, probability, event, present, called_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)',
    [lesson.id, target.id, 'transfer', 0, 0, calledAt],
  );
  const batch = randomUUID();
  await run(
    'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [lesson.id, target.id, insertId, 'attend', 1, '接力到场', batch, calledAt],
  );

  return { student: await getStudent(target.id), rollCall: { id: insertId, mode: 'transfer' }, stats: await statsSnapshot() };
}
