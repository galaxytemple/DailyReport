import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock, closeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  closeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: executeMock, close: closeMock }),
  oracledb: { BIND_OUT: 3003, NUMBER: 2010, CLOB: 'clob' },
}));

import { saveReport, markSent } from '../report.js';

beforeEach(() => {
  executeMock.mockReset();
  closeMock.mockClear();
});

describe('saveReport', () => {
  it('inserts with theme and returns generated id', async () => {
    executeMock.mockResolvedValueOnce({ outBinds: { id: [42] } });

    const id = await saveReport(7, 'AI coding tools', '# report');

    expect(id).toBe(42);
    const [sql, binds] = executeMock.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO daily_reports');
    expect(sql).toContain('theme');
    expect(binds).toMatchObject({ tid: 7, theme: 'AI coding tools' });
    expect((binds as Record<string, unknown>).content).toMatchObject({ type: 'clob' });
  });

  it('caps theme at 200 chars', async () => {
    executeMock.mockResolvedValueOnce({ outBinds: { id: [1] } });
    const huge = 'x'.repeat(500);

    await saveReport(1, huge, 'c');

    const binds = executeMock.mock.calls[0]![1] as Record<string, string>;
    expect(binds.theme.length).toBe(200);
  });
});

describe('markSent', () => {
  it('issues UPDATE with the report id', async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 1 });
    await markSent(42);

    const [sql, binds] = executeMock.mock.calls[0]!;
    expect(sql).toContain('UPDATE daily_reports');
    expect(sql).toContain('sent_at');
    expect(binds).toEqual({ id: 42 });
  });
});
