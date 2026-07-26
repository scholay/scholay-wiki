import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { unifiedMergeView, getChunks, goToNextChunk, goToPreviousChunk, acceptChunk, rejectChunk } from '@codemirror/merge';
import { ChevronUp, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { prismEditorTheme, prismSyntax } from './LatexEditor';

/**
 * 内联 diff 配色 —— @codemirror/merge 默认在暗色里很刺眼:词级改动是高饱和亮绿下划线
 * (#88ff88aa),整篇新内容时满屏亮绿。这里覆写成柔和半透明叠色 + 左侧 accent 竖条:整行只
 * 轻微着底,词级精确改动才稍重,删除走柔和红。颜色全取 globals.css 的 --prism-editor-diff-* token。
 *
 * 关键:用 **EditorView.baseTheme**(不是 .theme)—— `&dark`/`&light` 这种暗/亮变体选择器
 * **只有 baseTheme 支持**;放进 .theme 会在模块加载时抛 `RangeError: Unsupported selector: &dark`,
 * 整个 PrismPage chunk 求值失败 → /prism 被 RouteErrorBoundary 兜成 404(踩过)。
 * 选择器与 @codemirror/merge baseTheme 同特异性(根带 `cm-merge-b` + 暗色 `cm-dark`,规则形如
 * `&dark.cm-merge-b .cm-changedText` 0,4,0),同 baseTheme 层、且本扩展放在 mergeView 之后注册 →
 * 平局后插入取胜,盖过其默认刺眼配色。
 */
const prismDiffTheme = EditorView.baseTheme({
  // 新增/变更行底色(unified = merge-b):柔和绿,覆写默认 rgba(100,160,128,.08)。
  '&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine, .cm-insertedLine': {
    backgroundColor: 'var(--prism-editor-diff-ins-soft)',
  },
  // 词级精确改动:亮绿下划线渐变 → 柔和底色块(匹配 &dark/&light.cm-merge-b 才盖得住)。
  '&.cm-merge-b .cm-changedText, &dark.cm-merge-b .cm-changedText, &light.cm-merge-b .cm-changedText': {
    background: 'var(--prism-editor-diff-ins-strong)',
    borderRadius: '2px',
  },
  // 删除块底色(覆写默认 rgba(160,128,100,.08))。
  '.cm-deletedChunk': { backgroundColor: 'var(--prism-editor-diff-del-soft)' },
  // 删除文本:柔和红底 + 红灰字(覆写默认亮红下划线渐变 / #ff000033)。
  '&.cm-merge-b .cm-deletedText, &dark .cm-deletedChunk .cm-deletedText, &light .cm-deletedChunk .cm-deletedText': {
    background: 'var(--prism-editor-diff-del-strong)',
    color: 'var(--prism-editor-diff-del-fg)',
    borderRadius: '2px',
  },
  // 变更 / 删除 gutter 竖条(3px)改柔和 accent(覆写默认亮色),当作左侧改动指示条。
  '&.cm-merge-b .cm-changedLineGutter, &dark.cm-merge-b .cm-changedLineGutter, &light.cm-merge-b .cm-changedLineGutter': {
    background: 'var(--prism-editor-diff-ins-accent)',
  },
  '&dark .cm-deletedLineGutter, &light .cm-deletedLineGutter': {
    background: 'var(--prism-editor-diff-del-accent)',
  },
});

/**
 * LaTeX 内联 diff —— 官方 @codemirror/merge unifiedMergeView 在主编辑器里渲染红删/绿增。
 * mergeControls:false —— 不显示每个 hunk 上方的内置 accept/reject 块控件,取舍统一走右上浮动导航,
 * 界面更干净(对齐 OpenAI Canvas:文档区只读 + 一个轻量控制条)。allowInlineDiffs 让句子级小改以词级呈现。
 *
 * 浮动导航:↑↓ 切块,✓/✗ 逐块取舍(细化最终文本),「全部保留 / 全部撤销」= 提交 / 丢弃整个提案,
 * 与对话面板「合并更改」卡片的两个按钮同一逻辑(onApplyAll / onDiscardAll 由父层提供)。
 */
export function LatexDiffEditor({
  original,
  proposed,
  onChange,
  onApplyAll,
  onDiscardAll,
  displayOnly,
  className,
}: {
  original: string;
  proposed: string;
  onChange?: (merged: string) => void;
  /** 全部保留:提交当前合并结果(= 对话卡片「全部保留」)。 */
  onApplyAll?: () => void;
  /** 全部撤销:丢弃整个提案(= 对话卡片「全部撤销」)。 */
  onDiscardAll?: () => void;
  /** 仅展示红删绿增,不显示任何浮动控制(取舍由外部 round 级 apply/reject 决定)。 */
  displayOnly?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const applyRef = useRef(onApplyAll);
  applyRef.current = onApplyAll;
  const discardRef = useRef(onDiscardAll);
  discardRef.current = onDiscardAll;
  const [nav, setNav] = useState({ count: 0, index: -1 });

  useEffect(() => {
    if (!host.current) return;
    const refresh = (view: EditorView) => {
      const chunks = getChunks(view.state)?.chunks ?? [];
      const cur = view.state.selection.main.head;
      let idx = chunks.findIndex((c) => cur <= c.toB);
      if (idx < 0) idx = chunks.length - 1;
      setNav({ count: chunks.length, index: chunks.length ? idx : -1 });
    };
    const diffKeymap = keymap.of([
      { key: 'Mod-y', run: (v) => { acceptChunk(v); return true; } },
      { key: 'Mod-u', run: (v) => { rejectChunk(v); return true; } },
      { key: 'Mod-Shift-Enter', run: () => { applyRef.current?.(); return true; } },
      { key: 'Mod-Shift-Backspace', run: () => { discardRef.current?.(); return true; } },
    ]);
    const state = EditorState.create({
      doc: proposed,
      extensions: [
        lineNumbers(),
        diffKeymap,
        StreamLanguage.define(stex),
        prismSyntax,
        EditorView.lineWrapping,
        unifiedMergeView({ original, mergeControls: false, allowInlineDiffs: true }),
        prismEditorTheme,
        prismDiffTheme, // 覆写 merge 默认刺眼配色为柔和叠色(放 mergeView 之后才能盖住其 baseTheme)
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          if (u.docChanged || u.selectionSet) refresh(u.view);
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    onChangeRef.current?.(proposed);
    refresh(view);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [original, proposed]);

  const chunk = (fn: (v: EditorView) => void) => () => {
    const v = viewRef.current;
    if (v) {
      fn(v);
      v.focus();
    }
  };

  return (
    <div className={cn('relative h-full', className)}>
      <div ref={host} className="h-full overflow-auto" />
      {!displayOnly && nav.count > 0 && (
        // 浮动导航 —— 暗色配色取 globals.css --prism-editor-* token;逐块取舍 + 全部保留/撤销。
        <div className="absolute right-3 top-3 z-raised flex items-center gap-0.5 rounded-12 border border-[color:var(--prism-editor-chrome-border)] bg-[var(--prism-editor-chrome-bg)] px-1.5 py-1 text-[color:var(--prism-editor-fg)] shadow-overlay">
          <span className="px-1 text-2xs tabular-nums text-[color:var(--prism-editor-chrome-muted)]">剩余 {nav.count} 处</span>
          <button type="button" onClick={chunk(goToPreviousChunk)} title="上一处 (↑)" className="rounded-4 p-1 hover:bg-surface-card/10"><ChevronUp className="size-4" /></button>
          <button type="button" onClick={chunk(goToNextChunk)} title="下一处 (↓)" className="rounded-4 p-1 hover:bg-surface-card/10"><ChevronDown className="size-4" /></button>
          <button type="button" onClick={chunk(acceptChunk)} title="保留此处 (⌘Y)" className="rounded-4 p-1 text-brand-green hover:bg-surface-card/10"><Check className="size-4" /></button>
          <button type="button" onClick={chunk(rejectChunk)} title="撤销此处 (⌘U)" className="rounded-4 p-1 text-brand-red hover:bg-surface-card/10"><X className="size-4" /></button>
          <span className="mx-0.5 h-4 w-px bg-[color:var(--prism-editor-chrome-border)]" />
          <button type="button" onClick={() => applyRef.current?.()} title="全部保留并应用 (⌘⇧↵)" className="rounded-4 px-1.5 py-1 text-2xs font-bold text-brand-green hover:bg-surface-card/10">全部保留</button>
          <button type="button" onClick={() => discardRef.current?.()} title="全部撤销 (⌘⇧⌫)" className="rounded-4 px-1.5 py-1 text-2xs text-brand-red hover:bg-surface-card/10">全部撤销</button>
        </div>
      )}
    </div>
  );
}
