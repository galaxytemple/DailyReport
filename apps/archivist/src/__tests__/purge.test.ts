import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockClose } = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue({ rowsAffected: 5 }),
  mockClose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: mockExecute, close: mockClose }),
  oracledb: {},
}));

import { purgeYesterdayRawData, nullOldReportContent } from '../purge.js';

beforeEach(() => {
  mockExecute.mockClear();
  mockClose.mockClear();
});

describe('purgeYesterdayRawData', () => {
  it('deletes yesterday raw_data rows and returns count', async () => {
    const count = await purgeYesterdayRawData();
    expect(count).toBe(5);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM raw_data'),
      expect.any(Object),
      expect.objectContaining({ autoCommit: true }),
    );
    expect(mockClose).toHaveBeenCalled();
  });
});

describe('nullOldReportContent', () => {
  it('nulls content older than 90 days', async () => {
    await nullOldReportContent();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE daily_reports'),
      expect.any(Object),
      expect.objectContaining({ autoCommit: true }),
    );
    expect(mockClose).toHaveBeenCalled();
  });
});
