// 引用「真实 LaTeX 样式」渲染引擎 —— 行内 [@key] → [1][2] 编号,交叉引用 [@fig:x] → 图 N,
// 文末「参考文献」编号列表(从 bibliography 的 BibTeX 解析作者/标题/年份)。
// StructEditor(所见即所得)与 PrismLivePreview(流式)共用同一套编号 + 格式化,两面一致。
//
// 编号 = **出现顺序**(像 IEEE/unsrt.bst;projector 用 plain.bst 是按作者字母,但预览是近似,
// 出现顺序对读者更直观也是常见 LaTeX 风格)。真源仍是结构体,这里纯展示。
import type { DocBlock, DocInline } from '../api/prism';

const CROSSREF_PREFIXES = ['fig:', 'tbl:', 'sec:', 'eq:', 'lst:', 'alg:', 'app:'] as const;

/** [@key] 是交叉引用锚(fig:/tbl:/sec:/eq:/lst:/alg:/app: → \ref)而非文献引用(→ \cite)。镜像后端 projector.isCrossRefKey。 */
export function isCrossRefKey(key: string): boolean {
  return CROSSREF_PREFIXES.some((p) => key.startsWith(p));
}

/** 把 [@...] 内容拆成干净 citekey:pandoc 多引用 [@a; @b] + 存量结构体里未愈的复合键 "a; @b"。镜像后端 splitCiteKeys。 */
export function splitCiteKeys(raw: string): string[] {
  return raw
    .split(/[;,\s]+/)
    .map((s) => s.replace(/^@/, '').trim())
    .filter(Boolean);
}

export interface CiteNumbering {
  lit: Map<string, number>; // 文献 key → 编号(出现顺序)
  litOrder: string[]; // 文献 key 按编号顺序(供参考文献表)
  cross: Map<string, number>; // 交叉引用锚 label(fig:x/tbl:y…)→ 该类型内的序号
}

const CROSS_LABEL: Record<string, (n: number | string) => string> = {
  'fig:': (n) => `图 ${n}`,
  'tbl:': (n) => `表 ${n}`,
  'eq:': (n) => `式 (${n})`,
  'sec:': (n) => `第 ${n} 节`,
  'lst:': (n) => `代码 ${n}`,
  'alg:': (n) => `算法 ${n}`,
  'app:': (n) => `附录 ${n}`,
};

function prefixOf(key: string): string {
  return CROSSREF_PREFIXES.find((p) => key.startsWith(p)) ?? '';
}

/** 交叉引用锚 → 展示文本(图 N / 表 N / 式 (N) …);未编号则退化成裸 key。 */
export function crossRefText(key: string, n: CiteNumbering): string {
  const pfx = prefixOf(key);
  if (!pfx) return key;
  const num = n.cross.get(key);
  return CROSS_LABEL[pfx](num ?? '?');
}

/** 一个 cite inline(可能复合 / 多引用)→ 展示文本:文献 [1, 2],交叉引用 图 1、表 2。 */
export function citeDisplay(rawKey: string, n: CiteNumbering): string {
  const keys = splitCiteKeys(rawKey);
  const nums: string[] = [];
  const cross: string[] = [];
  for (const k of keys) {
    if (isCrossRefKey(k)) {
      cross.push(crossRefText(k, n));
    } else {
      const num = n.lit.get(k);
      nums.push(num ? String(num) : k);
    }
  }
  if (cross.length && !nums.length) return cross.join('、');
  if (nums.length) return `[${nums.join(', ')}]`;
  return `[${keys.join(', ')}]`;
}

// ── 编号构建(两种来源:结构体 body / 流式 markdown)────────────────────────

function newNumbering(): CiteNumbering {
  return { lit: new Map(), litOrder: [], cross: new Map() };
}

function addCross(n: CiteNumbering, counters: Record<string, number>, label: string) {
  const pfx = prefixOf(label);
  if (!pfx || n.cross.has(label)) return;
  counters[pfx] = (counters[pfx] ?? 0) + 1;
  n.cross.set(label, counters[pfx]);
}

function addLit(n: CiteNumbering, key: string) {
  if (isCrossRefKey(key) || n.lit.has(key)) return;
  n.lit.set(key, n.lit.size + 1);
  n.litOrder.push(key);
}

/** 从结构体 body 建编号(StructEditor 用)。先给带 label 的块(图/表/式/节)编号,再按出现顺序编文献。 */
export function buildNumberingFromBody(body: DocBlock[]): CiteNumbering {
  const n = newNumbering();
  const counters: Record<string, number> = {};
  // 交叉引用目标:块的 label(figure→fig: / table→tbl: / displayMath→eq: / heading→sec:)。
  for (const b of body ?? []) {
    if (b.label) addCross(n, counters, b.label);
  }
  // 文献引用:遍历所有行内 cite(段落 + 列表项),出现顺序编号。
  const scan = (inls?: DocInline[]) => {
    for (const i of inls ?? []) {
      if (i.t === 'cite') for (const k of splitCiteKeys(i.key ?? '')) addLit(n, k);
    }
  };
  for (const b of body ?? []) {
    scan(b.inlines);
    if (b.items) for (const it of b.items) scan(it);
  }
  return n;
}

/** 从流式 markdown 建编号(PrismLivePreview 用)。锚 {#fig:x} 给交叉引用编号,[@key] 给文献编号(均按出现顺序)。 */
export function buildNumberingFromMarkdown(md: string): CiteNumbering {
  const n = newNumbering();
  const counters: Record<string, number> = {};
  // 锚 {#label}:出现顺序给交叉引用目标编号。
  const anchorRe = /\{#([a-zA-Z]+:[^}]+)\}/g;
  let a: RegExpExecArray | null;
  while ((a = anchorRe.exec(md)) !== null) addCross(n, counters, a[1].trim());
  // [@...]:文献引用出现顺序编号(跳过交叉引用)。
  const citeRe = /\[@([^\]]+)\]/g;
  let c: RegExpExecArray | null;
  while ((c = citeRe.exec(md)) !== null) {
    for (const k of splitCiteKeys(c[1])) addLit(n, k);
  }
  return n;
}

// ── BibTeX 解析 + 参考文献格式化 ─────────────────────────────────────────

export interface RefEntry {
  key: string;
  authors: string;
  title: string;
  venue: string;
  year: string;
}

function stripBraces(s: string): string {
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function initials(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((g) => g[0].toUpperCase() + '.')
    .join(' ');
}

function formatAuthors(raw: string): string {
  if (!raw) return '';
  const list = stripBraces(raw)
    .split(/\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  const fmt = list.map((a) => {
    if (a.includes(',')) {
      const [last, first] = a.split(',');
      return first?.trim() ? `${last.trim()}, ${initials(first)}` : last.trim();
    }
    const parts = a.split(/\s+/);
    if (parts.length === 1) return parts[0];
    const last = parts.pop() as string;
    return `${last}, ${initials(parts.join(' '))}`;
  });
  if (fmt.length > 6) return `${fmt.slice(0, 6).join(', ')}, et al.`;
  return fmt.join(', ');
}

/** 解析一条 BibTeX → 参考文献展示字段。正则解析(容一层嵌套花括号),够预览用。 */
export function parseBibEntry(key: string, bibtex: string): RefEntry {
  const fields: Record<string, string> = {};
  const fieldRe = /(\w+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|([^,}\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(bibtex)) !== null) {
    const name = m[1].toLowerCase();
    const val = stripBraces(m[2] ?? m[3] ?? m[4] ?? '');
    if (val) fields[name] = val;
  }
  return {
    key,
    authors: formatAuthors(fields.author ?? ''),
    title: fields.title ?? '',
    venue: fields.journal || fields.booktitle || fields.publisher || fields.school || '',
    year: fields.year ?? '',
  };
}

/** 已引用的文献(按编号顺序)→ 参考文献条目(编号 + 解析后的 RefEntry)。未在 bib 里的 key 用裸 key 兜底。 */
export function buildReferenceList(
  numbering: CiteNumbering,
  bibliography: Record<string, string> | undefined
): { num: number; entry: RefEntry }[] {
  const bib = bibliography ?? {};
  return numbering.litOrder.map((key, i) => ({
    num: i + 1,
    entry: bib[key] ? parseBibEntry(key, bib[key]) : { key, authors: '', title: key, venue: '', year: '' },
  }));
}
