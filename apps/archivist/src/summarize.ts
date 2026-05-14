import { Ollama } from 'ollama';
import { getConnection, oracledb } from '@daily/db';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

interface RawRow {
  ID: number;
  TOPIC_ID: number;
  SOURCE: string;
  URL: string | null;
  TITLE: string;
  BODY: string;
}

interface TopicSummary {
  topicId: number;
  rank: number;
  source: string;
  url: string | null;
  title: string;
  summary: string;
  sentiment: number;
}

export async function summariseYesterday(): Promise<void> {
  const conn = await getConnection();
  let rows;
  try {
    rows = await conn.execute<RawRow>(
      `SELECT id, topic_id, source, url, title, body
       FROM raw_data
       WHERE topic_id IS NOT NULL
         AND created_at >= TRUNC(SYSTIMESTAMP) - 1
         AND created_at <  TRUNC(SYSTIMESTAMP)
       ORDER BY topic_id`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
  } finally {
    await conn.close();
  }

  const byTopic = new Map<number, RawRow[]>();
  for (const row of rows.rows ?? []) {
    const list = byTopic.get(row.TOPIC_ID) ?? [];
    list.push(row);
    byTopic.set(row.TOPIC_ID, list);
  }

  for (const [topicId, items] of byTopic) {
    const summaries = await rankAndSummarise(topicId, items);
    await insertSummaries(summaries);
  }
}

// gemma2:9b often wraps JSON output in ```json fences despite instructions otherwise.
function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : trimmed;
}

async function rankAndSummarise(topicId: number, items: RawRow[]): Promise<TopicSummary[]> {
  const itemList = items
    .slice(0, 50)
    .map((r, i) => `[${i + 1}] ${r.TITLE}\n${r.BODY?.slice(0, 300) ?? ''}`)
    .join('\n\n');

  const prompt = `You are a news editor. From the items below, select the TOP 10 most important and unique ones.
For each selected item output a JSON array with fields:
- index (1-based original index)
- summary (one sentence, max 200 chars)
- sentiment (number -1.0 to 1.0)

Return ONLY a valid JSON array. No prose, no markdown fences.

Items:
${itemList}`;

  const callOllama = async (): Promise<string> => {
    const res = await ollama.chat({
      model: 'gemma2:9b',
      messages: [{ role: 'user', content: prompt }],
      options: { temperature: 0 },
    });
    return res.message.content;
  };

  let parsed: Array<{ index: number; summary: string; sentiment: number }> = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callOllama();
      parsed = JSON.parse(stripJsonFence(raw));
      break;
    } catch {
      if (attempt === 1) {
        console.error(`[archivist] LLM JSON parse failed for topic ${topicId}, skipping`);
        return [];
      }
    }
  }

  return parsed.slice(0, 10).map((p, i) => {
    const original = items[p.index - 1];
    return {
      topicId,
      rank: i + 1,
      source: original?.SOURCE ?? 'news',
      url: original?.URL ?? null,
      title: original?.TITLE ?? '',
      summary: p.summary,
      sentiment: p.sentiment,
    };
  });
}

async function insertSummaries(summaries: TopicSummary[]): Promise<void> {
  if (summaries.length === 0) return;
  const conn = await getConnection();
  try {
    await conn.executeMany(
      `INSERT INTO archived_summary (topic_id, report_date, rank, source, url, title, summary, sentiment)
       VALUES (:tid, TRUNC(SYSTIMESTAMP - 1), :rank, :src, :url, :title, :summary, :sentiment)`,
      summaries.map((s) => ({
        tid: s.topicId,
        rank: s.rank,
        src: s.source,
        url: s.url,
        title: s.title,
        summary: s.summary,
        sentiment: s.sentiment,
      })),
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
