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
        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-[color:var(--prism-editor-chrome-border)] bg-[var(--prism-editor-chrome-bg)] px-1.5 py-1 text-[color:var(--prism-editor-fg)] shadow-lg">
          <span className="px-1 text-2xs tabular-nums text-[color:var(--prism-editor-chrome-muted)]">剩余 {nav.count} 处</span>
          <button type="button" onClick={chunk(goToPreviousChunk)} title="上一处 (↑)" className="rounded p-1 hover:bg-white/10"><ChevronUp className="size-4" /></button>
          <button type="button" onClick={chunk(goToNextChunk)} title="下一处 (↓)" className="rounded p-1 hover:bg-white/10"><ChevronDown className="size-4" /></button>
          <button type="button" onClick={chunk(acceptChunk)} title="保留此处 (⌘Y)" className="rounded p-1 text-brand-green hover:bg-white/10"><Check className="size-4" /></button>
          <button type="button" onClick={chunk(rejectChunk)} title="撤销此处 (⌘U)" className="rounded p-1 text-brand-red hover:bg-white/10"><X className="size-4" /></button>
          <span className="mx-0.5 h-4 w-px bg-[color:var(--prism-editor-chrome-border)]" />
          <button type="button" onClick={() => applyRef.current?.()} title="全部保留并应用 (⌘⇧↵)" className="rounded px-1.5 py-1 text-2xs font-bold text-brand-green hover:bg-white/10">全部保留</button>
          <button type="button" onClick={() => discardRef.current?.()} title="全部撤销 (⌘⇧⌫)" className="rounded px-1.5 py-1 text-2xs text-brand-red hover:bg-white/10">全部撤销</button>
        </div>
      )}
    </div>
  );
}
