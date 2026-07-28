import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import { pickEffectiveFields } from '@/shared/lib/pick-field';
import type {
  Paper,
  PaperSource,
  UpstreamSource,
  UserLibraryPaper,
} from '@/shared/api/types';

/**
 * 文件夹「单行读取 / 转换」—— 跨 feature 复用(library 页面 + browser 详情 pane)。
 *
 * 从 features/library/api/papers.ts 提升到 shared:browser 的论文详情 pane 需要
 * 用它判「我有没有收藏 + 转出统一 Paper 形状」,而 features 之间不能互 import
 * (见 frontend CLAUDE.md 分层约束),故落 shared。library 自己经 api/papers.ts
 * 再 re-export 保持既有调用面稳定。
 *
 * mirrors backend/internal/library GET /user/library/by-upstream 响应(UserLibraryPaper)。
 */

/**
 * 按 (source, source_paper_id) 找当前用户文件夹里的论文行。
 *
 * 用途:
 *   - 上游 (stc/olx/pmd) 详情页:查"我有没有收藏 + 有没有上传 PDF"
 *   - 自由文件(source='local')详情页:全部内容都来自这一查
 *
 * 未收藏后端返 200 + data:null(不是 404),返回 null;真错误仍会 throw。
 * source='local' 时 paperId 是 PDF 内容 SHA-256。
 */
export function useLibraryPaperByUpstream(
  source: PaperSource | undefined,
  paperId: string | undefined
) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'by-upstream', source, paperId] as const,
    enabled: !!token && !!source && !!paperId,
    staleTime: STALE_FRESH,
    queryFn: async (): Promise<UserLibraryPaper | null> => {
      try {
        const { data } = await http.get<{ data: UserLibraryPaper | null }>(
          `/user/library/by-upstream/${source}/${encodeURIComponent(paperId!)}`
        );
        return data.data ?? null;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * UserLibraryPaper → Paper(详情页渲染层用的统一形状)。
 * 走 pickEffectiveFields: og 优先 → 元数据 → 空, 与列表卡 / 详情 pane 行为一致。
 */
export function libraryRowToPaper(row: UserLibraryPaper): Paper {
  const eff = pickEffectiveFields(row);
  return {
    paperId: row.source_paper_id,
    title: eff.title,
    abstract: eff.abstract,
    year: eff.year,
    venue: eff.venue,
    authors: eff.authors,
    // 自由文件没有 OA PDF / 上游 URL —— openAccessPdf/url 留空,
    // ActionRow 那些按钮自然 hide
    citationCount: row.citation_count,
    // Paper.source 是 UpstreamSource 类型;'local' 在类型层不允许,但运行时
    // 用 cast 透传,detail pane 用 source==='local' 判断分支。
    source: row.source as UpstreamSource,
  };
}
