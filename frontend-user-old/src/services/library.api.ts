/**
 * ============================================================================
 * Scholay 文献集 API
 * ----------------------------------------------------------------------------
 * 后端：backend/internal/library
 * 路由：/api/v1/user/library  （挂在用户认证中间件下）
 * 模型：单"默认收藏夹"，唯一键 (user_id, source, source_paper_id)
 * ============================================================================
 */
import api from './client';
import type { ApiResult } from '../types/api';

export type LibrarySource = 'stc' | 'olx';

export interface LibraryPaper {
  id: number;
  user_id: number;
  source: LibrarySource;
  source_paper_id: string;
  title: string;
  authors?: Array<{ name?: string; authorId?: string }> | null;
  year?: number | null;
  venue: string;
  doi: string;
  abstract: string;
  pdf_url: string;
  publication_types?: string[] | null;
  citation_count: number;
  created_at: string;
  updated_at: string;
}

export interface LibraryListResponse {
  items: LibraryPaper[];
  total: number;
}

export interface AddLibraryPayload {
  source: LibrarySource;
  source_paper_id: string;
  title?: string;
  authors?: unknown;
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  pdf_url?: string;
  publication_types?: string[];
  citation_count?: number;
  raw?: unknown;
}

export interface CheckResponse {
  saved: Record<string, boolean>;
}

export const libraryAPI = {
  /** 列出"我的"收藏 —— 可按 source 过滤 */
  list: (
    params: { source?: LibrarySource; page?: number; page_size?: number } = {},
  ): Promise<ApiResult<LibraryListResponse>> =>
    api.get('/user/library', { params }),

  /** 加入收藏（幂等：已存在则返回已有记录） */
  add: (payload: AddLibraryPayload): Promise<ApiResult<LibraryPaper>> =>
    api.post('/user/library', payload),

  /** 移除收藏 */
  remove: (source: LibrarySource, sourcePaperID: string): Promise<ApiResult<{ deleted: number }>> =>
    api.delete(`/user/library/${source}/${encodeURIComponent(sourcePaperID)}`),

  /** 批量查"这一页搜索结果里哪些已收藏" */
  check: (source: LibrarySource, paperIds: string[]): Promise<ApiResult<CheckResponse>> =>
    api.post('/user/library/check', { source, paper_ids: paperIds }),
};
