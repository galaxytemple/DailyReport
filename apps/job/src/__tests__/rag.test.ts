import { describe, it, expect, vi, beforeEach } from 'vitest';

const { embedMock, executeMock, closeMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  executeMock: vi.fn(),
  closeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({ embed: embedMock })),
}));

vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: executeMock, close: closeMock }),
  oracledb: { OUT_FORMAT_OBJECT: 'object', DB_TYPE_VECTOR: 'vector' },
}));

import { retrieveContextForCluster, embedQuery } from '../rag.js';

beforeEach(() => {
  embedMock.mockReset();
  executeMock.mockReset();
  closeMock.mockClear();
  embedMock.mockResolvedValue({ embeddings: [new Array(768).fill(0)] });
});

describe('embedQuery', () => {
  it('returns the 768-dim vector', async () => {
    const v = await embedQuery('hello');
    expect(v).toHaveLength(768);
  });

  it('throws on empty input', async () => {
    await expect(embedQuery('   ')).rejects.toThrow(/empty/);
  });
});

describe('retrieveContextForCluster', () => {
  it('unions passages from multiple topics, deduped by url', async () => {
    executeMock
      .mockResolvedValueOnce({
        rows: [
          { TITLE: 'Shared', BODY: 'b1', URL: 'https://example.com/a' },
          { TITLE: 'Only-A', BODY: 'b2', URL: 'https://example.com/b' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { TITLE: 'Shared', BODY: 'b1', URL: 'https://example.com/a' },
          { TITLE: 'Only-B', BODY: 'b3', URL: 'https://example.com/c' },
        ],
      });

    const passages = await retrieveContextForCluster([
      { topicId: 1, keyword: 'kw1' },
      { topicId: 2, keyword: 'kw2' },
    ]);

    expect(passages.map((p) => p.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });

  it('caps total passages at totalCap', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      TITLE: `T${i}`, BODY: `B${i}`, URL: `https://example.com/${i}`,
    }));
    executeMock.mockResolvedValue({ rows });

    const passages = await retrieveContextForCluster(
      [{ topicId: 1, keyword: 'a' }, { topicId: 2, keyword: 'b' }],
      { totalCap: 30 },
    );
    expect(passages.length).toBe(30);
  });
});
