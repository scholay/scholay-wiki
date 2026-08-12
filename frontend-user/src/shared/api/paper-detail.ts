import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_COLD, STALE_COOL } from '@/shared/lib/query-config';
import type { Paper, PaperAuthor, UpstreamSource } from '@/shared/api/types';

/**
 * 论文详情兜底拉取 —— 仅在 tabs store 没有缓存(分享链接 / 清缓存 / 跨设备)
 * 时调用。已有 tab 数据时不应触发(详情页通过 enabled 守门)。
 *
 * 当前后端 GET /public/papers/:paperId 不要求 source,但我们仍把 source 加进
 * queryKey,免得不同源的同 id 串数据。
 */
interface FetchPaperOptions {
  source: UpstreamSource;
  paperId: string;
  enabled: boolean;
}

/** 论文详情的 queryKey/staleTime —— hook 与 route loader 的 prefetch 必须共用,键漂移=白预取。 */
export const paperDetailQueryKey = (source: UpstreamSource, paperId: string) =>
  ['paper', 'detail', source, paperId] as const;
export const PAPER_DETAIL_STALE_TIME = STALE_COOL;

/** 独立 fetcher —— useFetchPaperDetail 与 browser 路由 loader 的 prefetch 共用。 */
export async function fetchPaperDetail(
  source: UpstreamSource,
  paperId: string
): Promise<Paper> {
  try {
    const { data } = await http.get<{ data: Record<string, unknown> }>(
      `/public/papers/${encodeURIComponent(paperId)}`
    );
    const raw = data.data ?? {};
    // 后端 minicod.Paper 字段大多与前端 Paper 一致,补 source 让 PaperDetailPane
    // 能正确显示 stc / olx / pmd 来源 badge
    return {
      paperId: String(raw.paperId ?? paperId),
      title: raw.title as string | undefined,
      abstract: raw.abstract as string | undefined,
      year: raw.year as number | undefined,
      venue: raw.venue as string | undefined,
      url: raw.url as string | undefined,
      citationCount: raw.citationCount as number | undefined,
      referenceCount: raw.referenceCount as number | undefined,
      isOpenAccess: raw.isOpenAccess as boolean | undefined,
      authors: raw.authors as Paper['authors'],
      fieldsOfStudy: raw.fieldsOfStudy as string[] | undefined,
      source,
    };
  } catch (err) {
    throw toApiError(err);
  }
}

export function useFetchPaperDetail({
  source,
  paperId,
  enabled,
}: FetchPaperOptions) {
  return useQuery({
    queryKey: paperDetailQueryKey(source, paperId),
    enabled: enabled && !!paperId,
    staleTime: PAPER_DETAIL_STALE_TIME,
    queryFn: () => fetchPaperDetail(source, paperId),
  });
}

// ============================================================================
// References —— GET /public/papers/:paperId/references
//
// 后端透传上游(SemanticScholar / OpenAlex)的列表,响应 shape:
//   { data: { offset, next, data: Citation[] } }
// 我们只在 PaperDetailPane 渲染参考文献区块时拉,失败 / 空返回不阻塞主视图。
// ============================================================================

export interface PaperReference {
  paperId?: string;
  title?: string;
  year?: number;
  venue?: string;
  url?: string;
  authors?: PaperAuthor[];
}

interface RawReferencesPayload {
  offset?: number;
  next?: number;
  data?: Array<Record<string, unknown>>;
}

export function useFetchPaperReferences(paperId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['paper', 'references', paperId] as const,
    enabled: enabled && !!paperId,
    staleTime: STALE_COLD,
    queryFn: async (): Promise<PaperReference[]> => {
      try {
        const { data } = await http.get<{ data: RawReferencesPayload }>(
          `/public/papers/${encodeURIComponent(paperId)}/references`,
          { params: { limit: 100 } }
        );
        const rows = data.data?.data ?? [];
        return rows.map(normalizeReference).filter((r) => !!r.title || !!r.paperId);
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

function normalizeReference(r: Record<string, unknown>): PaperReference {
  // 上游 references 列表里每行有时是 `{citedPaper: {...}}`,有时直接是 paper 字段
  // 兼容这两种 shape(SemanticScholar 用前者,minicod 透传后者)
  const c =
    (r['citedPaper'] as Record<string, unknown> | undefined) ?? r;
  return {
    paperId: c['paperId'] as string | undefined,
    title: c['title'] as string | undefined,
    year: c['year'] as number | undefined,
    venue: c['venue'] as string | undefined,
    url: c['url'] as string | undefined,
    authors: c['authors'] as PaperAuthor[] | undefined,
  };
}
