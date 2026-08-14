// @vitest-environment jsdom

import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get },
}));

import { useAdminTranscript } from './session-monitor';

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function journalTurn(id: number, cursorSeq: number) {
  return {
    id,
    seq: 20 + id,
    cursorSeq,
    status: 'complete',
    kind: 'interactive',
    attempt: 0,
    model: `model-${id}`,
    userText: `question-${id}`,
    startedAt: '2026-08-09T08:00:00.000Z',
    completedAt: '2026-08-09T08:00:01.000Z',
    durationMs: 1_000,
    usage: null,
    messages: [],
  };
}

beforeEach(() => mocks.get.mockReset());
afterEach(() => cleanup());

describe('useAdminTranscript cursor pagination', () => {
  it('用 nextBeforeSeq 只取新的更早页，并按旧→新合并 hybrid 数据', async () => {
    mocks.get
      .mockResolvedValueOnce({
        data: {
          data: {
            messages: [],
            turns: [journalTurn(2, 2), journalTurn(3, 3)],
            totalTurns: 3,
            hasMore: true,
            nextBeforeSeq: 2,
            source: 'hybrid',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            messages: [
              {
                id: 'old-user',
                type: 'user',
                content: [{ type: 'text', text: 'archive-old' }],
              },
            ],
            turns: [],
            totalTurns: 3,
            hasMore: false,
            source: 'hybrid',
          },
        },
      });
    const client = queryClient();
    const view = renderHook(() => useAdminTranscript('session-1'), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() =>
      expect(view.result.current.data?.turns).toHaveLength(2),
    );
    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      '/admin/agent-sessions/session-1/messages',
      { params: { limit_turns: 60, structured: 1 } },
    );

    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(view.result.current.data?.messages[0]?.id).toBe('old-user'),
    );

    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/admin/agent-sessions/session-1/messages',
      { params: { limit_turns: 60, structured: 1, before_seq: 2 } },
    );
    expect(
      view.result.current.data?.turns.map((turn) => turn.cursorSeq),
    ).toEqual([2, 3]);
    expect(view.result.current.data?.hasMore).toBe(false);
    expect(view.result.current.hasNextPage).toBe(false);

    view.unmount();
    client.clear();
  });

  it('会话未打开时不发起请求', () => {
    const client = queryClient();
    const view = renderHook(() => useAdminTranscript(null), {
      wrapper: wrapperFor(client),
    });

    expect(view.result.current.fetchStatus).toBe('idle');
    expect(mocks.get).not.toHaveBeenCalled();
    view.unmount();
    client.clear();
  });
});
