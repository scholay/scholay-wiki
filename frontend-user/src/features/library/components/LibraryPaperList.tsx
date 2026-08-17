import { useMemo } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import type { UserLibraryPaper } from '@/shared/api/types';
import type { LibraryFolderFilter } from '../api/papers';
import type { LibrarySelectionApi } from '../hooks/useLibrarySelection';
import { LibraryPaperRow } from './paper-row/LibraryPaperRow';

/**
 * 文件夹内的论文列表 —— **纯展示**:papers / 文件夹 / 选择状态全从 props 进来。
 * 选择状态由父级 LibraryFolderView 持有(`useLibrarySelection`),批量操作
 * 在父级底栏渲染,本组件只负责行 + 分页。
 *
 * 行内交互(LibraryPaperRow)与子组件(AuthorsRow / MetaRow / StatusRow)
 * 都拆到 paper-row/ 子目录,避免本文件膨胀(原 798 行 → 现 ~120 行)。
 */
interface Props {
  papers: UserLibraryPaper[];
  filter: LibraryFolderFilter;
  isLoading?: boolean;
  error?: Error | null;
  selection: LibrarySelectionApi;
  /** 分页 —— 父级(LibraryFolderView)持有状态,本组件只渲染 + 通知 */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** 矩阵对齐时分页挪到列表外 footer,避免撑高滚动区。 */
  hidePagination?: boolean;
}

export const LIBRARY_PAGE_SIZE_OPTIONS = [20, 50] as const;

export function LibraryPaperList({
  papers,
  filter,
  isLoading,
  error,
  selection,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  hidePagination = false,
}: Props) {
  // 当前页所有 venue —— 批量查 journal enrichment(JCR/IF/CCF 等)
  const pageVenues = useMemo(
    () =>
      papers
        .map((p) => p.venue?.trim())
        .filter((v): v is string => !!v && v.length > 0),
    [papers]
  );
  const enrichments = useJournalEnrichments(pageVenues);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-faint">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-6 py-8 text-12 text-brand-red">
        文献列表暂时没能加载出来,请稍后重试
      </div>
    );
  }
  if (papers.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={filter === 'root' ? '你还没有收藏任何论文' : '这个文件夹还没有论文'}
        description={
          filter === 'root'
            ? '在搜索结果里点「收藏」就能把论文加进来'
            : '选中其它文件夹的论文后,用批量「转移」移动到这里'
        }
      />
    );
  }

  // 分页区间(从 1 起):本页第 1 条 ~ 本页第 N 条 / 共 total
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col px-8">
      {/* onToggle 直接传 selection.toggle(它是稳定的 useCallback)—— 行内不 inline lambda,
          memo 化的 LibraryPaperRow 在翻页 / 单行选区变化时 0 重渲未变行 */}
      <ul className="divide-y divide-border-soft">
        {papers.map((p, idx) => (
          <LibraryPaperRow
            key={p.id}
            paper={p}
            rowIndex={idx}
            journalEnrichment={
              p.venue ? (enrichments[p.venue.trim()] ?? null) : null
            }
            selected={selection.selected.has(p.id)}
            onToggle={selection.toggle}
          />
        ))}
      </ul>

      {/* 分页器 —— 抽到 shared/components/PaginationPrevNext;
          全单页 + 小数据量时不渲染(干净点) */}
      {!hidePagination &&
        !(total <= LIBRARY_PAGE_SIZE_OPTIONS[0] && total <= pageSize) && (
        <PaginationPrevNext
          page={page}
          onPageChange={onPageChange}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          total={total}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pageSize={pageSize}
          pageSizeOptions={LIBRARY_PAGE_SIZE_OPTIONS}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
