-- V5: introduce `themes` (name + CSV emails), make `topics` children of a theme.
-- Pre-V5 per-topic emails are union-ed into a single "Legacy" theme (active=0)
-- so the job ignores it; the operator re-assigns topics in the UI.

CREATE TABLE themes (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR2(200)  NOT NULL,
  emails     VARCHAR2(1000) NOT NULL,
  active     NUMBER(1)      DEFAULT 1 NOT NULL CHECK (active IN (0,1)),
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

-- Seed Legacy with the union of existing per-topic emails. NVL fallback covers
-- the empty-topics case; LISTAGG over zero rows returns NULL in Oracle.
INSERT INTO themes (name, emails, active)
SELECT 'Legacy',
       NVL(LISTAGG(email, ',') WITHIN GROUP (ORDER BY email), 'admin@example.com'),
       0
FROM (SELECT DISTINCT email FROM topics);

-- topics: add theme_id, backfill to Legacy, enforce NOT NULL + FK, drop email.
ALTER TABLE topics ADD theme_id NUMBER;
UPDATE topics SET theme_id = (SELECT id FROM themes WHERE name = 'Legacy');
ALTER TABLE topics MODIFY theme_id NOT NULL;
ALTER TABLE topics ADD CONSTRAINT topics_theme_fk
  FOREIGN KEY (theme_id) REFERENCES themes(id);
ALTER TABLE topics DROP COLUMN email;
CREATE INDEX topics_theme_active_idx ON topics(theme_id, active);

-- daily_reports: theme is now the unit of sending. Backfill and drop topic_id.
ALTER TABLE daily_reports ADD theme_id NUMBER;
UPDATE daily_reports SET theme_id = (SELECT id FROM themes WHERE name = 'Legacy');
ALTER TABLE daily_reports MODIFY theme_id NOT NULL;
ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_theme_fk
  FOREIGN KEY (theme_id) REFERENCES themes(id);
ALTER TABLE daily_reports DROP COLUMN topic_id CASCADE CONSTRAINTS;
