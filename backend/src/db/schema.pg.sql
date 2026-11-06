-- 点到 CALME · PostgreSQL 方言建表脚本（线上主库）
-- 与 sqlite/mysql 版保持同一套列名与语义，业务 SQL 完全共用。

CREATE TABLE IF NOT EXISTS students (
  id          SERIAL PRIMARY KEY,
  student_no  VARCHAR(32)  NOT NULL UNIQUE,
  name        VARCHAR(64)  NOT NULL,
  major       VARCHAR(64)  NOT NULL DEFAULT '',
  class_name  VARCHAR(64)  NOT NULL DEFAULT '',
  created_at  VARCHAR(32)  NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(128) NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'active',
  started_at  VARCHAR(32)  NOT NULL,
  ended_at    VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS roll_calls (
  id           SERIAL PRIMARY KEY,
  lesson_id    INTEGER NOT NULL,
  student_id   INTEGER NOT NULL,
  mode         VARCHAR(16) NOT NULL,
  weight       DOUBLE PRECISION NOT NULL DEFAULT 0,
  probability  DOUBLE PRECISION NOT NULL DEFAULT 0,
  event        VARCHAR(16),
  present      SMALLINT NOT NULL DEFAULT 1,
  called_at    VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  id           SERIAL PRIMARY KEY,
  lesson_id    INTEGER NOT NULL,
  student_id   INTEGER NOT NULL,
  roll_call_id INTEGER,
  kind         VARCHAR(16) NOT NULL,
  delta        DOUBLE PRECISION NOT NULL,
  note         VARCHAR(255),
  batch_id     VARCHAR(40),
  created_at   VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  id                SERIAL PRIMARY KEY,
  student_id        INTEGER NOT NULL,
  earned_at         VARCHAR(32) NOT NULL,
  used_at           VARCHAR(32),
  used_roll_call_id INTEGER
);

CREATE TABLE IF NOT EXISTS rule_config (
  id         INTEGER PRIMARY KEY,
  payload    TEXT NOT NULL,
  updated_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key   VARCHAR(64) PRIMARY KEY,
  state_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_lesson  ON roll_calls (lesson_id, called_at);
CREATE INDEX IF NOT EXISTS idx_calls_student ON roll_calls (student_id);
CREATE INDEX IF NOT EXISTS idx_events_lesson ON score_events (lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_student ON score_events (student_id);
CREATE INDEX IF NOT EXISTS idx_events_batch ON score_events (batch_id);
CREATE INDEX IF NOT EXISTS idx_badges_student ON badges (student_id);
