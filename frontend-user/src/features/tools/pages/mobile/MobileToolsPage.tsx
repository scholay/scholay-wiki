import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CyclingHint } from '@/shared/components/CyclingHint';
import { useInfiniteToolList, useToolCategories } from '../../api/tools';
import { ToolLogo } from '../../components/ToolLogo';
import { PRICE_TYPE_LABEL } from '@/types/feature-tool';
import type { FeatureTool } from '@/types/feature-tool';

/**
 * 移动端功能页 = PC 功能广场(/tools)的移动版。
 * 数据层 100% 复用本 feature 的 hooks(useInfiniteToolList/useToolCategories);
 * 布局重做:搜索条 + 分类横滑 chips + 单列卡片 + 触底无限续载。
 * URL 驱动(q/category)与 PC 同思路,刷新/分享保留筛选态。
 */
export function MobileToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const [draft, setDraft] = useState(q);

  const categoriesQ = useToolCategories();
  const listQ = useInfiniteToolList({ q: q || undefined, category: category || undefined });
  const tools = useMemo(
    () => (listQ.data?.pages ?? []).flatMap((p) => p.items),
    [listQ.data]
  );
  const total = listQ.data?.pages[0]?.total;

  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  // 触底续载:sentinel 进入视口 → fetchNextPage
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQ;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 space-y-3 border-b border-border bg-background px-4 pt-3 pb-3">
        <h1 className="text-lg font-semibold text-foreground">功能广场</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            patchParams({ q: draft.trim() });
          }}
          className="flex h-10 items-center gap-2 rounded-pill border border-border bg-surface-1 px-3.5"
        >
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="搜索科研工具"
            className="min-w-0 flex-1 bg-transparent text-md text-foreground outline-none placeholder:text-faint"
          />
          {draft && (
            <button
              type="button"
              aria-label="清空"
              onClick={() => {
                setDraft('');
                patchParams({ q: '' });
              }}
            >
              <X className="size-4 text-faint" />
            </button>
          )}
        </form>

        {/* 分类 chips 横滑(PC 是侧栏,移动端收成一行) */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <CategoryChip
            label="全部"
            active={!category}
            onClick={() => patchParams({ category: '' })}
          />
          {(categoriesQ.data?.categories ?? []).map((c) => (
            <CategoryChip
              key={c.slug}
              label={`${c.label} ${c.count}`}
              active={category === c.slug}
              onClick={() => patchParams({ category: c.slug })}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1">
        {listQ.isLoading && (
          <div className="flex h-40 items-center justify-center">
            <CyclingHint
              phrases={['正在加载科研工具…', '统计 / 绘图 / 文献 / LaTeX…']}
              className="text-sm text-muted-foreground"
            />
          </div>
        )}

        {listQ.isError && tools.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <p className="text-sm text-muted-foreground">加载失败</p>
            <button
              type="button"
              onClick={() => void listQ.refetch()}
              className="rounded-pill border border-border-button px-4 py-1.5 text-sm text-foreground"
            >
              重试
            </button>
          </div>
        )}

        {!listQ.isLoading && tools.length === 0 && !listQ.isError && (
          <p className="py-16 text-center text-sm text-faint">
            没有匹配的工具,换个关键词试试
          </p>
        )}

        {tools.length > 0 && (
          <>
            {total != null && (
              <p className="px-4 pt-3 text-xs text-faint">共 {total} 个工具</p>
            )}
            <ul className="space-y-2 p-3">
              {tools.map((tool) => (
                <MobileToolRow key={tool.id} tool={tool} />
              ))}
            </ul>
          </>
        )}

        <div ref={sentinelRef} className="h-10">
          {isFetchingNextPage && (
            <p className="text-center text-xs text-faint">加载中…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-pill border px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
        active
          ? 'border-foreground bg-foreground font-medium text-white'
          : 'border-border bg-background text-muted-foreground'
      )}
    >
      {label}
    </button>
  );
}

function MobileToolRow({ tool }: { tool: FeatureTool }) {
  return (
    <li>
      <Link
        to={`/m/tools/${tool.slug || tool.id}`}
        className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 active:bg-surface-2"
      >
        <ToolLogo tool={tool} className="h-11 w-11" textClass="text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-md font-medium text-foreground">
              {tool.name}
            </span>
            {tool.price_type && (
              <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-2xs text-muted-foreground">
                {PRICE_TYPE_LABEL[tool.price_type] ?? tool.price_type}
              </span>
            )}
          </div>
          {tool.tagline && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {tool.tagline}
            </p>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}
