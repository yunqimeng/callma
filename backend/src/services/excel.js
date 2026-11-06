import ExcelJS from 'exceljs';
import { listStudents } from './students.js';

const HEADER_ALIASES = {
  学号: 'student_no',
  学生学号: 'student_no',
  student_no: 'student_no',
  姓名: 'name',
  学生姓名: 'name',
  name: 'name',
  专业: 'major',
  major: 'major',
  班级: 'class_name',
  行政班: 'class_name',
  class_name: 'class_name',
};

const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, '');

/**
 * 解析导入的 Excel：自动找表头行（允许上方有标题），按中文/英文列名映射。
 * 遍历所有工作表：每张表的「班级」列若为空，则用工作表名当班级，
 * 这样「一位老师一张表」的名单可以直接整体导入并保留教学班信息。
 * 返回 [{student_no, name, major, class_name}]，按学号去重（先出现的优先）。
 */
export async function parseStudentWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (!workbook.worksheets.length) throw Object.assign(new Error('Excel 里没有工作表'), { status: 400 });

  const rows = [];
  const seen = new Set();

  for (const sheet of workbook.worksheets) {
    let headerRow = null;
    let mapping = {};
    for (let r = 1; r <= Math.min(sheet.rowCount, 8); r += 1) {
      const row = sheet.getRow(r);
      const candidate = {};
      row.eachCell((cell, col) => {
        const key = HEADER_ALIASES[normalizeHeader(cell.value)];
        if (key && !candidate[key]) candidate[key] = col;
      });
      if (candidate.student_no && candidate.name) {
        headerRow = r;
        mapping = candidate;
        break;
      }
    }
    if (!headerRow) continue; // 跳过说明页 / 统计页

    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const pick = (col) => {
        if (!col) return '';
        const cell = row.getCell(col);
        const value = cell.value;
        if (value && typeof value === 'object') {
          if ('text' in value) return String(value.text).trim();
          if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
          if (value instanceof Date) return value.toISOString().slice(0, 10);
          if ('result' in value) return String(value.result ?? '').trim();
        }
        return String(value ?? '').trim();
      };
      const item = {
        student_no: pick(mapping.student_no),
        name: pick(mapping.name),
        major: pick(mapping.major),
        class_name: pick(mapping.class_name) || sheet.name.trim(),
      };
      if (!item.student_no && !item.name) continue;
      if (seen.has(item.student_no)) continue;
      seen.add(item.student_no);
      rows.push(item);
    }
  }

  if (!rows.length) {
    throw Object.assign(new Error('未找到表头：Excel 需包含「学号」「姓名」两列'), { status: 400 });
  }
  return rows;
}

/** 导入模板：一行示例 + 列宽 + 表头样式 */
export async function buildTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('学生名单');
  sheet.columns = [
    { header: '学号', key: 'student_no', width: 16 },
    { header: '姓名', key: 'name', width: 12 },
    { header: '专业', key: 'major', width: 26 },
    { header: '班级', key: 'class_name', width: 26 },
  ];
  sheet.addRow({ student_no: '20240101', name: '陈知远', major: '计算机科学与技术', class_name: '2024级 计科 1 班' });
  sheet.addRow({ student_no: '20240102', name: '林秋澄', major: '软件工程', class_name: '2024级 软工 1 班' });
  styleHeader(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** 积分详单：题目要求「学号、姓名、专业、随机点名次数、总积分」，另附顺序/到场/徽章 */
export async function buildScoreSheet() {
  const students = await listStudents({ sort: 'score' });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '点到 CALME';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('积分详单');
  sheet.columns = [
    { header: '排名', key: 'rank', width: 8 },
    { header: '学号', key: 'student_no', width: 16 },
    { header: '姓名', key: 'name', width: 12 },
    { header: '专业', key: 'major', width: 26 },
    { header: '随机点名次数', key: 'random_calls', width: 14 },
    { header: '顺序点名次数', key: 'sequence_calls', width: 14 },
    { header: '到场次数', key: 'present_count', width: 12 },
    { header: '总积分', key: 'total_score', width: 12 },
    { header: '可用接力徽章', key: 'badges', width: 14 },
  ];

  students.forEach((s, index) => {
    sheet.addRow({
      rank: index + 1,
      student_no: s.student_no,
      name: s.name,
      major: s.major,
      random_calls: Number(s.random_calls),
      sequence_calls: Number(s.sequence_calls),
      present_count: Number(s.present_count),
      total_score: Number(s.total_score),
      badges: Number(s.badges),
    });
  });

  styleHeader(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'I1' };

  const summary = workbook.addWorksheet('汇总');
  const total = students.reduce((acc, s) => acc + Number(s.total_score), 0);
  summary.addRows([
    ['导出时间', new Date().toLocaleString('zh-CN')],
    ['学生总数', students.length],
    ['累计点名', students.reduce((acc, s) => acc + Number(s.total_calls), 0)],
    ['班级平均分', students.length ? Math.round((total / students.length) * 10) / 10 : 0],
    ['最高分', students.length ? Number(students[0].total_score) : 0],
  ]);
  summary.getColumn(1).width = 18;
  summary.getColumn(2).width = 26;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5C46' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1F5C46' } } };
  });
}
