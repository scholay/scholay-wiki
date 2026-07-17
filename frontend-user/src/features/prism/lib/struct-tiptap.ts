// 结构体 ↔ Tiptap(ProseMirror JSON)双向转换。
// 真源永远是结构体(DocStruct);Tiptap 只是所见即所得编辑层。前置信息(标题/作者/摘要/关键词)
// 不进编辑器文档,由 StructEditor 用独立可编辑字段承载 —— 这里只管 body(正文块)。
//
// 铁律:必须可逆 —— structToTiptap → tiptapToStruct 回到等价结构体,否则用户一编辑就丢内容。
// 自定义节点(inlineMath/blockMath/citation/figure/opaqueBlock)见 tiptap-nodes.tsx。
import type { DocBlock, DocInline } from '../api/prism';
import { buildNumberingFromBody, citeDisplay, type CiteNumbering } from './cite-render';

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

// 把一段文本推成 PM 文本节点,内部换行拆成 hardBreak 节点(与 pmInlinesToStruct 的 hardBreak→'\n' 对称)。
// 否则结构体里的换行会塞进单个 text 节点、被渲染成空格 —— 段内软换行往返丢失(评审 #9)。
function pushText(out: PMNode[], text: string, marks?: PMMark[]): void {
  if (!text) return; // PM 文本节点不能为空
  const parts = text.split('\n');
  parts.forEach((part, idx) => {
    if (idx > 0) out.push({ type: 'hardBreak' });
    if (part) out.push(marks ? { type: 'text', text: part, marks } : { type: 'text', text: part });
  });
}

function inlinesToPM(inls?: DocInline[], numbering?: CiteNumbering): PMNode[] {
  const out: PMNode[] = [];
  for (const i of inls ?? []) {
    switch (i.t) {
      case 'math':
        out.push({ type: 'inlineMath', attrs: { latex: i.latex ?? '' } });
        break;
      case 'cite': {
        const key = i.key ?? '';
        // citeText = 真实 LaTeX 样式的展示文本([1, 2] / 图 1);派生自 numbering,不进结构体(tiptapToStruct 只读 citeKey)。
        const citeText = numbering ? citeDisplay(key, numbering) : '';
        out.push({ type: 'citation', attrs: { citeKey: key, citeText } });
        break;
      }
      case 'bold':
        pushText(out, i.v ?? '', [{ type: 'bold' }]);
        break;
      case 'italic':
        pushText(out, i.v ?? '', [{ type: 'italic' }]);
        break;
      default:
        pushText(out, i.v ?? '');
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

function blockToPM(b: DocBlock, numbering?: CiteNumbering): PMNode | null {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(Math.max(b.level ?? 1, 1), 6);
      const text = b.text ?? '';
      return { type: 'heading', attrs: { level, label: b.label ?? '' }, content: text ? [{ type: 'text', text }] : [] };
    }
    case 'paragraph':
      return paragraph(inlinesToPM(b.inlines, numbering));
    case 'displayMath':
      return { type: 'blockMath', attrs: { latex: b.latex ?? '', label: b.label ?? '' } };
    case 'list': {
      const items = (b.items ?? []).map((it) => ({
        type: 'listItem',
        content: [paragraph(inlinesToPM(it, numbering))],
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

/** 正文块数组 → Tiptap doc JSON(供 useEditor content / setContent)。行内 cite 附带真实 LaTeX 样式展示文本。 */
export function bodyToTiptap(body: DocBlock[]): PMNode {
  // 先据整篇 body 建编号(出现顺序),再逐块转换,让每个 cite 拿到 [N] / 图 N 展示文本。
  const numbering = buildNumberingFromBody(body ?? []);
  const content = (body ?? []).map((b) => blockToPM(b, numbering)).filter((n): n is PMNode => n !== null);
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
      // 结构体 Inline 单标记模型:同时 bold+italic 只能取其一(bold 优先)。这是扁平模型的固有限制
      // (projector/docx/md 三侧都按单标记投影),非 bug;编辑器工具条也以单标记为主。
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
      // 结构体 list 是**扁平单层**(items: DocInline[][])。旧实现只读每个 listItem 的首个 paragraph:
      // 多段落项的后续段落、以及嵌套子列表都被静默丢弃(评审 #9)。这里改为收集该项**所有**段落的行内,
      // 并把嵌套子列表**展平**成后续项(保内容、丢层级)—— 模型无法表达嵌套,但绝不整块吞掉用户内容。
      const items: DocInline[][] = [];
      const walkItem = (li: PMNode) => {
        const own: DocInline[] = [];
        const nested: PMNode[] = [];
        for (const c of li.content ?? []) {
          if (c.type === 'paragraph') own.push(...pmInlinesToStruct(c.content));
          else if (c.type === 'bulletList' || c.type === 'orderedList') nested.push(c);
        }
        if (own.length) items.push(own); // 纯容器项(只含子列表、无自身文本)不产生空项
        for (const sub of nested) for (const subLi of sub.content ?? []) walkItem(subLi);
      };
      for (const li of n.content ?? []) walkItem(li);
      return { type: 'list', ordered: n.type === 'orderedList', items };
    }
    case 'table': {
      // 结构体表格单元格是**纯文本**(rows: string[][]);projector 也按文本投影。单元格内的 math/bold/cite
      // 等富行内不在模型内 —— pmTextOf 只取可见文本(math/cite 无 text 贡献即被略去)。这是扁平模型的
      // 固有限制,非本次回归(表内富公式极少见;需要时应作为独立的模型升级评估)。
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
