import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

import { fetchReddit } from '../sources/reddit.js';

function listing(children: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { children: children.map((data) => ({ data })) } }),
  };
}

describe('fetchReddit', () => {
  it('returns items with source=reddit', async () => {
    fetchMock.mockResolvedValueOnce(
      listing([
        { title: 'Oil stocks surge', selftext: 'Everyone is buying.', permalink: '/r/stocks/comments/1/x' },
        { title: 'Market update', selftext: 'Down 2% today.', permalink: '/r/investing/comments/2/y' },
      ]),
    );

    const items = await fetchReddit('oil');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('reddit');
  });

  it('builds the canonical reddit.com URL from permalink', async () => {
    fetchMock.mockResolvedValueOnce(
      listing([{ title: 'X', selftext: '', permalink: '/r/stocks/comments/1/x' }]),
    );

    const items = await fetchReddit('oil');
    expect(items[0].url).toBe('https://www.reddit.com/r/stocks/comments/1/x');
  });

  it('falls back to title when selftext is empty', async () => {
    fetchMock.mockResolvedValueOnce(
      listing([{ title: 'Just a link post', selftext: '', permalink: '/r/x/comments/1/z' }]),
    );

    const items = await fetchReddit('oil');
    expect(items[0].body).toBe('Just a link post');
  });

  it('sends the configured User-Agent', async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    process.env.REDDIT_USER_AGENT = 'daily-report/1.0 by galaxytemple@gmail.com';

    await fetchReddit('oil');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'daily-report/1.0 by galaxytemple@gmail.com',
    );
  });

  it('returns [] on non-OK HTTP response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const items = await fetchReddit('oil');
    expect(items).toEqual([]);
  });
});
