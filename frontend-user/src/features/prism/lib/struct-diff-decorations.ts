// 原地 diff 装饰:把「本次 AI 改动」以 ProseMirror 装饰(Decoration)叠加在**同一个所见即所得编辑器**上,
// 而不是切到另一个独立的 diff 面。装饰是纯视觉覆盖,绝不进文档内容 —— 编辑器正文永远 == 结构体真源,
// 装饰随用户编辑失效/清除,不会被保存。
//
// 痕迹语义(沿用 struct-diff 的绿加/红删,渲染在真编辑器里,用户要求「划线代表修改」):
//   - 段落/标题内改动(mod)→ 词级:新增/改写的词 = 绿底+绿下划线;删除的词 = 红色**划线**(inline widget,
//                          就地插在被删处,让用户直接看到「删了什么」)。对不齐则退化为整块绿框,绝不错标。
//   - 整块新增(ins)     → 节点装饰:绿左边框 + 淡绿底
//   - 整块删除(del)     → block widget:在原位置渲染一条划掉的删除预览
//
// 铁律:位置只从传入的 PM 文档(编辑器当前 doc)算;math/figure/list/table/opaque 是原子块,只整块 ins/del。
import { Decoration } from '@tiptap/pm/view';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { diffStructs, textToWords } from './struct-diff';
import { tiptapToBody, type PMNode } from './struct-tiptap';
import type { DocBlock, DocStruct } from '../api/prism';

// 装饰样式类(写成完整字面量,Tailwind 扫描器才会生成)。
const CLS_INS_INLINE = 'prism-diff-ins rounded-4 bg-brand-green/20 underline decoration-brand-green decoration-2 underline-offset-2';
const CLS_DEL_INLINE = 'prism-diff-del rounded-4 bg-danger-soft px-0.5 text-brand-red line-through decoration-brand-red';
const CLS_INS_BLOCK = 'prism-diff-ins-block rounded-r-4 border-l-2 border-brand-green bg-brand-green/10';
const CLS_MOD_BLOCK = 'prism-diff-mod-block rounded-r-4 border-l-2 border-brand-green/60 bg-brand-green/5';
const CLS_DEL_BLOCK =
  'prism-diff-del-block my-1 block rounded-r-4 border-l-2 border-brand-red bg-danger-soft/40 py-0.5 pl-3 text-12 leading-relaxed text-brand-red line-through';

const emptyStruct = (body: DocBlock[]): DocStruct => ({
  structVersion: 0,
  targetTemplate: '',
  frontMatter: { title: '' },
  body,
});

type PosTok = { key: string; from: number; to: number };
type DiffTok = { t: string; text?: string; latex?: string; key?: string };

// 走一个块级 PM 节点的行内内容,产出带 PM 位置的 token 序列(与 struct-diff 的 tokenize 同序:
// 文字→按 textToWords 切词;inlineMath/citation→单原子;hardBreak→'\n' 词)。
function nodeTokensWithPos(node: ProseNode, offset: number): PosTok[] {
  const out: PosTok[] = [];
  node.forEach((child, childOffset) => {
    const from = offset + 1 + childOffset; // 节点内容起点 = offset+1
    if (child.isText) {
      let run = from;
      for (const w of textToWords(child.text ?? '')) {
        out.push({ key: 'w:' + w, from: run, to: run + w.length });
        run += w.length;
      }
    } else if (child.type.name === 'inlineMath') {
      out.push({ key: 'm:' + String(child.attrs?.latex ?? ''), from, to: from + child.nodeSize });
    } else if (child.type.name === 'citation') {
      out.push({ key: 'c:' + String(child.attrs?.citeKey ?? ''), from, to: from + child.nodeSize });
    } else if (child.type.name === 'hardBreak') {
      out.push({ key: 'w:\n', from, to: from + child.nodeSize });
    }
  });
  return out;
}

// struct-diff 的 Tok → 归一键(与 nodeTokensWithPos 同规则)。
function diffTokKey(tk: DiffTok): string {
  return tk.t === 'word' ? 'w:' + (tk.text ?? '') : tk.t === 'math' ? 'm:' + (tk.latex ?? '') : 'c:' + (tk.key ?? '');
}

// Tok → 可读文字(删除 widget 用)。
function tokText(tk: DiffTok): string {
  return tk.t === 'word' ? tk.text ?? '' : tk.t === 'math' ? '$' + (tk.latex ?? '') + '$' : '[' + (tk.key ?? '') + ']';
}

// 块级删除/整块新增的可读预览文字。
function blockPreview(b: DocBlock): string {
  switch (b.type) {
    case 'heading':
      return b.text ?? '';
    case 'paragraph':
      return (b.inlines ?? [])
        .map((i) => (i.t === 'math' ? '$' + (i.latex ?? '') + '$' : i.t === 'cite' ? '[' + (i.key ?? '') + ']' : i.v ?? ''))
        .join('');
    case 'displayMath':
      return '$$ ' + (b.latex ?? '') + ' $$';
    case 'list':
      return (b.items ?? []).map((it) => it.map((i) => i.v ?? '').join('')).join(' · ');
    case 'table':
      return '表格';
    case 'figure':
      return '配图:' + (b.caption ?? '');
    case 'opaque':
      return 'AI 管理的区域';
    default:
      return '';
  }
}

function trunc(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

// 行内「删除的词」划线 widget(就地插在被删处)。
function delInlineWidget(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = CLS_DEL_INLINE;
  el.setAttribute('contenteditable', 'false');
  el.textContent = trunc(text, 120);
  return el;
}

// 整块删除的划线预览 widget。
function delBlockWidget(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = CLS_DEL_BLOCK;
  el.setAttribute('contenteditable', 'false');
  el.textContent = trunc(text, 200) || '(已删除)';
  return el;
}

/**
 * 构造「本次改动」装饰。doc = 编辑器当前 PM 文档(新内容,提供位置);baselineBody = 改动前的正文块。
 */
export function buildDiffDecorations(doc: ProseNode, baselineBody: DocBlock[]): Decoration[] {
  const currentBody = tiptapToBody(doc.toJSON() as PMNode);
  const sd = diffStructs(emptyStruct(baselineBody ?? []), emptyStruct(currentBody));
  if (!sd.blocks.some((b) => b.kind !== 'same')) return [];

  const topNodes: { node: ProseNode; offset: number }[] = [];
  doc.forEach((node, offset) => topNodes.push({ node, offset }));
  const docEnd = doc.content.size;

  const decos: Decoration[] = [];
  let ni = 0; // 指向下一个「新内容」顶层节点
  const gapPos = () => (ni < topNodes.length ? topNodes[ni].offset : docEnd);

  for (const db of sd.blocks) {
    if (db.kind === 'same') {
      ni++;
      continue;
    }
    if (db.kind === 'del') {
      decos.push(
        Decoration.widget(gapPos(), () => delBlockWidget(blockPreview(db.block)), {
          side: -1,
          key: 'delblk-' + gapPos() + '-' + decos.length,
        }),
      );
      continue;
    }
    const tn = topNodes[ni];
    ni++;
    if (!tn) continue;
    const nodeFrom = tn.offset;
    const nodeTo = tn.offset + tn.node.nodeSize;
    if (db.kind === 'ins') {
      decos.push(Decoration.node(nodeFrom, nodeTo, { class: CLS_INS_BLOCK }));
      continue;
    }

    // db.kind === 'mod':词级痕迹。posToks = 新节点内所有 token 的位置,应与 toks 里的非 del token 一一对应。
    const posToks = nodeTokensWithPos(tn.node, tn.offset);
    const nonDel = db.toks.filter((t) => t.op !== 'del');
    const aligned = posToks.length === nonDel.length && nonDel.every((t, i) => diffTokKey(t.tok) === posToks[i].key);
    if (!aligned) {
      decos.push(Decoration.node(nodeFrom, nodeTo, { class: CLS_MOD_BLOCK })); // 对不齐 → 整块标,绝不错标
      continue;
    }
    let pi = 0;
    let pendingDel: string[] = [];
    const flushDel = (atPos: number) => {
      if (!pendingDel.length) return;
      const text = pendingDel.join('');
      decos.push(Decoration.widget(atPos, () => delInlineWidget(text), { side: -1, key: 'deltok-' + atPos + '-' + decos.length }));
      pendingDel = [];
    };
    for (const t of db.toks) {
      if (t.op === 'del') {
        pendingDel.push(tokText(t.tok)); // 累积被删的词,遇到下一个存活 token 时就地插入划线 widget
        continue;
      }
      flushDel(posToks[pi].from); // 先把它之前被删的词插在这个位置
      if (t.op === 'ins') decos.push(Decoration.inline(posToks[pi].from, posToks[pi].to, { class: CLS_INS_INLINE }));
      pi++;
    }
    flushDel(Math.max(nodeFrom + 1, nodeTo - 1)); // 段尾被删的词
  }
  return decos;
}
