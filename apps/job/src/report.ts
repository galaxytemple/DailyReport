import { getConnection, oracledb } from '@daily/db';

export async function saveReport(
  themeId: number,
  themeName: string,
  content: string,
): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `INSERT INTO daily_reports (theme_id, theme, content)
       VALUES (:tid, :theme, :content)
       RETURNING id INTO :id`,
      {
        tid: themeId,
        theme: themeName.slice(0, 200),
        content: { val: content, type: oracledb.CLOB },
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true },
    );
    return (result.outBinds as { id: number[] }).id[0];
  } finally {
    await conn.close();
  }
}

export async function markSent(reportId: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE daily_reports SET sent_at = SYSTIMESTAMP WHERE id = :id`,
      { id: reportId },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
