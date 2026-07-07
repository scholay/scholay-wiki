// Prism 所见即所得编辑器的自定义 Tiptap 节点。
// 结构体里的 math / cite / figure / opaque 在 ProseMirror 里都是「原子节点」(atom)——
// 不可从内部编辑,整块增删,双击公式用 MathLive 改。见 struct-tiptap.ts 的双向转换。
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useMemo, useState } from 'react';
import katex from 'katex';
import { MathEditorDialog } from './MathEditorDialog';

function katexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex || '\\,', { throwOnError: false, displayMode });
  } catch {
    return latex || '\\,';
  }
}

// ── 行内公式 ────────────────────────────────────────────────────────────
function InlineMathView({ node, updateAttributes, editor }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const latex = String(node.attrs.latex ?? '');
  const html = useMemo(() => katexHtml(latex, false), [latex]);
  return (
    <NodeViewWrapper as="span" className="prism-inline-math cursor-pointer align-baseline">
      <span
        title="双击编辑公式"
        onDoubleClick={() => editor.isEditable && setOpen(true)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MathEditorDialog
        open={open}
        initialLatex={latex}
        onInsert={(l) => updateAttributes({ latex: l })}
        onOpenChange={setOpen}
      />
    </NodeViewWrapper>
  );
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': String(node.attrs.latex ?? '') })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView);
  },
});

// ── 块级公式 ────────────────────────────────────────────────────────────
function BlockMathView({ node, updateAttributes, editor }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const latex = String(node.attrs.latex ?? '');
  const html = useMemo(() => katexHtml(latex, true), [latex]);
  return (
    <NodeViewWrapper className="prism-block-math my-3">
      <div
        title="双击编辑公式"
        className="cursor-pointer overflow-x-auto rounded-md py-1 hover:bg-surface-1"
        onDoubleClick={() => editor.isEditable && setOpen(true)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MathEditorDialog
        open={open}
        initialLatex={latex}
        onInsert={(l) => updateAttributes({ latex: l })}
        onOpenChange={setOpen}
      />
    </NodeViewWrapper>
  );
}

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    // label:交叉引用锚(结构体 Block.Label);编辑器里不显示,但必须随节点带过往返,否则一次编辑就丢锚。
    return { latex: { default: '' }, label: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-block-math]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-math': String(node.attrs.latex ?? '') })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView);
  },
});

// ── 引用(行内原子,只读渲染成绿色 chip)──────────────────────────────────
export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { citeKey: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-cite-key]', getAttrs: (el) => ({ citeKey: (el as HTMLElement).getAttribute('data-cite-key') ?? '' }) }];
  },
  renderHTML({ node }) {
    const key = String(node.attrs.citeKey ?? '');
    return [
      'span',
      { 'data-cite-key': key, class: 'mx-0.5 rounded bg-surface-2 px-1 text-brand-green' },
      `[${key}]`,
    ];
  },
});

// ── 插图(块原子,占位显示;编辑图片走「插入图片」/对话)──────────────────
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    // label/width:交叉引用锚 + 图宽(结构体 Block.Label/Width);随节点带过往返,否则一次编辑就丢。
    return { asset: { default: '' }, caption: { default: '' }, label: { default: '' }, width: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'figure[data-asset]' }];
  },
  renderHTML({ node }) {
    const caption = String(node.attrs.caption ?? '') || '插图';
    return [
      'figure',
      { 'data-asset': String(node.attrs.asset ?? ''), class: 'my-4 rounded-md border border-dashed border-border bg-surface-1 px-4 py-6 text-center text-sm text-faint' },
      `图:${caption}`,
    ];
  },
});

// ── 内置节点的结构体元数据 attr ─────────────────────────────────────────
// heading / table 是内置节点(StarterKit / extension-table),给它们挂上结构体元数据(label / caption)。
// rendered:false → 只进 schema + JSON、不渲染成 DOM 属性;随 setContent/getJSON 往返带过,一次 WYSIWYG
// 编辑(改标题文字 / 改表格单元格)不会把交叉引用锚 / 表题注冲成空(评审 F2)。
export const StructBlockMeta = Extension.create({
  name: 'structBlockMeta',
  addGlobalAttributes() {
    return [
      { types: ['heading'], attributes: { label: { default: '', rendered: false } } },
      {
        types: ['table'],
        attributes: { label: { default: '', rendered: false }, caption: { default: '', rendered: false } },
      },
    ];
  },
});

// ── AI 管理区(块原子,只读)────────────────────────────────────────────
export const OpaqueBlock = Node.create({
  name: 'opaqueBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { content: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-opaque]' }];
  },
  renderHTML() {
    return [
      'div',
      { 'data-opaque': '', class: 'my-3 rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-faint' },
      '(AI 管理的区域)',
    ];
  },
});
