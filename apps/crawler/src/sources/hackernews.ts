import type { CrawledItem } from '../types.js';

interface HnHit {
  title?: string;
  url?: string;
  story_text?: string;
  objectID: string;
}

interface HnResponse {
  hits?: HnHit[];
}

export async function fetchHackerNews(
  keyword: string,
  options: { sinceUnixSec?: number; hitsPerPage?: number } = {},
): Promise<CrawledItem[]> {
  const since =
    options.sinceUnixSec ?? Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const url = new URL('https://hn.algolia.com/api/v1/search');
  url.searchParams.set('query', keyword);
  url.searchParams.set('tags', 'story');
  url.searchParams.set('numericFilters', `created_at_i>${since}`);
  url.searchParams.set('hitsPerPage', String(options.hitsPerPage ?? 25));

  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.HN_USER_AGENT ?? 'daily-report/1.0' },
  });

  if (!res.ok) {
    console.error(`[hackernews] HTTP ${res.status} for "${keyword}"`);
    return [];
  }

  const data = (await res.json()) as HnResponse;

  return (data.hits ?? []).map((hit) => {
    const title = hit.title ?? '';
    const externalUrl = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
    return {
      source: 'news' as const,
      url: externalUrl,
      title,
      body: hit.story_text || title,
    };
  });
}
