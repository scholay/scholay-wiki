// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClawArtifactPanel } from './ClawArtifactPanel';
import type { ClawArtifact } from '../../api/artifacts';

/**
 * A10 的另一半:窄屏 Sheet 里挂的是**这个面板**(列表 + 预览),不是原先那个只能显示单个文件的
 * `ClawArtifactPreview`。所以这里断言的是「面板在列表态确实把整个会话的产物都列出来」——
 * 修复前窄屏用户看到的最多是其中一个文件,其余的没有任何入口能到达。
 *
 * 只测列表态:预览态会把 `ClawArtifactPreview` 拉起来(要拉字节、要 query provider),
 * 那属于既有组件的职责,不是本次改动引入的行为。
 */
afterEach(cleanup);

const files: ClawArtifact[] = [
  { id: 1, path: 'out/报告.docx', name: '报告.docx', kind: 'file', size: 2048 },
  { id: 2, path: 'out/数据.xlsx', name: '数据.xlsx', kind: 'file', size: 4096 },
  { id: 3, path: 'out/图集', name: '图集', kind: 'dir' },
];

describe('ClawArtifactPanel(窄屏 Sheet 复用的同一个面板)', () => {
  it('列表态列出会话里全部产物,而不只是被点开的那一个', () => {
    render(
      <ClawArtifactPanel
        sessionId="s1"
        artifacts={files}
        previewArtifact={null}
        onPreview={vi.fn()}
        onClosePreview={vi.fn()}
      />,
    );
    expect(screen.getByText('报告.docx')).toBeTruthy();
    expect(screen.getByText('数据.xlsx')).toBeTruthy();
    // 目录产物渲染成 `名字/`,同样必须在列表里。
    expect(screen.getByText('图集/')).toBeTruthy();
    // 计数与列表长度一致(移动端那颗按钮上的数字与这里同一个来源)。
    expect(screen.getByText('· 3')).toBeTruthy();
  });

  it('零产物时给可读空态,而不是一块空白 —— 窄屏用户可能在没有产物时就打开它', () => {
    render(
      <ClawArtifactPanel
        sessionId="s1"
        artifacts={[]}
        previewArtifact={null}
        onPreview={vi.fn()}
        onClosePreview={vi.fn()}
      />,
    );
    expect(screen.getByText('扩展区暂无内容')).toBeTruthy();
  });
});
