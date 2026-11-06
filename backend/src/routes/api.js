import express from 'express';
import multer from 'multer';
import { getDialect } from '../db/index.js';
import { listStudents, createStudent, updateStudent, deleteStudent, importStudents, listMajors, listClasses, resetStudents } from '../services/students.js';
import { drawContext, drawOnce, transferRollCall } from '../services/draw.js';
import { applyScore, undoLast } from '../services/score.js';
import { boardOverview, studentProfile } from '../services/board.js';
import { getRules, saveRules } from '../services/lesson.js';
import { statsSnapshot, recentCalls } from '../services/stats.js';
import { parseStudentWorkbook, buildTemplate, buildScoreSheet } from '../services/excel.js';
import { enabledCount, tiltLabel, eventFrequencyLabel, weightFormulaText } from '../domain/rules.js';
import { buildDistribution } from '../domain/weighing.js';
import { simulateDraws } from '../domain/simulation.js';
import { withColdCalls, countColdStartAffected } from '../services/coldstart.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const rulesMeta = (rules, stats) => ({
  enabledCount: enabledCount(rules),
  totalCount: 5,
  tilt: tiltLabel(rules),
  eventFrequency: eventFrequencyLabel(rules),
  formula: weightFormulaText(rules),
  badgeAvailable: stats.badges,
});

router.get('/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/* ---------------- 点名台 ---------------- */
router.get('/draw/context', wrap(async (req, res) => {
  const className = String(req.query.class ?? '').trim();
  const context = await drawContext({ className });
  res.json({
    ...context,
    db: getDialect(),
    meta: rulesMeta(context.rules, context.stats),
    feed: await recentCalls(8),
  });
}));

router.post('/draw', wrap(async (req, res) => {
  const mode = req.body?.mode === 'sequence' ? 'sequence' : 'random';
  const className = String(req.body?.className ?? '').trim();
  res.json(await drawOnce({ mode, className }));
}));

router.post('/draw/transfer', wrap(async (req, res) => {
  const { rollCallId, toStudentId } = req.body ?? {};
  res.json(await transferRollCall({ rollCallId: Number(rollCallId), toStudentId: Number(toStudentId) }));
}));

router.post('/score', wrap(async (req, res) => {
  const { rollCallId, repeat = null, answer = null } = req.body ?? {};
  res.json(await applyScore({ rollCallId: Number(rollCallId), repeat, answer }));
}));

router.post('/undo', wrap(async (req, res) => {
  res.json(await undoLast());
}));

router.get('/feed', wrap(async (req, res) => {
  res.json({ items: await recentCalls(Number(req.query.limit) || 8) });
}));

/* ---------------- 学生名单 ---------------- */
router.get('/students/majors', wrap(async (req, res) => {
  res.json({ majors: await listMajors() });
}));

router.get('/classes', wrap(async (req, res) => {
  res.json({ classes: await listClasses() });
}));

router.post('/students/reset', wrap(async (req, res) => {
  if (req.body?.confirm !== 'RESET') throw Object.assign(new Error('缺少确认标记'), { status: 400 });
  res.json(await resetStudents());
}));

router.get('/students/template', wrap(async (req, res) => {
  const buffer = await buildTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''%E5%AD%A6%E7%94%9F%E5%90%8D%E5%8D%95%E6%A8%A1%E6%9D%BF.xlsx");
  res.send(buffer);
}));

router.get('/students', wrap(async (req, res) => {
  const { search = '', major = '', className = '', sort = 'no' } = req.query;
  const students = await listStudents({ search, major, className, sort });
  const stats = await statsSnapshot();
  res.json({
    students,
    classes: await listClasses(),
    stats: {
      ...stats,
      majors: (await listMajors()).length,
    },
  });
}));

router.post('/students', wrap(async (req, res) => {
  res.status(201).json(await createStudent(req.body ?? {}));
}));

router.put('/students/:id', wrap(async (req, res) => {
  res.json(await updateStudent(Number(req.params.id), req.body ?? {}));
}));

router.delete('/students/:id', wrap(async (req, res) => {
  res.json(await deleteStudent(Number(req.params.id)));
}));

router.post('/students/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('没有收到文件'), { status: 400 });
  const rows = await parseStudentWorkbook(req.file.buffer);
  if (!rows.length) throw Object.assign(new Error('文件里没有可导入的数据'), { status: 400 });
  res.json(await importStudents(rows));
}));

/* ---------------- 积分看板 ---------------- */
router.get('/board', wrap(async (req, res) => {
  res.json(await boardOverview());
}));

router.get('/export', wrap(async (req, res) => {
  const buffer = await buildScoreSheet();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''%E7%A7%AF%E5%88%86%E8%AF%A6%E5%8D%95.xlsx");
  res.send(buffer);
}));

/* ---------------- 学生端 ---------------- */
router.get('/portal/:keyword', wrap(async (req, res) => {
  const profile = await studentProfile(req.params.keyword);
  if (!profile) throw Object.assign(new Error('没有找到这个学号或姓名'), { status: 404 });
  res.json(profile);
}));

/* ---------------- 趣味规则 ---------------- */
router.get('/rules', wrap(async (req, res) => {
  const rules = await getRules();
  const stats = await statsSnapshot();
  const students = await withColdCalls(await listStudents(), rules);
  res.json({
    rules,
    meta: {
      ...rulesMeta(rules, stats),
      coldStartAffected: countColdStartAffected(students, rules),
      totalStudents: students.length,
    },
    stats,
  });
}));

router.put('/rules', wrap(async (req, res) => {
  const rules = await saveRules(req.body?.rules ?? req.body ?? {});
  const stats = await statsSnapshot();
  const students = await withColdCalls(await listStudents(), rules);
  res.json({
    rules,
    meta: {
      ...rulesMeta(rules, stats),
      coldStartAffected: countColdStartAffected(students, rules),
      totalStudents: students.length,
    },
  });
}));

router.post('/rules/simulate', wrap(async (req, res) => {
  const rules = await getRules();
  const students = await withColdCalls(await listStudents({ sort: 'no' }), rules);
  const draws = Number(req.body?.draws) || 3000;
  const distribution = buildDistribution(students, rules);
  const items = simulateDraws(distribution, draws);
  const avg = students.length ? 1 / students.length : 0;
  const topStudent = [...distribution].sort((a, b) => Number(b.total) - Number(a.total))[0];
  res.json({
    draws: Math.min(Math.max(draws, 100), 50000),
    items: items.slice(0, 12),
    summary: {
      average: avg,
      spread: items.filter((i) => i.total > 0).slice(0, 3).map((i) => ({ name: i.name, total: i.total, simulated: i.simulated })),
      top: topStudent ? { name: topStudent.name, total: topStudent.total, simulated: items.find((i) => i.id === topStudent.id)?.simulated ?? 0 } : null,
      server: true,
    },
  });
}));

export default router;
