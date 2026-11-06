-- 点到 CALME · MySQL 8 建表脚本（线上 FREE Online 数据库）
-- 与 sqlite 版保持同一套列名 / 语义，业务 SQL 完全共用。

CREATE TABLE IF NOT EXISTS students (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_no  VARCHAR(32)  NOT NULL UNIQUE,
  name        VARCHAR(64)  NOT NULL,
  major       VARCHAR(64)  NOT NULL DEFAULT '',
  class_name  VARCHAR(64)  NOT NULL DEFAULT '',
  created_at  VARCHAR(32)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lessons (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(128) NOT NULL,
  status      VARCHAR(16)  NOT NULL DEFAULT 'active',
  started_at  VARCHAR(32)  NOT NULL,
  ended_at    VARCHAR(32)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roll_calls (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  lesson_id    INT NOT NULL,
  student_id   INT NOT NULL,
  mode         VARCHAR(16) NOT NULL,
  weight       DOUBLE NOT NULL DEFAULT 0,
  probability  DOUBLE NOT NULL DEFAULT 0,
  event        VARCHAR(16) NULL,
  present      TINYINT NOT NULL DEFAULT 1,
  called_at    VARCHAR(32) NOT NULL,
  INDEX idx_calls_lesson (lesson_id, called_at),
  INDEX idx_calls_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS score_events (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  lesson_id    INT NOT NULL,
  student_id   INT NOT NULL,
  roll_call_id INT NULL,
  kind         VARCHAR(16) NOT NULL,
  delta        DOUBLE NOT NULL,
  note         VARCHAR(255) NULL,
  batch_id     VARCHAR(40) NULL,
  created_at   VARCHAR(32) NOT NULL,
  INDEX idx_events_lesson (lesson_id, created_at),
  INDEX idx_events_student (student_id),
  INDEX idx_events_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS badges (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  student_id        INT NOT NULL,
  earned_at         VARCHAR(32) NOT NULL,
  used_at           VARCHAR(32) NULL,
  used_roll_call_id INT NULL,
  INDEX idx_badges_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_config (
  id         INT PRIMARY KEY,
  payload    TEXT NOT NULL,
  updated_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_state (
  state_key   VARCHAR(64) PRIMARY KEY,
  state_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
