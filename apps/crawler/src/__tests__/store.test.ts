import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, closeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  closeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: executeMock, close: closeMock }),
  oracledb: { DB_TYPE_VECTOR: 'vector', CLOB: 'clob' },
}));

import { storeItem } from '../store.js';
import type { CrawledItem } from '../types.js';

beforeEach(() => {
  executeMock.mockReset();
  closeMock.mockClear();
});

const item: CrawledItem = {
  source: 'news',
  url: 'https://example.com/post',
  title: 'Hello',
  body: 'Body text',
};

describe('storeItem', () => {
  it('inserts when not duplicate', async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [] })            // dedup check
      .mockResolvedValueOnce({ rowsAffected: 1 });    // insert

    const ok = await storeItem(1, item, [0.1, 0.2, 0.3]);
    expect(ok).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(2);

    const insertCall = executeMock.mock.calls[1]!;
    expect(insertCall[0]).toContain('INSERT INTO raw_data');
    // CLOB-typed bind for body
    expect(insertCall[1]).toMatchObject({ body: { type: 'clob' } });
    // Vector-typed bind for embedding
    expect(insertCall[1]).toMatchObject({ emb: { type: 'vector' } });
  });

  it('skips on duplicate URL same day', async () => {
    executeMock.mockResolvedValueOnce({ rows: [[1]] });
    const ok = await storeItem(1, item, [0.1]);
    expect(ok).toBe(false);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('uses sargable range predicate for dedup (no TRUNC(created_at))', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowsAffected: 1 });

    await storeItem(1, item, [0.1]);

    const dedupSql = executeMock.mock.calls[0]![0] as string;
    expect(dedupSql).not.toMatch(/TRUNC\(\s*created_at\s*\)/);
    expect(dedupSql).toMatch(/created_at\s*>=\s*TRUNC\(SYSTIMESTAMP\)/);
    expect(dedupSql).toMatch(/created_at\s*<\s*TRUNC\(SYSTIMESTAMP\)\s*\+\s*1/);
  });

  it('skips dedup query when item has no URL', async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1 });
    const ok = await storeItem(1, { ...item, url: null }, [0.1]);
    expect(ok).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock.mock.calls[0]![0]).toContain('INSERT');
  });

  it('always closes the connection', async () => {
    executeMock.mockRejectedValueOnce(new Error('boom'));
    await expect(storeItem(1, item, [0.1])).rejects.toThrow('boom');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
