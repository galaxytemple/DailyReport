-- Flyway runs as DAILY_SCHEMA (DDL user); all objects land in that schema.

CREATE TABLE topics (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword    VARCHAR2(500)  NOT NULL,
  email      VARCHAR2(255)  NOT NULL,
  cron_time  VARCHAR2(50)   NOT NULL,
  active     NUMBER(1)      DEFAULT 1 NOT NULL CHECK (active IN (0,1)),
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE raw_data (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id   NUMBER         NOT NULL REFERENCES topics(id),
  source     VARCHAR2(50)   NOT NULL CHECK (source IN ('reddit','twitter','news')),
  url        VARCHAR2(2000),
  title      VARCHAR2(1000),
  body       CLOB,
  embedding  VECTOR(768, FLOAT32),
  sentiment  NUMBER(3,2),
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE daily_reports (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id   NUMBER         NOT NULL REFERENCES topics(id),
  content    CLOB,
  sent_at    TIMESTAMP,
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE archived_summary (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    NUMBER         NOT NULL REFERENCES topics(id),
  report_date DATE           NOT NULL,
  rank        NUMBER(2)      NOT NULL CHECK (rank BETWEEN 1 AND 10),
  source      VARCHAR2(50)   NOT NULL,
  url         VARCHAR2(2000),
  title       VARCHAR2(1000),
  summary     VARCHAR2(1000) NOT NULL,
  sentiment   NUMBER(3,2),
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

-- B-tree indexes for the hot predicates.
-- All "today" / "yesterday" filters in the apps use sargable range form
-- (created_at >= X AND created_at < X+1), so a plain (topic_id, created_at) index works.
CREATE INDEX raw_data_topic_date_idx        ON raw_data        (topic_id, created_at);
CREATE INDEX daily_reports_created_idx      ON daily_reports   (created_at);
CREATE INDEX archived_summary_topic_date_idx ON archived_summary (topic_id, report_date);

-- DML grants to the app runtime user are handled manually by the operator
-- (outside of this migration). See db/README or the project plan's
-- "Task 3 prerequisites" section for the SQL to run as ADMIN.
