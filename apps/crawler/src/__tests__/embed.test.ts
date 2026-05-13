import { describe, it, expect, vi, beforeEach } from 'vitest';

const { embedMock } = vi.hoisted(() => ({ embedMock: vi.fn() }));

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({ embed: embedMock })),
}));

import { embedText } from '../embed.js';

beforeEach(() => {
  embedMock.mockReset();
});

describe('embedText', () => {
  it('returns the 768-dim vector from Ollama', async () => {
    const vec = new Array(768).fill(0).map((_, i) => i / 768);
    embedMock.mockResolvedValueOnce({ embeddings: [vec] });

    const out = await embedText('hello world');
    expect(out).toHaveLength(768);
    expect(typeof out[0]).toBe('number');
  });

  it('caps input at 2000 chars', async () => {
    embedMock.mockResolvedValueOnce({ embeddings: [new Array(768).fill(0)] });
    const huge = 'x'.repeat(5000);

    await embedText(huge);

    const args = embedMock.mock.calls[0]?.[0] as { input: string };
    expect(args.input.length).toBe(2000);
  });

  it('throws on empty input', async () => {
    await expect(embedText('   ')).rejects.toThrow(/empty/);
  });
});
