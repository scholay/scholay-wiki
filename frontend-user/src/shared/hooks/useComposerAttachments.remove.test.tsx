// @vitest-environment jsdom
//
// 输入框「点 × 撤销附件」的行为回归。
//
// 🔴 这条测试存在的理由是一个真实的、用户看不见的数据泄漏:
// removeItem 此前**只改本地 state**。用户点 × 以为撤销了,文件其实已经上传成功,
// 并且**已经永久计入他的 2GB per-user 附件额度**;后端的 DELETE 路由早就注册了,
// 缺的只是调用点。所以这里断言的不是「函数被调用」,而是**真的发出了一次带
// scope=permanent 的 DELETE 请求** —— 少了这一步,用户的每一次「取消」都在偷偷占额度。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

type DeleteCall = [string, { params?: { scope?: string } }?];
const del = vi.fn(async (..._args: DeleteCall) => ({ data: {} }));

vi.mock('@/shared/lib/http', () => ({
  http: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: (...args: unknown[]) => del(...(args as DeleteCall)),
  },
  toApiError: (e: unknown) => e,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';

import { useComposerAttachments } from './useComposerAttachments';
import type { AttachmentDTO } from '@/shared/types/chat';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function setup(dto: Partial<AttachmentDTO>) {
  const upload = vi.fn(
    async (file: File): Promise<AttachmentDTO> => ({
      sessionId: 'sess-1',
      type: 'file',
      name: file.name,
      mimeType: 'text/csv',
      size: file.size,
      path: `/home/bun/sessions/sess-1/${dto.uuid ?? 'x'}-${file.name}`,
      ...dto,
    }),
  );
  return renderHook(() => useComposerAttachments({ upload }), { wrapper });
}

const csv = () => new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' });

beforeEach(() => {
  del.mockClear();
  vi.mocked(toast.error).mockClear();
});

describe('removeItem —— 发送前撤销必须真的删掉后端附件', () => {
  it('点 × 会对该附件发一次 scope=permanent 的 DELETE', async () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const { result } = setup({ uuid });

    await act(async () => {
      await result.current.addFiles([csv()]);
    });
    expect(result.current.attachments).toHaveLength(1);

    act(() => result.current.removeItem(result.current.items[0]!.id));

    // chip 立刻消失(用户表达的「别带进这条消息」本地就能兑现)。
    expect(result.current.items).toHaveLength(0);

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    const [url, cfg] = del.mock.calls[0]!;
    expect(url).toBe(`/user/attachment/${uuid}`);
    // permanent 而非 session:用户从没打算留下它,只删 cwd 副本的话字节仍在 MinIO 占额度。
    expect(cfg?.params?.scope).toBe('permanent');
  });

  it('拿不到 uuid(老后端 / 还在上传中)时不发请求', async () => {
    const { result } = setup({ uuid: undefined }); // 0112 之前的后端不返回该字段

    await act(async () => {
      await result.current.addFiles([csv()]);
    });
    act(() => result.current.removeItem(result.current.items[0]!.id));

    expect(result.current.items).toHaveLength(0);
    // 没有身份键就没有可删的东西,发请求只会拿到一个 400/404,还会给用户弹一条假错误。
    expect(del).not.toHaveBeenCalled();
  });

  it('删除失败时 chip 仍然移除,不把网络错误变成「× 点了没反应」', async () => {
    del.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    const { result } = setup({ uuid: '99999999-8888-7777-6666-555555555555' });

    await act(async () => {
      await result.current.addFiles([csv()]);
    });
    act(() => result.current.removeItem(result.current.items[0]!.id));

    expect(result.current.items).toHaveLength(0);
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  });

  // 「已经不在了」不是失败。后端对同一个 uuid 的第二次永久删除回 **410**(行已软删),
  // 对从未存在的行回 404。两者对删除动作而言结果相同 —— 目的已达成。
  // 只放过 404 会让「两个标签页同时删 / 列表数据略陈旧」弹一句红色的「该文件已被删除」,
  // 用户看到的是一个失败提示 + 一个确实消失了的文件,自相矛盾。
  it.each([404, 410])('后端回 %i(已经不在了)时不弹错误提示', async (status) => {
    del.mockRejectedValueOnce(Object.assign(new Error('gone'), { status }));
    const { result } = setup({ uuid: '77777777-6666-5555-4444-333333333333' });

    await act(async () => {
      await result.current.addFiles([csv()]);
    });
    act(() => result.current.removeItem(result.current.items[0]!.id));

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    // 等 mutation 走完 onError/onSuccess 分支再断言(否则可能在回调前就通过)。
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
