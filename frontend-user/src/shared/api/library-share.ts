import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { Paper, PaperAuthor } from '@/shared/api/types';

/**
 * 文献集分享 —— 对接后端 /api/v1/user/library/shares(owner)与
 * /api/v1/public/share/:token(收件人,免登录)。网盘式:链接 + 提取码 + 过期 +
 * 转存 + 访问追踪。本轮只支持论文(单篇 single / 文件夹整本 collection)。
 *
 * queryKey:['library','shares'] 列表;['library','share-access', id] 访问记录;
 * 公开获取不进 library 树(用 ['public-share', token, code])。
 */

export type ShareKind = 'single' | 'collection' | 'journal';

export interface CreateShareInput {
  kind: ShareKind;
  /** single 必填:前端把 Paper 关键字段拍平传过来 */
  paper?: {
    source: string;
    source_paper_id: string;
    title: string;
    authors?: PaperAuthor[];
    year?: number;
    venue?: string;
    doi?: string;
    abstract?: string;
    pdf_url?: string;
    citation_count?: number;
  };
  /** collection 必填 */
  folder_id?: number;
  /** journal 必填:被分享期刊 id(落地页据此实时取详情) */
  journal_id?: number;
  /** 可选:期刊副标题(出版社·类型·国家),仅快速展示 */
  subtitle?: string;
  title?: string;
  with_code?: boolean;
  /** nil/<=0 = 永久 */
  expires_in_days?: number;
  allow_save?: boolean;
}

export interface CreatedShare {
  id: number;
  token: string;
  path: string; // /s/<token>
  kind: ShareKind;
  title: string;
  paper_count: number;
  extract_code: string;
  expires_at: string | null;
  allow_save: boolean;
  /** 创建后回传的篇目样本(前 8 篇),供分享海报/预览渲染;集合类才有。 */
  papers?: SharePaperSnapshot[];
}

export interface MyShare {
  id: number;
  token: string;
  kind: ShareKind;
  entity_type: string;
  title: string;
  subtitle: string;
  paper_count: number;
  extract_code: string;
  expires_at: string | null;
  allow_save: boolean;
  status: 'active' | 'revoked';
  view_count: number;
  save_count: number;
  created_at: string;
}

export interface SharePaperSnapshot {
  source: string;
  source_paper_id: string;
  title: string;
  authors?: PaperAuthor[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  pdf_url?: string;
  citation_count?: number;
}

export interface PublicShare {
  need_code: boolean;
  token?: string;
  kind: ShareKind;
  entity_type?: string;
  title: string;
  subtitle?: string;
  paper_count: number;
  /** kind=journal:被分享期刊 id,落地页据此取期刊详情。 */
  journal_id?: number | null;
  allow_save?: boolean;
  expires_at?: string | null;
  created_at?: string;
  /** 合集去重作者数(collection);无则不展示。 */
  author_count?: number;
  sharer: string;
  /** need_code 时为「最高被引」前几篇 teaser 样本;解锁后为完整篇目。 */
  papers?: SharePaperSnapshot[];
}

export interface SaveShareResult {
  added: number;
  skipped: number;
  total: number;
  folder_id: number;
  folder_name: string;
  limit_reached?: boolean;
}

export interface ShareAccessRecord {
  id: number;
  viewer_user_id?: number;
  viewer_label: string;
  action: 'view' | 'save';
  item_count: number;
  created_at: string;
}

/** 把详情/列表用的 Paper 拍平成 single 分享所需字段。 */
export function paperToShareInput(p: Paper): CreateShareInput['paper'] {
  return {
    source: p.source ?? '',
    source_paper_id: p.paperId,
    title: p.title ?? '',
    authors: p.authors,
    year: p.year,
    venue: p.venue,
    doi: typeof p.externalIds?.DOI === 'string' ? p.externalIds.DOI : undefined,
    abstract: p.abstract,
    pdf_url: p.openAccessPdf?.url,
    citation_count: p.citationCount,
  };
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateShareInput): Promise<CreatedShare> => {
      try {
        const { data } = await http.post<{ data: CreatedShare }>(
          '/user/library/shares',
          input
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'shares'] }),
  });
}

export function useMyShares() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'shares'],
    enabled: !!token,
    queryFn: async (): Promise<MyShare[]> => {
      try {
        const { data } = await http.get<{ data: { shares: MyShare[] } }>(
          '/user/library/shares'
        );
        return data.data?.shares ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/user/library/shares/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'shares'] }),
  });
}

export function useShareAccess(id: number | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['library', 'share-access', id],
    enabled: !!token && !!id,
    queryFn: async () => {
      try {
        const { data } = await http.get<{
          data: { view_count: number; save_count: number; records: ShareAccessRecord[] };
        }>(`/user/library/shares/${id}/access`);
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 公开获取分享(收件人,免登录;带 token 时后端会把访问记到名下)。 */
export function usePublicShare(token: string | undefined, code: string) {
  return useQuery({
    queryKey: ['public-share', token, code],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<PublicShare> => {
      try {
        const params = code ? `?code=${encodeURIComponent(code)}` : '';
        const { data } = await http.get<{ data: PublicShare }>(
          `/public/share/${encodeURIComponent(token!)}${params}`
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 转存到自己的文献集(需登录)。 */
export function useSaveShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      token: string;
      code?: string;
      folder_id?: number;
    }): Promise<SaveShareResult> => {
      try {
        const { data } = await http.post<{ data: SaveShareResult }>(
          `/user/library/shares/${encodeURIComponent(vars.token)}/save`,
          { code: vars.code, folder_id: vars.folder_id }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }),
  });
}

/** 拼"防屏蔽口令文本"(链接 + 提取码,纯文本社交安全)。origin = window.location.origin。 */
export function buildShareText(
  s: { token: string; title: string; paper_count: number; extract_code?: string },
  origin: string
): string {
  const url = `${origin}/s/${s.token}`;
  const head = `「Scholay 分享」${s.title}${s.paper_count > 1 ? ` · ${s.paper_count} 篇` : ''}`;
  if (s.extract_code) {
    return `${head}\n链接: ${url}\n提取码: ${s.extract_code}\n(在浏览器打开链接,输入提取码查看)`;
  }
  return `${head}\n链接: ${url}`;
}
