import { get, run, now, getState, setState } from './index.js';
import { DEMO_STUDENTS, DEMO_CLASS } from './seed-data.js';

/**
 * 首次启动、名单为空时灌入演示名单，保证点开就有东西可点。
 * 只在「从未初始化过」时执行一次：清空名单后重启不会把演示数据又灌回来。
 */
export async function seedIfEmpty() {
  if (await getState('seeded')) return { seeded: false };
  const row = await get('SELECT COUNT(*) AS n FROM students');
  if (Number(row?.n ?? 0) > 0) {
    await setState('seeded', true);
    return { seeded: false };
  }
  for (const [student_no, name, major] of DEMO_STUDENTS) {
    await run('INSERT INTO students (student_no, name, major, class_name, created_at) VALUES (?, ?, ?, ?, ?)', [
      student_no,
      name,
      major,
      DEMO_CLASS,
      now(),
    ]);
  }
  await setState('seeded', true);
  console.log(`[seed] 已写入 ${DEMO_STUDENTS.length} 名演示学生`);
  return { seeded: true, count: DEMO_STUDENTS.length };
}
