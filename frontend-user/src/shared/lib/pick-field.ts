/**
 * 文件夹内论文的字段展示策略 —— "og 优先, fallback 到元数据, 都空不显示"
 *
 * 背景:
 *   一条 user_library_papers 行有两套字段:
 *     - 元数据 (title / abstract / authors / year / venue / doi): 上游搜索源
 *       (stc / olx / pmd) 收藏时冻结的快照, 永远不被用户编辑污染
 *     - og_* (og_title / og_abstract / ...): "用户那一边的真值",
 *       PDF 抽取 + 手动编辑共用这组列
 *
 * 展示决策:
 *   1) og_xx 非空 → 用 og_xx
 *   2) og_xx 空 → 用元数据
 *   3) 都空 → 不渲染
 *
 * 整个「我的文件夹」UI (卡片 / 详情 pane / 编辑预览) 都过这层 helper,
 * 不要在组件里散落 `row.title || row.og_title` 这种写法。
 */
import type { PaperAuthor, UserLibraryPaper } from '@/shared/api/types';

/** 字符串字段: og 非空字符串就用 og, 否则 fallback 到元数据, 都空返回 '' */
export function pickString(og: string | undefined, meta: string | undefined): string {
  const o = (og ?? '').trim();
  if (o) return o;
  return (meta ?? '').trim();
}

/** 数值字段 (年份): og 非 0 / 非 null 就用 og, 否则 fallback */
export function pickNumber(
  og: number | null | undefined,
  meta: number | null | undefined
): number | undefined {
  if (typeof og === 'number' && og > 0) return og;
  if (typeof meta === 'number' && meta > 0) return meta;
  return undefined;
}

/** 作者数组: og 非空数组就用 og, 否则用元数据数组, 都空返回 [] */
export function pickAuthors(
  og: PaperAuthor[] | undefined,
  meta: PaperAuthor[] | undefined
): PaperAuthor[] {
  if (og && og.length > 0) return og;
  return meta ?? [];
}

/**
 * 一次性算出一条 paper 的全部 "有效字段" —— 卡片渲染统一用这个 derived view,
 * 不要直接访问 paper.title / paper.og_title。
 */
export interface EffectivePaperFields {
  title: string;
  abstract: string;
  authors: PaperAuthor[];
  year: number | undefined;
  venue: string;
  doi: string;
  /** 标识有任意 og 字段在生效 —— 编辑弹窗 "已修改" 标记或调试用 */
  hasOgOverride: boolean;
}

/**
 * 该行是否有"本地保留信息"(og_* 任一非空)。
 * 用途:在线关联 footer hint(本地字段会继续压住新关联的上游信息)、
 * 编辑弹窗"已修改"标记等。
 * (取消关联已不再以此置灰 —— 后端快照式 unlink 会自动固化当前展示值。)
 */
export function hasLocalOverride(paper: UserLibraryPaper): boolean {
  return Boolean(
    (paper.og_title ?? '').trim() ||
      (paper.og_abstract ?? '').trim() ||
      (paper.og_authors && paper.og_authors.length > 0) ||
      (typeof paper.og_year === 'number' && paper.og_year > 0) ||
      (paper.og_venue ?? '').trim() ||
      (paper.og_doi ?? '').trim()
  );
}

/**
 * 该条目是否"有自己的东西"(非空壳)—— 与后端空壳守卫同一口径:
 *
 *   hasOwnSubstance = hasLocalOverride(paper)(任一 og_* 本地信息非空)
 *                     || 已上传 PDF(pdf_uploaded_at 或 pdf_sha256 非空)
 *
 * ⚠️ 注意 pdf_url 是在线数据列(收藏时带过来的 OA 直链),**不代表用户上传过 PDF**,
 * 不参与此判定。
 *
 * 空壳规则:linked 行若两者皆无,其展示内容全部来自在线数据快照 —— 此时
 * 「取消关联」会让条目变成不含任何信息的空数据,入口应置灰;同理 free 行
 * 无本地信息时「移除 PDF」会清掉条目仅剩的内容,也应置灰。
 */
export function hasOwnSubstance(paper: UserLibraryPaper): boolean {
  return (
    hasLocalOverride(paper) ||
    Boolean(paper.pdf_uploaded_at) ||
    Boolean((paper.pdf_sha256 ?? '').trim())
  );
}

export function pickEffectiveFields(paper: UserLibraryPaper): EffectivePaperFields {
  const title = pickString(paper.og_title, paper.title);
  const abstract = pickString(paper.og_abstract, paper.abstract);
  const authors = pickAuthors(paper.og_authors, paper.authors);
  const year = pickNumber(paper.og_year, paper.year);
  const venue = pickString(paper.og_venue, paper.venue);
  const doi = pickString(paper.og_doi, paper.doi);

  return { title, abstract, authors, year, venue, doi, hasOgOverride: hasLocalOverride(paper) };
}
