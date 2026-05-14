-- V6: two changes that pair naturally
--   (a) ON DELETE CASCADE on every FK in the themes/topics graph so deleting
--       a theme or topic from the UI nukes its children cleanly.
--   (b) raw_data.topic_id NULLABLE so RSS items (not keyword-scoped) can live
--       in a global pool. RAG retrieves them via embedding similarity.

-- themes ← topics (named in V5)
ALTER TABLE topics DROP CONSTRAINT topics_theme_fk;
ALTER TABLE topics ADD CONSTRAINT topics_theme_fk
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE;

-- themes ← daily_reports (named in V5)
ALTER TABLE daily_reports DROP CONSTRAINT daily_reports_theme_fk;
ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_theme_fk
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE;

-- topics ← raw_data (V1 unnamed; look it up). Also make NULLABLE for global RSS.
DECLARE
  cname VARCHAR2(128);
BEGIN
  SELECT constraint_name INTO cname
  FROM user_constraints
  WHERE table_name = 'RAW_DATA' AND constraint_type = 'R';
  EXECUTE IMMEDIATE 'ALTER TABLE raw_data DROP CONSTRAINT ' || cname;
END;
/

ALTER TABLE raw_data MODIFY topic_id NULL;
ALTER TABLE raw_data ADD CONSTRAINT raw_data_topic_fk
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;

-- topics ← archived_summary (V1 unnamed). Stays NOT NULL — archive only
-- summarises keyword-tagged items; the global RSS pool isn't archived.
DECLARE
  cname VARCHAR2(128);
BEGIN
  SELECT constraint_name INTO cname
  FROM user_constraints
  WHERE table_name = 'ARCHIVED_SUMMARY' AND constraint_type = 'R';
  EXECUTE IMMEDIATE 'ALTER TABLE archived_summary DROP CONSTRAINT ' || cname;
END;
/

ALTER TABLE archived_summary ADD CONSTRAINT archived_summary_topic_fk
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;
