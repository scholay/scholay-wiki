/**
 * 文献集 · 写入侧序列化器(纯 TS,零 React / 网络)。
 *
 * 背景:多个入口(在线关联 / 手动编辑 / PDF 上传填充)各自维护过一份私有转换函数,
 * 行为基本一致却散落各处 —— 尤其 `SearchHit → ConfirmLink` 在 PaperRelinkDialog 与
 * PdfUploadTab 是逐字重复的两份。这里收编为单一真源:
 *   - keyOfHit            候选单选 key
 *   - hitToConfirmLink    SearchHit → confirm/relink 的 link 入参(两处共用)
 *   - sourceBrandLabel    source 缩写 → 文献搜索品牌名
 *   - authorsToInputText  作者数组 → 可编辑输入框文本(收编 authorsToText / hitAuthorsToText)
 *   - formatAuthorsDisplay 作者展示串(前 5 + et al)
 *   - textToAuthors       输入框文本 → 作者数组
 *
 * 读取侧请用 [[pick-field]](og → metadata → 空)。
 * 表单 → og_* payload 的转换(差量 / 全量)已随表单统一收编到 hooks/useMetadataForm
 * 的 formToOgPayload(依赖 RHF dirtyFields,与本文件的纯 hit/作者序列化器分层)。
 */
import type { PaperAuthor } from '@/shared/api/types';
import type { ConfirmLink, SearchHit } from '../api/upload-resolve';

/** hit 唯一标识 "source:source_paper_id" —— 候选单选 key。 */
export function keyOfHit(h: SearchHit): string {
  return `${h.source}:${h.source_paper_id}`;
}

/** SearchHit → confirm/relink 的 link 入参(在线关联与 PDF 链接 confirm 共用)。 */
export function hitToConfirmLink(h: SearchHit): ConfirmLink {
  return {
    source: h.source,
    source_paper_id: h.source_paper_id,
    title: h.title,
    abstract: h.abstract,
    year: h.year,
    venue: h.venue,
    doi: h.doi,
    citation_count: h.citation_count,
    pdf_url: h.pdf_url,
    authors: h.authors,
    raw: h.raw,
  };
}

/** source 缩写 → 文献搜索品牌名(与 features/search 侧栏 SOURCE_OPTIONS 对齐)。
 *  stc=Semantic Scholar→Graph,olx=OpenAlex→Discovery,pmd=PubMed→Medicine。 */
export function sourceBrandLabel(s: string): string {
  if (s === 'stc') return 'Graph';
  if (s === 'olx') return 'Discovery';
  if (s === 'pmd') return 'Medicine';
  return s;
}

/** 从任意作者数组取名字数组(兼容 string[] 与 {name}[]),去空。不 trim,与历史行为一致。 */
function authorNames(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object' && 'name' in a) {
        const n = (a as { name?: unknown }).name;
        return typeof n === 'string' ? n : '';
      }
      return '';
    })
    .filter(Boolean);
}

/**
 * 作者数组 → 可编辑输入框文本。默认逗号分隔(PDF 填充);手动编辑传 '; '。
 * 收编原 PdfUploadFill.hitAuthorsToText(', ')与 PaperEditDialog.authorsToText('; ')。
 */
export function authorsToInputText(authors: unknown, sep = ', '): string {
  return authorNames(authors).join(sep);
}

/** 作者展示串:取前 5 个,超出标 "et al. (N authors)"。收编 PaperRelinkDialog.formatAuthors。 */
export function formatAuthorsDisplay(authors: unknown): string {
  const names = authorNames(authors);
  if (names.length === 0) return '';
  const head = names.slice(0, 5).join(', ');
  return names.length > 5 ? `${head}, et al. (${names.length} authors)` : head;
}

/** 可编辑输入框文本 → 作者数组(分隔符 ; ; , , 与换行)。收编 PaperEditDialog.textToAuthors。 */
export function textToAuthors(text: string): PaperAuthor[] {
  return text
    .split(/[;；,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
