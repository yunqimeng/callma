/**
 * 把本地 SQLite 的数据整体迁到 MySQL / TiDB Cloud。
 *
 * 用法（在 backend 目录）：
 *   DATABASE_URL="mysql://user:pass@host:4000/callme?ssl-mode=required" node tools/migrate-sqlite-to-mysql.mjs
 *
 * 做三件事：
 *   1. 按 schema.mysql.sql 建表（已存在则跳过）
 *   2. 清空目标库的业务表
 *   3. 按原 id 搬 students / lessons / roll_calls / score_events / badges / rule_config
 *      保留自增 id 是为了让 roll_call_id、student_id 这些外键关系不断
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const sqliteFile = process.env.DB_FILE || path.join(backendRoot, 'data', 'callme.db');

if (!process.env.DATABASE_URL) {
  console.error('缺少 DATABASE_URL，例如：DATABASE_URL="mysql://user:pass@host:4000/callme?ssl-mode=required"');
  process.exit(1);
}
if (!fs.existsSync(sqliteFile)) {
  console.error(`找不到本地库：${sqliteFile}`);
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const needSsl = /[?&](ssl|ssl-mode|sslmode)=/i.test(process.env.DATABASE_URL) || process.env.DB_SSL === '1';

const base = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  charset: 'utf8mb4',
  ...(needSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

console.log(`→ 目标：${base.host}:${base.port}/${base.database}${needSsl ? '（TLS）' : ''}`);

const conn = await mysql.createConnection(base);

const tables = ['lessons', 'students', 'roll_calls', 'score_events', 'badges', 'rule_config', 'app_state'];

// 先删表再建表，避免旧表结构（例如改过列名）残留导致插入失败
for (const table of tables) {
  await conn.query(`DROP TABLE IF EXISTS ${table}`);
}

const ddl = fs.readFileSync(path.join(backendRoot, 'src', 'db', 'schema.mysql.sql'), 'utf8');
for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
  await conn.query(stmt);
}
console.log('✓ 表结构就绪（已重建）');

const sqlite = new DatabaseSync(sqliteFile);

let total = 0;
for (const table of tables) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) continue;
  const columns = Object.keys(rows[0]);
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
  for (const row of rows) {
    await conn.query(sql, columns.map((c) => row[c]));
  }
  total += rows.length;
  console.log(`  ${table.padEnd(13)} ${String(rows.length).padStart(5)} 行`);
}

const [[students]] = await conn.query('SELECT COUNT(*) AS n FROM students');
const [[calls]] = await conn.query('SELECT COUNT(*) AS n FROM roll_calls');
const [[events]] = await conn.query('SELECT COUNT(*) AS n FROM score_events');
const [[classes]] = await conn.query('SELECT COUNT(DISTINCT class_name) AS n FROM students');
await conn.end();

console.log(
  `\n完成：迁移 ${total} 行 → 云端 students=${students.n}（${classes.n} 个教学班）, roll_calls=${calls.n}, score_events=${events.n}`,
);
