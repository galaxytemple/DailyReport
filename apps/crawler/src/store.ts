import { getConnection, oracledb } from '@daily/db';
import type { CrawledItem } from './types.js';

export async function storeItem(
  topicId: number,
  item: CrawledItem,
  embedding: number[],
): Promise<boolean> {
  const conn = await getConnection();
  try {
    if (item.url) {
      const dup = await conn.execute<[number]>(
        `SELECT 1 FROM raw_data
         WHERE topic_id = :tid
           AND url = :url
           AND created_at >= TRUNC(SYSTIMESTAMP)
           AND created_at <  TRUNC(SYSTIMESTAMP) + 1
         FETCH FIRST 1 ROWS ONLY`,
        { tid: topicId, url: item.url },
      );
      if ((dup.rows?.length ?? 0) > 0) return false;
    }

    await conn.execute(
      `INSERT INTO raw_data (topic_id, source, url, title, body, embedding)
       VALUES (:tid, :src, :url, :title, :body, :emb)`,
      {
        tid: topicId,
        src: item.source,
        url: item.url,
        title: item.title?.slice(0, 1000) ?? null,
        body: { val: item.body.slice(0, 8000), type: oracledb.CLOB },
        emb: { val: new Float32Array(embedding), type: oracledb.DB_TYPE_VECTOR },
      },
      { autoCommit: true },
    );
    return true;
  } finally {
    await conn.close();
  }
}

// RSS feed items aren't keyword-scoped — they live in a global pool with
// topic_id = NULL and are retrieved by embedding similarity in the job's RAG
// step. Dedup by URL within today's window (no topic dimension).
export async function storeGlobalItem(
  item: CrawledItem,
  embedding: number[],
): Promise<boolean> {
  const conn = await getConnection();
  try {
    if (item.url) {
      const dup = await conn.execute<[number]>(
        `SELECT 1 FROM raw_data
         WHERE topic_id IS NULL
           AND url = :url
           AND created_at >= TRUNC(SYSTIMESTAMP)
           AND created_at <  TRUNC(SYSTIMESTAMP) + 1
         FETCH FIRST 1 ROWS ONLY`,
        { url: item.url },
      );
      if ((dup.rows?.length ?? 0) > 0) return false;
    }

    await conn.execute(
      `INSERT INTO raw_data (topic_id, source, url, title, body, embedding)
       VALUES (NULL, :src, :url, :title, :body, :emb)`,
      {
        src: item.source,
        url: item.url,
        title: item.title?.slice(0, 1000) ?? null,
        body: { val: item.body.slice(0, 8000), type: oracledb.CLOB },
        emb: { val: new Float32Array(embedding), type: oracledb.DB_TYPE_VECTOR },
      },
      { autoCommit: true },
    );
    return true;
  } finally {
    await conn.close();
  }
}
