// 结构体级 Word 式痕迹 diff(见 docs/research/prism-render-surface-2026-06 Part V)。
// 两阶段:① 块对齐(diffArrays + 内容相似度配对「修改」块)② 段落/标题内词级 diff。
// 铁律:math / figure / list / opaque 原子 —— 整块 del+ins,绝不进 KaTeX/公式内部 diff。
import { diffArrays } from 'diff';
import type { DocStruct, DocBlock, DocInline } from '../api/prism';

export type Tok =
  | { t: 'word'; text: string }
  | { t: 'math'; latex: string }
  | { t: 'cite'; key: string };

export type TokDiff = { op: 'same' | 'ins' | 'del'; tok: Tok };

export type DiffBlock =
  | { kind: 'same'; block: DocBlock }
  | { kind: 'ins'; block: DocBlock }
  | { kind: 'del'; block: DocBlock }
  | { kind: 'mod'; oldBlock: DocBlock; newBlock: DocBlock; toks: TokDiff[] };

export interface FMChange {
  field: '标题' | '摘要' | '关键词';
  oldVal: string;
  newVal: string;
}

export interface StructDiff {
  fm: FMChange[];
  blocks: DiffBlock[];
  changed: boolean;
}

// 词切分:优先 Intl.Segmenter(中英文都对),不可用则回退空白/非空白切。用 any 规避 TS lib 差异。
// 导出:原地 diff 装饰(struct-diff-decorations.ts)按同一规则在 PM 文档里定位 token,保证与本文件
// 计算出的词级 diff 对齐(不一致会触发装饰的整块回退)。
export function textToWords(text: string): string[] {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string | undefined, o: unknown) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) {
      const seg = new Seg(undefined, { granularity: 'word' });
      return Array.from(seg.segment(text), (s) => s.segment);
    }
  } catch {
    /* fall through */
  }
  return text.match(/\s+|\S+/g) ?? [];
}

// 把一个块的行内内容拆成 diff 原子:文字→词,公式/引用→单个原子(不切内部)。
// 注:v1 丢弃 bold/italic 标记(修改块内不保留加粗/斜体区分,渲染为普通词)。
function tokenize(block: DocBlock): Tok[] {
  const inls: DocInline[] =
    block.type === 'heading' ? [{ t: 'text', v: block.text ?? '' }] : block.inlines ?? [];
  const out: Tok[] = [];
  for (const i of inls) {
    if (i.t === 'math') out.push({ t: 'math', latex: i.latex ?? '' });
    else if (i.t === 'cite') out.push({ t: 'cite', key: i.key ?? '' });
    else for (const w of textToWords(i.v ?? '')) out.push({ t: 'word', text: w });
  }
  return out;
}

function tokKey(tk: Tok): string {
  return tk.t === 'word' ? 'w:' + tk.text : tk.t === 'math' ? 'm:' + tk.latex : 'c:' + tk.key;
}

function blockPlainText(b: DocBlock): string {
  const base = tokenize(b)
    .map((t) => (t.t === 'word' ? t.text : t.t === 'math' ? '$' + t.latex + '$' : '[' + t.key + ']'))
    .join('');
  if (base) return base;
  // 非文字块:给个稳定判别串,让相同块比较相等(不同则算整块 del+ins)。
  switch (b.type) {
    case 'displayMath':
      return 'M:' + (b.latex ?? '');
    case 'figure':
      return 'F:' + (b.asset ?? '') + (b.caption ?? '');
    case 'list':
      return 'L:' + JSON.stringify(b.items ?? []);
    case 'table':
      return 'T:' + JSON.stringify(b.rows ?? []);
    case 'opaque':
      return 'O:' + (b.rawLatex ?? '');
    default:
      return '';
  }
}

// Dice 系数(bigram 重合),判两块是否算「同一块被修改」。
function dice(a: string, b: string): number {
  if (a === b) return 1;
  const bg = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const A = bg(a);
  const B = bg(b);
  if (A.size === 0 && B.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

// 只有段落/标题算「修改」(词级 diff);math/figure/list/opaque 原子 → 整块 del+ins。
function similar(a: DocBlock, b: DocBlock): boolean {
  if (a.type !== b.type) return false;
  if (a.type !== 'paragraph' && a.type !== 'heading') return false;
  return dice(blockPlainText(a), blockPlainText(b)) >= 0.3;
}

function diffToks(oldToks: Tok[], newToks: Tok[]): TokDiff[] {
  const parts = diffArrays(oldToks, newToks, { comparator: (x, y) => tokKey(x) === tokKey(y) });
  const out: TokDiff[] = [];
  for (const p of parts) {
    const op: TokDiff['op'] = p.added ? 'ins' : p.removed ? 'del' : 'same';
    for (const tk of p.value) out.push({ op, tok: tk });
  }
  return out;
}

function diffBlocks(oldB: DocBlock[], newB: DocBlock[]): DiffBlock[] {
  const parts = diffArrays(oldB, newB, {
    comparator: (a, b) => a.type === b.type && blockPlainText(a) === blockPlainText(b),
  });
  const out: DiffBlock[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      for (const b of p.value) out.push({ kind: 'same', block: b });
      continue;
    }
    if (p.removed && parts[i + 1]?.added) {
      const rem = p.value;
      const add = parts[i + 1].value;
      i++;
      const n = Math.max(rem.length, add.length);
      for (let k = 0; k < n; k++) {
        const o = rem[k];
        const nw = add[k];
        if (o && nw && similar(o, nw)) {
          out.push({ kind: 'mod', oldBlock: o, newBlock: nw, toks: diffToks(tokenize(o), tokenize(nw)) });
        } else {
          if (o) out.push({ kind: 'del', block: o });
          if (nw) out.push({ kind: 'ins', block: nw });
        }
      }
    } else if (p.removed) {
      for (const b of p.value) out.push({ kind: 'del', block: b });
    } else {
      for (const b of p.value) out.push({ kind: 'ins', block: b });
    }
  }
  return out;
}

export function diffStructs(oldDoc: DocStruct, newDoc: DocStruct): StructDiff {
  const fm: FMChange[] = [];
  const of = oldDoc.frontMatter ?? { title: '' };
  const nf = newDoc.frontMatter ?? { title: '' };
  if ((of.title ?? '') !== (nf.title ?? '')) fm.push({ field: '标题', oldVal: of.title ?? '', newVal: nf.title ?? '' });
  if ((of.abstract ?? '') !== (nf.abstract ?? '')) fm.push({ field: '摘要', oldVal: of.abstract ?? '', newVal: nf.abstract ?? '' });
  const ok = (of.keywords ?? []).join(', ');
  const nk = (nf.keywords ?? []).join(', ');
  if (ok !== nk) fm.push({ field: '关键词', oldVal: ok, newVal: nk });

  const blocks = diffBlocks(oldDoc.body ?? [], newDoc.body ?? []);
  const changed = fm.length > 0 || blocks.some((b) => b.kind !== 'same');
  return { fm, blocks, changed };
}
