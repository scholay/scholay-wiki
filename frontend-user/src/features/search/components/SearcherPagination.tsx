import { cn } from '@/shared/lib/utils';

/**
 * 搜索器分页器 —— 三列 grid:[pageSize pill][页码][总页数]
 *
 * 跟 SearcherColumn 强耦合,只在搜索器列底部用,不抽到 shared/components。
 * 母组件管 page/pageSize 真相(URL 参数 ?p= / ?ps=),这里只渲染 + 通知。
 *
 * 显示策略 computePages:
 *   total≤5     → 全列  [1, 2, 3, 4, 5]
 *   current≤3   → 头连续 [1, 2, 3, …, last]
 *   current≥-2  → 尾连续 [1, …, last-2, last-1, last]
 *   居中        → 当前 ± 1  [1, …, c-1, c, c+1, …, last]
 */

export const PAGE_SIZE_OPTIONS = [20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface Props {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  onChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

export function SearcherPagination({
  page,
  totalPages,
  pageSize,
  onChange,
  onPageSizeChange,
}: Props) {
  const pages = computePages(page, totalPages);
  return (
    <nav
      aria-label="分页"
      // 响应式 3-cell grid:页码居中始终可见,两侧自然撑开,从不挤压页码。
      // 列宽 `[1fr_auto_1fr]` —— 页码 auto 取自然宽度优先,左右各占一半余量;
      // 不再用 justify-between + 右侧 88px 占位(那种做法在 ≤380px 容器宽度下
      // 会把 pageSize pill 列压窄,导致两颗胶囊重叠成右图那样)。
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-10 px-3 border-t border-border bg-surface-1 shrink-0"
    >
      {/* 左:pageSize 切换 —— 仅 20 / 50 两档,shrink-0 防被 grid 压扁
          justify-self-start 让 pill 列贴左,不被 1fr 列拉伸 */}
      <div className="justify-self-start inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-background border border-border p-0.5">
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
                  ? 'bg-destructive text-on-brand'
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

      {/* 右:利用空位放"共 X 页",窄屏自动 hidden md:flex 防止挤压页码 */}
      <span className="justify-self-end hidden md:inline-flex shrink-0 text-2xs text-faint tabular-nums whitespace-nowrap">
        共 {totalPages} 页
      </span>
    </nav>
  );
}

function computePages(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, '...', total];
  if (current >= total - 2) return [1, '...', total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
