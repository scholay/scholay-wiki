import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags as t } from '@lezer/highlight';
import { cn } from '@/shared/lib/utils';

/**
 * LaTeX 代码编辑器 —— CodeMirror 6 适配层(项目唯一编辑器选择,见 frontend CLAUDE.md)。
 * 用官方 legacy-modes 的 stex 语法 + 项目 token 化暗色主题包成受控组件。
 * 颜色全部来自 globals.css 的 --prism-editor-* 变量(集中 token,组件内不硬编码 hex)。
 */

// Prism 编辑器暗色面板主题 —— 颜色取 globals.css 的 --prism-editor-* token(CM 主题可直接用 var())。
// 导出供 LatexDiffEditor 复用(同一套暗色 LaTeX 编辑风格)。
export const prismEditorTheme = EditorView.theme(
  {
    '&' : { backgroundColor: 'var(--prism-editor-bg)', color: 'var(--prism-editor-fg)', height: '100%', fontSize: 'var(--text-12)' },
    // lineHeight 走 --leading-code(1.65)—— 代码编辑器有自己的一档,不属于字族档
    // (最接近的 --leading-paragraph 1.7 语义是长段中文正文,且 0.05em × 每一行 = 编辑器整体高度变化)。
    '.cm-scroller' : { fontFamily: 'var(--font-mono)', lineHeight: 'var(--leading-code)' },
    '.cm-gutters' : { backgroundColor: 'var(--prism-editor-gutter-bg)', color: 'var(--prism-editor-gutter-fg)', border: 'none' },
    '.cm-activeLine' : { backgroundColor: 'var(--prism-editor-active)' },
    '.cm-activeLineGutter' : { backgroundColor: 'var(--prism-editor-active)' },
    '.cm-cursor' : { borderLeftColor: 'var(--prism-editor-cursor)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground' : { backgroundColor: 'var(--prism-editor-selection)' },
    '&.cm-focused' : { outline: 'none' },
  },
  { dark: true }
);

/**
 * LaTeX 语法高亮 —— 面向「写论文的人」而非程序员:正文(默认 fg)最亮最突出;
 * 标记(命令/括号/注释)柔和上色并适度弱化,结构清晰但不喧宾夺主。色值取 globals.css 的 --prism-editor-* token。
 * stex(legacy)产出的 token:tag(命令)/bracket/comment/keyword/atom/number。
 * 导出供 LatexDiffEditor 复用。
 */
const prismHighlightStyle = HighlightStyle.define([
  { tag: [t.tagName, t.keyword], color: 'var(--prism-editor-cmd)' }, // \section \usepackage … 命令
  { tag: [t.bracket, t.brace], color: 'var(--prism-editor-brace)' }, // {} [] 退到背景
  { tag: t.comment, color: 'var(--prism-editor-comment)', fontStyle: 'italic' }, // % 注释
  { tag: t.atom, color: 'var(--prism-editor-math)' }, // 数学等
  { tag: t.number, color: 'var(--prism-editor-num)' },
]);
export const prismSyntax = syntaxHighlighting(prismHighlightStyle);

/** 选区内联编辑(Cmd+K)回调载荷:选中文本 + 文档范围 + 选区头的屏幕坐标(用于浮层定位)。 */
export interface InlineEditTarget {
  text: string;
  from: number;
  to: number;
  coords: { left: number; top: number; bottom: number };
}

interface LatexEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  /** 用户在有选区时按 Cmd+K → 携带选区文本与坐标,父层据此弹出内联编辑浮层。 */
  onInlineEdit?: (target: InlineEditTarget) => void;
  /** 选区变化(去抖)→ 非空选区携带文本+坐标(供「引用此处」选区工具条定位),清空时回传 null。 */
  onSelectionChange?: (target: InlineEditTarget | null) => void;
}

// 暴露给父组件的命令式句柄。
export interface LatexEditorHandle {
  insertAtCursor: (text: string) => void;
  /** 跳到指定行(1-based)并聚焦 —— 编译报错 file:line 跳转用。 */
  gotoLine: (line: number) => void;
}

export const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(function LatexEditor(
  { value, onChange, readOnly, className, onInlineEdit, onSelectionChange },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const selTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const v = view.current;
      if (!v) return;
      const sel = v.state.selection.main;
      v.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + text.length },
      });
      v.focus();
    },
    gotoLine(line: number) {
      const v = view.current;
      if (!v) return;
      const ln = Math.max(1, Math.min(line, v.state.doc.lines));
      const pos = v.state.doc.line(ln).from;
      v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      v.focus();
    },
  }), []);
  // onChange / onInlineEdit 用 ref 透传,避免把它们进编辑器创建依赖里(否则每次 render 重建)。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onInlineEditRef = useRef(onInlineEdit);
  onInlineEditRef.current = onInlineEdit;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // 只创建一次编辑器实例。
  useEffect(() => {
    if (!host.current) return;
    // Cmd/Ctrl+K:有非空选区时,把选区文本+坐标交给父层弹内联编辑浮层。
    const inlineEditKeymap = keymap.of([
      {
        key: 'Mod-k',
        run: (v) => {
          const sel = v.state.selection.main;
          if (sel.empty) return false;
          const head = v.coordsAtPos(sel.from);
          if (!head) return false;
          onInlineEditRef.current?.({
            text: v.state.sliceDoc(sel.from, sel.to),
            from: sel.from,
            to: sel.to,
            coords: { left: head.left, top: head.top, bottom: head.bottom },
          });
          return true;
        },
      },
    ]);
    // 去抖回调读取「当前」view 的选区(setTimeout 触发时 view.current 已就绪),非空且可见才上报坐标。
    const reportSelection = () => {
      const v = view.current;
      if (!v) return;
      const sel = v.state.selection.main;
      if (sel.empty) {
        onSelectionChangeRef.current?.(null);
        return;
      }
      const head = v.coordsAtPos(sel.from);
      if (!head) {
        onSelectionChangeRef.current?.(null);
        return;
      }
      onSelectionChangeRef.current?.({
        text: v.state.sliceDoc(sel.from, sel.to),
        from: sel.from,
        to: sel.to,
        coords: { left: head.left, top: head.top, bottom: head.bottom },
      });
    };
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        inlineEditKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        StreamLanguage.define(stex),
        prismSyntax,
        EditorView.lineWrapping,
        EditorState.readOnly.of(!!readOnly),
        EditorView.editable.of(!readOnly),
        prismEditorTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          // 选区变化去抖上报(拖选过程中不抖动)→ 父层据此弹「编辑此处 / 引用此处」选区工具条。
          if (onSelectionChangeRef.current && (u.selectionSet || u.docChanged)) {
            if (selTimer.current) clearTimeout(selTimer.current);
            selTimer.current = setTimeout(reportSelection, 140);
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      if (selTimer.current) clearTimeout(selTimer.current);
      v.destroy();
      view.current = null;
    };
    // 创建一次;value 外部变更由下方 effect 同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 变化(切换文件 / 服务端 rebase)→ 整体替换文档(仅在不同才 dispatch,防回环)。
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== value) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className={cn('h-full overflow-hidden', className)} />;
});
