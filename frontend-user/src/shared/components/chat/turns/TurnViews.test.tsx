// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolBlock, Turn } from '@/shared/types/chat';
import { ClawTurnView } from './ClawTurnView';
import { PrismTurnView } from './PrismTurnView';
import { SearchTurnView } from './SearchTurnView';

afterEach(() => cleanup());

function completeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 'turn-1',
    userText: '用户问题',
    blocks: [],
    complete: true,
    ...overrides,
  };
}

function paperTool(id = 'paper-tool'): ToolBlock {
  return {
    kind: 'tool',
    id,
    toolUseId: id,
    toolName: 'mcp__minicod__search_papers',
    input: { query: 'AI' },
    result: { items: [{ id: 'paper-1', title: '共用论文卡' }] },
  };
}

describe('shared turn views', () => {
  it('Claw 保留结果卡 → 处理过程 → 最终答案顺序，并统一处理 Skill/research/claim/路径清洗', () => {
    const skill: ToolBlock = {
      kind: 'tool',
      id: 'skill',
      toolUseId: 'skill',
      toolName: 'Skill',
      input: { name: 'paper-explain' },
      result: { ok: true },
    };
    const renderPaperResult = vi.fn(() => <div>只读论文结果</div>);
    const { container } = render(
      <ClawTurnView
        turn={completeTurn({
          blocks: [
            paperTool(),
            skill,
            {
              kind: 'text',
              id: 'answer',
              text: '已保存到 /home/bun/out/结果.md',
            },
          ],
          research: { queries: 1, ledgerTotal: 4 },
          claimAudited: true,
        })}
        renderPaperResult={renderPaperResult}
      />,
    );

    expect(renderPaperResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'paper-tool' }),
      expect.anything(),
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('只读论文结果')).toBeLessThan(text.indexOf('处理过程'));
    expect(text.indexOf('处理过程')).toBeLessThan(text.indexOf('已保存到'));
    expect(text).toContain('结果.md');
    expect(text).not.toContain('/home/bun');
    expect(text).toContain('本轮回答经过自动核验并已更正');
    expect(text).toContain('本轮检索 1 次');

    fireEvent.click(
      screen.getByRole('button', { name: /\u5904\u7406\u8fc7\u7a0b/ }),
    );
    expect(screen.getByText('论文精读')).toBeInTheDocument();
  });

  it('Search 隐藏 AskUserQuestion，论文卡由同一 core 的 slot 切换交互/只读形态', () => {
    const renderPaperResult = vi.fn(() => <div>注入论文卡</div>);
    render(
      <SearchTurnView
        turn={completeTurn({
          blocks: [
            {
              kind: 'tool',
              id: 'ask',
              toolUseId: 'ask',
              toolName: 'AskUserQuestion',
              input: { questions: [{ question: '不应出现的交互问题' }] },
              result: {},
            },
            paperTool(),
          ],
        })}
        renderPaperResult={renderPaperResult}
      />,
    );

    expect(
      screen.queryByText(/\u4e0d应出现的交互问题/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('注入论文卡')).toBeInTheDocument();
    expect(renderPaperResult).toHaveBeenCalledTimes(1);
  });

  it('Prism 保留自动编译检查、顶层 thinking、plain 答案和 AskUserQuestion 隐藏', () => {
    const { container } = render(
      <PrismTurnView
        turn={completeTurn({
          userText: '【系统 · 自动编译检查】请修复',
          thinkingText: '先检查编译错误',
          blocks: [
            {
              kind: 'tool',
              id: 'ask',
              toolUseId: 'ask',
              toolName: 'AskUserQuestion',
              input: { question: '不应展示' },
              result: {},
            },
            {
              kind: 'text',
              id: 'answer',
              text: '已修复 /home/bun/project/main.tex',
            },
          ],
        })}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('系统 · 自动编译检查');
    expect(text).toContain('思考过程');
    expect(text).not.toContain('不应展示');
    expect(text).toContain('已修复 main.tex');
    expect(text).not.toContain('/home/bun/project');
    expect(
      container.querySelector('.rounded-16.border.bg-surface-card'),
    ).not.toBeInTheDocument();
  });

  it('只读调用方不注入 blockedContent 时 core 不会出现 quota 写操作', () => {
    render(<PrismTurnView turn={completeTurn({ blocked: true })} />);
    expect(
      screen.queryByRole('button', { name: '重新发送' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '去恢复额度' }),
    ).not.toBeInTheDocument();
  });
});
