/**
 * 交付物预览分类 —— 据 kind + MIME + 扩展名挑预览渲染器。纯函数。
 *
 * SVG 刻意不归 image(后端按光栅图白名单已拒 svg;且内联 svg 可执行脚本),归 code/text。
 * archive(zip / 目录)与未知二进制 → 只下载,不预览(符合需求:zip 只下载)。
 */

export type ArtifactCategory =
  | 'image'
  | 'svg' // 内联 SVG → DOMPurify 清洗后渲染(不归 image:img 不渲染 svg 脚本但我们要内联展示矢量图)
  | 'figure' // 细胞图配方 JSON(*.fig.json)→ composeFigure 渲染成静态 SVG(sci_draw A 车道产物,只读)
  | 'pdf'
  | 'html' // 完整 HTML 文档 → 沙箱 iframe 渲染(可切源码)
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
  // 细胞图配方:*.fig.json。必须在 json 分支之前(x.fig.json 的 ext 是 json)。
  if (a.name.toLowerCase().endsWith('.fig.json')) return 'figure';
  if (e === 'svg' || m === 'image/svg+xml') return 'svg'; // 在 image 之前:svg 走清洗内联,不当光栅图
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
  // HTML 完整文档:渲染成网页(沙箱 iframe),不当代码原文。必须在 CODE_LANG 之前(html 在 CODE_LANG 里)。
  if (e === 'html' || e === 'htm' || m === 'text/html') return 'html';
  if (CODE_LANG[e]) return 'code';
  if (e === 'txt' || m.startsWith('text/')) return 'text';
  return 'unpreviewable';
}

/** 该分类是否需要拉原始字节做客户端渲染(图片/PDF 走 URL 直读,不在此列)。 */
export function categoryNeedsBytes(c: ArtifactCategory): boolean {
  return (
    c === 'markdown' ||
    c === 'text' ||
    c === 'code' ||
    c === 'json' ||
    c === 'spreadsheet' ||
    c === 'docx' ||
    c === 'svg' || // 需取字节解码出 SVG 源文本 → DOMPurify 清洗后渲染
    c === 'figure' || // 需取字节解码出细胞图配方 JSON → composeFigure 渲染 SVG
    c === 'html' // 需取字节解码出 HTML 文本 → 沙箱 iframe srcDoc 渲染
  );
}
