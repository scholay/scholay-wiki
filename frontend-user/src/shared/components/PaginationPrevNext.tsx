import { forwardRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 通用「上一页 / 下一页」分页条 —— 覆盖 3 种业务形态(library / admin / journals):
 *
 *   1) **已知 totalPages**(library / admin):传 `totalPages`,中间显示 `{page} / {totalPages}`
 *   2) **未知 totalPages(cursor / hasMore 语义)**(journals):传 `hasMore`,中间显示 `第 {page} 页`
 *
 * 可选段:
 *   - `total + rangeStart + rangeEnd` → 左侧显示 "显示 X-Y / 共 N"
 *   - `pageSize + pageSizeOptions + onPageSizeChange` → 中部 select 切换每页大小
 *
 * 设计前提:filter 改 / pageSize 改时由调用方负责把 page 归 1;本组件只渲染。
 */

export interface PaginationPrevNextProps {
  page: number;
  onPageChange: (page: number) => void;

  /** 已知模式:有 totalPages → 显示 `{page} / {totalPages}` */
  totalPages?: number;
  /** 游标模式:仅知 hasMore → 显示 `第 {page} 页`,下一页 disabled = !hasMore */
  hasMore?: boolean;

  /** 左侧"显示 X-Y / 共 N"摘要 —— 三项要么都传要么都不传 */
  total?: number;
  rangeStart?: number;
  rangeEnd?: number;

  /** 中部 pageSize select —— 三项要么都传要么都不传 */
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;

  /** 全条 disabled —— loading 中也保持显示但禁止点击,避免布局抖动 */
  disabled?: boolean;
  className?: string;
}

export const PaginationPrevNext = forwardRef<HTMLElement, PaginationPrevNextProps>(
  (
    {
      page,
      onPageChange,
      totalPages,
      hasMore,
      total,
      rangeStart,
      rangeEnd,
      pageSize,
      pageSizeOptions,
      onPageSizeChange,
      disabled,
      className,
    },
    ref
  ) => {
    // prev: 第 1 页禁用;next: totalPages 模式看页数,hasMore 模式看游标
    const prevDisabled = disabled || page <= 1;
    const nextDisabled =
      disabled ||
      (totalPages != null ? page >= totalPages : !hasMore);

    const showSummary =
      total != null && rangeStart != null && rangeEnd != null;
    const showPageSize =
      pageSize != null && pageSizeOptions != null && onPageSizeChange != null;

    return (
      <nav
        ref={ref}
        aria-label="分页"
        className={cn(
          'flex items-center justify-between gap-4 py-4 text-xs',
          className
        )}
      >
      {/* 左:摘要 + pageSize(任意组合,缺失则占位空白让翻页区右对齐) */}
      <div className="flex items-center gap-2.5 text-faint min-h-7">
        {showSummary && (
          <span>
            显示{' '}
            <span className="text-foreground font-bold tabular-nums">
              {rangeStart}
            </span>
            –
            <span className="text-foreground font-bold tabular-nums">
              {rangeEnd}
            </span>
            {' / 共 '}
            <span className="text-foreground font-bold tabular-nums">
              {total!.toLocaleString()}
            </span>
          </span>
        )}
        {showSummary && showPageSize && (
          <span className="h-3.5 w-px bg-border" aria-hidden />
        )}
        {showPageSize && (
          <span className="inline-flex items-center gap-1">
            每页
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange!(Number(e.target.value))}
              disabled={disabled}
              className="h-7 px-1.5 rounded-sm bg-surface-card border border-border text-xs text-subtle hover:border-foreground focus-visible:outline-none focus-visible:border-foreground cursor-pointer tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pageSizeOptions!.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      {/* 右:prev / page-indicator / next */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={prevDisabled}
          aria-label="上一页"
          className={cn(
            'inline-flex h-7 px-2.5 items-center gap-1 rounded-sm text-xs font-medium transition-colors',
            prevDisabled
              ? 'text-faint border border-border-soft cursor-not-allowed'
              : 'text-foreground border border-border hover:bg-surface-1'
          )}
        >
          <ChevronLeft className="size-3" strokeWidth={2.5} />
          上一页
        </button>

        {/* 中部页数指示:已知 totalPages 显示 "X / Y";游标模式显示 "第 X 页" */}
        <span className="inline-flex h-7 min-w-[64px] px-3 items-center justify-center rounded-sm bg-foreground text-background text-xs font-bold tabular-nums">
          {totalPages != null ? `${page} / ${totalPages}` : `第 ${page} 页`}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={nextDisabled}
          aria-label="下一页"
          className={cn(
            'inline-flex h-7 px-2.5 items-center gap-1 rounded-sm text-xs font-medium transition-colors',
            nextDisabled
              ? 'text-faint border border-border-soft cursor-not-allowed'
              : 'text-foreground border border-border hover:bg-surface-1'
          )}
        >
          下一页
          <ChevronRight className="size-3" strokeWidth={2.5} />
        </button>
      </div>
    </nav>
  );
  }
);
PaginationPrevNext.displayName = 'PaginationPrevNext';
