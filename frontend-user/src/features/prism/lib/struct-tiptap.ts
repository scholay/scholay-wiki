// 结构体 ↔ Tiptap(ProseMirror JSON)双向转换。
// 真源永远是结构体(DocStruct);Tiptap 只是所见即所得编辑层。前置信息(标题/作者/摘要/关键词)
// 不进编辑器文档,由 StructEditor 用独立可编辑字段承载 —— 这里只管 body(正文块)。
//
// 铁律:必须可逆 —— structToTiptap → tiptapToStruct 回到等价结构体,否则用户一编辑就丢内容。
// 自定义节点(inlineMath/blockMath/citation/figure/opaqueBlock)见 tiptap-nodes.tsx。
import type { DocBlock, DocInline } from '../api/prism';

// ── 最小 ProseMirror JSON 结构(只覆盖本编辑器用到的节点)──────────────
export interface PMMark {
  type: string;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

// ── 结构体 → Tiptap ────────────────────────────────────────────────────

function inlinesToPM(inls?: DocInline[]): PMNode[] {
  const out: PMNode[] = [];
  for (const i of inls ?? []) {
    switch (i.t) {
      case 'math':
        out.push({ type: 'inlineMath', attrs: { latex: i.latex ?? '' } });
        break;
      case 'cite':
        out.push({ type: 'citation', attrs: { citeKey: i.key ?? '' } });
        break;
      case 'bold': {
        const t = i.v ?? '';
        if (t) out.push({ type: 'text', text: t, marks: [{ type: 'bold' }] });
        break;
      }
      case 'italic': {
        const t = i.v ?? '';
        if (t) out.push({ type: 'text', text: t, marks: [{ type: 'italic' }] });
        break;
      }
      default: {
        const t = i.v ?? '';
        if (t) out.push({ type: 'text', text: t }); // PM 文本节点不能为空
      }
    }
  }
  return out;
}

function paragraph(content: PMNode[]): PMNode {
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function cell(text: string, header: boolean): PMNode {
  const p = paragraph(text ? [{ type: 'text', text }] : []);
  return { type: header ? 'tableHeader' : 'tableCell', content: [p] };
}

function blockToPM(b: DocBlock): PMNode | null {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(Math.max(b.level ?? 1, 1), 6);
      const text = b.text ?? '';
      return { type: 'heading', attrs: { level, label: b.label ?? '' }, content: text ? [{ type: 'text', text }] : [] };
    }
    case 'paragraph':
      return paragraph(inlinesToPM(b.inlines));
    case 'displayMath':
      return { type: 'blockMath', attrs: { latex: b.latex ?? '', label: b.label ?? '' } };
    case 'list': {
      const items = (b.items ?? []).map((it) => ({
        type: 'listItem',
        content: [paragraph(inlinesToPM(it))],
      }));
      return { type: b.ordered ? 'orderedList' : 'bulletList', content: items.length ? items : [{ type: 'listItem', content: [paragraph([])] }] };
    }
    case 'table': {
      const rows = b.rows ?? [];
      if (!rows.length) return null;
      const cols = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] ?? '');
      const trs = rows.map((r, ri) => ({
        type: 'tableRow',
        content: pad(r).map((c) => cell(c, ri === 0)),
      }));
      return { type: 'table', attrs: { caption: b.caption ?? '', label: b.label ?? '' }, content: trs };
    }
    case 'figure':
      return { type: 'figure', attrs: { asset: b.asset ?? '', caption: b.caption ?? '', label: b.label ?? '', width: b.width ?? '' } };
    case 'opaque':
      return { type: 'opaqueBlock', attrs: { content: b.rawLatex ?? '' } };
    default:
      return null;
  }
}

/** 正文块数组 → Tiptap doc JSON(供 useEditor content / setContent)。 */
export function bodyToTiptap(body: DocBlock[]): PMNode {
  const content = (body ?? []).map(blockToPM).filter((n): n is PMNode => n !== null);
  // 空文档给一个空段落,否则 ProseMirror 报「doc 至少要一个 block」。
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// ── Tiptap → 结构体 ────────────────────────────────────────────────────

function pmTextOf(nodes?: PMNode[]): string {
  let s = '';
  for (const n of nodes ?? []) {
    if (n.type === 'text') s += n.text ?? '';
    else if (n.content) s += pmTextOf(n.content);
  }
  return s;
}

function pmInlinesToStruct(nodes?: PMNode[]): DocInline[] {
  const out: DocInline[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      const marks = n.marks?.map((m) => m.type) ?? [];
      const t = marks.includes('bold') ? 'bold' : marks.includes('italic') ? 'italic' : 'text';
      out.push({ t, v: n.text ?? '' });
    } else if (n.type === 'inlineMath') {
      out.push({ t: 'math', latex: String(n.attrs?.latex ?? '') });
    } else if (n.type === 'citation') {
      out.push({ t: 'cite', key: String(n.attrs?.citeKey ?? '') });
    } else if (n.type === 'hardBreak') {
      out.push({ t: 'text', v: '\n' });
    }
  }
  return out;
}

function pmBlockToStruct(n: PMNode): DocBlock | null {
  switch (n.type) {
    case 'heading': {
      const label = String(n.attrs?.label ?? '');
      return { type: 'heading', level: Number(n.attrs?.level ?? 1), text: pmTextOf(n.content), ...(label ? { label } : {}) };
    }
    case 'paragraph': {
      const inlines = pmInlinesToStruct(n.content);
      return { type: 'paragraph', inlines };
    }
    case 'blockMath': {
      const label = String(n.attrs?.label ?? '');
      return { type: 'displayMath', latex: String(n.attrs?.latex ?? ''), ...(label ? { label } : {}) };
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (n.content ?? []).map((li) => {
        // listItem 内首个 paragraph 的行内
        const p = (li.content ?? []).find((c) => c.type === 'paragraph');
        return pmInlinesToStruct(p?.content);
      });
      return { type: 'list', ordered: n.type === 'orderedList', items };
    }
    case 'table': {
      const rows = (n.content ?? []).map((tr) => (tr.content ?? []).map((td) => pmTextOf(td.content)));
      const caption = String(n.attrs?.caption ?? '');
      const label = String(n.attrs?.label ?? '');
      return { type: 'table', rows, ...(caption ? { caption } : {}), ...(label ? { label } : {}) };
    }
    case 'figure': {
      const label = String(n.attrs?.label ?? '');
      const width = String(n.attrs?.width ?? '');
      return {
        type: 'figure',
        asset: String(n.attrs?.asset ?? ''),
        caption: String(n.attrs?.caption ?? ''),
        ...(label ? { label } : {}),
        ...(width ? { width } : {}),
      };
    }
    case 'opaqueBlock':
      return { type: 'opaque', rawLatex: String(n.attrs?.content ?? '') };
    default:
      return null;
  }
}

/** Tiptap doc JSON → 正文块数组(回写结构体 body)。 */
export function tiptapToBody(doc: PMNode): DocBlock[] {
  return (doc.content ?? []).map(pmBlockToStruct).filter((b): b is DocBlock => b !== null);
}

/** body 归一签名 —— 判「外部改动 vs 自身回声」用(经同一条 structToTiptap 管道,消除 id 等装饰差异)。 */
export function bodySignature(body: DocBlock[]): string {
  return JSON.stringify(bodyToTiptap(body ?? []));
}
