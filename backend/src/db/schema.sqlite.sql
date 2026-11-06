-- 点到 CALME · SQLite 方言建表脚本（本地开发 / 演示兜底）
-- 时间统一存 ISO 字符串，便于两种数据库共用同一套查询。

CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no  TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  major       TEXT    NOT NULL DEFAULT '',
  class_name  TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',
  started_at  TEXT    NOT NULL,
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS roll_calls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id    INTEGER NOT NULL,
  student_id   INTEGER NOT NULL,
  mode         TEXT    NOT NULL,              -- random / sequence / transfer
  weight       REAL    NOT NULL DEFAULT 0,    -- 抽中时的原始权重
  probability  REAL    NOT NULL DEFAULT 0,    -- 归一化后的概率
  event        TEXT,                          -- double / shield / redpacket
  present      INTEGER NOT NULL DEFAULT 1,
  called_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id    INTEGER NOT NULL,
  student_id   INTEGER NOT NULL,
  roll_call_id INTEGER,
  kind         TEXT    NOT NULL,              -- attend / repeat / answer / event / combo
  delta        REAL    NOT NULL,
  note         TEXT,
  batch_id     TEXT,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id         INTEGER NOT NULL,
  earned_at          TEXT    NOT NULL,
  used_at            TEXT,
  used_roll_call_id  INTEGER
);

CREATE TABLE IF NOT EXISTS rule_config (
  id         INTEGER PRIMARY KEY,
  payload    TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key   TEXT PRIMARY KEY,
  state_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_lesson  ON roll_calls (lesson_id, called_at);
CREATE INDEX IF NOT EXISTS idx_calls_student ON roll_calls (student_id);
CREATE INDEX IF NOT EXISTS idx_events_lesson ON score_events (lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_student ON score_events (student_id);
CREATE INDEX IF NOT EXISTS idx_events_batch ON score_events (batch_id);
CREATE INDEX IF NOT EXISTS idx_badges_student ON badges (student_id);
