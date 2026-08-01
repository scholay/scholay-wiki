import { FileText, Loader2, Trash2 } from 'lucide-react';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';

/**
 * 搜索器分页器 —— 三列 grid:[pageSize pill][页码][结果数 + 总页数]
 *
 * 跟 SearcherColumn 强耦合,只在搜索器列底部用,不抽到 shared/components。
 * 母组件管 page/pageSize 真相(URL 参数 ?p= / ?ps=),这里只渲染 + 通知。
 *
 * 显示策略 computePages:
 *   total≤5     → 全列  [1, 2, 3, 4, 5]
 *   current≤3   → 头连续 [1, 2, 3, …, last]
 *   current≥-2  → 尾连续 [1, …, last-2, last-1, last]
 *   居中        → 当前 ± 1  [1, …, c-1, c, c+1, …, last]
 *
 * 右侧结果数:宽够时「找到 N 篇相关文献」,窄时仅图标 + 数值(@container)。
 */

export const PAGE_SIZE_OPTIONS = [20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface Props {
  page: number;
  totalPages: number;
  /** 命中文献总数(右侧统计) */
  totalResults: number;
  pageSize: PageSize;
  onChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** 清除检索(二次确认后) */
  onClear: () => void;
  /** 本页全选复选框(暂存/取消暂存当前页结果) */
  selectAll?: {
    checked: boolean;
    indeterminate?: boolean;
    busy?: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
}

export function SearcherPagination({
  page,
  totalPages,
  totalResults,
  pageSize,
  onChange,
  onPageSizeChange,
  onClear,
  selectAll,
}: Props) {
  const pages = computePages(page, totalPages);
  const resultsLabel = `找到 ${totalResults.toLocaleString()} 篇相关文献`;
  return (
    <nav
      aria-label="分页"
      // 响应式 3-cell grid:页码居中始终可见,两侧自然撑开,从不挤压页码。
      // 列宽 `[1fr_auto_1fr]` —— 页码 auto 取自然宽度优先,左右各占一半余量;
      // @container 供右侧结果数在列宽不足时收成图标+数值。
      className="@container grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border"
    >
      {/* 左:全选 + pageSize 切换 */}
      <div className="justify-self-start flex shrink-0 items-center gap-2">
        {selectAll ? (
          <label
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5 select-none',
              selectAll.busy && 'cursor-wait opacity-70',
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            {selectAll.busy ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-faint" strokeWidth={2.25} />
            ) : (
              <Checkbox
                checked={
                  selectAll.indeterminate
                    ? 'indeterminate'
                    : selectAll.checked
                }
                onCheckedChange={(value) =>
                  selectAll.onCheckedChange(value === true)
                }
                disabled={selectAll.busy}
                aria-label="全选本页"
                title={
                  selectAll.checked
                    ? '取消勾选以移出本页暂存'
                    : '勾选以暂存本页全部结果'
                }
              />
            )}
            <span className="text-xs font-medium text-muted-foreground">全选</span>
          </label>
        ) : null}
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-background border border-border p-0.5">
        {PAGE_SIZE_OPTIONS.map((sz) => (
          <button
            key={sz}
            type="button"
            onClick={() => onPageSizeChange(sz)}
            aria-pressed={pageSize === sz}
            className={cn(
              'inline-flex items-center justify-center h-5 px-2 rounded-pill text-2xs font-bold transition-colors whitespace-nowrap',
              pageSize === sz
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {sz}/页
          </button>
        ))}
        </div>
      </div>

      {/* 中:页码 —— shrink-0 + justify-self-center,优先级最高,不被压缩 */}
      <div className="justify-self-center flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-foreground disabled:opacity-30 disabled:hover:text-faint"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span
              key={`dot-${i}`}
              className="inline-flex h-6 w-6 items-center justify-center text-faint text-xs"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                'inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1.5 text-xs font-semibold transition-colors',
                p === page
                  ? 'bg-destructive text-white'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          aria-label="下一页"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-foreground disabled:opacity-30 disabled:hover:text-faint"
        >
          ›
        </button>
      </div>

      {/* 右:结果数 + 共 X 页 + 清除。窄容器结果数收成图标+数值,清除收成纯图标。 */}
      <div className="justify-self-end flex min-w-0 items-center gap-2">
        <span
          title={resultsLabel}
          aria-label={resultsLabel}
          className="inline-flex min-w-0 items-center gap-1 text-2xs text-faint tabular-nums whitespace-nowrap"
        >
          <FileText className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="@max-[480px]:hidden">找到 </span>
          <span>{totalResults.toLocaleString()}</span>
          <span className="@max-[480px]:hidden"> 篇相关文献</span>
        </span>
        <span className="inline-flex shrink-0 text-2xs text-faint tabular-nums whitespace-nowrap @max-[400px]:hidden">
          共 {totalPages} 页
        </span>
        <ConfirmPopover
          title="清除当前检索结果?"
          description="将清空关键词、结果与筛选条件。"
          confirmText="清除"
          danger
          side="top"
          align="end"
          onConfirm={onClear}
        >
          <button
            type="button"
            title="清除"
            aria-label="清除检索"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-1 hover:text-foreground @max-[400px]:w-7 @max-[400px]:justify-center @max-[400px]:px-0 @max-[400px]:gap-0"
          >
            <Trash2 className="size-3.5" strokeWidth={2.25} />
            <span className="@max-[400px]:hidden">清除</span>
          </button>
        </ConfirmPopover>
      </div>
    </nav>
  );
}

function computePages(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, '...', total];
  if (current >= total - 2) return [1, '...', total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
