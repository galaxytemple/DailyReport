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
