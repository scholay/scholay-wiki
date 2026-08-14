import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, Search, Share2, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { CyclingHint } from '@/shared/components/CyclingHint';
import { SEARCH_FIELD_SHELL } from '@/shared/components/search-autocomplete/search-field';
import { usePullToRefresh } from '@/shared/hooks';
import { PullToRefreshIndicator } from '@/shared/components/PullToRefreshIndicator';
import { useShareSheet } from '@/stores/share.store';
import { useInfiniteToolList, useToolCategories } from '../../api/tools';
import { ToolLogo } from '../../components/ToolLogo';
import { MobileToolsFilterSheet, type ToolFilters } from '../../components/mobile/MobileToolsFilterSheet';
import { PRICE_TYPE_LABEL } from '@/types/feature-tool';
import type { FeatureTool } from '@/types/feature-tool';

/** 排序值 → 后端 sort_by/sort_order。 */
const SORT_MAP: Record<string, { sort_by: string; sort_order: 'asc' | 'desc' }> = {
  hot: { sort_by: 'view_count', sort_order: 'desc' },
  new: { sort_by: 'created_at', sort_order: 'desc' },
  name: { sort_by: 'name', sort_order: 'asc' },
};

/**
 * 移动端功能页 = PC 功能广场(/tools)的移动版。
 * 数据层 100% 复用本 feature 的 hooks(useInfiniteToolList/useToolCategories);
 * 布局重做:搜索条 + 分类横滑 chips + 单列卡片 + 触底无限续载。
 * URL 驱动(q/category)与 PC 同思路,刷新/分享保留筛选态。
 */
export function MobileToolsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const [draft, setDraft] = useState(q);
  const [filterOpen, setFilterOpen] = useState(false);

  // 高级筛选(价格/获取方式/开源/排序)走 URL,与 PC 同思路;分类走顶部 chips。
  const filters: ToolFilters = {
    price: searchParams.get('price') ?? '',
    access: searchParams.get('access') ?? '',
    os: searchParams.get('os') ?? '',
    sort: searchParams.get('sort') ?? '',
  };
  const activeFilterCount = [filters.price, filters.access, filters.os, filters.sort].filter(Boolean).length;
  const sort = filters.sort ? SORT_MAP[filters.sort] : undefined;

  const categoriesQ = useToolCategories();
  const listQ = useInfiniteToolList({
    q: q || undefined,
    category: category || undefined,
    price_type: filters.price || undefined,
    access_type: filters.access || undefined,
    open_source: (filters.os as '' | 'open' | 'closed') || undefined,
    sort_by: sort?.sort_by,
    sort_order: sort?.sort_order,
  });
  const tools = useMemo(
    () => (listQ.data?.pages ?? []).flatMap((p) => p.items),
    [listQ.data]
  );
  const total = listQ.data?.pages[0]?.total;

  // 列表虚拟化 —— 工具数可达数百,只挂载视口附近行
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toolVirtualizer = useVirtualizer({
    count: tools.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 6,
    getItemKey: (index) => tools[index]?.id ?? index,
  });

  const ptr = usePullToRefresh({
    onRefresh: () => listQ.refetch(),
    enabled: !listQ.isLoading,
  });

  const patchParams = (patch: Record<string, string | undefined>) => {
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="返回功能首页"
            onClick={() => navigate('/m/tools')}
            className="-ml-1.5 flex size-8 items-center justify-center rounded-pill text-foreground active:bg-surface-2"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="text-16 font-medium text-foreground">功能广场</h1>
        </div>
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patchParams({ q: draft.trim() });
            }}
            /* 规格走 SEARCH_FIELD_SHELL(Figma §4.5)。修前 h-10(40)/ rounded-pill /
               border-border(ink@12%)/ bg-surface-1,是全站唯一一个 pill 形搜索框。
               焦点修前是 `focus-within:border-border-control` —— 那正好等于新的静置色,
               留着就是「按下去零变化」,现改成朱砂 outline。 */
            className={cn(
              'flex flex-1 items-center gap-2 pl-3.5 pr-1',
              SEARCH_FIELD_SHELL
            )}
          >
            <Search className="size-4 shrink-0 text-faint" />
            <input
              type="search"
              enterKeyHint="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="搜索网站、工具…"
              /* outline-none 合法: 焦点由外层 form 的 SEARCH_FIELD_FOCUS(朱砂 outline)提示 */
              className="min-w-0 flex-1 bg-transparent text-14 text-foreground outline-none placeholder:text-faint"
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
            {/* 🟠 2026-07-27 补:本框原先【没有任何提交按钮】,是移动端唯一如此的检索框。
                移动端没有物理键盘,而紧邻右侧那颗图标按钮是「筛选」——
                用户敲完关键词在屏幕上找提交入口,找到的却是筛选漏斗,误点后弹出筛选面板、
                检索反而没执行。对照移动端搜索浮层 MobileSearchOverlay 是配了显式「搜索」按钮的。 */}
            <Button type="submit" className="shrink-0">
              搜索
            </Button>
          </form>
          <button
            type="button"
            aria-label="筛选"
            onClick={() => setFilterOpen(true)}
            /* size-11(44):搜索框随 Figma §4.5 从 40 升到 44 后,这颗同排图标钮跟着抬平 ——
               修前两者都是 40,不跟就会在同一横排出现 44/40 错位。圆角保持 pill(圆形图标钮),
               它不是搜索框、不吃 §4.5 的 rounded-16。 */
            className="relative flex size-11 shrink-0 items-center justify-center rounded-pill border border-border bg-surface-1 text-foreground active:bg-surface-2"
          >
            <SlidersHorizontal className="size-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium text-on-brand">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

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

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-1"
        {...ptr.handlers}
      >
        <PullToRefreshIndicator pull={ptr.pull} refreshing={ptr.refreshing} />
        {listQ.isLoading && (
          <div className="flex h-40 items-center justify-center">
            <CyclingHint
              phrases={['正在加载科研工具…', '统计 / 绘图 / 文献 / LaTeX…']}
              className="text-12 text-muted-foreground"
            />
          </div>
        )}

        {listQ.isError && tools.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <p className="text-12 text-muted-foreground">加载失败</p>
            <button
              type="button"
              onClick={() => void listQ.refetch()}
              className="rounded-pill border border-border-button px-4 py-1.5 text-12 text-foreground"
            >
              重试
            </button>
          </div>
        )}

        {!listQ.isLoading && tools.length === 0 && !listQ.isError && (
          <p className="py-16 text-center text-12 text-faint">
            没有匹配的工具,换个关键词试试
          </p>
        )}

        {tools.length > 0 && (
          <>
            {total != null && (
              <p className="px-4 pt-3 text-12 text-faint">共 {total} 个工具</p>
            )}
            <ul
              style={{ height: toolVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}
              className="pt-2"
            >
              {toolVirtualizer.getVirtualItems().map((vi) => {
                const tool = tools[vi.index];
                if (!tool) return null;
                return (
                  <li
                    key={vi.key}
                    data-index={vi.index}
                    ref={toolVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                    className="px-3 pb-2"
                  >
                    <MobileToolRow tool={tool} />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div ref={sentinelRef} className="h-10">
          {isFetchingNextPage && (
            <p className="text-center text-12 text-faint">加载中…</p>
          )}
        </div>
      </div>

      <MobileToolsFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onChange={(patch) => patchParams(patch)}
        onReset={() => patchParams({ price: '', access: '', os: '', sort: '' })}
      />
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
        'shrink-0 rounded-pill border px-3 py-1.5 text-12 whitespace-nowrap transition-colors',
        active
          ? 'border-foreground bg-foreground font-medium text-on-brand'
          : 'border-border bg-surface-card text-muted-foreground'
      )}
    >
      {label}
    </button>
  );
}

function MobileToolRow({ tool }: { tool: FeatureTool }) {
  const openShare = useShareSheet((s) => s.openShare);
  return (
    <Link
      to={`/m/tools/${tool.slug || tool.id}`}
      className="flex items-center gap-3 rounded-16 border border-border bg-surface-card p-3 transition-transform active:scale-[0.98] active:bg-surface-2"
    >
      <ToolLogo tool={tool} className="h-11 w-11" textClass="text-16" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-14 font-medium text-foreground">
            {tool.name}
          </span>
          {tool.price_type && (
            <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-0.5 text-12 text-muted-foreground">
              {PRICE_TYPE_LABEL[tool.price_type] ?? tool.price_type}
            </span>
          )}
        </div>
        {tool.tagline && (
          <p className="mt-0.5 line-clamp-2 text-12 leading-paragraph text-muted-foreground">
            {tool.tagline}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="分享"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openShare({ kind: 'tool', tool });
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-pill text-faint active:bg-surface-2"
      >
        <Share2 className="size-4" />
      </button>
    </Link>
  );
}
