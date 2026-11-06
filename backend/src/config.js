import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/**
 * 运行配置。
 * - 本地开发：留空 DATABASE_URL，自动使用 Node 内置 SQLite（backend/data/callme.db）
 * - 线上：DATABASE_URL=mysql://user:pass@host:3306/dbname 即可切换为 MySQL，代码零改动
 */
export const config = {
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL || '',
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'callme.db'),
  // 免费云库常有连接数上限（如 SQLPub 免费版 10 个），默认保守取 5
  dbPoolSize: Number(process.env.DB_POOL_SIZE || 5),
  root,
  frontendDist: path.resolve(root, '..', 'frontend', 'dist'),
};
