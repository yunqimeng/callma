/**
 * 命令行导入名单：node tools/import-roster.mjs "C:\\path\\to\\名单.xlsx" [--reset]
 * 走的是和页面完全相同的 HTTP 接口，导入结果与手动上传一致。
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , file, ...flags] = process.argv;
if (!file) {
  console.error('用法: node tools/import-roster.mjs <xlsx 路径> [--reset]');
  process.exit(1);
}

const base = process.env.CALLME_BASE || 'http://localhost:8000';

if (flags.includes('--reset')) {
  const res = await fetch(`${base}/api/students/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET' }),
  });
  console.log('reset →', res.status, await res.text());
}

const buffer = fs.readFileSync(file);
const form = new FormData();
form.append('file', new Blob([buffer]), path.basename(file));

const res = await fetch(`${base}/api/students/import`, { method: 'POST', body: form });
console.log('import →', res.status, await res.text());

const stats = await (await fetch(`${base}/api/students?sort=no`)).json();
console.log('学生总数:', stats.stats.students, '| 班级:', (stats.classes ?? []).map((c) => `${c.class_name}(${c.count})`).join(', '));
