# 点到 CALME · 课堂随机点名与积分系统

结对编程作业：支持**随机点名**与**按学号顺序点名**两种模式，记录到场与课堂表现积分，
提供积分排行、可视化、Excel 导入导出，并把数据保存在**云端 MySQL 数据库**。

- 前端：Vue 3 + Vue Router + ECharts（原生 ES Module，可直接部署为静态资源）
- 后端：Node.js + Express + mysql2（SQLite / MySQL / PostgreSQL 三方言同构）
- 线上数据库：TiDB Cloud Serverless（MySQL 协议 + TLS）
- 部署：Render 免费 Web 服务

---

## 一、功能

### 基础需求（对应题目 Part·1）

| # | 需求 | 实现 |
|---|---|---|
| 1 | 从 Excel 导入名单并存入在线数据库 | `/api/students/import`，支持多工作表、按表名当班级、按学号去重；数据写入云端 MySQL |
| 2 | 随机点名 + 按学号顺序点名，显示姓名学号 | 加权轮盘赌 / 学号递增两种模式，点名台大屏展示 |
| 3 | 数据库存点名信息 + 积分排行 + 可视化 | 7 张表存储；积分看板 Top10 柱状/折线图（总积分 + 随机点名次数） |
| 4 | 导出积分详单 | `/api/export`，Excel 含学号、姓名、专业、随机/顺序点名次数、到场、总积分、徽章 |
| 5 | 积分规则 | 初始 0；到场 +1；复述准确 +0.5 / 否则 −1；回答质量 +0.5~3；积分越高被抽中概率越低 |

### 进阶与创新

| 机制 | 说明 |
|---|---|
| 反向权重抽点 | `w = 1 / (1 + 总分)^decay`，decay 可调（默认 0.85） |
| 冷启动加成 | 两种口径可切换：按**累计被点次数**，或按**本场是否还没被点到** |
| 接力徽章 | 每被点 N 次得 1 枚，可把本次点名转交给其他同学 |
| 随机事件 | 双击积分 / 课堂护盾 / 全班小红包，概率可调 |
| 连击奖励 | 同一同学连续两次「精准作答 +3」额外 +1 |
| 抽样概率模拟 | 后端跑 3000 次蒙特卡洛，验证权重分布，避免主线程卡顿 |
| 学生端 | 学号/姓名查个人积分、排名、走势、明细（只读） |
| 撤销 | 按批次回滚，一次记分（复述+回答+连击）整体撤销 |

---

## 二、目录结构

```
callme/
├─ backend/
│  ├─ src/
│  │  ├─ config.js           # 端口 / 数据库连接串 / 连接池
│  │  ├─ server.js           # Express 启动、静态托管、错误出口
│  │  ├─ db/
│  │  │  ├─ index.js         # 三方言数据访问层（? 占位符 → $1 / insertId / RETURNING）
│  │  │  ├─ schema.sqlite.sql
│  │  │  ├─ schema.mysql.sql
│  │  │  ├─ schema.pg.sql
│  │  │  ├─ seed.js          # 首次启动写入演示名单（只执行一次）
│  │  │  └─ seed-data.js
│  │  ├─ domain/             # 纯算法，无 IO
│  │  │  ├─ weighing.js      # 权重公式 + 轮盘赌
│  │  │  ├─ simulation.js    # 蒙特卡洛
│  │  │  ├─ scoring.js       # 积分规则常量与随机事件
│  │  │  └─ rules.js         # 规则归一化与文案
│  │  ├─ services/           # 业务编排（students / draw / score / board / excel / coldstart）
│  │  └─ routes/api.js       # REST 路由
│  ├─ tools/
│  │  └─ migrate-sqlite-to-mysql.mjs   # 本地数据一键迁云
│  ├─ .env.example
│  └─ package.json
├─ frontend/
│  ├─ src/
│  │  ├─ views/              # 点名台 / 学生名单 / 积分看板 / 趣味规则 / 学生端
│  │  ├─ components/TopNav.vue
│  │  ├─ api.js  utils.js  router.js
│  │  └─ styles/base.css     # 设计令牌
│  ├─ scripts/
│  │  ├─ build-static.mjs    # 不依赖 esbuild 的构建（受限环境兜底）
│  │  └─ check-imports.mjs   # 校验所有 import 可解析
│  └─ vite.config.js
├─ docs/演示名单_45人.xlsx     # 虚构演示数据
├─ tools/import-roster.mjs   # 命令行导入名单
├─ render.yaml
├─ start.bat                 # Windows 一键启动
└─ README.md
```

---

## 三、本地运行

要求：Node.js ≥ 20（推荐 22 LTS）。

```powershell
# 1. 后端依赖
cd backend
npm install

# 2. 前端依赖 + 构建
cd ../frontend
npm install
npm run build          # 若 Vite 构建异常，可改用 npm run build:static

# 3. 启动（一个进程同时提供页面和 API）
cd ../backend
npm start
```

浏览器打开 http://localhost:8000 。

Windows 也可以直接双击根目录的 `start.bat`，它会自动装依赖、构建、启动并打开浏览器。

### 数据库选择

不配置 `DATABASE_URL` 时，自动使用本地 SQLite（`backend/data/callme.db`），零依赖即可跑通全部功能。

要连云端 MySQL：

```ini
# backend/.env
DATABASE_URL=mysql://user:password@host:4000/callme?ssl-mode=required
DB_POOL_SIZE=5
PORT=8000
```

连接串里出现 `ssl-mode` / `ssl` / `sslmode` 时自动启用 TLS（云数据库通常强制加密）。

---

## 四、部署到 Render

1. 推代码到 GitHub 仓库
2. Render → **New +** → **Web Service** → 选中该仓库
3. Build Command / Start Command 会被 `render.yaml` 自动填充（也可手动填）：
   - Build: `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - Start: `cd backend && node src/server.js`
4. Environment 里添加 `DATABASE_URL`（TiDB / MySQL 连接串）
5. Deploy，拿到 `https://xxx.onrender.com`

> 注意：免费 Web 服务闲置 15 分钟会休眠，首次访问需要等 30 秒左右冷启动。

---

## 五、API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/draw/context?class=` | 点名台初始化（权重透视、KPI、流水） |
| POST | `/api/draw` | 抽一次 `{mode, className}` |
| POST | `/api/draw/transfer` | 接力徽章转交 |
| POST | `/api/score` | 记分 `{rollCallId, repeat, answer}` |
| POST | `/api/undo` | 撤销上一步 |
| GET | `/api/students?search=&major=&className=&sort=` | 名单 |
| POST | `/api/students` / PUT `/api/students/:id` / DELETE | 增改删 |
| POST | `/api/students/import` | Excel 导入（multipart，字段名 `file`） |
| POST | `/api/students/reset` | 清空名单（需 `{confirm:"RESET"}`） |
| GET | `/api/classes` | 教学班列表 |
| GET | `/api/board` | 看板 KPI / Top10 / 排行 / 洞察 |
| GET | `/api/portal/:keyword` | 学生端个人档案 |
| GET | `/api/rules` / PUT `/api/rules` | 规则读写 |
| POST | `/api/rules/simulate` | 蒙特卡洛模拟 |
| GET | `/api/export` | 导出积分详单 xlsx |
| GET | `/api/students/template` | 导入模板 |

---

## 六、已知限制

- Render 免费实例会休眠，首访有冷启动；TiDB Serverless 长期不访问也会暂停，演示前先在控制台唤醒。
- 免费数据库连接数有限，`DB_POOL_SIZE` 默认 5。
- 学生端为公开只读页面，未做鉴权（课堂场景下可接受）。
- 蒙特卡洛模拟默认 3000 次，尾部概率的标准误约 ±0.1~0.4 个百分点，结果每次刷新会有小幅波动。
