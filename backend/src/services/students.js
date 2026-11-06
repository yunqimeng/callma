import { all, get, run, now } from '../db/index.js';

/**
 * 学生聚合视图：把「总积分 / 点名次数 / 到场次数 / 可用徽章」一次性算好。
 * 用相关子查询而不是 GROUP BY，两种方言行为完全一致，46 人规模下开销可忽略。
 */
const STUDENT_SELECT = `
  SELECT s.id, s.student_no, s.name, s.major, s.class_name, s.created_at,
    COALESCE((SELECT SUM(e.delta) FROM score_events e WHERE e.student_id = s.id), 0) AS total_score,
    (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id) AS total_calls,
    (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.mode = 'random') AS random_calls,
    (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.mode = 'sequence') AS sequence_calls,
    (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.mode = 'transfer') AS transfer_calls,
    (SELECT COUNT(*) FROM roll_calls rc WHERE rc.student_id = s.id AND rc.present = 1) AS present_count,
    (SELECT COUNT(*) FROM badges b WHERE b.student_id = s.id AND b.used_at IS NULL) AS badges
  FROM students s
`;

const SORTS = {
  no: 's.student_no ASC',
  score: 'total_score DESC, s.student_no ASC',
  calls: 'total_calls DESC, s.student_no ASC',
  name: 's.name ASC',
};

export async function listStudents({ search = '', major = '', className = '', sort = 'no' } = {}) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(s.name LIKE ? OR s.student_no LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (major) {
    where.push('s.major = ?');
    params.push(major);
  }
  if (className) {
    where.push('s.class_name = ?');
    params.push(className);
  }
  const sql = `${STUDENT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${SORTS[sort] ?? SORTS.no}`;
  return all(sql, params);
}

export async function getStudent(id) {
  return get(`${STUDENT_SELECT} WHERE s.id = ?`, [id]);
}

export async function getStudentByNo(studentNo) {
  return get(`${STUDENT_SELECT} WHERE s.student_no = ?`, [studentNo]);
}

export async function listMajors() {
  const rows = await all('SELECT major, COUNT(*) AS count FROM students GROUP BY major ORDER BY count DESC');
  return rows;
}

export async function listClasses() {
  return all(
    "SELECT class_name, COUNT(*) AS count FROM students WHERE class_name <> '' GROUP BY class_name ORDER BY count DESC",
  );
}

/** 清空名单：连点名记录 / 积分流水 / 徽章一起删，规则配置保留 */
export async function resetStudents() {
  await run('DELETE FROM score_events');
  await run('DELETE FROM roll_calls');
  await run('DELETE FROM badges');
  await run('DELETE FROM students');
  return { ok: true };
}

export async function createStudent({ student_no, name, major = '', class_name = '' }) {
  const no = String(student_no ?? '').trim();
  const nick = String(name ?? '').trim();
  if (!no || !nick) throw Object.assign(new Error('学号和姓名不能为空'), { status: 400 });
  if (await get('SELECT id FROM students WHERE student_no = ?', [no])) {
    throw Object.assign(new Error(`学号 ${no} 已存在`), { status: 409 });
  }
  const { insertId } = await run(
    'INSERT INTO students (student_no, name, major, class_name, created_at) VALUES (?, ?, ?, ?, ?)',
    [no, nick, major, class_name, now()],
  );
  return getStudent(insertId);
}

export async function updateStudent(id, patch = {}) {
  const student = await get('SELECT * FROM students WHERE id = ?', [id]);
  if (!student) throw Object.assign(new Error('学生不存在'), { status: 404 });
  const next = {
    name: patch.name ?? student.name,
    major: patch.major ?? student.major,
    class_name: patch.class_name ?? student.class_name,
    student_no: patch.student_no ?? student.student_no,
  };
  await run('UPDATE students SET student_no = ?, name = ?, major = ?, class_name = ? WHERE id = ?', [
    next.student_no,
    next.name,
    next.major,
    next.class_name,
    id,
  ]);
  return getStudent(id);
}

export async function deleteStudent(id) {
  await run('DELETE FROM score_events WHERE student_id = ?', [id]);
  await run('DELETE FROM roll_calls WHERE student_id = ?', [id]);
  await run('DELETE FROM badges WHERE student_id = ?', [id]);
  await run('DELETE FROM students WHERE id = ?', [id]);
  return { ok: true };
}

/** Excel 导入：按学号做 upsert，重复导入不会产生脏数据 */
export async function importStudents(rows = []) {
  let inserted = 0;
  let updated = 0;
  const skipped = [];
  for (const row of rows) {
    const student_no = String(row.student_no ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (!student_no || !name || student_no === 'undefined') {
      skipped.push({ student_no, name, reason: '缺少学号或姓名' });
      continue;
    }
    const major = String(row.major ?? '').trim();
    const class_name = String(row.class_name ?? '').trim();
    const existing = await get('SELECT id FROM students WHERE student_no = ?', [student_no]);
    if (existing) {
      await run('UPDATE students SET name = ?, major = ?, class_name = ? WHERE id = ?', [name, major, class_name, existing.id]);
      updated += 1;
    } else {
      await run('INSERT INTO students (student_no, name, major, class_name, created_at) VALUES (?, ?, ?, ?, ?)', [
        student_no,
        name,
        major,
        class_name,
        now(),
      ]);
      inserted += 1;
    }
  }
  return { inserted, updated, skipped };
}

export { STUDENT_SELECT };
