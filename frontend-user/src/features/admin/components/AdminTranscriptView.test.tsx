// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminTranscriptView } from './AdminTranscriptView';
import type {
  AdminTranscriptResponse,
  AdminTranscriptTurn,
  TranscriptEntry,
} from '../api/session-monitor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function entry(type: string, content: unknown): TranscriptEntry {
  return { id: `${type}-${Math.random()}`, type, content };
}

function turn(
  overrides: Partial<AdminTranscriptTurn> = {},
): AdminTranscriptTurn {
  return {
    id: 11,
    seq: 7,
    cursorSeq: 7,
    status: 'complete',
    kind: 'interactive',
    attempt: 0,
    model: 'provider/model-v1',
    userText: '请帮我分析',
    startedAt: '2026-08-09T08:00:00.000Z',
    completedAt: '2026-08-09T08:00:02.300Z',
    durationMs: 2300,
    usage: {
      inputTokens: 101,
      outputTokens: 22,
      cacheReadTokens: 7,
      cacheCreationTokens: 3,
    },
    messages: [
      entry('user', [{ type: 'text', text: '请帮我分析' }]),
      entry('assistant', [{ type: 'text', text: '这是回答' }]),
    ],
    ...overrides,
  };
}

function transcript(
  turns: AdminTranscriptTurn[],
  overrides: Partial<AdminTranscriptResponse> = {},
): AdminTranscriptResponse {
  return {
    messages: [],
    turns,
    totalTurns: turns.length,
    hasMore: false,
    source: 'journal',
    ...overrides,
  };
}

describe('AdminTranscriptView', () => {
  it('用用户端同源轮视图回放，并展示权威模型、时间、耗时和状态', () => {
    render(
      <AdminTranscriptView
        transcript={transcript([turn()])}
        featureKey="claw"
        sessionId="session-1"
      />,
    );

    expect(screen.getByText('请帮我分析')).toBeTruthy();
    expect(screen.getByText('这是回答')).toBeTruthy();
    expect(screen.getByText('provider/model-v1')).toBeTruthy();
    expect(screen.getByText('第 7 轮')).toBeTruthy();
    expect(screen.getByText('2 秒')).toBeTruthy();
    // 原始 token 不能在管理台主显；对外用量口径必须是后端权威算力点。
    expect(screen.queryByText(/^输入 101/)).toBeNull();
    expect(screen.getByText('已完成')).toBeTruthy();
  });

  it('历史没记录模型时诚实显示未记录，不用会话锁定模型猜测', () => {
    render(
      <AdminTranscriptView
        transcript={transcript([turn({ model: '' })])}
        featureKey="prism"
        sessionId="session-2"
      />,
    );
    expect(screen.getByText('模型未记录')).toBeTruthy();
  });

  it('额度阻断轮保留用户当时的状态卡，但不提供重发或充值操作', () => {
    render(
      <AdminTranscriptView
        transcript={transcript([
          turn({
            status: 'blocked',
            kind: 'quota',
            model: '',
            usage: null,
            messages: [],
          }),
        ])}
        featureKey="smart_search"
        sessionId="session-3"
      />,
    );

    expect(screen.getByText(/额度已用完/)).toBeTruthy();
    expect(screen.getByText('未发送')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重新发送' })).toBeNull();
    expect(screen.queryByRole('button', { name: '去恢复额度' })).toBeNull();
    expect(screen.queryByRole('button', { name: '取消发送' })).toBeNull();
  });

  it('进行中轮依权威 status 保持生成中，不伪装成已完成或已暂停', () => {
    render(
      <AdminTranscriptView
        transcript={transcript([
          turn({
            status: 'running',
            completedAt: null,
            durationMs: null,
            messages: [
              entry('user', [{ type: 'text', text: '正在处理' }]),
              entry('tool_use', [
                { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
              ]),
            ],
          }),
        ])}
        featureKey="claw"
        sessionId="session-4"
      />,
    );
    expect(screen.getByText('生成中')).toBeTruthy();
    expect(screen.queryByText('已暂停')).toBeNull();
    expect(screen.queryByText('已完成')).toBeNull();
  });

  it('先在前端解锁已拉取的早期轮，不会因为长会话一次渲染全部 DOM', () => {
    const turns = Array.from({ length: 61 }, (_, index) =>
      turn({
        id: index + 1,
        seq: index + 1,
        cursorSeq: index + 1,
        userText: `问题 ${index + 1}`,
        model: '',
        usage: null,
        messages: [],
      }),
    );
    const onLoadEarlier = vi.fn();
    render(
      <AdminTranscriptView
        transcript={transcript(turns)}
        featureKey="claw"
        sessionId="session-5"
        onLoadEarlier={onLoadEarlier}
      />,
    );

    expect(screen.queryByText('第 1 轮')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '显示更早的 1 轮' }));
    expect(screen.getByText('第 1 轮')).toBeTruthy();
    expect(onLoadEarlier).not.toHaveBeenCalled();
  });

  it('hybrid 同时渲染 archive 旧段与 journal 新段，且保持旧→新顺序', () => {
    const oldMessages = [
      entry('user', [{ type: 'text', text: '归档旧问题' }]),
      entry('assistant', [{ type: 'text', text: '归档旧回答' }]),
    ];
    render(
      <AdminTranscriptView
        transcript={transcript(
          [
            turn({
              id: 22,
              seq: 30,
              cursorSeq: 2,
              userText: 'journal 新问题',
              messages: [
                entry('user', [{ type: 'text', text: 'journal 新问题' }]),
                entry('assistant', [{ type: 'text', text: 'journal 新回答' }]),
              ],
            }),
          ],
          {
            messages: oldMessages,
            totalTurns: 2,
            source: 'hybrid',
          },
        )}
        featureKey="claw"
        sessionId="hybrid-session"
      />,
    );

    const oldQuestion = screen.getByText('归档旧问题');
    const newQuestion = screen.getByText('journal 新问题');
    expect(screen.getByText('归档旧回答')).toBeTruthy();
    expect(screen.getByText('journal 新回答')).toBeTruthy();
    expect(screen.getAllByText('第 1 轮')).toHaveLength(1);
    expect(screen.getAllByText('第 2 轮')).toHaveLength(1);
    expect(
      oldQuestion.compareDocumentPosition(newQuestion) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('把管理端规范后的相对附件 marker 还原成 chip，不泄漏存储名', () => {
    const stored = '4b5c6d7e-1111-2222-3333-444455556666-实验数据.pdf';
    render(
      <AdminTranscriptView
        transcript={{
          messages: [
            entry('user', [
              { type: 'text', text: `@"uploads/${stored}" 请分析` },
            ]),
            entry('assistant', [{ type: 'text', text: '好的' }]),
          ],
          turns: [],
          totalTurns: 1,
          hasMore: false,
          source: 'archive',
        }}
        featureKey="claw"
        sessionId="attachment-session"
      />,
    );

    expect(screen.getByText('实验数据.pdf')).toBeTruthy();
    expect(screen.getByText('请分析')).toBeTruthy();
    expect(screen.queryByText(new RegExp(stored))).toBeNull();
  });

  it('blocked envelope 保留附件和引用，但不出现用户端写操作', () => {
    render(
      <AdminTranscriptView
        transcript={transcript([
          turn({
            status: 'blocked',
            messages: [],
            userText: '请使用附件和文献',
            attachments: [
              {
                type: 'file',
                name: '原始数据.csv',
                mimeType: 'text/csv',
                path: 'uploads/4b5c6d7e-1111-2222-3333-444455556666-原始数据.csv',
              },
            ],
            references: [
              { kind: 'folder', title: '我的文献集', paperCount: 8 },
            ],
          }),
        ])}
        featureKey="claw"
        sessionId="blocked-session"
      />,
    );

    expect(screen.getByText('原始数据.csv')).toBeTruthy();
    expect(screen.getByText('我的文献集')).toBeTruthy();
    expect(screen.getByTitle('引用文件夹「我的文献集」(8 篇)')).toBeTruthy();
    expect(screen.getByText(/没有产生模型消耗/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /重新发送/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /开通会员/ })).toBeNull();
  });
});
