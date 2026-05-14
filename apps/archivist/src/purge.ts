import { getConnection } from '@daily/db';

export async function purgeYesterdayRawData(): Promise<number> {
  const conn = await getConnection();
  try {
    // Sargable range form — uses raw_data_topic_date_idx; do NOT wrap created_at in TRUNC().
    const result = await conn.execute(
      `DELETE FROM raw_data
       WHERE created_at >= TRUNC(SYSTIMESTAMP) - 1
         AND created_at <  TRUNC(SYSTIMESTAMP)`,
      {},
      { autoCommit: true },
    );
    return result.rowsAffected ?? 0;
  } finally {
    await conn.close();
  }
}

export async function nullOldReportContent(): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE daily_reports
       SET content = NULL
       WHERE content IS NOT NULL
         AND created_at < SYSTIMESTAMP - INTERVAL '90' DAY`,
      {},
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
