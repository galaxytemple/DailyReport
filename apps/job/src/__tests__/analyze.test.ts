import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({ chat: chatMock })),
}));

import { analyzeCluster } from '../analyze.js';

async function* streamOf(...parts: string[]) {
  for (const p of parts) yield { message: { content: p } };
}

beforeEach(() => {
  chatMock.mockReset();
});

describe('analyzeCluster', () => {
  it('returns the LLM markdown content', async () => {
    chatMock.mockResolvedValueOnce(streamOf('# AI tools\n\n- bullet\n'));

    const out = await analyzeCluster({
      theme: 'AI coding tools',
      topics: [{ id: 1, keyword: 'claude code' }],
      passages: [{ title: 'Item', body: 'body', url: 'https://x/y', topicId: 1 }],
    });

    expect(out).toContain('# AI tools');
  });

  it('passes a system prompt that names inputs as DATA', async () => {
    chatMock.mockResolvedValueOnce(streamOf('ok'));

    await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [],
    });

    const messages = chatMock.mock.calls[0]?.[0]?.messages;
    expect(messages?.[0]?.role).toBe('system');
    expect(messages?.[0]?.content).toMatch(/DATA/);
  });

  it('concatenates streamed chunks into a single string', async () => {
    chatMock.mockResolvedValueOnce(streamOf('Hello, ', 'world', '!'));

    const out = await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [],
    });

    expect(out).toBe('Hello, world!');
  });

  it('requests streaming with keep_alive set', async () => {
    chatMock.mockResolvedValueOnce(streamOf('ok'));

    await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [],
    });

    const args = chatMock.mock.calls[0]?.[0];
    expect(args?.stream).toBe(true);
    expect(args?.keep_alive).toBeDefined();
  });

  it('appends a Sources section with numbered markdown links from passages', async () => {
    chatMock.mockResolvedValueOnce(streamOf('body'));

    const out = await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [
        { title: 'First', body: 'b1', url: 'https://a/1', topicId: 1 },
        { title: 'No-URL', body: 'b2', url: null, topicId: 1 },
        { title: 'Third', body: 'b3', url: 'https://a/3', topicId: 1 },
      ],
    });

    expect(out).toContain('## Sources');
    expect(out).toContain('\\[1\\] [First](<https://a/1>)');
    expect(out).toContain('\\[3\\] [Third](<https://a/3>)');
    expect(out).not.toContain('No-URL');
  });

  it('rewrites [N] in the body to a markdown link to passage N url', async () => {
    chatMock.mockResolvedValueOnce(streamOf('see [1] and [2] and [3].'));

    const out = await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [
        { title: 'First', body: 'b1', url: 'https://a/1', topicId: 1 },
        { title: 'No-URL', body: 'b2', url: null, topicId: 1 },
        { title: 'Third', body: 'b3', url: 'https://a/3', topicId: 1 },
      ],
    });

    expect(out).toContain('[\\[1\\]](<https://a/1>)');
    expect(out).toContain('[\\[3\\]](<https://a/3>)');
    expect(out).toMatch(/and \[2\] and/);
  });

  it('omits Sources section when no passages have URLs', async () => {
    chatMock.mockResolvedValueOnce(streamOf('body'));

    const out = await analyzeCluster({
      theme: 'X',
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [{ title: 'No-URL', body: 'b', url: null, topicId: 1 }],
    });

    expect(out).not.toContain('## Sources');
  });

  it('sanitizes newlines and length from the theme', async () => {
    chatMock.mockResolvedValueOnce(streamOf('ok'));
    const evilTheme = 'evil\ntheme\rwith newlines ' + 'x'.repeat(500);

    await analyzeCluster({
      theme: evilTheme,
      topics: [{ id: 1, keyword: 'kw' }],
      passages: [],
    });

    const userPrompt = chatMock.mock.calls[0]?.[0]?.messages?.[1]?.content as string;
    expect(userPrompt).not.toMatch(/\n.*evil/);
    expect(userPrompt.length).toBeLessThan(5000);
  });
});
