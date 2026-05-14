import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { RSS_FEEDS } from '../feeds.js';
import type { CrawledItem } from '../types.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const parser = new Parser({
  timeout: 10_000,
  headers: {
    'User-Agent': process.env.RSS_USER_AGENT ?? BROWSER_UA,
  },
});

const ARTICLE_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.blog-post',
  '.post-body',
];

const SHORT_BODY_THRESHOLD = 500;
const MAX_ITEMS_PER_FEED = 20;

export async function fetchArticleBody(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, aside, form, iframe, noscript, .nav, .header, .footer, .sidebar, .ad, .ads').remove();

    for (const sel of ARTICLE_SELECTORS) {
      const text = $(sel).first().text().replace(/\s+/g, ' ').trim();
      if (text.length > 200) return text;
    }

    const fallback = $('body').text().replace(/\s+/g, ' ').trim();
    return fallback.length > 200 ? fallback : null;
  } catch {
    return null;
  }
}

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
    for (const entry of (r.value.items ?? []).slice(0, MAX_ITEMS_PER_FEED)) {
      const title = entry.title?.trim() ?? '';
      if (!title) continue;

      let body = (entry.contentSnippet ?? entry.content ?? title).slice(0, 8000);

      if (body.length < SHORT_BODY_THRESHOLD && entry.link) {
        const fetched = await fetchArticleBody(entry.link);
        if (fetched && fetched.length > body.length) {
          body = fetched.slice(0, 8000);
        }
      }

      items.push({
        source: 'news',
        url: entry.link ?? null,
        title,
        body,
      });
    }
  }

  return items;
}
