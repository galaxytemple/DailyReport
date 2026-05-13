import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

import { fetchHackerNews } from '../sources/hackernews.js';

function hnResponse(hits: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ hits }),
  };
}

describe('fetchHackerNews', () => {
  it('returns items tagged source=news', async () => {
    fetchMock.mockResolvedValueOnce(
      hnResponse([
        { objectID: '1', title: 'Claude Code 2.0', url: 'https://anthropic.com/x', story_text: '' },
        { objectID: '2', title: 'GPU benchmarks', url: 'https://example.com/y', story_text: 'long text' },
      ]),
    );

    const items = await fetchHackerNews('claude');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('news');
  });

  it('uses the linked URL when present', async () => {
    fetchMock.mockResolvedValueOnce(
      hnResponse([{ objectID: '99', title: 'Linked', url: 'https://link.example/a', story_text: '' }]),
    );
    const items = await fetchHackerNews('x');
    expect(items[0].url).toBe('https://link.example/a');
  });

  it('falls back to the HN discussion URL when no external link', async () => {
    fetchMock.mockResolvedValueOnce(
      hnResponse([{ objectID: '42', title: 'Ask HN: prep tips', story_text: 'body' }]),
    );
    const items = await fetchHackerNews('interview');
    expect(items[0].url).toBe('https://news.ycombinator.com/item?id=42');
  });

  it('filters to the last 24h by default', async () => {
    fetchMock.mockResolvedValueOnce(hnResponse([]));
    const before = Math.floor(Date.now() / 1000);

    await fetchHackerNews('any');

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    const filter = url.searchParams.get('numericFilters') ?? '';
    const match = filter.match(/created_at_i>(\d+)/);
    expect(match).not.toBeNull();
    const cutoff = Number(match![1]);
    // cutoff should be ~24h before "now"
    expect(before - cutoff).toBeGreaterThan(86_000);
    expect(before - cutoff).toBeLessThan(87_000);
  });

  it('returns [] on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await fetchHackerNews('x')).toEqual([]);
  });
});
