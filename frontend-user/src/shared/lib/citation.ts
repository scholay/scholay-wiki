/**
 * 论文引用格式生成 —— 移植自 frontend-user/src/utils/citationGenerator.ts。
 *
 * 4 个格式:BibTeX / MLA / APA / Chicago。
 * - BibTeX:smart key(`{lastname}{year}{firstTitleWord}{secondWordInitials}`,
 *   跳过 of/the/in 等停用词)
 * - MLA:首作者 last-name-first,>2 个作者用 et al.,期刊名 `<i>`
 * - APA:全作者 `Last, F. M.` + `&` 连接,期刊名/卷号 `<i>`
 * - Chicago:首作者 last-name-first 其余正向,`and` 连接末位
 *
 * 期刊名 / 卷号用 `<i>...</i>` 包裹 —— 渲染时通过 [[citationItalicParts]]
 * 切成 React 节点,复制时调 [[stripItalic]] 转纯文本。
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

export type CitationFormat = 'bibtex' | 'mla' | 'apa' | 'chicago';

export const CITATION_FORMAT_LABELS: Record<CitationFormat, string> = {
  bibtex: 'BibTeX',
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
};

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

/** 主入口 —— 任意格式 → 字符串(含 `<i>` 标记) */
export function generateCitation(
  paper: CitationPaper | null | undefined,
  format: CitationFormat
): string {
  if (!paper) return '';
  switch (format) {
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
