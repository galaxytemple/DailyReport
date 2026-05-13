import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({ chat: chatMock })),
}));

import { clusterTopics } from '../cluster.js';
import type { Topic } from '@daily/db';

beforeEach(() => {
  chatMock.mockReset();
});

function t(id: number, keyword: string): Topic {
  return { id, keyword, email: 'x@example.com', active: 1, createdAt: new Date() };
}

describe('clusterTopics', () => {
  it('returns [] for empty input', async () => {
    expect(await clusterTopics([])).toEqual([]);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('returns singleton for one topic without calling LLM', async () => {
    const out = await clusterTopics([t(1, 'claude code')]);
    expect(out).toEqual([{ theme: 'claude code', topicIds: [1] }]);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('parses valid LLM JSON output', async () => {
    chatMock.mockResolvedValueOnce({
      message: {
        content: JSON.stringify([
          { theme: 'AI coding tools', topic_ids: [1, 3] },
          { theme: 'Interview prep', topic_ids: [2] },
        ]),
      },
    });

    const out = await clusterTopics([
      t(1, 'claude code'),
      t(2, 'system design interview'),
      t(3, 'cursor'),
    ]);

    expect(out).toEqual([
      { theme: 'AI coding tools', topicIds: [1, 3] },
      { theme: 'Interview prep', topicIds: [2] },
    ]);
  });

  it('strips ```json fences from LLM output', async () => {
    chatMock.mockResolvedValueOnce({
      message: {
        content: '```json\n[{"theme":"A","topic_ids":[1,2]}]\n```',
      },
    });

    const out = await clusterTopics([t(1, 'a'), t(2, 'b')]);
    expect(out).toEqual([{ theme: 'A', topicIds: [1, 2] }]);
  });

  it('puts unassigned topics into an "Other" cluster', async () => {
    chatMock.mockResolvedValueOnce({
      message: { content: JSON.stringify([{ theme: 'A', topic_ids: [1] }]) },
    });

    const out = await clusterTopics([t(1, 'a'), t(2, 'b'), t(3, 'c')]);
    expect(out).toEqual([
      { theme: 'A', topicIds: [1] },
      { theme: 'Other', topicIds: [2, 3] },
    ]);
  });

  it('falls back to singletons after 2 failed LLM attempts', async () => {
    chatMock
      .mockResolvedValueOnce({ message: { content: 'not json at all' } })
      .mockResolvedValueOnce({ message: { content: 'still garbage' } });

    const out = await clusterTopics([t(1, 'a'), t(2, 'b')]);
    expect(out).toEqual([
      { theme: 'a', topicIds: [1] },
      { theme: 'b', topicIds: [2] },
    ]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('rejects cluster output with invalid topic ids', async () => {
    chatMock
      .mockResolvedValueOnce({
        message: { content: JSON.stringify([{ theme: 'A', topic_ids: [1, 999] }]) },
      })
      .mockResolvedValueOnce({
        message: { content: JSON.stringify([{ theme: 'A', topic_ids: [1] }, { theme: 'B', topic_ids: [2] }]) },
      });

    const out = await clusterTopics([t(1, 'a'), t(2, 'b')]);
    expect(out).toEqual([
      { theme: 'A', topicIds: [1] },
      { theme: 'B', topicIds: [2] },
    ]);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});
