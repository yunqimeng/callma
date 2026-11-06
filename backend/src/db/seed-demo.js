/**
 * 生成一节课的演示数据，方便截图、录视频与答辩演示。
 * 用法：npm run seed:demo
 * 注意：会清空现有的点名记录与积分流水（学生名单保留）。
 */
import { initDb, all, run, now } from './index.js';
import { buildDistribution, sampleOnce } from '../domain/weighing.js';
import { getRules } from '../services/lesson.js';
import { listStudents } from '../services/students.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  await initDb();
  await run('DELETE FROM score_events');
  await run('DELETE FROM roll_calls');
  await run('DELETE FROM badges');

  const students = await listStudents({ sort: 'no' });
  if (!students.length) {
    console.log('名单为空，先运行 npm run seed');
    return;
  }
  const rules = await getRules();
  const lesson = await (async () => {
    const existing = await all("SELECT id FROM lessons WHERE status = 'active' ORDER BY id DESC LIMIT 1");
    if (existing.length) return existing[0];
    const { insertId } = await run("INSERT INTO lessons (title, status, started_at) VALUES ('课堂点名 · 进行中', 'active', ?)", [now()]);
    return { id: insertId };
  })();

  const start = Date.now() - 95 * 60 * 1000;
  const drawCount = 46;
  const stats = new Map(students.map((s) => [s.id, { total: 0, calls: 0 }]));

  for (let i = 0; i < drawCount; i += 1) {
    const pool = students.map((s) => ({
      ...s,
      total_score: stats.get(s.id).total,
      total_calls: stats.get(s.id).calls,
    }));
    const dist = buildDistribution(pool, rules);
    const picked = sampleOnce(dist);
    if (!picked) break;

    const calledAt = new Date(start + i * 115000).toISOString();
    const mode = i % 9 === 0 ? 'sequence' : 'random';
    const event = Math.random() < rules.randomEvent.probability ? pick(['double', 'shield', 'redpacket']) : null;

    const { insertId: rollCallId } = await run(
      'INSERT INTO roll_calls (lesson_id, student_id, mode, weight, probability, event, present, called_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [lesson.id, picked.id, mode, picked.weight, picked.probability, event, calledAt],
    );

    await run(
      'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [lesson.id, picked.id, rollCallId, 'attend', 1, '到场', `demo-${i}`, calledAt],
    );
    stats.get(picked.id).total += 1;
    stats.get(picked.id).calls += 1;

    // 复述：70% 准确
    const repeatCorrect = Math.random() < 0.7;
    const repeatDelta = repeatCorrect ? 0.5 : -1;
    await run(
      'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [lesson.id, picked.id, rollCallId, 'repeat', repeatDelta, repeatCorrect ? '准确复述问题' : '未能复述', `demo-${i}`, calledAt],
    );
    stats.get(picked.id).total += repeatDelta;

    // 回答：50% 有分
    if (Math.random() < 0.55) {
      const answer = pick([0.5, 1, 1.5, 2, 3]);
      const delta = event === 'double' ? answer * 2 : answer;
      await run(
        'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lesson.id, picked.id, rollCallId, 'answer', delta, `回答质量 ${answer} 分`, `demo-${i}`, calledAt],
      );
      stats.get(picked.id).total += delta;
    }

    if (event === 'redpacket') {
      for (const s of students) {
        await run(
          'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [lesson.id, s.id, null, 'event', 0.5, '全班小红包', `demo-${i}`, calledAt],
        );
        stats.get(s.id).total += 0.5;
      }
    }

    const calls = stats.get(picked.id).calls;
    if (calls > 0 && calls % rules.badge.threshold === 0) {
      await run('INSERT INTO badges (student_id, earned_at) VALUES (?, ?)', [picked.id, calledAt]);
    }
  }

  const total = await all('SELECT COUNT(*) AS n FROM roll_calls');
  console.log(`[demo] 已生成 ${total[0].n} 次点名记录`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
