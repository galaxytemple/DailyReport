import { describe, it, expect, vi, beforeEach } from 'vitest';

const { parseURLMock, fetchMock } = vi.hoisted(() => ({
  parseURLMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: parseURLMock,
  })),
}));

vi.stubGlobal('fetch', fetchMock);

// 16 feeds in the curated list; mock parseURL to control what each call returns.
import { fetchBlogs } from '../sources/blogs.js';
import { RSS_FEEDS } from '../feeds.js';

beforeEach(() => {
  parseURLMock.mockReset();
  fetchMock.mockReset();
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

  it('fetches full article when RSS body is short', async () => {
    parseURLMock.mockResolvedValue({
      items: [{ title: 'Stub', link: 'https://example.com/post', contentSnippet: 'tiny' }],
    });

    const fullArticle = 'x'.repeat(2000);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `<html><body><article>${fullArticle}</article></body></html>`,
    });

    const items = await fetchBlogs();
    expect(items[0].body.length).toBeGreaterThan(500);
    expect(items[0].body).toContain('xxxx');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('does not fetch when RSS body is already long enough', async () => {
    const longBody = 'a'.repeat(600);
    parseURLMock.mockResolvedValue({
      items: [{ title: 'Full', link: 'https://example.com/p', contentSnippet: longBody }],
    });

    await fetchBlogs();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to RSS body when article fetch fails', async () => {
    parseURLMock.mockResolvedValue({
      items: [{ title: 'Stub', link: 'https://example.com/p', contentSnippet: 'tiny snippet' }],
    });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    const items = await fetchBlogs();
    expect(items[0].body).toBe('tiny snippet');
  });

  it('caps at MAX_ITEMS_PER_FEED per feed', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      title: `Post ${i}`, link: `https://example.com/${i}`, contentSnippet: 'x'.repeat(1000),
    }));
    parseURLMock.mockResolvedValue({ items: many });

    const items = await fetchBlogs();
    expect(items.length).toBe(RSS_FEEDS.length * 20);
  });
});
