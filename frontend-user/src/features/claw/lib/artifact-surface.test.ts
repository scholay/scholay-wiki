import { describe, expect, it } from 'vitest';
import { artifactToggleAvailable, resolveArtifactSurface } from './artifact-surface';

/**
 * A10 —— 窄屏 / 移动端的成果入口(2026-08-07)。
 *
 * 修复前的实际行为:`rightPanelAvailable = !inlineFigures && !isNarrow`。
 * 那个 `!isNarrow` 让 ≤1024 的浏览器窗口连**顶栏那颗开关**都不渲染,窄屏 Sheet 又只在
 * `previewArtifact` 非空时才挂 —— 而 previewArtifact 只能由「对话流里那张文件卡还在视野里
 * 且用户点了预览」产生。会话一长(渲染窗口只留最近 60 轮)或刷新后卡片滚出视野,
 * agent 产出的文件在窄屏与 /m/claw 上就**再也找不到**。
 *
 * 下面每条断言都对应一个用户能观察到的后果,不是对实现文本的复述。
 */
describe('resolveArtifactSurface', () => {
  it('窄屏打开扩展区 → 落 Sheet(修复前这里恒为 none:入口根本不存在)', () => {
    expect(resolveArtifactSurface({ isNarrow: true, open: true, hasPreview: false })).toBe('sheet');
  });

  it('桌面打开扩展区 → 落右侧分栏(桌面行为不得被这次改动波及)', () => {
    expect(resolveArtifactSurface({ isNarrow: false, open: true, hasPreview: false })).toBe('panel');
  });

  it('窄屏:点对话流文件卡预览,即使没主动开过扩展区也必须有东西承接(否则是死点击)', () => {
    expect(resolveArtifactSurface({ isNarrow: true, open: false, hasPreview: true })).toBe('sheet');
  });

  it('桌面:同上,预览单独就能把分栏拉出来', () => {
    expect(resolveArtifactSurface({ isNarrow: false, open: false, hasPreview: true })).toBe('panel');
  });

  it('既没开也没预览 → 不呈现(关掉就是真关掉,两端一致)', () => {
    expect(resolveArtifactSurface({ isNarrow: true, open: false, hasPreview: false })).toBe('none');
    expect(resolveArtifactSurface({ isNarrow: false, open: false, hasPreview: false })).toBe('none');
  });

  it('科研绘图(图内联在对话流)→ 任何宽度、任何意图都不呈现扩展区,免得同一批图列两遍', () => {
    for (const isNarrow of [true, false]) {
      for (const open of [true, false]) {
        for (const hasPreview of [true, false]) {
          expect(
            resolveArtifactSurface({ inlineFigures: true, isNarrow, open, hasPreview }),
          ).toBe('none');
        }
      }
    }
  });
});

describe('artifactToggleAvailable', () => {
  /**
   * 🔴 这条是本次修复的核心不变式,单独钉死:
   * 开关的存在性**只**取决于 feature 有没有扩展区,与屏幕宽度无关。
   * 谁要是再把 isNarrow 混进这个判断,窄屏入口就会又一次整个消失 —— 而那次消失是静默的
   * (页面照常渲染、只是少了一颗按钮),不会有任何报错。
   */
  it('窄屏与桌面都必须给出开关', () => {
    expect(artifactToggleAvailable({})).toBe(true);
    expect(artifactToggleAvailable({ inlineFigures: false })).toBe(true);
  });

  it('只有内联出图的 feature 不给开关', () => {
    expect(artifactToggleAvailable({ inlineFigures: true })).toBe(false);
  });
});
