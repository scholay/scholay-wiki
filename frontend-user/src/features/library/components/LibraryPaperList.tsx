import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Inbox, Loader2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PaginationPrevNext } from '@/shared/components/PaginationPrevNext';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import type { UserLibraryPaper } from '@/shared/api/types';
import type { LibraryFolderFilter, LibrarySortOrder } from '../api/papers';
import type { LibrarySelectionApi } from '../hooks/useLibrarySelection';
import { LibraryPaperRow } from './paper-row/LibraryPaperRow';

/**
 * 文献集论文列表 —— **纯展示**:papers / 文件夹 / 选择状态全从 props 进来。
 * 选择状态由父级 LibraryFolderView 持有(`useLibrarySelection`),批量操作 toolbar
 * 也在父级外层 header 渲染,本组件只负责行 + 分页 + 跨页统计。
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
  /** 排序方向 —— 当前后端仅 created_at 维度,只切方向 */
  sortOrder: LibrarySortOrder;
  /** 顶部"排序"按钮点击 —— 父级翻转方向 */
  onToggleSortOrder: () => void;
}

const LIBRARY_PAGE_SIZE_OPTIONS = [20, 50] as const;

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
  sortOrder,
  onToggleSortOrder,
}: Props) {
  // 头部「已上传 PDF」计数 —— 口径必须与行内 PdfChip 一致(看 pdf_uploaded_at,
  // 即用户上传到 MinIO 的文件),不能用 pdf_url(那是收藏时带来的在线 OA 直链,
  // 有直链但未上传 PDF 的行会被误计,与同页 chip 显示"缺失"自相矛盾)。
  const pdfStats = useMemo(() => {
    let uploaded = 0;
    for (const p of papers) {
      if (p.pdf_uploaded_at) uploaded += 1;
    }
    return { uploaded };
  }, [papers]);

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
      <div className="px-6 py-8 text-xs text-brand-red">
        文献列表暂时没能加载出来,请稍后重试
      </div>
    );
  }
  if (papers.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={filter === 'root' ? '你的文献集还没有论文' : '这个文件夹还没有论文'}
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
      {/* inner header —— 跨页统计 + 本页 PDF 计数 + 排序/视图描述
          注:total 是跨页总数,pdfStats 是本页统计(分页下只反映本页) */}
      <header className="flex items-center justify-between gap-3 pt-1 pb-2">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-bold text-foreground">
            共 {total.toLocaleString()} 篇
          </span>
          {papers.length > 0 && (
            <>
              <span className="text-border-strong">·</span>
              <span className="text-faint">
                本页{' '}
                <span className="tabular-nums">{papers.length}</span> 篇 · PDF{' '}
                <span className="tabular-nums">{pdfStats.uploaded}</span> /{' '}
                <span className="tabular-nums">{papers.length}</span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-subtle">
          {/* 排序按钮 —— 当前仅一个维度 "加入时间",点击翻转 asc/desc;
              "视图: 列表" 标识已删除(本就只有列表一种视图) */}
          <button
            type="button"
            onClick={onToggleSortOrder}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-sm hover:bg-surface-1 hover:text-foreground transition-colors"
            title={
              sortOrder === 'asc'
                ? '当前升序(早加入在前),点击切降序'
                : '当前降序(最新在前),点击切升序'
            }
          >
            <span>排序: 加入时间</span>
            {sortOrder === 'asc' ? (
              <ArrowUp className="size-3" strokeWidth={2.5} />
            ) : (
              <ArrowDown className="size-3" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </header>

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
      {!(total <= LIBRARY_PAGE_SIZE_OPTIONS[0] && total <= pageSize) && (
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
