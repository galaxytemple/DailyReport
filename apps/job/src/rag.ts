import { Ollama } from 'ollama';
import { getConnection, oracledb } from '@daily/db';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

export interface Passage {
  title: string;
  body: string;
  url: string | null;
  topicId: number | null;
}

export async function embedQuery(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) throw new Error('embedQuery: empty input');
  const res = await ollama.embed({ model: 'nomic-embed-text', input: trimmed });
  return res.embeddings[0];
}

async function retrieveForTopic(
  topicId: number,
  queryEmbedding: number[],
  limit: number,
): Promise<Passage[]> {
  const conn = await getConnection();
  try {
    // Include the global RSS pool (topic_id IS NULL). Embedding similarity
    // surfaces only the items semantically close to this topic's keyword.
    const result = await conn.execute<{ TID: number | null; TITLE: string; BODY: string; URL: string | null }>(
      `SELECT topic_id AS tid, title, body, url
       FROM raw_data
       WHERE (topic_id = :tid OR topic_id IS NULL)
         AND created_at >= TRUNC(SYSTIMESTAMP)
         AND created_at <  TRUNC(SYSTIMESTAMP) + 1
       ORDER BY VECTOR_DISTANCE(embedding, :qvec, COSINE)
       FETCH FIRST :lim ROWS ONLY`,
      {
        tid: topicId,
        qvec: { val: new Float32Array(queryEmbedding), type: oracledb.DB_TYPE_VECTOR },
        lim: limit,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return (result.rows ?? []).map((r) => ({
      title: r.TITLE,
      body: r.BODY,
      url: r.URL,
      topicId: r.TID,
    }));
  } finally {
    await conn.close();
  }
}

export async function retrieveContextForCluster(
  topicQueries: Array<{ topicId: number; keyword: string }>,
  options: { perTopicLimit?: number; totalCap?: number } = {},
): Promise<Passage[]> {
  const perTopicLimit = options.perTopicLimit ?? 15;
  const totalCap = options.totalCap ?? 30;

  const perTopic = await Promise.all(
    topicQueries.map(async ({ topicId, keyword }) => {
      const qvec = await embedQuery(keyword);
      return retrieveForTopic(topicId, qvec, perTopicLimit);
    }),
  );

  const seen = new Set<string>();
  const merged: Passage[] = [];
  for (const passages of perTopic) {
    for (const p of passages) {
      const key = p.url ?? `${p.topicId ?? 'global'}::${p.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
      if (merged.length >= totalCap) return merged;
    }
  }
  return merged;
}
