import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { initDb } from './db/index.js';
import api from './routes/api.js';
import { seedIfEmpty } from './db/seed.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', api);

// 生产模式：把前端构建产物一起托管，一个进程 = 一个网址
const indexHtml = path.join(config.frontendDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.frontendDist, { index: false }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(indexHtml));
} else {
  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send(
      '前端尚未构建。开发模式请运行 frontend 的 npm run dev（5173）；或先 npm run build 生成 dist。',
    );
  });
}

// 统一错误出口：业务层抛 { status, message }，这里转成 JSON
app.use((err, req, res, next) => {
  const status = Number(err.status) || 500;
  if (status >= 500) console.error('[api error]', err);
  res.status(status).json({ error: err.message || '服务器开小差了' });
});

await initDb();
await seedIfEmpty();

app.listen(config.port, () => {
  console.log(`点到 CALME 已启动 → http://localhost:${config.port}`);
});
