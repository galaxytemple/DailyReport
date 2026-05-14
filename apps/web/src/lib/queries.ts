import { initPool, getConnection, oracledb } from '@daily/db';
import type { Theme, Topic } from '@daily/db';

export async function getTopicKeywordsByTheme(): Promise<Map<number, string[]>> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string]>(
      `SELECT theme_id, keyword FROM topics ORDER BY theme_id, id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    const out = new Map<number, string[]>();
    for (const [tid, kw] of result.rows ?? []) {
      const list = out.get(tid) ?? [];
      list.push(kw);
      out.set(tid, list);
    }
    return out;
  } finally {
    await conn.close();
  }
}

export async function getThemes(): Promise<Theme[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, number, Date]>(
      `SELECT id, name, emails, active, created_at FROM themes ORDER BY id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, name, emails, active, createdAt]) => ({
      id, name, emails, active, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export interface TopicWithTheme extends Topic {
  themeName: string;
}

export async function getTopicsWithTheme(): Promise<TopicWithTheme[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, number, string, string, number, Date]>(
      `SELECT t.id, t.theme_id, th.name, t.keyword, t.active, t.created_at
       FROM topics t JOIN themes th ON t.theme_id = th.id
       ORDER BY th.name, t.id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, themeId, themeName, keyword, active, createdAt]) => ({
      id, themeId, themeName, keyword, active, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getTodayCount(): Promise<Record<number, number>> {
  await initPool();
  const conn = await getConnection();
  try {
    // topic_id IS NOT NULL — global RSS pool is counted separately.
    const result = await conn.execute<[number, number]>(
      `SELECT topic_id, COUNT(*) FROM raw_data
       WHERE topic_id IS NOT NULL
         AND created_at >= TRUNC(SYSTIMESTAMP)
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

export async function getGlobalRssTodayCount(): Promise<number> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number]>(
      `SELECT COUNT(*) FROM raw_data
       WHERE topic_id IS NULL
         AND created_at >= TRUNC(SYSTIMESTAMP)
         AND created_at <  TRUNC(SYSTIMESTAMP) + 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return result.rows?.[0]?.[0] ?? 0;
  } finally {
    await conn.close();
  }
}

export interface ReportListItem {
  id: number;
  themeId: number;
  themeName: string;
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
      `SELECT r.id, r.theme_id, th.name, r.theme, r.sent_at, r.created_at
       FROM daily_reports r JOIN themes th ON r.theme_id = th.id
       ORDER BY r.created_at DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { offset, limit },
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, themeId, themeName, theme, sentAt, createdAt]) => ({
      id, themeId, themeName, theme, sentAt, createdAt,
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
