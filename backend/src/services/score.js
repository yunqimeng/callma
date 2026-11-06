import { randomUUID } from 'node:crypto';
import { all, get, run, now } from '../db/index.js';
import { getRules, ensureActiveLesson } from './lesson.js';
import { repeatDelta, isValidAnswer, REPEAT_LABEL, SCORE_RULES } from '../domain/scoring.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * 逐项记分。
 *
 * 一次点名最多两笔：复述（+0.5 / -1）+ 回答（0 / 0.5 / 1 / 1.5 / 2 / 3）。
 * 到场 +1 已在抽取时自动写入，这里不重复加。
 *
 * 随机事件只影响「本轮首次加减分」：
 *   double → 第一个正分 ×2
 *   shield → 第一个负分归零
 */
export async function applyScore({ rollCallId, repeat = null, answer = null }) {
  const rollCall = await get('SELECT * FROM roll_calls WHERE id = ?', [rollCallId]);
  if (!rollCall) throw httpError(404, '点名记录不存在');

  const existing = await all(
    "SELECT id FROM score_events WHERE roll_call_id = ? AND kind IN ('repeat', 'answer')",
    [rollCallId],
  );
  if (existing.length) throw httpError(409, '本次点名已记分，如需修改请先撤销');

  const rules = await getRules();
  const lesson = await ensureActiveLesson();
  const batchId = randomUUID();
  const createdAt = now();
  const events = [];

  let effect = rollCall.event;
  const consumeEffect = (delta) => {
    if (delta === 0) return 0;
    if (effect === 'double' && delta > 0) {
      effect = null;
      return delta * 2;
    }
    if (effect === 'shield' && delta < 0) {
      effect = null;
      return 0;
    }
    return delta;
  };

  const push = async (kind, delta, note) => {
    await run(
      'INSERT INTO score_events (lesson_id, student_id, roll_call_id, kind, delta, note, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [lesson.id, rollCall.student_id, rollCall.id, kind, delta, note, batchId, now()],
    );
    events.push({ kind, delta, note });
  };

  // 连击判定必须在写入本次 answer 之前取「全班上一条回答记录」，
  // 否则会把刚插入的这条自己也读出来，导致首次作答就误判连击。
  let previousAnswer = null;
  if (rules.combo.enabled && Number(answer) === 3) {
    previousAnswer = await get("SELECT student_id, delta FROM score_events WHERE kind = 'answer' ORDER BY id DESC LIMIT 1");
  }

  if (repeat === 'correct' || repeat === 'wrong') {
    const raw = repeatDelta(repeat);
    const delta = consumeEffect(raw);
    await push('repeat', delta, REPEAT_LABEL[repeat]);
  }

  if (answer !== null && answer !== undefined && isValidAnswer(answer) && Number(answer) > 0) {
    const raw = Number(answer);
    const delta = consumeEffect(raw);
    await push('answer', delta, `回答质量 ${raw} 分`);
  }

  // 连击：同一同学连续两次「精准作答 +3」，额外 +1
  let comboTriggered = false;
  if (previousAnswer && previousAnswer.student_id === rollCall.student_id && Number(previousAnswer.delta) === 3) {
    await push('combo', SCORE_RULES.comboBonus, '连击奖励');
    comboTriggered = true;
  }

  const student = await get('SELECT * FROM students WHERE id = ?', [rollCall.student_id]);
  const total = await get('SELECT COALESCE(SUM(delta), 0) AS total FROM score_events WHERE student_id = ?', [
    rollCall.student_id,
  ]);

  return {
    rollCallId,
    student: { id: student.id, name: student.name, student_no: student.student_no },
    events,
    comboTriggered,
    total: Math.round(Number(total?.total ?? 0) * 10) / 10,
    batchId,
  };
}

/**
 * 撤销上一步：按批次回滚，若这批就是「点名」本身，连同点名记录一起删除。
 * 用批次而不是「最后一条」，是因为一次记分可能同时写 repeat / answer / combo 三行。
 */
export async function undoLast() {
  const last = await get('SELECT batch_id, created_at FROM score_events ORDER BY id DESC LIMIT 1');
  if (!last) return { ok: false, message: '没有可撤销的记录' };

  const events = await all('SELECT DISTINCT roll_call_id FROM score_events WHERE batch_id = ?', [last.batch_id]);
  const rollCallIds = events.map((e) => e.roll_call_id).filter(Boolean);

  await run('DELETE FROM score_events WHERE batch_id = ?', [last.batch_id]);

  for (const id of rollCallIds) {
    const rest = await get('SELECT COUNT(*) AS n FROM score_events WHERE roll_call_id = ?', [id]);
    if (Number(rest?.n ?? 0) === 0) await run('DELETE FROM roll_calls WHERE id = ?', [id]);
  }

  return { ok: true, removed: rollCallIds.length > 0 ? '已撤销上一次点名' : '已撤销上一次记分' };
}
