import type { CrawledItem } from '../types.js';

interface RedditChild {
  data: {
    title?: string;
    selftext?: string;
    permalink?: string;
  };
}

interface RedditListing {
  data?: { children?: RedditChild[] };
}

const DEFAULT_UA = 'daily-report/1.0 (set REDDIT_USER_AGENT in .env)';

export async function fetchReddit(keyword: string): Promise<CrawledItem[]> {
  const url = new URL('https://www.reddit.com/search.json');
  url.searchParams.set('q', keyword);
  url.searchParams.set('sort', 'new');
  url.searchParams.set('t', 'day');
  url.searchParams.set('limit', '25');

  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.REDDIT_USER_AGENT ?? DEFAULT_UA },
  });

  if (!res.ok) {
    console.error(`[reddit] HTTP ${res.status} for "${keyword}"`);
    return [];
  }

  const data = (await res.json()) as RedditListing;
  const children = data.data?.children ?? [];

  return children.map((c) => {
    const title = c.data.title ?? '';
    return {
      source: 'reddit' as const,
      url: c.data.permalink ? `https://www.reddit.com${c.data.permalink}` : null,
      title,
      body: c.data.selftext || title,
    };
  });
}
