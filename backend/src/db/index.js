import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 三方言数据访问层：sqlite（本地/兜底）、mysql、postgres（线上主库）。
 * 业务 SQL 统一用 `?` 占位符书写，这里在交给 PostgreSQL 前转换成 $1..$n，
 * 于是同一套查询可以原样跑在三种数据库上。
 */
let dialect = 'sqlite';
let sqlite = null;
let pool = null;
let poolKind = null; // mysql | postgres

export const now = () => new Date().toISOString();

export function getDialect() {
  return dialect;
}

const isPostgres = (url) => /^postgres(ql)?:\/\//i.test(url);

function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
}

function needSsl() {
  return process.env.DB_SSL === '1' || /[?&](ssl|ssl-mode|sslmode|require_secure_transport)=/i.test(config.databaseUrl);
}

export async function initDb() {
  if (config.databaseUrl && isPostgres(config.databaseUrl)) {
    dialect = 'postgres';
    const pg = await import('pg');
    const { Pool, types } = pg.default ?? pg;
    // PostgreSQL 的 COUNT/SUM 默认返回字符串（int8/numeric），统一转成数字，
    // 避免前端出现 "464" 与 464 混用、求和变成字符串拼接
    types.setTypeParser(20, (value) => Number(value));
    types.setTypeParser(1700, (value) => Number(value));
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolSize,
      ...(needSsl() ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    poolKind = 'postgres';
    const ddl = fs.readFileSync(path.join(here, 'schema.pg.sql'), 'utf8');
    for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
      await pool.query(stmt);
    }
    console.log('[db] PostgreSQL connected');
    return;
  }

  if (config.databaseUrl) {
    dialect = 'mysql';
    const mysql = await import('mysql2/promise');
    const url = new URL(config.databaseUrl);
    pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: config.dbPoolSize,
      timezone: 'Z',
      ...(needSsl() ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    poolKind = 'mysql';
    const ddl = fs.readFileSync(path.join(here, 'schema.mysql.sql'), 'utf8');
    for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
      await pool.query(stmt);
    }
    console.log('[db] MySQL connected');
    return;
  }

  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  sqlite = new DatabaseSync(config.dbFile);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec(fs.readFileSync(path.join(here, 'schema.sqlite.sql'), 'utf8'));
  console.log(`[db] SQLite ready at ${config.dbFile}`);
}

export async function all(sql, params = []) {
  if (dialect === 'mysql') {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  if (dialect === 'postgres') {
    const result = await pool.query(toPgPlaceholders(sql), params);
    return result.rows;
  }
  return sqlite.prepare(sql).all(...params);
}

export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] ?? null;
}

export async function run(sql, params = []) {
  if (dialect === 'mysql') {
    const [res] = await pool.query(sql, params);
    return { insertId: res.insertId ?? 0, affected: res.affectedRows ?? 0 };
  }
  if (dialect === 'postgres') {
    let text = toPgPlaceholders(sql);
    // PostgreSQL 没有 insertId，插入后显式取回主键
    const isInsert = /^\s*insert\s/i.test(text);
    if (isInsert && !/returning/i.test(text)) text += ' RETURNING id';
    const res = await pool.query(text, params);
    return { insertId: res.rows?.[0]?.id ?? 0, affected: res.rowCount ?? 0 };
  }
  const res = sqlite.prepare(sql).run(...params);
  return { insertId: Number(res.lastInsertRowid ?? 0), affected: Number(res.changes ?? 0) };
}

/** 批量插入（逐条执行，保证三种方言行为一致） */
export async function insertMany(sql, rows) {
  const ids = [];
  for (const row of rows) {
    const { insertId } = await run(sql, row);
    ids.push(insertId);
  }
  return ids;
}

export async function getState(key, fallback = null) {
  const row = await get('SELECT state_value FROM app_state WHERE state_key = ?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.state_value);
  } catch {
    return row.state_value;
  }
}

export async function setState(key, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = await get('SELECT state_key FROM app_state WHERE state_key = ?', [key]);
  if (existing) {
    await run('UPDATE app_state SET state_value = ? WHERE state_key = ?', [payload, key]);
  } else {
    await run('INSERT INTO app_state (state_key, state_value) VALUES (?, ?)', [payload, key]);
  }
}

export { poolKind };
