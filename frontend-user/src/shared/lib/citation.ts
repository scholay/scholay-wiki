/**
 * 论文引用格式生成 —— 移植自 frontend-user/src/utils/citationGenerator.ts。
 *
 * 5 个格式:GB/T 7714 / BibTeX / APA / MLA / Chicago。
 * - GB/T 7714:中国国标(numeric)。`作者. 题名[J]. 刊名, 年, 卷: 页码.`
 *   作者「姓 + 名首字母」,>3 人取前 3 + 「等」;会议/论文集用 [C] 否则 [J];无斜体。
 *   面向中文用户写学位论文/中文期刊的本土刚需,国际样式库不覆盖。
 * - BibTeX:smart key(`{lastname}{year}{firstTitleWord}{secondWordInitials}`,
 *   跳过 of/the/in 等停用词)
 * - MLA:首作者 last-name-first,>2 个作者用 et al.,期刊名 `<i>`
 * - APA:全作者 `Last, F. M.` + `&` 连接,期刊名/卷号 `<i>`
 * - Chicago:首作者 last-name-first 其余正向,`and` 连接末位
 *
 * 期刊名 / 卷号用 `<i>...</i>` 包裹 —— 渲染时通过 [[citationItalicParts]]
 * 切成 React 节点,复制时调 [[stripItalic]] 转纯文本。(GB/T 7714 无斜体)
 *
 * 新增/调整格式集合时只改本文件:[[CITATION_FORMATS]] 是消费方(PaperFooter /
 * CitationDialog / 引用生成器工具页)共享的单一真源,别再各自维护一份数组。
 */

export interface CitationAuthor {
  name?: string | undefined;
}

export interface CitationJournal {
  volume?: string;
  pages?: string;
}

/**
 * 引用输入 —— 全字段可选,刻意宽松接 v2 `Paper`(没 volume/pages)和后续可能
 * 接入的更富类型。注意 `authors[].name` 也是可选的(对齐 v2 PaperAuthor)。
 */
export interface CitationPaper {
  paperId?: string;
  title?: string;
  authors?: CitationAuthor[];
  year?: number | string;
  venue?: string;
  journal?: CitationJournal;
}

export type CitationFormat = 'gbt7714' | 'bibtex' | 'mla' | 'apa' | 'chicago';

export const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = {
  gbt7714: 'GB/T 7714',
  bibtex: 'BibTeX',
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
};

/**
 * 展示顺序的单一真源 —— GB/T 7714 排首位(中文用户最常用)。
 * PaperFooter / CitationDialog / 引用生成器工具页都 import 它,新增格式只改这里。
 */
export const CITATION_FORMATS: readonly CitationFormat[] = [
  'gbt7714',
  'bibtex',
  'apa',
  'mla',
  'chicago',
];

/** BibTeX 用等宽 pre 渲染,其余走 prose 段落。 */
export function isMonoCitation(format: CitationFormat): boolean {
  return format === 'bibtex';
}

/** 默认引用格式的 localStorage key —— 详情页 Footer / 弹窗 / 工具页共用一个,行为一致。 */
export const CITE_FORMAT_STORAGE_KEY = 'scholay.cite-format';

function isCitationFormat(v: string | null): v is CitationFormat {
  return v != null && (CITATION_FORMATS as readonly string[]).includes(v);
}

/** 读默认格式(读不到/非法时回退到调用方给的 fallback,保留各处历史默认)。 */
export function readDefaultCitationFormat(
  fallback: CitationFormat
): CitationFormat {
  if (typeof localStorage === 'undefined') return fallback;
  const saved = localStorage.getItem(CITE_FORMAT_STORAGE_KEY);
  return isCitationFormat(saved) ? saved : fallback;
}

/** 写默认格式。 */
export function setDefaultCitationFormat(f: CitationFormat): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CITE_FORMAT_STORAGE_KEY, f);
}

const STOP_WORDS = new Set([
  'of', 'the', 'in', 'for', 'and', 'a', 'an', 'to', 'on',
]);

function authorName(a: CitationAuthor | undefined): string {
  return (a?.name ?? '').trim();
}

function generateBibtex(paper: CitationPaper): string {
  const authors = paper.authors ?? [];
  const title = paper.title || 'Untitled';
  const year = paper.year ?? 'n.d.';
  const venue = paper.venue || '';
  const volume = paper.journal?.volume || '';
  const pages = paper.journal?.pages || '';

  const firstAuthor = authorName(authors[0]) || 'Unknown';
  const lastName = firstAuthor.split(/\s+/).pop() ?? firstAuthor;

  const titleWords = title
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  const firstTitleWord =
    titleWords[0]?.replace(/[^a-zA-Z]/g, '') || 'Paper';
  const secondTitleWord = titleWords[1]?.replace(/[^a-zA-Z]/g, '') || '';
  const secondWordInitials = secondTitleWord.slice(0, 2).toUpperCase();

  const bibtexKey = `${lastName}${year}${firstTitleWord}${secondWordInitials}`;

  let out = `@article{${bibtexKey},\n  title={${title}},\n  author={${authors
    .map(authorName)
    .filter(Boolean)
    .join(' and ')}}`;
  if (venue) out += `,\n  journal={${venue}}`;
  if (year) out += `,\n  year={${year}}`;
  if (volume) out += `,\n  volume={${volume}}`;
  if (pages) out += `,\n  pages={${pages}}`;
  out += `\n}`;
  return out;
}

function generateMLA(paper: CitationPaper): string {
  const authors = paper.authors ?? [];
  const title = paper.title || 'Untitled';
  const year = paper.year ?? 'n.d.';
  const venue = paper.venue || '';
  const volume = paper.journal?.volume || '';
  const pages = paper.journal?.pages || '';

  let authorStr = 'Unknown';
  if (authors.length > 0) {
    const firstName = authorName(authors[0]);
    const firstAuthorParts = firstName.split(/\s+/);
    const firstAuthorFormatted =
      firstAuthorParts.length > 1
        ? `${firstAuthorParts[firstAuthorParts.length - 1]}, ${firstAuthorParts
            .slice(0, -1)
            .join(' ')}`
        : firstName;

    if (authors.length === 1) {
      authorStr = firstAuthorFormatted;
    } else if (authors.length === 2) {
      authorStr = `${firstAuthorFormatted}, and ${authorName(authors[1])}`;
    } else {
      authorStr = `${firstAuthorFormatted} et al.`;
    }
  }

  let out = `${authorStr}. "${title}."`;
  if (venue) out += ` <i>${venue}</i>`;
  if (volume) out += ` ${volume}`;
  if (year && pages) out += ` (${year}): ${pages}`;
  else if (year) out += ` (${year})`;
  else if (pages) out += `: ${pages}`;
  out += '.';
  return out;
}

function generateAPA(paper: CitationPaper): string {
  const authors = paper.authors ?? [];
  const title = paper.title || 'Untitled';
  const year = paper.year ?? 'n.d.';
  const venue = paper.venue || '';
  const volume = paper.journal?.volume || '';
  const pages = paper.journal?.pages || '';

  let authorStr = 'Unknown';
  if (authors.length > 0) {
    const apaFormatted = authors.map((a) => {
      const name = authorName(a);
      const parts = name.split(/\s+/);
      if (parts.length > 1) {
        const initials = parts
          .slice(0, -1)
          .map((n) => n[0] + '.')
          .join(' ');
        return `${parts[parts.length - 1]}, ${initials}`;
      }
      return name;
    });

    if (apaFormatted.length === 1) {
      authorStr = apaFormatted[0];
    } else if (apaFormatted.length === 2) {
      authorStr = `${apaFormatted[0]}, & ${apaFormatted[1]}`;
    } else {
      authorStr = `${apaFormatted.slice(0, -1).join(', ')}, & ${
        apaFormatted[apaFormatted.length - 1]
      }`;
    }
  }

  let out = `${authorStr} (${year}). ${title}.`;
  if (venue && volume) out += ` <i>${venue}, ${volume}</i>`;
  else if (venue) out += ` <i>${venue}</i>`;
  else if (volume) out += ` <i>${volume}</i>`;
  if (pages) out += `, ${pages}`;
  out += '.';
  return out;
}

function generateChicago(paper: CitationPaper): string {
  const authors = paper.authors ?? [];
  const title = paper.title || 'Untitled';
  const year = paper.year ?? 'n.d.';
  const venue = paper.venue || '';
  const volume = paper.journal?.volume || '';
  const pages = paper.journal?.pages || '';

  let authorStr = 'Unknown';
  if (authors.length > 0) {
    const chicagoFormatted = authors.map((a) => {
      const name = authorName(a);
      const parts = name.split(/\s+/);
      if (parts.length > 1) {
        return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
      }
      return name;
    });
    if (chicagoFormatted.length === 1) {
      authorStr = chicagoFormatted[0];
    } else if (chicagoFormatted.length === 2) {
      authorStr = `${chicagoFormatted[0]}, and ${chicagoFormatted[1]}`;
    } else {
      authorStr = `${chicagoFormatted.slice(0, -1).join(', ')}, and ${
        chicagoFormatted[chicagoFormatted.length - 1]
      }`;
    }
  }

  let out = `${authorStr}. "${title}."`;
  if (venue) out += ` <i>${venue}</i>`;
  if (volume) out += ` ${volume}`;
  if (year) out += ` (${year})`;
  if (pages) out += `: ${pages}`;
  out += '.';
  return out;
}

/**
 * GB/T 7714-2015(顺序编码制,期刊文章)。
 *
 * 形如:`作者. 题名[J]. 刊名, 年, 卷: 页码.`
 * - 作者:`姓 名首字母`(末位 token 当姓,其余取首字母大写,与本文件其它格式同口径
 *   的朴素拆名);>3 人取前 3 + 「等」。
 * - 文献类型标志:刊名含 conference/proceedings/workshop/symposium/congress → [C],
 *   否则默认 [J]。
 * - 无斜体(国标不用斜体)。卷/页缺失则省略对应片段,不留悬空标点。
 */
function gbtAuthor(a: CitationAuthor | undefined): string {
  const name = authorName(a);
  if (!name) return '';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const surname = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .join(' ');
  return initials ? `${surname} ${initials}` : surname;
}

function generateGBT7714(paper: CitationPaper): string {
  const authors = (paper.authors ?? []).map(gbtAuthor).filter(Boolean);
  const title = paper.title || 'Untitled';
  const year = paper.year ?? '';
  const venue = paper.venue || '';
  const volume = paper.journal?.volume || '';
  // 页码:en/em dash 归一成连字符,去空格
  const pages = (paper.journal?.pages || '').replace(/[–—]/g, '-').trim();

  let authorStr = '';
  if (authors.length > 0 && authors.length <= 3) {
    authorStr = authors.join(', ');
  } else if (authors.length > 3) {
    authorStr = `${authors.slice(0, 3).join(', ')}, 等`;
  }

  const typeMark = /conference|proceedings|workshop|symposium|congress/i.test(
    venue
  )
    ? '[C]'
    : '[J]';

  // 源信息段:刊名,后接「, 年, 卷」;无刊名时年/卷单独成段;再接「: 页码」。
  const segs: string[] = [];
  if (venue) segs.push(venue);
  const yv: string[] = [];
  if (year) yv.push(String(year));
  if (volume) yv.push(volume);
  const yvStr = yv.join(', ');
  if (yvStr) {
    if (segs.length) segs[segs.length - 1] = `${segs[segs.length - 1]}, ${yvStr}`;
    else segs.push(yvStr);
  }
  let tail = segs.join(', ');
  if (pages) tail += `${tail ? ': ' : ''}${pages}`;

  const head = authorStr ? `${authorStr}. ` : '';
  return `${head}${title}${typeMark}.${tail ? ` ${tail}.` : ''}`;
}

/** 主入口 —— 任意格式 → 字符串(含 `<i>` 标记;GB/T 7714 无标记) */
export function generateCitation(
  paper: CitationPaper | null | undefined,
  format: CitationFormat
): string {
  if (!paper) return '';
  switch (format) {
    case 'gbt7714':
      return generateGBT7714(paper);
    case 'bibtex':
      return generateBibtex(paper);
    case 'mla':
      return generateMLA(paper);
    case 'apa':
      return generateAPA(paper);
    case 'chicago':
      return generateChicago(paper);
  }
}

/** 复制到剪贴板时调用 —— 去 `<i>` 标记转纯文本 */
export function stripItalic(s: string): string {
  return s.replace(/<\/?i>/g, '');
}

/**
 * 将含 `<i>` 标记的串切成 (string | { italic: string }) 数组,
 * 渲染端 map 一遍即可:`<i>` 段包 `<i>...</i>` JSX,其余直接出 string。
 * 不引 DOMPurify 是因为这里只能出现 `<i>` 两种标记,自己切更轻量更安全。
 */
export function citationItalicParts(
  s: string
): Array<string | { italic: string }> {
  return s
    .split(/(<i>[\s\S]*?<\/i>)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith('<i>') ? { italic: p.slice(3, -4) } : p));
}
