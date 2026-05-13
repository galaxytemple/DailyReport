import cron from 'node-cron';
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';
import { fetchBlogs } from './sources/blogs.js';
import { fetchReddit } from './sources/reddit.js';
import { fetchHackerNews } from './sources/hackernews.js';
import { embedText } from './embed.js';
import { storeItem } from './store.js';
import type { CrawledItem } from './types.js';

async function loadActiveTopics(): Promise<Topic[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, number]>(
      `SELECT id, keyword, email, active FROM topics WHERE active = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, keyword, email, active]) => ({
      id, keyword, email, active, createdAt: new Date(),
    }));
  } finally {
    await conn.close();
  }
}

async function crawlTopic(topic: Topic): Promise<void> {
  const results = await Promise.allSettled([
    fetchHackerNews(topic.keyword),
    fetchReddit(topic.keyword),
    fetchBlogs(),
  ]);

  const items: CrawledItem[] = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const label = ['hackernews', 'reddit', 'blogs'][i];
    console.warn(`[crawler] topic=${topic.id} ${label} failed:`, r.reason);
    return [];
  });

  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    const text = `${item.title} ${item.body}`.trim();
    if (!text) continue;

    try {
      const embedding = await embedText(text);
      const ok = await storeItem(topic.id, item, embedding);
      if (ok) inserted += 1;
      else skipped += 1;
    } catch (e) {
      console.error(`[crawler] item failed (${item.url ?? 'no-url'}):`, (e as Error).message);
    }
  }

  console.log(
    `[crawler] topic=${topic.id} "${topic.keyword}" — ` +
      `${items.length} candidates, ${inserted} new, ${skipped} dedup`,
  );
}

async function runCrawl(): Promise<void> {
  const topics = await loadActiveTopics();
  for (const t of topics) {
    try {
      await crawlTopic(t);
    } catch (e) {
      console.error(`[crawler] topic=${t.id} crashed:`, e);
    }
  }
}

async function main(): Promise<void> {
  await initPool();
  await runCrawl();
  cron.schedule('0 * * * *', () => {
    runCrawl().catch((e) => console.error('[crawler] runCrawl failed:', e));
  });
  console.log('[crawler] started — runs every hour at :00');
}

main().catch((e) => {
  console.error('[crawler] fatal:', e);
  process.exit(1);
});
