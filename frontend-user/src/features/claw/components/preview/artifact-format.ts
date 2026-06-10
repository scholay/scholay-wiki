/**
 * 交付物预览分类 —— 据 kind + MIME + 扩展名挑预览渲染器。纯函数。
 *
 * SVG 刻意不归 image(后端按光栅图白名单已拒 svg;且内联 svg 可执行脚本),归 code/text。
 * archive(zip / 目录)与未知二进制 → 只下载,不预览(符合需求:zip 只下载)。
 */

export type ArtifactCategory =
  | 'image'
  | 'pdf'
  | 'markdown'
  | 'spreadsheet' // xlsx / xls / csv / tsv → SheetJS 表格
  | 'docx'
  | 'json'
  | 'code'
  | 'text'
  | 'archive' // zip / 目录 → 只下载
  | 'unpreviewable';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];

// 扩展名 → highlight.js 语言名(rehype-highlight 用)。
const CODE_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  rs: 'rust',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  tex: 'latex',
  bib: 'bibtex',
  r: 'r',
  m: 'matlab',
  lua: 'lua',
  dockerfile: 'dockerfile',
};

/** 取小写扩展名(无扩展名 → '')。 */
export function artifactExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** code 类的 highlight 语言名(非 code → '')。 */
export function artifactCodeLang(name: string): string {
  return CODE_LANG[artifactExt(name)] || '';
}

export function artifactCategory(a: {
  name: string;
  mime?: string;
  kind?: 'file' | 'dir';
}): ArtifactCategory {
  if (a.kind === 'dir') return 'archive';
  const e = artifactExt(a.name);
  const m = (a.mime || '').toLowerCase();

  if (e === 'zip' || m === 'application/zip' || m === 'application/x-zip-compressed') return 'archive';
  if (IMAGE_EXT.includes(e) || (m.startsWith('image/') && m !== 'image/svg+xml')) return 'image';
  if (e === 'pdf' || m === 'application/pdf') return 'pdf';
  if (e === 'md' || e === 'markdown' || m === 'text/markdown') return 'markdown';
  if (
    e === 'xlsx' ||
    e === 'xls' ||
    e === 'csv' ||
    e === 'tsv' ||
    m.includes('spreadsheetml') ||
    m.includes('ms-excel') ||
    m === 'text/csv' ||
    m === 'text/tab-separated-values'
  ) {
    return 'spreadsheet';
  }
  if (e === 'docx' || m.includes('wordprocessingml')) return 'docx';
  if (e === 'json' || e === 'jsonl' || m === 'application/json') return 'json';
  if (CODE_LANG[e]) return 'code';
  if (e === 'txt' || m.startsWith('text/')) return 'text';
  return 'unpreviewable';
}

/** 该分类是否需要拉原始字节做客户端渲染(图片/PDF 走 URL 直读,不在此列)。 */
export function categoryNeedsBytes(c: ArtifactCategory): boolean {
  return c === 'markdown' || c === 'text' || c === 'code' || c === 'json' || c === 'spreadsheet' || c === 'docx';
}
