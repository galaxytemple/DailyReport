'use server';
import { initPool, getConnection, oracledb } from '@daily/db';
import { assertQuizOwner } from '@/lib/quiz-owner';
import { getQuizConfig } from '@/lib/queries';
import { splitSentences, buildQuiz, MIN_SENTENCES, type QuizQuestion } from '@/lib/quiz';

// Day boundary for the correct-answer calendar. SYSTIMESTAMP is the DB server
// clock (UTC) and ignores the session time zone, so we convert explicitly here.
// 'AT TIME ZONE' handles PST/PDT automatically.
const QUIZ_TZ = 'America/Los_Angeles';

export async function fetchNextQuiz(): Promise<QuizQuestion | null> {
  await assertQuizOwner();
  const { blankPct } = await getQuizConfig();

  await initPool();
  const conn = await getConnection();
  try {
    // Save enforces >= MIN_SENTENCES, so a single random row is normally
    // eligible; fetch a small batch and pick the first eligible as defense.
    const result = await conn.execute<[string, string]>(
      `SELECT title, body FROM quiz_passages
       ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 5 ROWS ONLY`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    for (const [title, body] of result.rows ?? []) {
      const sentences = splitSentences(body);
      if (sentences.length >= MIN_SENTENCES) {
        return buildQuiz(sentences, title, blankPct, Math.random);
      }
    }
    return null;
  } finally {
    await conn.close();
  }
}

export async function recordCorrect(): Promise<void> {
  await assertQuizOwner();
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO quiz_daily d
       USING (SELECT TRUNC(SYSTIMESTAMP AT TIME ZONE :tz) AS day FROM dual) s
       ON (d.day = s.day)
       WHEN MATCHED THEN UPDATE SET d.correct_count = d.correct_count + 1
       WHEN NOT MATCHED THEN INSERT (day, correct_count) VALUES (s.day, 1)`,
      { tz: QUIZ_TZ },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
