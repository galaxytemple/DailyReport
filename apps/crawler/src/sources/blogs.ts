import Parser from 'rss-parser';
import { RSS_FEEDS } from '../feeds.js';
import type { CrawledItem } from '../types.js';

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent':
      process.env.RSS_USER_AGENT ?? 'daily-report/1.0 (+rss aggregator)',
  },
});

export async function fetchBlogs(): Promise<CrawledItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map((url) => parser.parseURL(url)),
  );

  const items: CrawledItem[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') {
      console.warn(`[blogs] feed unreachable: ${RSS_FEEDS[i]} — ${r.reason}`);
      continue;
    }
    for (const entry of r.value.items ?? []) {
      const title = entry.title?.trim() ?? '';
      if (!title) continue;
      items.push({
        source: 'news',
        url: entry.link ?? null,
        title,
        body: (entry.contentSnippet ?? entry.content ?? title).slice(0, 8000),
      });
    }
  }

  return items;
}
