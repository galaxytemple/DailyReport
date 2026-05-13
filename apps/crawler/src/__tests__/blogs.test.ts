import { describe, it, expect, vi, beforeEach } from 'vitest';

const { parseURLMock } = vi.hoisted(() => ({ parseURLMock: vi.fn() }));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: parseURLMock,
  })),
}));

// 16 feeds in the curated list; mock parseURL to control what each call returns.
import { fetchBlogs } from '../sources/blogs.js';
import { RSS_FEEDS } from '../feeds.js';

beforeEach(() => {
  parseURLMock.mockReset();
});

describe('fetchBlogs', () => {
  it('aggregates items from every feed', async () => {
    parseURLMock.mockResolvedValue({
      items: [
        { title: 'Post A', link: 'https://example.com/a', contentSnippet: 'aaa' },
        { title: 'Post B', link: 'https://example.com/b', contentSnippet: 'bbb' },
      ],
    });

    const items = await fetchBlogs();
    expect(items.length).toBe(RSS_FEEDS.length * 2);
    expect(items[0]).toMatchObject({ source: 'news', title: 'Post A' });
  });

  it('survives a single feed failure', async () => {
    parseURLMock
      .mockResolvedValueOnce({ items: [{ title: 'OK', link: 'x', contentSnippet: 'y' }] })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ items: [] });

    const items = await fetchBlogs();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].title).toBe('OK');
  });

  it('skips items without a title', async () => {
    parseURLMock.mockResolvedValue({
      items: [
        { title: '', link: 'https://example.com/a', contentSnippet: 'aaa' },
        { title: 'Real', link: 'https://example.com/b', contentSnippet: 'bbb' },
      ],
    });

    const items = await fetchBlogs();
    expect(items.every((i) => i.title.length > 0)).toBe(true);
  });

  it('caps body length at 8000 chars', async () => {
    const huge = 'x'.repeat(20_000);
    parseURLMock.mockResolvedValue({
      items: [{ title: 'Huge', link: 'https://example.com/h', contentSnippet: huge }],
    });

    const items = await fetchBlogs();
    expect(items[0].body.length).toBe(8000);
  });
});
