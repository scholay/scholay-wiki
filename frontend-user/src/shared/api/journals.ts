import { useMutation, useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_COLD } from '@/shared/lib/query-config';
import type { Journal, JournalFullDetail, JournalListUnified } from '@/shared/api/types';

/**
 * 单期刊详情 —— 多个 feature 共用(journals 详情页 + library 详情 pane + …)。
 *
 * 放在 `shared/api` 而非任一 feature:
 *   - 不绑定特定 feature 状态,纯查 `/public/journals/get`
 *   - queryKey `['journal', 'detail', id]` 全局唯一,任意调用方共享缓存
 *   - 避免 features 间通过 hook re-export 形成隐式依赖
 */
/** raw unified → 规范 Journal(与 features/journals 搜索规整同口径,集中一处)。 */
function normalizeUnifiedJournal(u: JournalListUnified, fallbackId: number): Journal {
  const ifNum = u.jcr_impact_factor != null ? parseFloat(String(u.jcr_impact_factor)) : NaN;
  const issns = [u.issn_l, u.print_issn, u.electronic_issn]
    .filter((s): s is string => !!s && !!s.trim())
    .flatMap((s) => s.split(',').map((x) => x.trim()))
    .filter(Boolean);
  return {
    id: u.id ?? fallbackId,
    canonical_name: u.canonical_name ?? '',
    seo_slug: u.seo_slug ?? undefined,
    issns: issns.length ? issns : undefined,
    publisher: u.crossref_publisher ?? u.doaj_publisher ?? undefined,
    country: u.openalex_country ?? undefined,
    type: u.openalex_type ?? undefined,
    is_oa: u.openalex_is_oa === 1 || u.openalex_is_oa === true || u.doaj_is_in_doaj === 1 || undefined,
    jcr_impact_factor: Number.isFinite(ifNum) ? ifNum : undefined,
    jcr_quartile: u.jcr_quartile ?? undefined,
    fqb_quartile: String(u.fqb_major_quartile ?? '').trim().match(/^([1-4])/)?.[1] ?? undefined,
    ccf_rank: u.ccf_rank ?? undefined,
    xr_quartile: String(u.xr_major_quartile ?? '').trim().match(/^([1-4])/)?.[1] ?? undefined,
    xr_top: u.xr_top === '是' || u.xr_top === '1',
    openalex_h_index: u.openalex_h_index ?? undefined,
    source_count: u.source_count ?? undefined,
    has_submission: u.has_submission === 1 || u.has_submission === true || undefined,
  };
}

/**
 * /public/journals/get full=1 原始透传 —— { data: { unified, submission?, sources? } }。
 * 详情/趋势/投稿资源都基于这同一份 full 数据,统一缓存键 ['journal','detail',id],
 * 多个 hook(useJournalDetail / useJournalFullDetail / JournalTrendChart)共享一次请求。
 */
async function fetchJournalFull(id: number): Promise<JournalFullDetail> {
  try {
    const { data } = await http.post<{ data: JournalFullDetail }>(
      '/public/journals/get',
      { id, full: '1' }
    );
    return data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

/** 单期刊规范详情(供 hero/badges/列表)—— 与 useJournalFullDetail 共享同一缓存,只多一层 select。 */
export function useJournalDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['journal', 'detail', id] as const,
    enabled: enabled && id != null && id > 0,
    staleTime: STALE_COLD,
    queryFn: () => fetchJournalFull(id ?? 0),
    select: (full): Journal => {
      const u = full?.unified;
      if (u) return normalizeUnifiedJournal(u, id ?? 0);
      return (full ?? {}) as unknown as Journal; // 防御:已是规范形态时原样返回
    },
  });
}

/**
 * 期刊完整详情(full=1 含各源子表 + 投稿资源元信息)—— 趋势图 + 详情页「全字段展示」+
 * 投稿资源区共用。与 useJournalDetail 同缓存键,只在需要时启用(enabled 由调用方控)。
 */
export function useJournalFullDetail(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['journal', 'detail', id] as const,
    enabled: enabled && id > 0,
    staleTime: STALE_COLD,
    queryFn: () => fetchJournalFull(id),
  });
}

/**
 * 期刊投稿资源下载(投稿须知 .md / LaTeX 模板 .zip)—— Max 会员专享。
 * 走后端代理端点(后端校验 tier=max + 持 key 拉取);响应是二进制流,前端触发浏览器保存。
 * 文件名在前端按期刊名拼(后端也回了 Content-Disposition,这里不依赖它,跨浏览器更稳)。
 */
export function useDownloadJournalSubmission() {
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      kind: 'guideline' | 'latex';
      journalName?: string;
    }): Promise<void> => {
      try {
        const resp = await http.get(
          `/user/journals/${vars.id}/submission/${vars.kind}`,
          {
            responseType: 'blob',
            params: vars.journalName ? { name: vars.journalName } : undefined,
          }
        );
        const suffix = vars.kind === 'guideline' ? '-投稿须知.md' : '-LaTeX模板.zip';
        const base = (vars.journalName?.trim() || `journal-${vars.id}`)
          .replace(/[\\/:*?"<>|]/g, '_')
          .slice(0, 80);
        triggerBlobDownload(resp.data as Blob, base + suffix);
      } catch (err) {
        // responseType:'blob' 下,错误响应体也是 Blob —— 先解出真实后端 message
        // (如「Max 会员专享」),否则 toApiError 拿不到 .message 会退化成兜底文案。
        throw await blobAwareApiError(err);
      }
    },
  });
}

/** 把 blob 模式下的错误响应体(Blob)解析成 JSON 再交给 toApiError,保住后端真实 message。 */
async function blobAwareApiError(err: unknown) {
  const resp = (err as { response?: { data?: unknown } } | null)?.response;
  if (resp?.data instanceof Blob) {
    try {
      resp.data = JSON.parse(await resp.data.text());
    } catch {
      /* 不是 JSON(如二进制损坏)—— 保持原样,toApiError 走兜底 */
    }
  }
  return toApiError(err);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
