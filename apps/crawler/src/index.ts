import cron from 'node-cron';
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';
import { fetchBlogs } from './sources/blogs.js';
import { fetchHackerNews } from './sources/hackernews.js';
import { embedText } from './embed.js';
import { storeItem, storeGlobalItem } from './store.js';
import type { CrawledItem } from './types.js';

async function loadActiveTopics(): Promise<Topic[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, number, string, number]>(
      `SELECT t.id, t.theme_id, t.keyword, t.active
       FROM topics t JOIN themes th ON t.theme_id = th.id
       WHERE t.active = 1 AND th.active = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, themeId, keyword, active]) => ({
      id, themeId, keyword, active, createdAt: new Date(),
    }));
  } finally {
    await conn.close();
  }
}

async function crawlGlobalRss(): Promise<void> {
  let items: CrawledItem[];
  try {
    items = await fetchBlogs();
  } catch (e) {
    console.warn('[crawler] global RSS fetch failed:', e);
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    const text = `${item.title} ${item.body}`.trim();
    if (!text) continue;

    try {
      const embedding = await embedText(text);
      const ok = await storeGlobalItem(item, embedding);
      if (ok) inserted += 1;
      else skipped += 1;
    } catch (e) {
      console.error(`[crawler] global item failed (${item.url ?? 'no-url'}):`, (e as Error).message);
    }
  }

  console.log(
    `[crawler] global RSS pool — ${items.length} candidates, ${inserted} new, ${skipped} dedup`,
  );
}

async function crawlTopic(topic: Topic): Promise<void> {
  // Reddit's /search.json is 403'd from cloud IPs (OCI/AWS/GCP egress).
  // Reddit content now arrives via subreddit RSS in the global pool — see
  // RSS_FEEDS in feeds.ts. fetchReddit() removed from this path.
  let items: CrawledItem[] = [];
  try {
    items = await fetchHackerNews(topic.keyword);
  } catch (e) {
    console.warn(`[crawler] topic=${topic.id} hackernews failed:`, e);
  }

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
  await crawlGlobalRss();
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
