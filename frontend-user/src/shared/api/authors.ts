import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { Author, AuthorPapersResult, Paper } from './types';

/**
 * 学者 API —— 与后端 `/api/v1/public/author-detail/*` 对接。
 *
 * 上游(SemanticScholar / OpenAlex)只返核心元数据(name / paperCount / hIndex /
 * citationCount),没有 affiliations 列表 / 研究方向 / 个人简介。UI 端补全方式:
 *   - **研究方向 chips**:从 useAuthorPapers 的 `fieldsOfStudy` 聚合,取 top N
 *   - **合作学者**:从 papers.authors 里聚合(排除自己),取 top N
 *   - **年度发表趋势**:papers 按 year 分组计数
 *
 * 共享在 shared/api 是因为后续 features/scholar(若拆出独立 feature)和当前
 * features/library(以 tab 形式展示)都消费同一 queryKey,缓存命中。
 */

// ============================================================================
// 单个学者详情
// ============================================================================

export function useAuthorDetail(
  authorId: string | null | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: ['author', 'detail', authorId] as const,
    enabled: enabled && !!authorId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Author> => {
      try {
        const { data } = await http.get<{ data: Record<string, unknown> }>(
          `/public/author-detail/${encodeURIComponent(authorId!)}`
        );
        const raw = data.data ?? {};
        return {
          authorId: String(raw.authorId ?? authorId),
          name: (raw.name as string) ?? '未知作者',
          url: raw.url as string | undefined,
          homepage: raw.homepage as string | undefined,
          affiliations: raw.affiliations as string[] | undefined,
          paperCount: raw.paperCount as number | undefined,
          citationCount: raw.citationCount as number | undefined,
          hIndex: raw.hIndex as number | undefined,
          source: raw.source as Author['source'],
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// 学者作品列表 —— 分页,UI 默认拉 50 篇(用于代表作 + 趋势 + 合作者聚合)
// ============================================================================

export interface AuthorPapersOptions {
  authorId: string | null | undefined;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

interface RawAuthorPapersPayload {
  total?: number;
  offset?: number;
  data?: Array<Record<string, unknown>>;
}

export function useAuthorPapers({
  authorId,
  limit = 50,
  offset = 0,
  enabled = true,
}: AuthorPapersOptions) {
  return useQuery({
    queryKey: ['author', 'papers', authorId, limit, offset] as const,
    enabled: enabled && !!authorId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AuthorPapersResult> => {
      try {
        const { data } = await http.get<{ data: RawAuthorPapersPayload }>(
          `/public/author-detail/${encodeURIComponent(authorId!)}/papers`,
          { params: { limit, offset } }
        );
        const raw = data.data ?? {};
        const items = (raw.data ?? []).map(normalizePaper);
        return {
          items,
          total: raw.total ?? items.length,
          offset: raw.offset ?? offset,
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

function normalizePaper(r: Record<string, unknown>): Paper {
  return {
    paperId: String(r['paperId'] ?? ''),
    title: r['title'] as string | undefined,
    abstract: r['abstract'] as string | undefined,
    year: r['year'] as number | undefined,
    venue: r['venue'] as string | undefined,
    url: r['url'] as string | undefined,
    citationCount: r['citationCount'] as number | undefined,
    referenceCount: r['referenceCount'] as number | undefined,
    isOpenAccess: r['isOpenAccess'] as boolean | undefined,
    openAccessPdf: r['openAccessPdf'] as Paper['openAccessPdf'],
    authors: r['authors'] as Paper['authors'],
    fieldsOfStudy: r['fieldsOfStudy'] as string[] | undefined,
    source: r['source'] as Paper['source'],
  };
}
