import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';

export async function getTopics(): Promise<Topic[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, number, Date]>(
      `SELECT id, keyword, email, active, created_at FROM topics ORDER BY id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, keyword, email, active, createdAt]) => ({
      id, keyword, email, active, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getTodayCount(): Promise<Record<number, number>> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, number]>(
      `SELECT topic_id, COUNT(*) FROM raw_data
       WHERE created_at >= TRUNC(SYSTIMESTAMP)
         AND created_at <  TRUNC(SYSTIMESTAMP) + 1
       GROUP BY topic_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return Object.fromEntries((result.rows ?? []).map(([tid, cnt]) => [tid, cnt]));
  } finally {
    await conn.close();
  }
}

export interface ReportListItem {
  id: number;
  topicId: number;
  keyword: string;
  theme: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export async function getReports(page: number, limit = 20): Promise<ReportListItem[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const offset = (page - 1) * limit;
    const result = await conn.execute<[number, number, string, string | null, Date | null, Date]>(
      `SELECT r.id, r.topic_id, t.keyword, r.theme, r.sent_at, r.created_at
       FROM daily_reports r JOIN topics t ON r.topic_id = t.id
       ORDER BY r.created_at DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { offset, limit },
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, topicId, keyword, theme, sentAt, createdAt]) => ({
      id, topicId, keyword, theme, sentAt, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getReportContent(id: number): Promise<{ theme: string | null; content: string | null } | null> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[string | null, string | null]>(
      `SELECT theme, content FROM daily_reports WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_ARRAY, fetchInfo: { CONTENT: { type: oracledb.STRING } } },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return { theme: row[0], content: row[1] };
  } finally {
    await conn.close();
  }
}
