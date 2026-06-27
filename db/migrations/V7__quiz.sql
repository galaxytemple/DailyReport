-- V7: owner-only English-passage quiz. Three tables:
--   quiz_passages  one stored passage (title + body CLOB)
--   quiz_daily     per-day count of CORRECT answers (motivation calendar)
--   quiz_config    single-row format ratio (blank_pct % of questions use the
--                  blank-sentence format; the rest use the first-sentence format)

CREATE TABLE quiz_passages (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      VARCHAR2(500) NOT NULL,
  body       CLOB          NOT NULL,
  created_at TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE quiz_daily (
  day           DATE   PRIMARY KEY,
  correct_count NUMBER NOT NULL
);

CREATE TABLE quiz_config (
  id        NUMBER PRIMARY KEY CHECK (id = 1),
  blank_pct NUMBER NOT NULL CHECK (blank_pct BETWEEN 0 AND 100)
);

INSERT INTO quiz_config (id, blank_pct) VALUES (1, 50);
