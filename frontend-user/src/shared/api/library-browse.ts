/**
 * 「引用文献」选择器用的只读浏览 hooks —— 文件夹列表 + 文件夹内论文。
 *
 * 直接打文件夹后端接口(/user/library/folders、/user/library?folder=),但**不 import
 * features/library**(跨 feature 禁止):自有 queryKey,类型走 @/shared/api/types。
 * 2026-07 输入框统一:从 features/claw/api 上提 shared(三 agent feature 的引用选择器共用)。
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { PaperAuthor, UserLibraryFolderItem, UserLibraryPaper } from '@/shared/api/types';

export interface LibraryBrowseFoldersResponse {
  folders: UserLibraryFolderItem[];
  total_count: number;
  root_count: number;
}

/** 文件夹列表(含 paper_count)。enabled 控制选择器打开时才拉。 */
export function useLibraryBrowseFolders(enabled: boolean) {
  return useQuery({
    queryKey: ['shared', 'library-browse', 'folders'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await http.get<{ data?: LibraryBrowseFoldersResponse }>(
        '/user/library/folders',
      );
      return data.data ?? { folders: [], total_count: 0, root_count: 0 };
    },
  });
}

export interface LibraryBrowsePapersResponse {
  items: UserLibraryPaper[];
  total: number;
}

/** 某文件夹内的论文(分页,给多选)。folderId=null 时不拉。 */
export function useLibraryBrowsePapers(
  folderId: number | null,
  opts?: { q?: string; page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const q = (opts?.q ?? '').trim();
  return useQuery({
    queryKey: ['shared', 'library-browse', 'papers', folderId, page, pageSize, q],
    enabled: folderId != null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await http.get<{ data?: LibraryBrowsePapersResponse }>('/user/library', {
        params: { folder: folderId, page, page_size: pageSize, ...(q ? { q } : {}) },
      });
      return data.data ?? { items: [], total: 0 };
    },
  });
}

/** 文件夹内论文的有效展示字段(og 覆盖 online)—— 与后端 references.go 的 pick 逻辑一致。 */
export function effectivePaperTitle(p: UserLibraryPaper): string {
  return (p.og_title?.trim() || p.title?.trim() || '(无标题)');
}

/** 有效作者列表(og 覆盖在线)—— 原始对象数组(给头像/可点名)。 */
export function effectivePaperAuthorList(p: UserLibraryPaper): PaperAuthor[] {
  return (p.og_authors?.length ? p.og_authors : p.authors) ?? [];
}

export function effectivePaperAuthors(p: UserLibraryPaper): string {
  const names = effectivePaperAuthorList(p)
    .map((a) => a.name?.trim())
    .filter(Boolean) as string[];
  if (names.length === 0) return '';
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} 等` : names.join(', ');
}

export function effectivePaperYear(p: UserLibraryPaper): string {
  const y = p.og_year || p.year;
  return y ? String(y) : '';
}

export function effectivePaperVenue(p: UserLibraryPaper): string {
  return p.og_venue?.trim() || p.venue?.trim() || '';
}

export function effectivePaperAbstract(p: UserLibraryPaper): string {
  return p.og_abstract?.trim() || p.abstract?.trim() || '';
}
